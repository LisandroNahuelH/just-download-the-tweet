import type { MediaKind, PostMediaBundle, PostMediaItem } from "../bridge/contracts";
import { extractBundlesFromPayload, normalizeImageUrl } from "../bridge/media-extract";
import { buildMediaFilename } from "../shared/download-utils";

const STATUS_PATH_RE = /^\/(?:[^/]+\/)?status\/(\d+)(?:\/.*)?$/i;
const POST_CONTAINER_SELECTOR = 'article, [role="article"], [data-testid="tweet"]';
const INITIAL_STATE_MARKER = "window.__INITIAL_STATE__";

export interface PostSnapshot {
  article: HTMLElement;
  statusId: string;
  permalink: string;
  authorHandle: string;
  actionBar: HTMLElement | null;
  fallbackItems: PostMediaItem[];
}

export interface SnapshotExtractionContext {
  pagePayload?: unknown | null;
}

export function isSupportedXLocation(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/home" ||
    pathname.startsWith("/home/") ||
    /^\/[^/]+\/status\/\d+(?:\/.*)?$/i.test(pathname) ||
    /^\/i\/web\/status\/\d+(?:\/.*)?$/i.test(pathname)
  );
}

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

export function normalizeUrl(value: string): string {
  try {
    const parsed = new URL(value, globalThis.location?.origin ?? "https://x.com");
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

export function extractStatusIdFromHref(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }

  try {
    const parsed = new URL(href, globalThis.location?.origin ?? "https://x.com");
    const match = parsed.pathname.match(STATUS_PATH_RE);
    return match?.[1] ?? null;
  } catch {
    const match = href.match(STATUS_PATH_RE);
    return match?.[1] ?? null;
  }
}

export function extractAuthorHandleFromHref(href: string | null | undefined): string | null {
  if (!href) {
    return null;
  }

  try {
    const parsed = new URL(href, globalThis.location?.origin ?? "https://x.com");
    const match = parsed.pathname.match(/^\/([^/]+)\/status\/\d+(?:\/.*)?$/i);
    return match ? normalizeHandle(match[1]) : null;
  } catch {
    const match = href.match(/^\/([^/]+)\/status\/\d+(?:\/.*)?$/i);
    return match ? normalizeHandle(match[1]) : null;
  }
}

export function isVisibleElement(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const style = globalThis.getComputedStyle?.(htmlElement);
  if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
    return false;
  }

  if (typeof htmlElement.checkVisibility === "function") {
    return htmlElement.checkVisibility({ checkOpacity: false, checkVisibilityCSS: false });
  }

  return true;
}

export function readEmbeddedPagePayload(doc: Document = document): unknown | null {
  const globalInitialState = (globalThis as typeof globalThis & { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__;
  if (globalInitialState && typeof globalInitialState === "object") {
    return globalInitialState;
  }

  for (const script of Array.from(doc.querySelectorAll<HTMLScriptElement>("script"))) {
    const text = script.textContent ?? "";
    if (!text.includes(INITIAL_STATE_MARKER)) {
      continue;
    }

    const parsed = parseEmbeddedInitialState(text);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function findSupportedPostArticles(root: ParentNode = document, context: SnapshotExtractionContext = {}): HTMLElement[] {
  const selectedByStatusId = new Map<string, { article: HTMLElement; score: number; depth: number }>();

  for (const article of collectSupportedPostContainers(root)) {
    if (!isVisibleElement(article)) {
      continue;
    }

    const snapshot = extractPostSnapshot(article, context);
    if (!snapshot || hasAncestorPostContainerWithDifferentStatus(article, snapshot.statusId)) {
      continue;
    }

    const score = scoreArticleSelection(article, snapshot);
    const depth = getPostContainerDepth(article);
    const current = selectedByStatusId.get(snapshot.statusId);
    if (!current || score > current.score || (score === current.score && depth > current.depth)) {
      selectedByStatusId.set(snapshot.statusId, { article, score, depth });
    }
  }

  return Array.from(selectedByStatusId.values(), (entry) => entry.article);
}

export function extractPostSnapshot(article: HTMLElement, context: SnapshotExtractionContext = {}): PostSnapshot | null {
  const statusAnchor = findStatusAnchor(article);
  const statusId = extractStatusIdFromHref(statusAnchor?.getAttribute("href")) ?? null;
  if (!statusId) {
    return null;
  }

  const permalink = normalizeUrl(statusAnchor?.href ?? `${globalThis.location?.origin ?? "https://x.com"}/i/web/status/${statusId}`);
  const authorHandle =
    extractAuthorHandleFromHref(statusAnchor?.getAttribute("href")) ??
    extractAuthorHandleFromUserNameBlock(article) ??
    "user";

  return {
    article,
    statusId,
    permalink,
    authorHandle,
    actionBar: findActionBar(article),
    fallbackItems: extractFallbackMedia(article, statusId, authorHandle, context),
  };
}

export function findActionBar(article: HTMLElement): HTMLElement | null {
  const groups = Array.from(article.querySelectorAll<HTMLElement>('[role="group"]')).filter((group) => {
    return isVisibleElement(group) && belongsToContainer(group, article);
  });
  if (groups.length === 0) {
    return null;
  }

  const scored = groups
    .map((group) => ({
      group,
      score: group.querySelectorAll("button, [role='button']").length,
    }))
    .sort((left, right) => right.score - left.score);

  return scored.find((entry) => entry.score >= 3)?.group ?? scored[0]?.group ?? null;
}

export function extractFallbackMedia(
  article: HTMLElement,
  statusId: string,
  authorHandle: string,
  context: SnapshotExtractionContext = {},
): PostMediaItem[] {
  const imageItems = extractImageFallbackMedia(article, statusId, authorHandle);
  const embeddedItems = extractEmbeddedFallbackMedia(article, statusId, authorHandle, context.pagePayload);

  if (embeddedItems.some((item) => item.kind !== "photo")) {
    return embeddedItems;
  }

  return imageItems.length > 0 ? imageItems : embeddedItems;
}

export function toBundleFromSnapshot(snapshot: PostSnapshot): PostMediaBundle | null {
  if (snapshot.fallbackItems.length === 0) {
    return null;
  }

  return {
    postId: snapshot.statusId,
    authorHandle: snapshot.authorHandle,
    permalink: snapshot.permalink,
    items: snapshot.fallbackItems,
  };
}

export function findStatusAnchor(article: HTMLElement): HTMLAnchorElement | null {
  const anchors = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')).filter((anchor) => {
    return belongsToContainer(anchor, article);
  });
  if (anchors.length === 0) {
    return null;
  }

  return anchors.find((anchor) => anchor.querySelector("time")) ?? anchors[0] ?? null;
}

function collectSupportedPostContainers(root: ParentNode): HTMLElement[] {
  const containers = new Set<HTMLElement>();

  if (root instanceof Element && root.matches(POST_CONTAINER_SELECTOR)) {
    containers.add(root as HTMLElement);
  }

  for (const article of Array.from(root.querySelectorAll<HTMLElement>(POST_CONTAINER_SELECTOR))) {
    if (isVisibleElement(article)) {
      containers.add(article);
    }
  }

  return Array.from(containers);
}

function extractImageFallbackMedia(article: HTMLElement, statusId: string, authorHandle: string): PostMediaItem[] {
  const items: PostMediaItem[] = [];
  const seen = new Set<string>();

  for (const candidate of article.querySelectorAll<HTMLElement>("img, a[href]")) {
    if (!belongsToContainer(candidate, article)) {
      continue;
    }

    const rawUrl =
      candidate instanceof HTMLImageElement
        ? candidate.currentSrc || candidate.src
        : candidate instanceof HTMLAnchorElement && candidate.href.includes("pbs.twimg.com/media")
          ? candidate.href
          : null;

    if (!rawUrl || !rawUrl.includes("pbs.twimg.com/media")) {
      continue;
    }

    const url = normalizeImageUrl(rawUrl);
    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    const mimeType = inferMimeTypeFromImageUrl(url);
    const index = items.length + 1;
    const kind: MediaKind = url.includes("format=gif") ? "animated_gif" : "photo";
    items.push({
      postId: statusId,
      authorHandle,
      index,
      kind,
      url,
      mimeType,
      filename: buildMediaFilename({
        authorHandle,
        postId: statusId,
        index,
        kind,
        mimeType,
        url,
      }),
    });
  }

  return items;
}

function extractAuthorHandleFromUserNameBlock(article: HTMLElement): string | null {
  const userNameBlock = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="User-Name"]')).find((node) =>
    belongsToContainer(node, article),
  );
  if (!userNameBlock) {
    return null;
  }

  const profileLink = Array.from(userNameBlock.querySelectorAll<HTMLAnchorElement>("a[href^='/']")).find((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    return !href.includes("/status/") && !href.startsWith("/i/web/status/");
  });

  if (!profileLink) {
    return null;
  }

  try {
    const parsed = new URL(profileLink.href, globalThis.location?.origin ?? "https://x.com");
    const match = parsed.pathname.match(/^\/([^/]+)\/?$/);
    return match ? normalizeHandle(match[1]) : null;
  } catch {
    const href = profileLink.getAttribute("href") ?? "";
    const match = href.match(/^\/([^/]+)\/?$/);
    return match ? normalizeHandle(match[1]) : null;
  }
}

function extractEmbeddedFallbackMedia(
  article: HTMLElement,
  statusId: string,
  authorHandle: string,
  pagePayload: unknown | null,
): PostMediaItem[] {
  const payload = pagePayload === undefined ? readEmbeddedPagePayload(article.ownerDocument ?? document) : pagePayload;
  if (!payload) {
    return [];
  }

  const bundle = extractBundlesFromPayload(payload).find((entry) => entry.postId === statusId);
  if (!bundle || bundle.items.length === 0) {
    return [];
  }

  const normalizedBundleAuthor = normalizeHandle(bundle.authorHandle);
  const resolvedAuthorHandle = normalizedBundleAuthor && normalizedBundleAuthor !== "user" ? normalizedBundleAuthor : authorHandle;

  return bundle.items.map((item, index) => {
    const nextIndex = index + 1;
    const nextFilename = buildMediaFilename({
      authorHandle: resolvedAuthorHandle,
      postId: statusId,
      index: nextIndex,
      kind: item.kind,
      mimeType: item.mimeType,
      url: item.url,
    });

    return {
      ...item,
      postId: statusId,
      authorHandle: resolvedAuthorHandle,
      index: nextIndex,
      filename: nextFilename,
    };
  });
}

function inferMimeTypeFromImageUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("format=png")) {
    return "image/png";
  }

  if (lower.includes("format=webp")) {
    return "image/webp";
  }

  if (lower.includes("format=gif")) {
    return "image/gif";
  }

  return "image/jpeg";
}

function belongsToContainer(element: Element, container: HTMLElement): boolean {
  return element.closest(POST_CONTAINER_SELECTOR) === container;
}

function hasAncestorPostContainerWithDifferentStatus(container: HTMLElement, statusId: string): boolean {
  let ancestor = container.parentElement?.closest(POST_CONTAINER_SELECTOR) as HTMLElement | null;

  while (ancestor) {
    const ancestorStatusId = extractStatusIdFromHref(findStatusAnchor(ancestor)?.getAttribute("href"));
    if (ancestorStatusId && ancestorStatusId !== statusId) {
      return true;
    }

    ancestor = ancestor.parentElement?.closest(POST_CONTAINER_SELECTOR) as HTMLElement | null;
  }

  return false;
}

function scoreArticleSelection(article: HTMLElement, snapshot: PostSnapshot): number {
  let score = 0;

  if (snapshot.actionBar) {
    score += 4;
  }

  if (snapshot.fallbackItems.length > 0) {
    score += 3;
  }

  if (article.matches('[data-testid="tweet"], [role="article"]')) {
    score += 1;
  }

  return score;
}

function getPostContainerDepth(article: HTMLElement): number {
  let depth = 0;
  let ancestor = article.parentElement?.closest(POST_CONTAINER_SELECTOR) as HTMLElement | null;

  while (ancestor) {
    depth += 1;
    ancestor = ancestor.parentElement?.closest(POST_CONTAINER_SELECTOR) as HTMLElement | null;
  }

  return depth;
}

function parseEmbeddedInitialState(scriptText: string): unknown | null {
  const markerIndex = scriptText.indexOf(INITIAL_STATE_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const equalsIndex = scriptText.indexOf("=", markerIndex + INITIAL_STATE_MARKER.length);
  if (equalsIndex === -1) {
    return null;
  }

  const objectStart = scriptText.indexOf("{", equalsIndex);
  if (objectStart === -1) {
    return null;
  }

  const objectEnd = findMatchingJsonObjectEnd(scriptText, objectStart);
  if (objectEnd === -1) {
    return null;
  }

  return tryParseJson(decodeHtmlEntities(scriptText.slice(objectStart, objectEnd + 1)));
}

function findMatchingJsonObjectEnd(text: string, startIndex: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringDelimiter = "";

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === stringDelimiter) {
        inString = false;
        stringDelimiter = "";
      }

      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringDelimiter = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function tryParseJson(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string): string {
  if (!value.includes("&")) {
    return value;
  }

  const doc = globalThis.document;
  if (!doc) {
    return value;
  }

  const textarea = doc.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

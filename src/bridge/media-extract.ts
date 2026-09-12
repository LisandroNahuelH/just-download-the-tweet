import type { MediaKind, PostMediaBundle, PostMediaItem } from './contracts';

const X_HOST = 'x.com';
const TWITTER_HOST = 'twitter.com';

export function extractBundlesFromPayload(payload: unknown): PostMediaBundle[] {
  const bundles = new Map<string, PostMediaBundle>();
  const visited = new WeakSet<object>();

  visit(payload, false);
  return [...bundles.values()];

  function visit(value: unknown, inQuotedSubtree: boolean): void {
    if (!value || typeof value !== 'object') {
      return;
    }

    if (visited.has(value as object)) {
      return;
    }
    visited.add(value as object);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, inQuotedSubtree);
      }
      return;
    }

    if (!inQuotedSubtree) {
      const bundle = bundleFromTweetLikeNode(value);
      if (bundle) {
        const existing = bundles.get(bundle.postId);
        bundles.set(bundle.postId, existing ? mergeBundles(existing, bundle) : bundle);
      }
    }

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'quoted_status_result') {
        continue;
      }
      visit(child, inQuotedSubtree);
    }
  }
}

export function normalizeImageUrl(rawUrl: string): string {
  if (!rawUrl) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    if (!isTwimgMediaHost(url.hostname)) {
      return rawUrl;
    }

    if (url.pathname.includes('/media/')) {
      url.searchParams.set('name', 'orig');
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function chooseBestVideoVariant(variants: unknown): { url: string; mimeType: string; bitrate?: number } | null {
  if (!Array.isArray(variants) || variants.length === 0) {
    return null;
  }

  const normalized = variants
    .map((variant) => {
      if (!variant || typeof variant !== 'object') {
        return null;
      }
      const record = variant as Record<string, unknown>;
      const url = asString(record.url);
      if (!url) {
        return null;
      }

      return {
        url,
        mimeType: asString(record.content_type) ?? 'video/mp4',
        bitrate: asNumber(record.bitrate),
      };
    })
    .filter((variant): variant is NonNullable<typeof variant> => variant !== null);

  if (normalized.length === 0) {
    return null;
  }

  const mp4Variants = normalized.filter((variant) => variant.mimeType === 'video/mp4');
  const pool = mp4Variants.length > 0 ? mp4Variants : normalized;
  pool.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));

  return pool[0] ?? null;
}

export function inferExtensionFromMimeType(mimeType: string | undefined, fallbackUrl?: string): string {
  const normalizedMime = (mimeType ?? '').toLowerCase();
  if (normalizedMime.includes('jpeg')) return 'jpg';
  if (normalizedMime.includes('png')) return 'png';
  if (normalizedMime.includes('webp')) return 'webp';
  if (normalizedMime.includes('gif')) return 'gif';
  if (normalizedMime.includes('mp4')) return 'mp4';
  if (normalizedMime.includes('quicktime')) return 'mov';
  if (normalizedMime.includes('mpegurl')) return 'm3u8';

  if (fallbackUrl) {
    try {
      const url = new URL(fallbackUrl);
      const format = url.searchParams.get('format')?.toLowerCase();
      if (format === 'jpg' || format === 'jpeg' || format === 'png' || format === 'webp' || format === 'gif' || format === 'mp4' || format === 'mov' || format === 'm3u8') {
        return format === 'jpeg' ? 'jpg' : format;
      }

      const match = url.pathname.match(/\.([a-z0-9]+)$/i);
      if (match) {
        return match[1].toLowerCase();
      }
    } catch {
      return 'bin';
    }
  }

  return 'bin';
}

export function buildMediaFilename(params: {
  authorHandle: string;
  postId: string;
  index: number;
  kind: MediaKind;
  mimeType: string;
  url: string;
}): string {
  const safeHandle = sanitizeFilenamePart(params.authorHandle) || 'user';
  const safePostId = sanitizeFilenamePart(params.postId);
  const paddedIndex = String(params.index).padStart(2, '0');
  const extension = inferExtensionFromMimeType(params.mimeType, params.url);

  return `@${safeHandle}_${safePostId}_${paddedIndex}.${extension}`;
}

export function buildBundleFilename(params: { authorHandle: string; postId: string }): string {
  const safeHandle = sanitizeFilenamePart(params.authorHandle) || 'user';
  const safePostId = sanitizeFilenamePart(params.postId);
  return `@${safeHandle}_${safePostId}_media.zip`;
}

function bundleFromTweetLikeNode(node: unknown): PostMediaBundle | null {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return null;
  }

  const record = node as Record<string, unknown>;
  const postId = findPostId(record);
  if (!postId) {
    return null;
  }

  const authorHandle = findAuthorHandle(record) ?? 'user';
  const mediaNodes = findMediaNodes(record);
  if (mediaNodes.length === 0) {
    return null;
  }

  const items: PostMediaItem[] = [];
  mediaNodes.forEach((mediaNode, position) => {
    const item = buildItemFromMediaNode({
      mediaNode,
      postId,
      authorHandle,
      index: position + 1,
    });
    if (item) {
      items.push(item);
    }
  });

  if (items.length === 0) {
    return null;
  }

  return {
    postId,
    authorHandle,
    permalink: buildPermalink(authorHandle, postId),
    items,
  };
}

function buildItemFromMediaNode(params: {
  mediaNode: unknown;
  postId: string;
  authorHandle: string;
  index: number;
}): PostMediaItem | null {
  if (!params.mediaNode || typeof params.mediaNode !== 'object' || Array.isArray(params.mediaNode)) {
    return null;
  }

  const record = params.mediaNode as Record<string, unknown>;
  const kind = normalizeMediaKind(asString(record.type) ?? undefined);
  if (!kind) {
    return null;
  }

  if (kind === 'photo') {
    const photoUrl = asString(record.media_url_https) ?? asString(record.media_url);
    if (!photoUrl) {
      return null;
    }

    const normalizedUrl = normalizeImageUrl(photoUrl);
    const mimeType = mimeFromUrl(normalizedUrl) ?? 'image/jpeg';
    const originalInfo = record.original_info && typeof record.original_info === 'object' ? (record.original_info as Record<string, unknown>) : undefined;

    return {
      postId: params.postId,
      authorHandle: params.authorHandle,
      index: params.index,
      kind,
      url: normalizedUrl,
      mimeType,
      filename: buildMediaFilename({
        authorHandle: params.authorHandle,
        postId: params.postId,
        index: params.index,
        kind,
        mimeType,
        url: normalizedUrl,
      }),
      width: asNumber(originalInfo?.width),
      height: asNumber(originalInfo?.height),
    };
  }

  const videoInfo = record.video_info && typeof record.video_info === 'object' ? (record.video_info as Record<string, unknown>) : undefined;
  const bestVariant = chooseBestVideoVariant(videoInfo?.variants);
  if (!bestVariant) {
    return null;
  }

  return {
    postId: params.postId,
    authorHandle: params.authorHandle,
    index: params.index,
    kind,
    url: bestVariant.url,
    mimeType: bestVariant.mimeType,
    filename: buildMediaFilename({
      authorHandle: params.authorHandle,
      postId: params.postId,
      index: params.index,
      kind,
      mimeType: bestVariant.mimeType,
      url: bestVariant.url,
    }),
    bitrate: bestVariant.bitrate,
  };
}

function findMediaNodes(record: Record<string, unknown>): unknown[] {
  const candidates = [
    record.extended_entities,
    record.entities,
    record.legacy && typeof record.legacy === 'object' ? (record.legacy as Record<string, unknown>).extended_entities : undefined,
    record.legacy && typeof record.legacy === 'object' ? (record.legacy as Record<string, unknown>).entities : undefined,
  ].filter(Boolean) as Record<string, unknown>[];

  for (const candidate of candidates) {
    const media = candidate.media;
    if (Array.isArray(media) && media.length > 0) {
      return media;
    }
  }

  return [];
}

function findPostId(record: Record<string, unknown>): string | null {
  for (const key of ['rest_id', 'id_str', 'tweet_id', 'status_id', 'id']) {
    const value = asString(record[key]);
    if (value) {
      return value;
    }
  }

  const legacy = record.legacy;
  if (legacy && typeof legacy === 'object') {
    const legacyRecord = legacy as Record<string, unknown>;
    for (const key of ['rest_id', 'id_str', 'tweet_id', 'status_id', 'id']) {
      const value = asString(legacyRecord[key]);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function findAuthorHandle(record: Record<string, unknown>): string | null {
  const candidates = [
    record.core && typeof record.core === 'object' ? (record.core as Record<string, unknown>).user_results : undefined,
    record.user_results,
    record.author_results,
    record.user,
  ];

  for (const candidate of candidates) {
    const handle = findHandleInUserResult(candidate);
    if (handle) {
      return handle;
    }
  }

  const legacy = record.legacy;
  if (legacy && typeof legacy === 'object') {
    const legacyRecord = legacy as Record<string, unknown>;
    const handle = asString(legacyRecord.screen_name) ?? asString(legacyRecord.username);
    if (handle) {
      return handle.replace(/^@/, '');
    }
  }

  return null;
}

function findHandleInUserResult(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const result = record.result && typeof record.result === 'object' ? (record.result as Record<string, unknown>) : record;
  const legacy = result.legacy && typeof result.legacy === 'object' ? (result.legacy as Record<string, unknown>) : result;

  const handle =
    asString(legacy.screen_name) ??
    asString(legacy.username) ??
    asString(result.screen_name) ??
    asString(result.username);

  return handle ? handle.replace(/^@/, '') : null;
}

function buildPermalink(authorHandle: string, postId: string): string {
  const safeHandle = sanitizeFilenamePart(authorHandle) || 'user';
  return `https://${X_HOST}/${safeHandle}/status/${postId}`;
}

function mergeBundles(existing: PostMediaBundle, next: PostMediaBundle): PostMediaBundle {
  const seen = new Set(existing.items.map((item) => item.url));
  const mergedItems = [...existing.items];
  for (const item of next.items) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      mergedItems.push(item);
    }
  }

  mergedItems.sort((a, b) => a.index - b.index);

  return {
    ...existing,
    authorHandle: existing.authorHandle || next.authorHandle,
    permalink: existing.permalink || next.permalink,
    items: mergedItems,
  };
}

function normalizeMediaKind(value: string | undefined): MediaKind | null {
  const normalized = (value ?? '').toLowerCase();
  if (normalized === 'photo') return 'photo';
  if (normalized === 'video') return 'video';
  if (normalized === 'animated_gif' || normalized === 'gif') return 'animated_gif';
  return null;
}

function mimeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const format = parsed.searchParams.get('format')?.toLowerCase();
    if (format) {
      switch (format) {
        case 'jpg':
        case 'jpeg':
          return 'image/jpeg';
        case 'png':
          return 'image/png';
        case 'webp':
          return 'image/webp';
        case 'gif':
          return 'image/gif';
        case 'mp4':
          return 'video/mp4';
        case 'mov':
          return 'video/quicktime';
        case 'm3u8':
          return 'application/x-mpegURL';
        default:
          break;
      }
    }

    const ext = parsed.pathname.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'm3u8':
        return 'application/x-mpegURL';
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function isTwimgMediaHost(hostname: string): boolean {
  return hostname === 'pbs.twimg.com' || hostname.endsWith(`.${X_HOST}`) || hostname.endsWith(`.${TWITTER_HOST}`);
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

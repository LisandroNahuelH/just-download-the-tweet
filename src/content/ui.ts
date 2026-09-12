import type { PostMediaBundle, PostMediaItem } from "../bridge/contracts";
import { BridgeBundleCache, installBridgeListeners, requestBridgeSnapshot, snapshotToBundle } from "./bridge";
import {
  extractPostSnapshot,
  findSupportedPostArticles,
  isSupportedXLocation,
  readEmbeddedPagePayload,
  toBundleFromSnapshot,
  type PostSnapshot,
} from "./dom";
import { getMessage } from "../shared/browser/getMessage";
import { downloadAll, downloadOne, downloadZip, extractDownloadError } from "./runtime";

type ControllerState = "idle" | "loading" | "ready" | "error" | "success";

const HOST_ATTR = "data-just-download-the-tweet-host";

export class JustDownloadTheTweetApp {
  private readonly bridgeCache = new BridgeBundleCache();
  private readonly controllers = new Map<HTMLElement, PostMediaController>();
  private observer: MutationObserver | null = null;
  private detachBridgeListeners: (() => void) | null = null;
  private routeHooksInstalled = false;
  private queued = false;

  start(): void {
    if (!isSupportedXLocation(globalThis.location?.pathname ?? "/")) {
      return;
    }

    this.installNavigationHooks();
    this.installObserver();
    this.installBridgeListeners();
    void this.prefetchBridgeSnapshot();
    this.scanNow();
  }

  scanNow(): void {
    const currentDocument = globalThis.document;
    if (!currentDocument || !isSupportedXLocation(globalThis.location?.pathname ?? "/")) {
      this.disposeAll();
      return;
    }

    const pagePayload = readEmbeddedPagePayload(currentDocument);
    const liveArticles = new Set<HTMLElement>();
    for (const article of findSupportedPostArticles(currentDocument, { pagePayload })) {
      liveArticles.add(article);
      const snapshot = extractPostSnapshot(article, { pagePayload });
      if (!snapshot) {
        continue;
      }

      const existing = this.controllers.get(article);
      const hasOwnMedia = this.hasOwnMedia(snapshot);
      if (!hasOwnMedia) {
        if (existing) {
          existing.dispose();
          this.controllers.delete(article);
        }
        continue;
      }

      if (existing) {
        existing.sync(snapshot);
        continue;
      }

      const controller = new PostMediaController(
        snapshot,
        (updated) => this.resolveBundle(updated),
        (currentSnapshot) => this.bridgeCache.find(currentSnapshot),
      );
      this.controllers.set(article, controller);
      controller.mount();
    }

    for (const [article, controller] of this.controllers) {
      if (!liveArticles.has(article) || !currentDocument.contains(article)) {
        controller.dispose();
        this.controllers.delete(article);
      }
    }
  }

  private installObserver(): void {
    if (this.observer) {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
          this.scheduleScan();
          break;
        }
      }
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  private installNavigationHooks(): void {
    if (this.routeHooksInstalled) {
      return;
    }

    this.routeHooksInstalled = true;
    const schedule = () => this.scheduleScan();

    const patchHistory = (method: "pushState" | "replaceState"): void => {
      const original = history[method];
      history[method] = function patchedHistoryMethod(this: History, ...args: Parameters<History["pushState"]>): void {
        const result = original.apply(this, args as never);
        schedule();
        return result;
      } as typeof history.pushState;
    };

    patchHistory("pushState");
    patchHistory("replaceState");
    addEventListener("popstate", schedule);
    addEventListener("hashchange", schedule);
  }

  private installBridgeListeners(): void {
    if (this.detachBridgeListeners) {
      return;
    }

    this.detachBridgeListeners = installBridgeListeners(this.bridgeCache, () => this.scheduleScan());
  }

  private async prefetchBridgeSnapshot(): Promise<void> {
    const bundles = await requestBridgeSnapshot();
    if (bundles.length === 0) {
      return;
    }

    this.bridgeCache.seed(bundles);
    this.scheduleScan();
  }

  private async resolveBundle(
    snapshot: PostSnapshot,
  ): Promise<{ bundle: PostMediaBundle | null; source: "bridge" | "fallback" | null }> {
    const cached = this.bridgeCache.find(snapshot);
    if (cached) {
      return { bundle: cached, source: "bridge" };
    }

    const bundles = await requestBridgeSnapshot();
    if (bundles.length > 0) {
      this.bridgeCache.seed(bundles);
    }

    const resolved = this.bridgeCache.find(snapshot);
    if (resolved) {
      return { bundle: resolved, source: "bridge" };
    }

    const fallback = snapshotToBundle(snapshot) ?? toBundleFromSnapshot(snapshot);
    return { bundle: fallback, source: fallback ? "fallback" : null };
  }

  private scheduleScan(): void {
    if (this.queued) {
      return;
    }

    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.scanNow();
    });
  }

  private disposeAll(): void {
    for (const controller of this.controllers.values()) {
      controller.dispose();
    }

    this.controllers.clear();
  }

  private hasOwnMedia(snapshot: PostSnapshot): boolean {
    return snapshot.fallbackItems.length > 0 || Boolean(this.bridgeCache.find(snapshot));
  }
}

class PostMediaController {
  readonly postId: string;
  readonly authorHandle: string;
  readonly permalink: string;
  private snapshot: PostSnapshot;
  private readonly resolveBundle: (
    snapshot: PostSnapshot,
  ) => Promise<{ bundle: PostMediaBundle | null; source: "bridge" | "fallback" | null }>;
  private readonly peekBundle: (snapshot: PostSnapshot) => PostMediaBundle | null;
  private readonly removeCallback: () => void;
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private root: HTMLDivElement;
  private trigger: HTMLButtonElement;
  private status: HTMLDivElement;
  private popover: HTMLDivElement;
  private itemsList: HTMLDivElement;
  private bundle: PostMediaBundle | null = null;
  private bundleSource: "fallback" | "bridge" | null = null;
  private state: ControllerState = "idle";
  private errorMessage = "";
  private open = false;
  private autoCloseHandler = (event: Event) => this.handleDocumentInteraction(event);
  private keyHandler = (event: KeyboardEvent) => this.handleKeyboard(event);
  private viewportHandler = () => this.positionPopover();

  constructor(
    snapshot: PostSnapshot,
    resolveBundle: (snapshot: PostSnapshot) => Promise<{ bundle: PostMediaBundle | null; source: "bridge" | "fallback" | null }>,
    peekBundle: (snapshot: PostSnapshot) => PostMediaBundle | null,
  ) {
    this.snapshot = snapshot;
    this.postId = snapshot.statusId;
    this.authorHandle = snapshot.authorHandle;
    this.permalink = snapshot.permalink;
    this.resolveBundle = resolveBundle;
    this.peekBundle = peekBundle;
    this.removeCallback = () => undefined;
    this.host = document.createElement("div");
    this.host.setAttribute(HOST_ATTR, "1");
    this.host.dataset.postId = this.postId;
    this.host.dataset.authorHandle = this.authorHandle;
    this.host.dataset.permalink = this.permalink;
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.root = document.createElement("div");
    this.trigger = document.createElement("button");
    this.status = document.createElement("div");
    this.popover = document.createElement("div");
    this.itemsList = document.createElement("div");
    this.bundle = snapshot.fallbackItems.length > 0 ? toBundleFromSnapshot(snapshot) : null;
    this.bundleSource = this.bundle ? "fallback" : null;
    this.renderShell();
  }

  mount(): void {
    if (this.host.isConnected) {
      return;
    }

    const target = this.snapshot.actionBar ?? this.snapshot.article;
    target.append(this.host);
    this.sync(this.snapshot);
  }

  sync(snapshot: PostSnapshot): void {
    this.snapshot = snapshot;
    this.host.dataset.postId = snapshot.statusId;
    this.host.dataset.authorHandle = snapshot.authorHandle;
    this.host.dataset.permalink = snapshot.permalink;

    if (!this.bundle && snapshot.fallbackItems.length > 0) {
      this.bundle = toBundleFromSnapshot(snapshot);
      this.bundleSource = this.bundle ? "fallback" : null;
    }

    const cachedBundle = this.peekBundle(snapshot);
    if (cachedBundle) {
      this.bundle = cachedBundle;
      this.bundleSource = "bridge";
    }

    if (!this.bundle && snapshot.fallbackItems.length === 0) {
      this.bundle = null;
      this.bundleSource = null;
    }

    this.updateItemsList();
    this.renderState();
  }

  dispose(): void {
    this.closePopover();
    this.host.remove();
    this.removeCallback();
  }

  async handlePrimaryAction(): Promise<void> {
    const bundle = await this.ensureBundle();
    if (!bundle) {
      return;
    }

    if (bundle.items.length > 1) {
      this.togglePopover();
      return;
    }

    const item = bundle.items[0];
    if (item) {
      await this.downloadItem(bundle, item);
    }
  }

  async handleDownloadItem(item: PostMediaItem): Promise<void> {
    const bundle = await this.ensureBundle();
    if (!bundle) {
      return;
    }

    await this.downloadItem(bundle, item);
  }

  async handleDownloadAll(): Promise<void> {
    const bundle = await this.ensureBundle();
    if (!bundle) {
      return;
    }

    this.setState("loading");
    const response = await downloadAll({ bundle });
    const error = extractDownloadError(response);
    if (error) {
      this.setState("error", error);
      return;
    }

    this.setState("success", getMessage("downloadComplete"));
    this.closePopover();
    this.resetSuccessState();
  }

  async handleDownloadZip(): Promise<void> {
    const bundle = await this.ensureBundle();
    if (!bundle) {
      return;
    }

    this.setState("loading");
    const response = await downloadZip({ bundle });
    const error = extractDownloadError(response);
    if (error) {
      this.setState("error", error);
      return;
    }

    this.setState("success", getMessage("zipReady"));
    this.closePopover();
    this.resetSuccessState();
  }

  private async ensureBundle(): Promise<PostMediaBundle | null> {
    if (this.bundle && this.bundleSource === "bridge") {
      return this.bundle;
    }

    if (this.bundle && this.bundleSource === "fallback") {
      void this.resolveBundle(this.snapshot).then((resolved) => {
        if (!resolved.bundle) {
          return;
        }

        if (this.bundle !== resolved.bundle) {
          this.bundle = resolved.bundle;
          this.bundleSource = resolved.source;
          this.updateItemsList();
          this.renderState();
        }
      });

      return this.bundle;
    }

    this.setState("loading");
    const resolved = await this.resolveBundle(this.snapshot);
    if (!resolved.bundle) {
      this.setState("error", getMessage("couldNotResolvePostMedia"));
      return null;
    }

    this.bundle = resolved.bundle;
    this.bundleSource = resolved.source;
    this.updateItemsList();
    this.setState("ready");
    return resolved.bundle;
  }

  private renderShell(): void {
    this.shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        display: flex;
        align-self: center;
        align-items: center;
        line-height: 1;
      }

      .xd-root {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .xd-trigger {
        appearance: none;
        border: 0;
        border-radius: 999px;
        width: 3.17rem;
        height: 3.17rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        color: rgb(113, 118, 123);
        background: transparent;
        cursor: pointer;
        user-select: none;
        transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
      }

      .xd-trigger[data-state="loading"] {
        opacity: 0.78;
        cursor: progress;
      }

      .xd-trigger[data-state="error"] {
        color: rgb(244, 33, 46);
      }

      .xd-trigger[data-state="success"] {
        color: rgb(0, 186, 124);
      }

      .xd-trigger:hover {
        color: rgb(29, 155, 240);
        background: rgba(29, 155, 240, 0.1);
      }

      .xd-trigger:focus-visible {
        outline: 2px solid rgba(29, 155, 240, 0.55);
        outline-offset: 2px;
      }

      .xd-trigger__icon {
        width: 1.25rem;
        height: 1.25rem;
        display: block;
        flex-shrink: 0;
        pointer-events: none;
      }

      .xd-trigger__meta {
        position: absolute;
        right: 0.1rem;
        bottom: 0.1rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.1rem;
        height: 1.1rem;
        padding: 0 0.2rem;
        border-radius: 999px;
        background: rgb(29, 155, 240);
        color: #fff;
        font-size: 10.5px;
        font-weight: 700;
        line-height: 1;
        box-sizing: border-box;
      }

      .xd-status {
        min-height: 1rem;
        font-size: 11px;
        line-height: 1.35;
        color: #64748b;
        max-width: 160px;
      }

      .xd-status:empty {
        display: none;
      }

      .xd-status[data-state="error"] {
        color: #b91c1c;
      }

      .xd-status[data-state="success"] {
        color: #15803d;
      }

      .xd-popover {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 2147483647;
        min-width: 220px;
        max-width: min(320px, 80vw);
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(15, 23, 42, 0.98);
        box-shadow: 0 18px 44px rgba(15, 23, 42, 0.35);
        padding: 0.45rem;
        display: none;
        box-sizing: border-box;
      }

      .xd-popover[data-open="true"] {
        display: grid;
        gap: 0.4rem;
      }

      .xd-popover__title {
        margin: 0;
        padding: 0.25rem 0.45rem 0.15rem;
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #cbd5e1;
      }

      .xd-items {
        display: grid;
        gap: 0.35rem;
      }

      .xd-item,
      .xd-action {
        appearance: none;
        border: 0;
        border-radius: 12px;
        padding: 0.65rem 0.75rem;
        text-align: start;
        font-size: 13px;
        line-height: 1.25;
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.07);
        cursor: pointer;
      }

      .xd-item:hover,
      .xd-action:hover {
        filter: brightness(1.02);
      }

      .xd-action {
        background: rgba(96, 165, 250, 0.18);
      }
    `;

    this.root.className = "xd-root";
    this.trigger.className = "xd-trigger";
    this.trigger.type = "button";
    this.trigger.addEventListener("click", () => {
      void this.handlePrimaryAction();
    });

    this.status.className = "xd-status";
    this.popover.className = "xd-popover";
    this.popover.setAttribute("role", "menu");

    const title = document.createElement("p");
    title.className = "xd-popover__title";
    title.textContent = getMessage("postMediaTitle");

    this.itemsList.className = "xd-items";
    this.popover.append(title, this.itemsList);
    this.root.append(this.trigger, this.status, this.popover);
    this.shadow.append(style, this.root);
    this.renderState();
  }

  private updateItemsList(): void {
    this.itemsList.replaceChildren();
    const bundle = this.bundle;
    if (!bundle || bundle.items.length === 0) {
      return;
    }

    if (bundle.items.length > 1) {
      for (const item of bundle.items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "xd-item";
        button.textContent = `${describeItem(item)} ${item.filename}`;
        button.addEventListener("click", () => {
          void this.handleDownloadItem(item);
        });
        this.itemsList.append(button);
      }

      const allButton = document.createElement("button");
      allButton.type = "button";
      allButton.className = "xd-action";
      allButton.textContent = getMessage("downloadAll");
      allButton.addEventListener("click", () => {
        void this.handleDownloadAll();
      });

      const zipButton = document.createElement("button");
      zipButton.type = "button";
      zipButton.className = "xd-action";
      zipButton.textContent = getMessage("downloadZip");
      zipButton.addEventListener("click", () => {
        void this.handleDownloadZip();
      });

      this.itemsList.append(allButton, zipButton);
    }
  }

  private renderState(): void {
    this.trigger.dataset.state = this.state;
    this.status.dataset.state = this.state;
    this.popover.dataset.open = String(this.open);

    if (this.state === "loading") {
      this.status.textContent = getMessage("resolvingMedia");
    } else if (this.state === "error") {
      this.status.textContent = this.errorMessage;
    } else if (this.state === "success") {
      this.status.textContent = getMessage("downloadComplete");
    } else if (this.open && (this.bundle?.items.length ?? this.snapshot.fallbackItems.length) > 1) {
      this.status.textContent = getMessage(
        "selectOneOfMedias",
        String(this.bundle?.items.length ?? this.snapshot.fallbackItems.length),
      );
    } else {
      this.status.textContent = "";
    }

    this.updateTriggerLabel();
  }

  private updateTriggerLabel(): void {
    const count = this.bundle?.items.length ?? this.snapshot.fallbackItems.length;
    const hasMenu = count > 1;
    this.trigger.innerHTML = getDownloadIconMarkup(hasMenu ? String(count) : "");
    this.trigger.title = hasMenu ? getMessage("downloadOptionsTitle") : getMessage("downloadPostMediaTitle");
    this.trigger.setAttribute("aria-label", this.trigger.title);
    this.trigger.setAttribute("aria-haspopup", hasMenu ? "menu" : "false");
    this.trigger.setAttribute("aria-expanded", hasMenu ? String(this.open) : "false");
  }

  private setState(state: ControllerState, errorMessage = ""): void {
    this.state = state;
    this.errorMessage = errorMessage;
    this.renderState();
  }

  private togglePopover(): void {
    if (this.open) {
      this.closePopover();
      return;
    }

    this.openPopover();
  }

  private openPopover(): void {
    this.open = true;
    this.updateItemsList();
    this.renderState();
    this.positionPopover();
    document.addEventListener("pointerdown", this.autoCloseHandler, true);
    document.addEventListener("keydown", this.keyHandler, true);
    window.addEventListener("scroll", this.viewportHandler, true);
    window.addEventListener("resize", this.viewportHandler, true);
  }

  private closePopover(): void {
    if (!this.open) {
      return;
    }

    this.open = false;
    this.renderState();
    document.removeEventListener("pointerdown", this.autoCloseHandler, true);
    document.removeEventListener("keydown", this.keyHandler, true);
    window.removeEventListener("scroll", this.viewportHandler, true);
    window.removeEventListener("resize", this.viewportHandler, true);
  }

  private positionPopover(): void {
    if (!this.open) {
      return;
    }

    const margin = 8;
    const gap = 8;
    const triggerRect = this.trigger.getBoundingClientRect();
    const popoverRect = this.popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const fallbackWidth = Math.min(320, Math.max(220, viewportWidth - margin * 2));
    const popoverWidth = popoverRect.width || fallbackWidth;
    const popoverHeight = popoverRect.height || 0;

    let left = triggerRect.right - popoverWidth;
    let top = triggerRect.bottom + gap;

    if (left < margin) {
      left = Math.min(triggerRect.left, viewportWidth - popoverWidth - margin);
    }

    if (popoverHeight > 0 && top + popoverHeight > viewportHeight - margin) {
      top = triggerRect.top - popoverHeight - gap;
    }

    left = Math.max(margin, Math.min(left, viewportWidth - popoverWidth - margin));
    top = Math.max(margin, Math.min(top, viewportHeight - Math.max(popoverHeight, 1) - margin));

    this.popover.style.left = `${Math.round(left)}px`;
    this.popover.style.top = `${Math.round(top)}px`;
  }

  private handleDocumentInteraction(event: Event): void {
    const target = event.target as Node | null;
    if (!target || this.host.contains(target)) {
      return;
    }

    this.closePopover();
  }

  private handleKeyboard(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.closePopover();
    }
  }

  private async downloadItem(bundle: PostMediaBundle, item: PostMediaItem): Promise<void> {
    this.setState("loading");
    const response = await downloadOne({
      bundle,
      item,
      filename: item.filename,
    });

    const error = extractDownloadError(response);
    if (error) {
      this.setState("error", error);
      return;
    }

    this.setState("success", getMessage("downloadComplete"));
    this.closePopover();
    this.resetSuccessState();
  }

  private async resetSuccessState(): Promise<void> {
    window.setTimeout(() => {
      if (this.state === "success") {
        this.setState("ready");
      }
    }, 1000);
  }
}

function describeItem(item: PostMediaItem): string {
  const index = String(item.index);

  if (item.kind === "video") {
    return getMessage("itemVideo", index);
  }

  if (item.kind === "animated_gif") {
    return getMessage("itemGif", index);
  }

  return getMessage("itemMedia", index);
}

function getDownloadIconMarkup(meta: string): string {
  return `
    <svg class="xd-trigger__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <g>
        <path d="M17.53 10.53l-5 5-.53.53-.53-.53-5-5 1.06-1.06 3.72 3.72V3h1.5v10.19l3.72-3.72 1.06 1.06zM19.708 21H4.292C3.028 21 2 19.972 2 18.708V15h1.5v3.708c0 .437.355.792.792.792h15.416c.437 0 .792-.355.792-.792V15H22v3.708C22 19.972 20.972 21 19.708 21z"/>
      </g>
    </svg>
    ${meta ? `<span class="xd-trigger__meta" aria-hidden="true">${meta}</span>` : ""}
  `;
}

let singletonApp: JustDownloadTheTweetApp | null = null;

export function bootstrapJustDownloadTheTweet(): JustDownloadTheTweetApp {
  if (!singletonApp) {
    singletonApp = new JustDownloadTheTweetApp();
  }

  singletonApp.start();
  return singletonApp;
}

import {
  BRIDGE_MEDIA_EVENT,
  BRIDGE_MESSAGE_REQUEST_SNAPSHOT,
  BRIDGE_MESSAGE_SNAPSHOT,
  BRIDGE_NAMESPACE,
  type BridgeBundleEventDetail,
  type BridgeMessage,
  type BridgeSnapshotMessage,
  type PostMediaBundle,
} from "../bridge/contracts";
import { toBundleFromSnapshot, type PostSnapshot } from "./dom";

export class BridgeBundleCache {
  private readonly bundles = new Map<string, PostMediaBundle>();

  seed(bundles: PostMediaBundle[]): void {
    for (const bundle of bundles) {
      this.upsert(bundle);
    }
  }

  upsert(bundle: PostMediaBundle): void {
    const existing = this.bundles.get(bundle.postId);
    if (!existing) {
      this.bundles.set(bundle.postId, bundle);
      return;
    }

    this.bundles.set(bundle.postId, mergeBundles(existing, bundle));
  }

  find(snapshot: Pick<PostSnapshot, "statusId" | "permalink" | "authorHandle">): PostMediaBundle | null {
    const byId = this.bundles.get(snapshot.statusId);
    if (byId) {
      return byId;
    }

    for (const bundle of this.bundles.values()) {
      if (bundle.permalink && normalizeUrl(bundle.permalink) === normalizeUrl(snapshot.permalink)) {
        return bundle;
      }
    }

    return null;
  }

  values(): PostMediaBundle[] {
    return [...this.bundles.values()];
  }
}

export function installBridgeListeners(cache: BridgeBundleCache, onUpdate: (bundle: PostMediaBundle) => void): () => void {
  const handleBundleEvent = (event: Event): void => {
    const customEvent = event as CustomEvent<BridgeBundleEventDetail>;
    const bundle = customEvent.detail?.bundle as PostMediaBundle | undefined;
    if (!bundle) {
      return;
    }

    cache.upsert(bundle);
    onUpdate(bundle);
  };

  const handleMessage = (event: MessageEvent<BridgeMessage | unknown>): void => {
    if (event.source !== window) {
      return;
    }

    const message = event.data as Partial<BridgeSnapshotMessage> | null;
    if (!message || message.source !== BRIDGE_NAMESPACE || message.type !== BRIDGE_MESSAGE_SNAPSHOT || !Array.isArray(message.bundles)) {
      return;
    }

    const bundles = message.bundles as PostMediaBundle[];

    if (bundles.length === 0) {
      return;
    }

    cache.seed(bundles);
    for (const bundle of bundles) {
      onUpdate(bundle);
    }
  };

  document.addEventListener(BRIDGE_MEDIA_EVENT, handleBundleEvent);
  window.addEventListener("message", handleMessage);

  return () => {
    document.removeEventListener(BRIDGE_MEDIA_EVENT, handleBundleEvent);
    window.removeEventListener("message", handleMessage);
  };
}

export async function requestBridgeSnapshot(timeoutMs = 1200): Promise<PostMediaBundle[]> {
  return await new Promise<PostMediaBundle[]>((resolve) => {
    const requestId = crypto.randomUUID();
    let settled = false;

    const cleanup = (value: PostMediaBundle[]): void => {
      if (settled) {
        return;
      }

      settled = true;
      window.removeEventListener("message", handleMessage);
      clearTimeout(timerId);
      resolve(value);
    };

    const handleMessage = (event: MessageEvent<BridgeMessage | unknown>): void => {
      if (event.source !== window) {
        return;
      }

      const message = event.data as Partial<BridgeSnapshotMessage> | null;
      if (!message || message.source !== BRIDGE_NAMESPACE || message.type !== BRIDGE_MESSAGE_SNAPSHOT || message.requestId !== requestId) {
        return;
      }

      const bundles = Array.isArray(message.bundles) ? (message.bundles as PostMediaBundle[]) : [];

      cleanup(bundles);
    };

    const timerId = window.setTimeout(() => cleanup([]), timeoutMs);
    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        source: BRIDGE_NAMESPACE,
        type: BRIDGE_MESSAGE_REQUEST_SNAPSHOT,
        requestId,
      },
      "*",
    );
  });
}

export function snapshotToBundle(snapshot: PostSnapshot): PostMediaBundle | null {
  return toBundleFromSnapshot(snapshot);
}

function mergeBundles(existing: PostMediaBundle, next: PostMediaBundle): PostMediaBundle {
  const seen = new Set(existing.items.map((item) => item.url));
  const items = [...existing.items];

  for (const item of next.items) {
    if (seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);
    items.push(item);
  }

  items.sort((left, right) => left.index - right.index);

  return {
    ...existing,
    authorHandle: existing.authorHandle || next.authorHandle,
    permalink: existing.permalink || next.permalink,
    items,
  };
}

function normalizeUrl(value: string): string {
  try {
    const parsed = new URL(value, window.location.href);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return value;
  }
}

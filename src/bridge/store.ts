import type { PostMediaBundle } from './contracts';

export class MediaBundleStore {
  private readonly bundles = new Map<string, PostMediaBundle>();

  upsert(bundle: PostMediaBundle): { bundle: PostMediaBundle; changed: boolean } {
    const existing = this.bundles.get(bundle.postId);
    if (!existing) {
      this.bundles.set(bundle.postId, bundle);
      return { bundle, changed: true };
    }

    const merged = mergeBundles(existing, bundle);
    const changed = !areBundlesEqual(existing, merged);
    if (changed) {
      this.bundles.set(bundle.postId, merged);
    }

    return { bundle: changed ? merged : existing, changed };
  }

  get(postId: string): PostMediaBundle | null {
    return this.bundles.get(postId) ?? null;
  }

  values(): PostMediaBundle[] {
    return [...this.bundles.values()];
  }

  size(): number {
    return this.bundles.size;
  }

  clear(): void {
    this.bundles.clear();
  }
}

function mergeBundles(existing: PostMediaBundle, next: PostMediaBundle): PostMediaBundle {
  const seen = new Set(existing.items.map((item) => item.url));
  const items = [...existing.items];
  for (const item of next.items) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      items.push(item);
    }
  }
  items.sort((a, b) => a.index - b.index);

  return {
    ...existing,
    authorHandle: existing.authorHandle || next.authorHandle,
    permalink: existing.permalink || next.permalink,
    items,
  };
}

function areBundlesEqual(left: PostMediaBundle, right: PostMediaBundle): boolean {
  if (
    left.postId !== right.postId ||
    left.authorHandle !== right.authorHandle ||
    left.permalink !== right.permalink ||
    left.items.length !== right.items.length
  ) {
    return false;
  }

  for (let index = 0; index < left.items.length; index += 1) {
    const a = left.items[index];
    const b = right.items[index];
    if (
      a.postId !== b.postId ||
      a.authorHandle !== b.authorHandle ||
      a.index !== b.index ||
      a.kind !== b.kind ||
      a.url !== b.url ||
      a.mimeType !== b.mimeType ||
      a.filename !== b.filename ||
      a.width !== b.width ||
      a.height !== b.height ||
      a.bitrate !== b.bitrate
    ) {
      return false;
    }
  }

  return true;
}

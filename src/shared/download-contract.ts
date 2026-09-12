export type MediaKind = 'photo' | 'video' | 'animated_gif' | 'image' | 'gif' | 'unknown';

export interface PostMediaItem {
  postId: string;
  authorHandle: string;
  index: number;
  kind: MediaKind;
  url: string;
  mimeType?: string;
  filename?: string;
  width?: number;
  height?: number;
  bitrate?: number;
}

export interface PostMediaBundle {
  postId: string;
  authorHandle: string;
  permalink?: string;
  items: PostMediaItem[];
}

export type DownloadAction = 'DOWNLOAD_ONE' | 'DOWNLOAD_ALL' | 'DOWNLOAD_ZIP';

export interface DownloadItemResult {
  ok: boolean;
  downloadId?: number;
  filename: string;
  url: string;
  error?: string;
}

export interface OffscreenZipSkippedItem {
  index: number;
  url: string;
  error: string;
}

export interface DownloadResultMessage {
  type: 'DOWNLOAD_RESULT';
  requestId: string;
  action: DownloadAction;
  ok: boolean;
  files: DownloadItemResult[];
  archiveFilename?: string;
  archiveUrl?: string;
  skipped?: OffscreenZipSkippedItem[];
  warnings?: string[];
  error?: string;
}

export interface DownloadOneRequest {
  type: 'DOWNLOAD_ONE';
  requestId: string;
  item: PostMediaItem;
  bundle?: PostMediaBundle;
  filename?: string;
}

export interface DownloadAllRequest {
  type: 'DOWNLOAD_ALL';
  requestId: string;
  bundle: PostMediaBundle;
}

export interface DownloadZipRequest {
  type: 'DOWNLOAD_ZIP';
  requestId: string;
  bundle: PostMediaBundle;
}

export type DownloadRequest = DownloadOneRequest | DownloadAllRequest | DownloadZipRequest;

export interface OffscreenZipRequest {
  type: 'OFFSCREEN_ZIP_REQUEST';
  requestId: string;
  bundle: PostMediaBundle;
  archiveFilename: string;
}

export interface OffscreenZipResponse {
  type: 'OFFSCREEN_ZIP_READY';
  requestId: string;
  ok: true;
  archiveFilename: string;
  archiveUrl: string;
  itemCount: number;
  skipped: OffscreenZipSkippedItem[];
}

export interface OffscreenZipError {
  type: 'OFFSCREEN_ZIP_ERROR';
  requestId: string;
  ok: false;
  error: string;
  skipped: OffscreenZipSkippedItem[];
}

export type OffscreenZipMessage = OffscreenZipRequest | OffscreenZipResponse | OffscreenZipError;

type PlainRecord = Record<string, unknown>;

function isRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readObject(source: unknown, key: string): PlainRecord | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  const candidate = source[key];
  return isRecord(candidate) ? candidate : undefined;
}

function readNumber(source: unknown, key: string): number | undefined {
  if (!isRecord(source)) {
    return undefined;
  }
  return asNumber(source[key]);
}

export function normalizeMediaItem(raw: unknown): PostMediaItem | null {
  if (!isRecord(raw)) {
    return null;
  }

  const postId = asString(raw.postId) ?? asString(raw.id) ?? asString(raw.statusId);
  const authorHandle = asString(raw.authorHandle) ?? asString(raw.author) ?? asString(raw.username) ?? 'user';
  const index = asNumber(raw.index) ?? 1;
  const kind = asString(raw.kind) as MediaKind | undefined;
  const url = asString(raw.url) ?? asString(raw.href) ?? asString(raw.mediaUrl);

  if (!postId || !url) {
    return null;
  }

  return {
    postId,
    authorHandle,
    index,
    kind: kind ?? 'unknown',
    url,
    mimeType: asString(raw.mimeType) ?? asString(raw.type),
    filename: asString(raw.filename) ?? asString(raw.name),
    width: readNumber(raw, 'width'),
    height: readNumber(raw, 'height'),
    bitrate: readNumber(raw, 'bitrate'),
  };
}

export function normalizePostMediaBundle(raw: unknown): PostMediaBundle | null {
  if (!isRecord(raw)) {
    return null;
  }

  const postId = asString(raw.postId) ?? asString(raw.id) ?? asString(raw.statusId);
  if (!postId) {
    return null;
  }

  const authorHandle = asString(raw.authorHandle) ?? asString(raw.author) ?? asString(raw.username) ?? 'user';
  const permalink = asString(raw.permalink) ?? asString(raw.url) ?? asString(raw.sourceUrl);
  const itemsSource = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.media) ? raw.media : [];
  const items = itemsSource.map(normalizeMediaItem).filter((item): item is PostMediaItem => Boolean(item));

  return {
    postId,
    authorHandle,
    permalink,
    items,
  };
}

export function normalizeDownloadRequest(raw: unknown): DownloadRequest | null {
  if (!isRecord(raw)) {
    return null;
  }

  const type =
    asString(raw.type) ??
    asString(raw.action) ??
    asString(raw.kind) ??
    asString(raw.messageType);
  const requestId = asString(raw.requestId) ?? asString(raw.id) ?? crypto.randomUUID();
  const payload = readObject(raw, 'payload') ?? raw;

  if (type === 'DOWNLOAD_ONE') {
    const item = normalizeMediaItem(readObject(payload, 'item') ?? raw.item ?? raw.mediaItem ?? raw.media);
    const bundle = normalizePostMediaBundle(readObject(payload, 'bundle') ?? raw.bundle);
    const filename = asString(raw.filename) ?? asString(payload.filename);
    if (!item) {
      return null;
    }

    return {
      type,
      requestId,
      item: filename ? { ...item, filename } : item,
      bundle: bundle ?? undefined,
      filename,
    };
  }

  if (type === 'DOWNLOAD_ALL') {
    const bundle = normalizePostMediaBundle(readObject(payload, 'bundle') ?? raw.bundle ?? raw.post);
    if (!bundle) {
      return null;
    }

    return {
      type,
      requestId,
      bundle,
    };
  }

  if (type === 'DOWNLOAD_ZIP') {
    const bundle = normalizePostMediaBundle(readObject(payload, 'bundle') ?? raw.bundle ?? raw.post);
    if (!bundle) {
      return null;
    }

    return {
      type,
      requestId,
      bundle,
    };
  }

  return null;
}

export function normalizeOffscreenZipRequest(raw: unknown): OffscreenZipRequest | null {
  if (!isRecord(raw)) {
    return null;
  }

  const type = asString(raw.type) ?? asString(raw.action);
  if (type !== 'OFFSCREEN_ZIP_REQUEST') {
    return null;
  }

  const requestId = asString(raw.requestId) ?? crypto.randomUUID();
  const bundle = normalizePostMediaBundle(raw.bundle ?? readObject(raw, 'bundle'));
  const archiveFilename = asString(raw.archiveFilename) ?? 'download.zip';

  if (!bundle) {
    return null;
  }

  return {
    type,
    requestId,
    bundle,
    archiveFilename,
  };
}

export function normalizeOffscreenReleaseRequest(raw: unknown): { type: 'OFFSCREEN_RELEASE_URL'; requestId: string; archiveUrl: string } | null {
  if (!isRecord(raw)) {
    return null;
  }

  const type = asString(raw.type) ?? asString(raw.action);
  if (type !== 'OFFSCREEN_RELEASE_URL') {
    return null;
  }

  const requestId = asString(raw.requestId) ?? crypto.randomUUID();
  const archiveUrl = asString(raw.archiveUrl) ?? asString(raw.url);
  if (!archiveUrl) {
    return null;
  }

  return {
    type,
    requestId,
    archiveUrl,
  };
}

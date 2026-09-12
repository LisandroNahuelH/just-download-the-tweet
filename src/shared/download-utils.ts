import type { DownloadAction, PostMediaBundle, PostMediaItem } from './download-contract';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const TRAILING_DOTS_AND_SPACES = /[. ]+$/g;
const LEADING_AT = /^@+/;

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/zip': 'zip',
};

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function stripPath(value: string): string {
  return value.split('/').pop() ?? value;
}

export function sanitizeFilenamePart(value: unknown, fallback = 'user'): string {
  const base = safeString(value, fallback)
    .replace(LEADING_AT, '')
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/\s+/g, ' ')
    .replace(TRAILING_DOTS_AND_SPACES, '')
    .trim();

  return base || fallback;
}

export function sanitizeFilename(value: unknown, fallback = 'download'): string {
  const base = stripPath(safeString(value, fallback))
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/\s+/g, ' ')
    .replace(TRAILING_DOTS_AND_SPACES, '')
    .trim();

  return base || fallback;
}

export function stripExtension(name: string): string {
  const clean = sanitizeFilename(name);
  const dotIndex = clean.lastIndexOf('.');
  if (dotIndex <= 0) {
    return clean;
  }
  return clean.slice(0, dotIndex);
}

export function getExtensionFromName(name: string): string | undefined {
  const clean = sanitizeFilename(name);
  const dotIndex = clean.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === clean.length - 1) {
    return undefined;
  }
  return clean.slice(dotIndex + 1).toLowerCase();
}

export function getExtensionFromUrl(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    const format = parsedUrl.searchParams.get('format') ?? parsedUrl.searchParams.get('ext');
    if (format) {
      return format.toLowerCase();
    }

    const pathname = parsedUrl.pathname;
    const lastSegment = pathname.split('/').pop() ?? '';
    const dotIndex = lastSegment.lastIndexOf('.');
    if (dotIndex > 0 && dotIndex < lastSegment.length - 1) {
      return lastSegment.slice(dotIndex + 1).toLowerCase();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getExtensionFromMimeType(mimeType: unknown): string | undefined {
  const normalized = safeString(mimeType).toLowerCase();
  return MIME_TO_EXTENSION[normalized];
}

export function inferExtension(item: Pick<PostMediaItem, 'filename' | 'mimeType' | 'url' | 'kind'>): string {
  const filenameExtension = item.filename ? getExtensionFromName(item.filename) : undefined;
  if (filenameExtension) {
    return filenameExtension;
  }

  const urlExtension = getExtensionFromUrl(item.url);
  if (urlExtension) {
    return urlExtension;
  }

  const mimeExtension = getExtensionFromMimeType(item.mimeType);
  if (mimeExtension) {
    return mimeExtension;
  }

  if (item.kind === 'gif' || item.kind === 'animated_gif') {
    return 'mp4';
  }

  if (item.kind === 'video') {
    return 'mp4';
  }

  return 'bin';
}

export function ensureExtension(name: string, extension: string): string {
  const normalizedExtension = extension.replace(/^\.+/, '').toLowerCase();
  const sanitizedName = sanitizeFilename(name);
  const currentExtension = getExtensionFromName(sanitizedName);
  if (currentExtension) {
    return sanitizedName;
  }

  return `${stripExtension(sanitizedName)}.${normalizedExtension}`;
}

export function buildMediaFilename(item: PostMediaItem, fallbackIndex = item.index): string {
  const authorHandle = sanitizeFilenamePart(item.authorHandle, 'user');
  const postId = sanitizeFilenamePart(item.postId, 'post');
  const index = Number.isFinite(fallbackIndex) && fallbackIndex > 0 ? Math.trunc(fallbackIndex) : 1;
  const extension = inferExtension(item);
  return `@${authorHandle}_${postId}_${String(index).padStart(2, '0')}.${extension}`;
}

export function buildArchiveFilename(bundle: Pick<PostMediaBundle, 'authorHandle' | 'postId'>): string {
  const authorHandle = sanitizeFilenamePart(bundle.authorHandle, 'user');
  const postId = sanitizeFilenamePart(bundle.postId, 'post');
  return `@${authorHandle}_${postId}_media.zip`;
}

export function buildDownloadFilename(item: PostMediaItem): string {
  return ensureExtension(buildMediaFilename(item), inferExtension(item));
}

export function isDownloadAction(value: unknown): value is DownloadAction {
  return value === 'DOWNLOAD_ONE' || value === 'DOWNLOAD_ALL' || value === 'DOWNLOAD_ZIP';
}

export function coerceDownloadAction(value: unknown): DownloadAction | undefined {
  return isDownloadAction(value) ? value : undefined;
}

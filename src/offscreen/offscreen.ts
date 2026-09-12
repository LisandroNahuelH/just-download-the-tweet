import JSZip from 'jszip';

import {
  type OffscreenZipError,
  type OffscreenZipMessage,
  type OffscreenZipRequest,
  type OffscreenZipResponse,
  normalizeOffscreenReleaseRequest,
  normalizeOffscreenZipRequest,
} from '../shared/download-contract';
import { getMessage } from '../shared/browser/getMessage';
import { buildMediaFilename } from '../shared/download-utils';

type ZipFileResult = {
  ok: boolean;
  index: number;
  url: string;
  filename: string;
  error?: string;
  blob?: Blob;
};

const MAX_CONCURRENT_FETCHES = 4;
const ACTIVE_ARCHIVE_URLS = new Set<string>();

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return getMessage('unknownZipError');
  }
}

function releaseArchiveUrl(archiveUrl: string): void {
  if (!archiveUrl || !ACTIVE_ARCHIVE_URLS.has(archiveUrl)) {
    return;
  }

  ACTIVE_ARCHIVE_URLS.delete(archiveUrl);
  try {
    URL.revokeObjectURL(archiveUrl);
  } catch {
    // Ignore revocation failures; the URL may already have been revoked.
  }
}

async function fetchItemBlob(request: OffscreenZipRequest, index: number): Promise<ZipFileResult> {
  const item = request.bundle.items[index];
  const filename = buildMediaFilename({ ...item, index: item.index || index + 1 });

  try {
    const response = await fetch(item.url);
    if (!response.ok) {
      throw new Error(getMessage('httpFetchError', String(response.status)));
    }

    const blob = await response.blob();
    return {
      ok: true,
      index,
      url: item.url,
      filename,
      blob,
    };
  } catch (error) {
    return {
      ok: false,
      index,
      url: item.url,
      filename,
      error: toErrorMessage(error),
    };
  }
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function buildZipResponse(request: OffscreenZipRequest): Promise<OffscreenZipResponse | OffscreenZipError> {
  const fileResults = await mapWithConcurrency(request.bundle.items, MAX_CONCURRENT_FETCHES, (_item, index) =>
    fetchItemBlob(request, index),
  );

  const zip = new JSZip();
  const skipped = fileResults.filter((result): result is ZipFileResult & { ok: false; error: string } => !result.ok && Boolean(result.error));
  const successfulFiles = fileResults.filter((result): result is ZipFileResult & { ok: true; blob: Blob } => result.ok && Boolean(result.blob));

  for (const result of successfulFiles) {
    zip.file(result.filename, result.blob, { binary: true });
  }

  if (successfulFiles.length === 0) {
    return {
      type: 'OFFSCREEN_ZIP_ERROR',
      requestId: request.requestId,
      ok: false,
      error: getMessage('zipNoMediaFetched'),
      skipped: skipped.map((item) => ({
        index: item.index,
        url: item.url,
        error: item.error ?? getMessage('unknownFetchFailure'),
      })),
    };
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });

  const archiveUrl = URL.createObjectURL(zipBlob);
  ACTIVE_ARCHIVE_URLS.add(archiveUrl);
  return {
    type: 'OFFSCREEN_ZIP_READY',
    requestId: request.requestId,
    ok: true,
    archiveFilename: request.archiveFilename,
    archiveUrl,
    itemCount: successfulFiles.length,
    skipped: skipped.map((item) => ({
      index: item.index,
      url: item.url,
      error: item.error ?? getMessage('unknownFetchFailure'),
    })),
  };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: (response: OffscreenZipMessage | { ok: true } | { ok: false; error: string }) => void) => {
  const zipRequest = normalizeOffscreenZipRequest(message);
  if (zipRequest) {
    void (async () => {
      try {
        const response = await buildZipResponse(zipRequest);
        sendResponse(response);
      } catch (error) {
        const response: OffscreenZipError = {
          type: 'OFFSCREEN_ZIP_ERROR',
          requestId: zipRequest.requestId,
          ok: false,
          error: toErrorMessage(error),
          skipped: [],
        };
        sendResponse(response);
      }
    })();

    return true;
  }

  const releaseRequest = normalizeOffscreenReleaseRequest(message);
  if (releaseRequest) {
    releaseArchiveUrl(releaseRequest.archiveUrl);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

window.addEventListener('unload', () => {
  for (const archiveUrl of ACTIVE_ARCHIVE_URLS) {
    try {
      URL.revokeObjectURL(archiveUrl);
    } catch {
      // Ignore errors while the document is closing.
    }
  }
  ACTIVE_ARCHIVE_URLS.clear();
});

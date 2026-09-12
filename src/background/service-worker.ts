import {
  type DownloadAction,
  type DownloadItemResult,
  type DownloadRequest,
  type DownloadResultMessage,
  type OffscreenZipError,
  type OffscreenZipResponse,
  normalizeDownloadRequest,
} from '../shared/download-contract';
import { getMessage } from '../shared/browser/getMessage';
import {
  buildArchiveFilename,
  buildDownloadFilename,
  coerceDownloadAction,
  ensureExtension,
  inferExtension,
  sanitizeFilename,
} from '../shared/download-utils';
import { registerHeartbeatOnInstalled } from '../features/heartbeat/register-heartbeat-on-installed';
import { registerUninstallFarewellUrl } from '../features/heartbeat/register-uninstall-farewell-url';
import { sendAnonymousHeartbeat } from '../features/heartbeat/send-anonymous-heartbeat';

const OFFSCREEN_PAGE_PATH = 'src/offscreen/offscreen.html';
const OFFSCREEN_RELEASE_TYPE = 'OFFSCREEN_RELEASE_URL';
const ARCHIVE_URL_RELEASE_TIMEOUT_MS = 60_000;

let offscreenDocumentPromise: Promise<void> | null = null;

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
    return getMessage('unknownDownloadError');
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function downloadWithChrome(url: string, filename: string): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        conflictAction: 'uniquify',
        saveAs: false,
      },
      (downloadId: number | undefined) => {
        const lastError = chrome.runtime?.lastError?.message;
        if (lastError) {
          reject(new Error(lastError));
          return;
        }

        if (!isFiniteNumber(downloadId)) {
          reject(new Error(getMessage('chromeNoDownloadId')));
          return;
        }

        resolve(downloadId);
      },
    );
  });
}

async function ensureOffscreenDocument(): Promise<void> {
  const documentUrl = chrome.runtime.getURL(OFFSCREEN_PAGE_PATH);
  const contexts = await new Promise<chrome.runtime.ExtensionContext[]>((resolve) => {
    chrome.runtime.getContexts(
      {
        contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
        documentUrls: [documentUrl],
      },
      resolve,
    );
  });

  if (contexts.length > 0) {
    return;
  }

  if (!offscreenDocumentPromise) {
    offscreenDocumentPromise = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PAGE_PATH,
        reasons: ['BLOBS' as chrome.offscreen.Reason],
        justification: 'Create ZIP archives for downloaded X media.',
      })
      .then(() => undefined)
      .finally(() => {
        offscreenDocumentPromise = null;
      });
  }

  await offscreenDocumentPromise;
}

async function requestZipArchive(request: DownloadRequest & { type: 'DOWNLOAD_ZIP' }): Promise<OffscreenZipResponse | OffscreenZipError> {
  await ensureOffscreenDocument();

  const archiveFilename = buildArchiveFilename(request.bundle);
  const response = await chrome.runtime.sendMessage({
    type: 'OFFSCREEN_ZIP_REQUEST',
    requestId: request.requestId,
    bundle: request.bundle,
    archiveFilename,
  });

  if (!response || typeof response !== 'object') {
    return {
      type: 'OFFSCREEN_ZIP_ERROR',
      requestId: request.requestId,
      ok: false,
      error: getMessage('offscreenNoResponse'),
      skipped: [],
    };
  }

  return response as OffscreenZipResponse | OffscreenZipError;
}

async function releaseArchiveUrl(requestId: string, archiveUrl: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: OFFSCREEN_RELEASE_TYPE,
      requestId,
      archiveUrl,
    });
  } catch {
    // The offscreen document may already be gone. That is safe to ignore.
  }
}

function releaseArchiveUrlAfterDownload(downloadId: number, requestId: string, archiveUrl: string): void {
  let released = false;
  let timeoutId: number | undefined;

  const release = (): void => {
    if (released) {
      return;
    }

    released = true;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    chrome.downloads.onChanged.removeListener(listener);
    void releaseArchiveUrl(requestId, archiveUrl);
  };

  const listener = (delta: chrome.downloads.DownloadDelta): void => {
    if (delta.id !== downloadId || !delta.state?.current) {
      return;
    }

    if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
      release();
    }
  };

  chrome.downloads.onChanged.addListener(listener);
  timeoutId = setTimeout(release, ARCHIVE_URL_RELEASE_TIMEOUT_MS) as unknown as number;
}

function normalizeAction(value: unknown): DownloadAction | undefined {
  return coerceDownloadAction(value);
}

function buildDownloadResult(
  requestId: string,
  action: DownloadAction,
  files: DownloadItemResult[],
  extra: Partial<Pick<DownloadResultMessage, 'archiveFilename' | 'archiveUrl' | 'error' | 'warnings' | 'skipped'>> = {},
): DownloadResultMessage {
  const ok = files.every((file) => file.ok) && !extra.error;
  return {
    type: 'DOWNLOAD_RESULT',
    requestId,
    action,
    ok,
    files,
    archiveFilename: extra.archiveFilename,
    archiveUrl: extra.archiveUrl,
    skipped: extra.skipped,
    warnings: extra.warnings,
    error: extra.error,
  };
}

async function handleDownloadOne(request: Extract<DownloadRequest, { type: 'DOWNLOAD_ONE' }>): Promise<DownloadResultMessage> {
  const inferredFilename = buildDownloadFilename(request.item);
  const requestedFilename = request.filename ? ensureExtension(sanitizeFilename(request.filename), inferExtension(request.item)) : inferredFilename;

  try {
    const downloadId = await downloadWithChrome(request.item.url, requestedFilename);
    return buildDownloadResult(request.requestId, 'DOWNLOAD_ONE', [
      {
        ok: true,
        downloadId,
        filename: requestedFilename,
        url: request.item.url,
      },
    ]);
  } catch (error) {
    return buildDownloadResult(
      request.requestId,
      'DOWNLOAD_ONE',
      [
        {
          ok: false,
          filename: requestedFilename,
          url: request.item.url,
          error: toErrorMessage(error),
        },
      ],
      {
        error: toErrorMessage(error),
      },
    );
  }
}

async function handleDownloadAll(request: Extract<DownloadRequest, { type: 'DOWNLOAD_ALL' }>): Promise<DownloadResultMessage> {
  const files: DownloadItemResult[] = [];

  for (const [index, item] of request.bundle.items.entries()) {
    const filename = buildDownloadFilename({ ...item, index: index + 1 });
    try {
      const downloadId = await downloadWithChrome(item.url, filename);
      files.push({
        ok: true,
        downloadId,
        filename,
        url: item.url,
      });
    } catch (error) {
      files.push({
        ok: false,
        filename,
        url: item.url,
        error: toErrorMessage(error),
      });
    }

    await sleep(25);
  }

  return buildDownloadResult(request.requestId, 'DOWNLOAD_ALL', files);
}

async function handleDownloadZip(request: Extract<DownloadRequest, { type: 'DOWNLOAD_ZIP' }>): Promise<DownloadResultMessage> {
  const zipResponse = await requestZipArchive(request);

  if (!zipResponse.ok) {
    return buildDownloadResult(
      request.requestId,
      'DOWNLOAD_ZIP',
      [],
      {
        error: zipResponse.error,
        skipped: zipResponse.skipped,
      },
    );
  }

  try {
    const downloadId = await downloadWithChrome(zipResponse.archiveUrl, zipResponse.archiveFilename);
    const warnings = zipResponse.skipped.length > 0
      ? [getMessage('zipItemsSkippedWarning', String(zipResponse.skipped.length))]
      : undefined;
    const response = buildDownloadResult(
      request.requestId,
      'DOWNLOAD_ZIP',
      [
        {
          ok: true,
          downloadId,
          filename: zipResponse.archiveFilename,
          url: zipResponse.archiveUrl,
        },
      ],
      {
        archiveFilename: zipResponse.archiveFilename,
        archiveUrl: zipResponse.archiveUrl,
        warnings,
        skipped: zipResponse.skipped,
      },
    );

    releaseArchiveUrlAfterDownload(downloadId, request.requestId, zipResponse.archiveUrl);
    return response;
  } catch (error) {
    void releaseArchiveUrl(request.requestId, zipResponse.archiveUrl);
    return buildDownloadResult(
      request.requestId,
      'DOWNLOAD_ZIP',
      [
        {
          ok: false,
          filename: zipResponse.archiveFilename,
          url: zipResponse.archiveUrl,
          error: toErrorMessage(error),
        },
      ],
      {
        archiveFilename: zipResponse.archiveFilename,
        archiveUrl: zipResponse.archiveUrl,
        error: toErrorMessage(error),
        skipped: zipResponse.skipped,
      },
    );
  }
}

async function handleDownloadRequest(request: DownloadRequest): Promise<DownloadResultMessage> {
  const action = normalizeAction(request.type);
  if (!action) {
    return {
      type: 'DOWNLOAD_RESULT',
      requestId: request.requestId,
      action: 'DOWNLOAD_ONE',
      ok: false,
      files: [],
      error: getMessage('unsupportedRequestType', String(request.type)),
    };
  }

  if (action === 'DOWNLOAD_ONE' && request.type === 'DOWNLOAD_ONE') {
    return handleDownloadOne(request);
  }

  if (action === 'DOWNLOAD_ALL' && request.type === 'DOWNLOAD_ALL') {
    return handleDownloadAll(request);
  }

  if (action === 'DOWNLOAD_ZIP' && request.type === 'DOWNLOAD_ZIP') {
    return handleDownloadZip(request);
  }

  return {
    type: 'DOWNLOAD_RESULT',
    requestId: request.requestId,
    action,
    ok: false,
    files: [],
    error: getMessage('malformedRequestPayload', action),
  };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender: unknown, sendResponse: (response: DownloadResultMessage | { ok: boolean }) => void) => {
  if (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as { type?: string }).type === 'HEARTBEAT_PING'
  ) {
    void sendAnonymousHeartbeat('ping');
    sendResponse({ ok: true });
    return false;
  }

  const request = normalizeDownloadRequest(message);
  if (!request) {
    return false;
  }

  void (async () => {
    try {
      const result = await handleDownloadRequest(request);
      sendResponse(result);
    } catch (error) {
      sendResponse({
        type: 'DOWNLOAD_RESULT',
        requestId: request.requestId,
        action: request.type,
        ok: false,
        files: [],
        error: toErrorMessage(error),
      });
    }
  })();

  return true;
});

registerHeartbeatOnInstalled();
void registerUninstallFarewellUrl();
chrome.runtime.onStartup?.addListener?.(() => {
  void registerUninstallFarewellUrl();
});

import type { BridgeBundleEventDetail, BridgeReadyEventDetail } from './contracts';
import { dispatchBridgeError, dispatchBridgeReady, dispatchBundleUpdate, registerSnapshotResponder } from './events';
import { extractBundlesFromPayload } from './media-extract';
import { MediaBundleStore } from './store';

const INSTALL_KEY = '__justDownloadTheTweetBridgeInstalled__' as const;
const XHR_META = '__justDownloadTheTweetBridgeXhrMeta__' as const;
const XHR_HOOKED = '__justDownloadTheTweetBridgeHooked__' as const;

interface XhrMeta {
  method: string;
  url: string;
}

interface InstallState {
  store: MediaBundleStore;
  originalFetch: typeof fetch;
  originalXhrOpen: typeof XMLHttpRequest.prototype.open;
  originalXhrSend: typeof XMLHttpRequest.prototype.send;
  snapshotResponderDispose?: () => void;
}

declare global {
  interface Window {
    __justDownloadTheTweetBridgeInstalled__?: InstallState;
  }
}

export function installJustDownloadTheTweetBridge(target: Window = window): void {
  if (target[INSTALL_KEY]) {
    return;
  }

  const targetWindow = target as Window & { XMLHttpRequest: typeof XMLHttpRequest };
  const state: InstallState = {
    store: new MediaBundleStore(),
    originalFetch: target.fetch.bind(target),
    originalXhrOpen: targetWindow.XMLHttpRequest.prototype.open,
    originalXhrSend: targetWindow.XMLHttpRequest.prototype.send,
  };
  target[INSTALL_KEY] = state;

  patchFetch(target, state);
  patchXhr(target, state);
  state.snapshotResponderDispose = registerSnapshotResponder({
    target,
    getBundles: () => state.store.values(),
  });

  const readyDetail: BridgeReadyEventDetail = {
    installedAt: Date.now(),
    bundleCount: state.store.size(),
  };
  dispatchBridgeReady(target, readyDetail);
}

export function getBridgeSnapshot(target: Window = window) {
  return target[INSTALL_KEY]?.store.values() ?? [];
}

function patchFetch(target: Window, state: InstallState): void {
  const patchedFetch: typeof fetch = function patchedFetch(...args: Parameters<typeof fetch>) {
    const result = state.originalFetch(...args);
    void Promise.resolve(result)
      .then((response) => {
        void inspectResponse(response, {
          target,
          state,
          transport: 'fetch',
          endpoint: extractEndpointFromFetchArgs(args),
        });
      })
      .catch(() => {
        // Ignore fetch inspection errors.
      });
    return result;
  };

  target.fetch = patchedFetch;
}

function patchXhr(target: Window, state: InstallState): void {
  const xhrProto = (target as Window & { XMLHttpRequest: typeof XMLHttpRequest }).XMLHttpRequest
    .prototype as typeof XMLHttpRequest.prototype & Record<string, unknown>;

  xhrProto.open = function open(this: XMLHttpRequest & Record<string, unknown>, method: string, url: string, ...rest: unknown[]) {
    this[XHR_META] = {
      method,
      url,
    } as XhrMeta;
    return state.originalXhrOpen.apply(this, [method, url, ...rest] as never);
  } as typeof XMLHttpRequest.prototype.open;

  xhrProto.send = function send(this: XMLHttpRequest & Record<string, unknown>, ...args: unknown[]) {
    if (!this[XHR_HOOKED]) {
      this[XHR_HOOKED] = true;
      this.addEventListener('loadend', () => {
        void inspectXhr(this as XMLHttpRequest & Record<string, unknown>, target, state);
      });
    }
    return state.originalXhrSend.apply(this, args as never);
  } as typeof XMLHttpRequest.prototype.send;
}

async function inspectResponse(
  response: Response,
  params: {
    target: Window;
    state: InstallState;
    transport: 'fetch' | 'xhr';
    endpoint?: string;
  },
): Promise<void> {
  if (!shouldInspectUrl(params.endpoint ?? response.url)) {
    return;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!isJsonLikeContentType(contentType) && !shouldAttemptJsonByUrl(response.url)) {
    return;
  }

  try {
    const text = await response.clone().text();
    handlePayload(text, {
      target: params.target,
      state: params.state,
      transport: params.transport,
      endpoint: params.endpoint ?? response.url,
    });
  } catch (error) {
    dispatchBridgeError(params.target, {
      message: 'Failed to inspect fetch response.',
      cause: error,
    });
  }
}

async function inspectXhr(targetXhr: XMLHttpRequest & Record<string, unknown>, target: Window, state: InstallState): Promise<void> {
  const endpoint = (targetXhr[XHR_META] as XhrMeta | undefined)?.url ?? targetXhr.responseURL;
  if (!shouldInspectUrl(endpoint)) {
    return;
  }

  const contentType = safeGetResponseHeader(targetXhr, 'content-type') ?? '';
  if (!isJsonLikeContentType(contentType) && !shouldAttemptJsonByUrl(endpoint)) {
    return;
  }

  try {
    const responseType = targetXhr.responseType;
    if (responseType === 'arraybuffer' || responseType === 'blob' || responseType === 'document') {
      return;
    }

    const payload =
      responseType === 'json'
        ? targetXhr.response
        : typeof targetXhr.responseText === 'string'
          ? targetXhr.responseText
          : null;

    if (payload == null || payload === '') {
      return;
    }

    handlePayload(payload, {
      target,
      state,
      transport: 'xhr',
      endpoint,
    });
  } catch (error) {
    dispatchBridgeError(target, {
      message: 'Failed to inspect XHR response.',
      cause: error,
    });
  }
}

function handlePayload(
  payload: unknown,
  params: {
    target: Window;
    state: InstallState;
    transport: 'fetch' | 'xhr';
    endpoint?: string;
  },
): void {
  const parsed = typeof payload === 'string' ? tryParseJson(payload) : payload;
  if (parsed == null) {
    return;
  }

  const bundles = extractBundlesFromPayload(parsed);
  if (bundles.length === 0) {
    return;
  }

  for (const bundle of bundles) {
    const result = params.state.store.upsert(bundle);
    if (!result.changed) {
      continue;
    }

    const detail: BridgeBundleEventDetail = {
      bundle: result.bundle,
      endpoint: params.endpoint,
      transport: params.transport,
      capturedAt: Date.now(),
    };
    dispatchBundleUpdate(params.target, detail);
  }
}

function extractEndpointFromFetchArgs(args: Parameters<typeof fetch>): string | undefined {
  const request = args[0];
  if (typeof request === 'string') {
    return request;
  }

  if (request instanceof Request) {
    return request.url;
  }

  return undefined;
}

function shouldInspectUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url, window.location.href);
    const host = parsed.hostname;
    const path = parsed.pathname + parsed.search;
    if (!(host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com'))) {
      return false;
    }

    return (
      path.includes('/i/api/') ||
      path.includes('/graphql') ||
      path.includes('TweetDetail') ||
      path.includes('HomeTimeline') ||
      path.includes('HomeLatestTimeline') ||
      path.includes('UserTweets') ||
      path.includes('SearchTimeline') ||
      path.includes('AdaptiveSearch') ||
      path.includes('TweetResultByRestId') ||
      path.includes('ThreadedConversation') ||
      path.includes('timeline')
    );
  } catch {
    return false;
  }
}

function shouldAttemptJsonByUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return /graphql|timeline|tweet|search|convers/i.test(url);
}

function isJsonLikeContentType(contentType: string): boolean {
  return /application\/json|text\/json|application\/x-ndjson/i.test(contentType);
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function safeGetResponseHeader(xhr: XMLHttpRequest, headerName: string): string | null {
  try {
    return xhr.getResponseHeader(headerName);
  } catch {
    return null;
  }
}

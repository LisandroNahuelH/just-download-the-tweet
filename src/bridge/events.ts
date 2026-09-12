import {
  BRIDGE_ERROR_EVENT,
  BRIDGE_MEDIA_EVENT,
  BRIDGE_MESSAGE_BUNDLE_UPDATE,
  BRIDGE_MESSAGE_REQUEST_SNAPSHOT,
  BRIDGE_MESSAGE_SNAPSHOT,
  BRIDGE_NAMESPACE,
  BRIDGE_READY_EVENT,
  type BridgeBundleEventDetail,
  type BridgeReadyEventDetail,
  type BridgeSnapshotRequestMessage,
  type BridgeMessage,
} from './contracts';
import type { PostMediaBundle } from './contracts';

export function dispatchBridgeReady(target: Window, detail: BridgeReadyEventDetail): void {
  dispatchCustomEvent(target, BRIDGE_READY_EVENT, detail);
}

export function dispatchBundleUpdate(target: Window, detail: BridgeBundleEventDetail): void {
  dispatchCustomEvent(target, BRIDGE_MEDIA_EVENT, detail);
  postBridgeMessage(target, {
    source: BRIDGE_NAMESPACE,
    type: BRIDGE_MESSAGE_BUNDLE_UPDATE,
    bundle: detail.bundle,
    endpoint: detail.endpoint,
    transport: detail.transport,
    capturedAt: detail.capturedAt,
  });
}

export function dispatchBridgeError(target: Window, detail: { message: string; cause?: unknown }): void {
  dispatchCustomEvent(target, BRIDGE_ERROR_EVENT, detail);
}

export function registerSnapshotResponder(params: {
  target: Window;
  getBundles: () => PostMediaBundle[];
}): () => void {
  const handler = (event: MessageEvent<BridgeMessage | unknown>) => {
    if (event.source !== params.target) {
      return;
    }

    const message = event.data as Partial<BridgeSnapshotRequestMessage> | null;
    if (!message || message.source !== BRIDGE_NAMESPACE || message.type !== BRIDGE_MESSAGE_REQUEST_SNAPSHOT) {
      return;
    }

    postBridgeMessage(params.target, {
      source: BRIDGE_NAMESPACE,
      type: BRIDGE_MESSAGE_SNAPSHOT,
      requestId: message.requestId,
      bundles: params.getBundles(),
    });
  };

  params.target.addEventListener('message', handler as EventListener);
  return () => params.target.removeEventListener('message', handler as EventListener);
}

export function postBridgeMessage(target: Window, message: BridgeMessage): void {
  target.postMessage(message, '*');
}

export function dispatchCustomEvent<T>(target: Window, eventName: string, detail: T): void {
  target.dispatchEvent(new CustomEvent(eventName, { detail }));
  target.document?.dispatchEvent(new CustomEvent(eventName, { detail }));
}

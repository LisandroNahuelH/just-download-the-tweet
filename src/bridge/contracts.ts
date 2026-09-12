export const BRIDGE_NAMESPACE = 'just-download-the-tweet' as const;

export const BRIDGE_READY_EVENT = 'just-download-the-tweet:bridge-ready' as const;
export const BRIDGE_MEDIA_EVENT = 'just-download-the-tweet:media-cached' as const;
export const BRIDGE_ERROR_EVENT = 'just-download-the-tweet:bridge-error' as const;

export const BRIDGE_MESSAGE_REQUEST_SNAPSHOT = 'request-snapshot' as const;
export const BRIDGE_MESSAGE_SNAPSHOT = 'snapshot' as const;
export const BRIDGE_MESSAGE_BUNDLE_UPDATE = 'bundle-update' as const;

export type MediaKind = 'photo' | 'video' | 'animated_gif';

export interface PostMediaItem {
  postId: string;
  authorHandle: string;
  index: number;
  kind: MediaKind;
  url: string;
  mimeType: string;
  filename: string;
  width?: number;
  height?: number;
  bitrate?: number;
}

export interface PostMediaBundle {
  postId: string;
  authorHandle: string;
  permalink: string;
  items: PostMediaItem[];
}

export interface BridgeBundleEventDetail {
  bundle: PostMediaBundle;
  endpoint?: string;
  transport: 'fetch' | 'xhr';
  capturedAt: number;
}

export interface BridgeReadyEventDetail {
  installedAt: number;
  bundleCount: number;
}

export interface BridgeSnapshotRequestMessage {
  source: typeof BRIDGE_NAMESPACE;
  type: typeof BRIDGE_MESSAGE_REQUEST_SNAPSHOT;
  requestId?: string;
}

export interface BridgeSnapshotMessage {
  source: typeof BRIDGE_NAMESPACE;
  type: typeof BRIDGE_MESSAGE_SNAPSHOT;
  requestId?: string;
  bundles: PostMediaBundle[];
}

export interface BridgeBundleUpdateMessage {
  source: typeof BRIDGE_NAMESPACE;
  type: typeof BRIDGE_MESSAGE_BUNDLE_UPDATE;
  bundle: PostMediaBundle;
  endpoint?: string;
  transport: 'fetch' | 'xhr';
  capturedAt: number;
}

export type BridgeMessage =
  | BridgeSnapshotRequestMessage
  | BridgeSnapshotMessage
  | BridgeBundleUpdateMessage;

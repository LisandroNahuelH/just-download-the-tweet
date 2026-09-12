# Architecture — Just Download The Tweet

A Chrome MV3 extension (TypeScript, Vite 6 + CRXJS) that adds download controls to X (x.com / twitter.com) posts carrying media.

## Overview

```
┌─ MAIN world (X page) ────────────┐   ┌─ Extension ───────────────────────────────────┐
│ src/bridge/page.ts               │   │ src/content/index.ts → src/content/ui.ts      │
│  · wraps window.fetch + XHR      │   │  · per-post MutationObserver scan             │
│  · filters X GraphQL/timeline    │   │  · shadow-DOM download control + menu         │
│  · media-extract.ts → bundles    │   │ src/background/service-worker.ts              │
│  · window events ────────────────┼──▶│  · chrome.downloads orchestration             │
└──────────────────────────────────┘   │  · offscreen ZIP host                         │
                                       │ src/offscreen/offscreen.ts (JSZip)            │
                                       └───────────────────────────────────────────────┘
```

## Components

### MAIN-world bridge (`src/bridge/`)

- `page.ts` — the MAIN-world content script entry (declared in `manifest.config.ts`, `world: "MAIN"`, `document_start`).
- `install.ts` — wraps `window.fetch` and `XMLHttpRequest.prototype.{open,send}`. Only responses whose URL is on `x.com` / `twitter.com` and matches GraphQL/timeline endpoints are inspected; responses are read (cloned), never modified. Extracted bundles are stored in `MediaBundleStore` (`store.ts`) and announced through window events (`events.ts`); a snapshot responder answers requests from the isolated world.
- `media-extract.ts` — walks timeline JSON: finds tweet-like nodes (skipping quoted subtrees), reads `extended_entities` / `entities` media, rewrites photo URLs to the `name=orig` variant, picks the highest-bitrate MP4 video variant, and builds `PostMediaBundle`s with deterministic filenames.
- `contracts.ts` — shared types and event-name contract.

### Content UI (`src/content/`)

- `index.ts` — boots the app and sends `HEARTBEAT_PING`.
- `ui.ts` — `JustDownloadTheTweetApp`: a `MutationObserver` plus `history.pushState`/`replaceState`/`popstate` hooks rescan rendered posts; each post with media gets a `PostMediaController` rendering into a shadow root (styles isolated from X) inside the post's action bar. States: `idle → loading → ready → success | error`. One item downloads directly; several open a popover with per-item buttons, **Download all** and **Download ZIP**.
- `dom.ts` — DOM fallback path: locates post containers, status ids, author handles and action bars; reads `window.__INITIAL_STATE__` (or embedded scripts) and extracts image media when the bridge bundle is not available yet.
- `bridge.ts` — isolated-world listener for bridge events + snapshot requests. `runtime.ts` — `chrome.runtime.sendMessage` wrappers and error extraction.

### Background service worker (`src/background/service-worker.ts`)

- Handles `DOWNLOAD_ONE` (single item), `DOWNLOAD_ALL` (sequential with 25 ms spacing, `conflictAction: 'uniquify'`) and `DOWNLOAD_ZIP`.
- Writes through `chrome.downloads` to the browser's default folder.
- Offscreen document lifecycle: created on demand (`chrome.offscreen`, reason `BLOBS`), receives `OFFSCREEN_ZIP_REQUEST`, returns a `blob:` URL that is downloaded and then released (download change listener with a 60 s timeout).

### Offscreen ZIP (`src/offscreen/offscreen.ts`)

- Fetches each media item (max 4 concurrent), builds a DEFLATE ZIP with JSZip, and returns `{archiveFilename, archiveUrl, itemCount, skipped[]}`. Partial failures are reported per item; the archive still ships with everything that could be fetched.

### Heartbeat (`src/features/heartbeat/`)

- `install` / `update` events on `chrome.runtime.onInstalled`; `ping` on content-script load, throttled to at most once per 24 h (`jdttLastHeartbeatAt`).
- Payload `{v, product, event, extVersion, installId, installChannel, locale, timezone, ts}` → `POST https://www.premium11.com/api/heartbeat` with header `X-Heartbeat-Key`. No tweet content, no media URLs.
- `setUninstallURL` points at the farewell page with `id` and `v` only.

### i18n

- Runtime strings through `chrome.i18n`; 51 locale folders in `public/_locales/`.
- `tools/i18n/`: `check-i18n` (key parity against `en/messages.json`), `audit-title-case`, `audit-translations`, `audit-literals`, `bootstrap-*` (create/refresh locales from the store registry `tools/i18n/chrome-web-store-locales.json`), `apply-locale-patches` (deterministic wording patches).

## Data flow (a download)

1. X loads a timeline → the bridge sees the response → extracts bundles → window event.
2. The content app caches the bundle for that post id and renders or updates the control.
3. Click → `DOWNLOAD_ONE` → service worker → `chrome.downloads` → file in Downloads.
4. **Download ZIP** → offscreen document builds the archive → blob URL → `chrome.downloads` → URL released.

## Filenames

`@handle_postId_NN.ext` per item; `@handle_postId_media.zip` per archive. Sanitization and extension inference live in `src/shared/download-utils.ts`.

## Build and release

- `npm run build` → Vite 6 + CRXJS → `dist/` (load unpacked).
- `npm run verify` → i18n checks + typecheck + vitest + build (CI runs this on Node 22).
- `npm run package:release` → PowerShell ZIP of `dist/` into `release/` (Windows-only; upload through the Chrome Web Store Developer Dashboard).

## Why these choices

- **MAIN-world bridge:** X's timeline data is not reachable from the isolated world; observing the page's own requests is the reliable, read-only way to get exact media URLs.
- **DOM fallback:** posts rendered from cache still get a control before any bridge event arrives.
- **Offscreen for ZIP:** MV3 service workers cannot create object URLs for Blobs; offscreen documents can.
- **Per-post shadow DOM:** the control cannot inherit or leak X styles, and X CSS cannot break it.

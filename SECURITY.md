# Security policy

## Supported versions

Only the latest release of Just Download The Tweet receives fixes. The current line is `0.1.x` (see `package.json`).

## Reporting a vulnerability

Use GitHub's private reporting: **Security** tab → *Report a vulnerability* (also linked from the issue chooser). Do not open public issues for security reports. You can expect an initial reply within a few days.

## Data & privacy model

Everything is processed locally in your browser. The complete set of outbound network destinations is:

1. `x.com` / `twitter.com` / `*.twimg.com` — reading the timeline you are already on and fetching the media you explicitly download.
2. `www.premium11.com` — the anonymous usage heartbeat and the uninstall farewell page.

### The heartbeat (exact payload)

Sent on install, on update, and at most once per 24 hours from a content-script load:

```json
{
  "v": 1,
  "product": "just-download-the-tweet",
  "event": "install | update | ping",
  "extVersion": "<from the manifest>",
  "installId": "<random UUID v4 · chrome.storage.local: jdttInstallId>",
  "installChannel": "unpacked | store | sideload | admin | unknown",
  "locale": "<chrome.i18n UI language>",
  "timezone": "<IANA timezone>",
  "ts": "<epoch ms>"
}
```

Header: `X-Heartbeat-Key`. Endpoint: `POST https://www.premium11.com/api/heartbeat`.

**What is NOT sent, ever:** tweet text or content, media URLs or files, browsing history, open tabs, account identity, cookies. The payload above is exhaustive.

Uninstall: Chrome opens `https://www.premium11.com/goodbye/just-download-the-tweet?id=<installId>&v=<extVersion>` after the extension is removed (no service-worker request is made).

### The embedded anti-spam key

`src/features/heartbeat/constants/heartbeat-api-key.ts` embeds a soft anti-spam key. It is **public by design**: it ships inside the published extension package and is not a credential. Treat it as an allowlist entry, not a secret. Rotating it requires migrating deployed clients.

### Page observation (MAIN-world bridge)

To resolve media, a content script runs in the page's MAIN world and wraps `window.fetch` and `XMLHttpRequest`. It reads (never modifies) responses of X's own GraphQL/timeline calls and extracts media metadata locally. Wrapped calls return exactly what the originals return.

## Verifying the claims

```bash
grep -rn "premium11.com" src/                              # the only non-X endpoint
grep -n "fetch\|XMLHttpRequest" src/bridge/install.ts       # observation points
npm run verify                                              # reproducible build + tests
```

# Troubleshooting

Logs, probes and recovery steps. Commands assume a clone of this repository.

## First checks

1. Which page type are you on? The control renders on the home timeline and on `/status/` pages; other surfaces are not guaranteed.
2. Reload the page after loading or reloading the extension — content scripts run on fresh page loads.
3. `chrome://extensions` → Just Download The Tweet → **Errors**: any red button there is a real error worth reading.

## Where logs live

| Surface | Where |
|---|---|
| Content script (per page) | DevTools console on x.com |
| Service worker | `chrome://extensions` → Details → **Inspect views: service worker** → Console |
| Offscreen document | appears as an additional inspect target while a ZIP is built |
| Downloads | `chrome://downloads` |

## Build problems

- `i18n:check` fails → a locale drifted from `en/messages.json`:
  ```bash
  npm run i18n:audit
  npm run i18n:apply-patches     # deterministic patches, if any
  ```
  If a locale file is malformed, re-bootstrap it: `npm run i18n:bootstrap-locale -- <code>`.
- Type errors → `npm run typecheck` for the full list.
- Vitest failures → `npm test`; fixtures live in `tests/fixtures/`.
- Vite/CRXJS build errors → remove `dist/` and rebuild: `npm run build` (Windows: `rd /s /q dist` first).

## Runtime problems

| Symptom | Likely cause | Fix |
|---|---|---|
| No download control on posts | unsupported page or X markup changed | reload; check the location; if persistent, capture console logs + post URL for an issue |
| "Could not resolve the post media" | bridge missed the response and the DOM fallback found nothing | open the post directly (`/status/...`) and retry |
| Download starts then fails | media URL expired (X CDN) or media protected | retry from the post; re-open the post to refresh URLs |
| ZIP: "No media could be fetched" | all fetches failed (offline / blocked) | check the network; retry |
| ZIP missing some items | per-item fetch failure (warned in the UI) | download those items individually |
| Wrong UI language | follows the browser locale | change Chrome's language, or send a translation fix (see `CONTRIBUTING.md`) |

## Recovery

- Reload the extension: `chrome://extensions` → Reload (or toggle off/on).
- Reset local state (install id / heartbeat throttle) — run in the service worker console:
  ```js
  chrome.storage.local.remove(['jdttInstallId', 'jdttLastHeartbeatAt'])
  ```
- Fresh clone: `npm ci && npm run verify`.

## What to include in an issue

- Extension version (`chrome://extensions`) and Chrome version.
- Page URL type (home / status / other) and media type (photo / video / GIF).
- Console errors (content script and service worker), redacted of personal data.
- Steps to reproduce. The [issue chooser](https://github.com/LisandroNahuelH/just-download-the-tweet/issues/new/choose) lists everything.

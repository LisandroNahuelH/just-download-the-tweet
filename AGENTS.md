# AGENTS.md — the Just Download The Tweet runbook

You are an agent asked to build, test, or package **Just Download The Tweet** — a Chrome MV3 extension that adds download controls to media posts on X. Follow this file top to bottom. It is self-contained: repository layout, exact commands, expected output, and what to do when something fails.

**Hard boundary:** this is a **Chromium extension**. There is no system installer and no service to configure — distribution and updates belong to the Chrome Web Store. If a task asks you to install this on Firefox or Safari: stop and report that no such build exists.

## 0. Preflight — verify, then continue or stop

```bash
node --version        # expect: v20.x or newer (CI uses 22)
npm --version         # expect: 10.x or newer
git --version         # expect: any 2.x
```

If a check fails, **stop and report exactly which one**. Do not improvise.

## 1. Clone to a stable path

```bash
git clone https://github.com/LisandroNahuelH/just-download-the-tweet.git
cd just-download-the-tweet
```

## 2. Install dependencies and dry-run the full check suite

```bash
npm ci                # lockfile v3; no native toolchain needed
npm run verify        # i18n checks + typecheck + tests + build — writes only dist/
```

Expected tail: `i18n check passed for 51 locale(s)`, a passing vitest summary, `✓ built in ...` — exit code `0`.

## 3. Build (the artifact)

```bash
npm run build         # = i18n:check + vite build (Vite 6 + CRXJS)
```

Expected: `dist/` contains `manifest.json`, `service-worker-loader.js`, `assets/`, `src/offscreen/offscreen.html`, `icons/`, `_locales/`. **Never edit `dist/` by hand** — it is generated.

## 4. Load it (manual, one time)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Confirm the version shown matches `package.json` and `dist/manifest.json`.

## 5. Distribution and updates (no guardians — type waiver)

There are no guardian tasks or recurring jobs in this repository. The Chrome Web Store owns install, update and uninstall for end users. Skip guardian setup and report the waiver — the exact rationale is in [`docs/limits.md`](docs/limits.md) (section "Distribution type waivers").

## 6. Verification checklist (prove it, then report)

1. `npm run verify` → exit code 0.
2. `node -e "console.log(require('./package.json').version)"` → same string as `dist/manifest.json` `version`.
3. `dist/manifest.json` declares content scripts for `x.com` / `twitter.com` (MAIN-world bridge + isolated UI).
4. With the extension loaded, open `https://x.com` → posts with media show the download control in the action bar.
5. Single-media post → one click → file in Downloads named `@handle_id_01.ext`.
6. Multi-media post → menu with **Download all** and **Download ZIP**.
7. Report the checklist as a small table (probe | result).

## 7. Packaging a store release (maintainers)

```powershell
npm run build
npm run package:release    # Windows only (PowerShell Compress-Archive)
```

Output: `release/just-download-the-tweet-<version>-chrome-store.zip` (git-ignored). Upload it through the Chrome Web Store Developer Dashboard. Before packaging: bump the version in `package.json`, `package-lock.json` and `manifest.config.ts` together, re-run `npm run verify`, and update `CHANGELOG.md`.

## 8. Failure protocol

| Symptom | Meaning | Do |
|---|---|---|
| `npm ci` fails | Node/npm too old, or registry unreachable | check preflight; retry; report |
| `i18n:check` fails | a locale file drifted from `en/messages.json` | run `npm run i18n:audit`; fix or re-bootstrap that locale; report which |
| typecheck fails (inside `verify`) | type error | report file + error; do not silence it |
| vitest fails | behavior regression | report failing test + assertion |
| `vite build` fails | CRXJS/Vite error | report the full stack; do not patch `dist/` |
| Extension loads but no control | unsupported page, or X markup changed | check location (home or `/status/`), reload the page; capture console logs for an issue |
| Download fails | media URL expired or protected | retry from the post; if systematic, report with the post URL |

Never hand-edit generated files, never commit `release/*.zip` or `Backups/`, and never push secrets.

## 9. Manual path (raw commands, no agent)

```bash
git clone https://github.com/LisandroNahuelH/just-download-the-tweet.git
cd just-download-the-tweet && npm ci && npm run build
# chrome://extensions → Developer mode → Load unpacked → ./dist
```

## 10. What you must not do

- Do not write outside the repository (only `dist/` and `release/` are generated outputs).
- Do not edit `dist/` — rebuild instead.
- Do not commit `release/*.zip`, `Backups/`, or anything under `dist/`.
- Do not change version numbers as part of unrelated work — that belongs to the release checklist (step 7).
- Do not add analytics or network calls: the privacy model in [`SECURITY.md`](SECURITY.md) is part of the contract.

## Heartbeat (transparency)

Anonymous install/update/ping diagnostics live in `src/features/heartbeat/`. Payload: `{v, product, event, extVersion, installId, installChannel, locale, timezone, ts}` → `POST https://www.premium11.com/api/heartbeat`. No tweet content, no media URLs. Uninstall farewell: `https://www.premium11.com/goodbye/just-download-the-tweet?id=<installId>&v=<extVersion>`. Full disclosure: [`SECURITY.md`](SECURITY.md).

## File map

| Path | What |
|---|---|
| `src/bridge/` | MAIN-world bridge: fetch/XHR observer, payload extraction, events |
| `src/content/` | isolated world: DOM snapshot, per-post UI (shadow DOM), download client |
| `src/background/service-worker.ts` | download orchestration (`chrome.downloads`), offscreen ZIP, heartbeat |
| `src/offscreen/` | JSZip archive builder (offscreen document) |
| `src/shared/` | contracts, filename rules, message helpers |
| `src/features/heartbeat/` | anonymous diagnostics |
| `public/_locales/` | 51 locale files (runtime strings) |
| `tools/i18n/` | locale bootstrap + audit tooling, store locale registry |
| `tools/package-release.mjs` | store ZIP builder |
| `tests/` | vitest suites + fixtures |

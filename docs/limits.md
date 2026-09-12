# Limits — what is guaranteed, and the edges

Honest limits, so nobody is surprised. For recovery steps see [`troubleshooting.md`](troubleshooting.md); for bugs and feature requests use the [issue tracker](https://github.com/LisandroNahuelH/just-download-the-tweet/issues).

## Guaranteed

- Downloads are local: media goes from X's CDN to your Downloads folder; no intermediary server.
- Photos are requested at the `name=orig` variant; videos and GIFs at the highest-bitrate MP4 in the manifest.
- ZIP archives include every item that could be fetched — skips are reported, never silent.
- The UI cannot leak into or inherit X's styles (shadow DOM), and X's CSS cannot break it.

## Not covered (by design, or for now)

- **Protected or spaces media**: if X does not serve it, the extension cannot download it. No authentication is used, ever.
- **Non-Chromium browsers**: Firefox and Safari are not supported (no builds, no ports).
- **Surfaces**: `x.com` / `twitter.com` home timeline and post/status pages. Profiles, search and other surfaces get the control only where posts render with the same structure; coverage follows X's markup.
- **X redesigns**: DOM and GraphQL changes can break extraction until the next release. The DOM fallback mitigates but does not eliminate this.
- **DRM or paywalled media**: out of scope.

## Build and packaging edges

- `npm run package:release` uses PowerShell `Compress-Archive` — **Windows-only**. On other systems, zip `dist/**` manually with `manifest.json` at the archive root.
- CI runs `npm run verify` (i18n checks + typecheck + tests + build) on Node 22; it does not run `package:release`.

## Distribution type waivers (install / versions.json / guardians)

This repository builds a Chrome MV3 extension distributed through the Chrome Web Store, which owns install, update and uninstall. There is no system installer, no self-update channel and no host scheduler to guard.

- QB4 manual path stays documented (store link + build and load `dist/` unpacked).
- QB5 installer guards: no installer script exists in this type (nothing to guard).
- QB6 guardians: no recurring host jobs exist (nothing resets files here).
- QB7 versions.json: no repo-distributed hashed artifacts; store artifacts are built per release (`npm run build` + `npm run package:release`).

`validate-repo.py` auto-classifies this repository as library-family (package manifest, no bins) and reports QB4 "no installer for this type" and QB5-QB7 "type waiver". These skips are type-authorized and recorded here, in `AGENTS.md` and in the publication report — not unauthorized SKIPs.

## Privacy edges

- The anonymous heartbeat is fire-and-forget: if `premium11.com` is unreachable, nothing else is affected.
- The extension reads X's timeline traffic read-only in the page; it never modifies requests or responses.

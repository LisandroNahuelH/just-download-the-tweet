# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.8] - 2026-07-29

First public source release (source drop of the Chrome Web Store build).

### Added

- One-click download control injected into the action bar of X posts that carry media.
- Media resolution from X timeline payloads: photos at original resolution, best MP4 video variant, animated GIFs.
- Multi-media popover with "Download all" and "Download ZIP" (archives built in an offscreen document, 4 concurrent fetches).
- 51 store locales with runtime strings served through `chrome.i18n`.
- Anonymous install / update / ping heartbeat and an uninstall farewell URL for aggregate diagnostics.
- i18n audit tooling (`tools/i18n/*`) and Chrome Web Store packaging (`tools/package-release.mjs`).

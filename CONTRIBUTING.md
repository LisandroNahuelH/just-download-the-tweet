# Contributing

Thanks for helping. The repo is small and the bar is simple: honest code, honest docs, no surprises.

## Setup

```bash
git clone https://github.com/LisandroNahuelH/just-download-the-tweet.git
cd just-download-the-tweet
npm ci
npm run verify        # what CI runs: i18n checks + typecheck + tests + build
```

Load `dist/` unpacked at `chrome://extensions` (Developer mode) to test by hand.

## Ground rules

- One logical change per commit; English commit messages (conventional prefixes: `feat:`, `fix:`, `docs:`, `chore:` ...).
- Repository documentation is English. UI translations live in `public/_locales/` only.
- No secrets, no new network endpoints, no analytics — the privacy contract in [`SECURITY.md`](SECURITY.md) is part of the product.
- Add or update a vitest suite for behavior changes (`tests/`).
- Leave `dist/` and `release/` out of commits (generated).

## i18n workflow

- Validate + audit: `npm run i18n:check && npm run i18n:audit && npm run i18n:audit-literals`.
- Fix wording per locale with deterministic patches: edit `tools/i18n/locale-patches.json`, then `npm run i18n:apply-patches`.
- Add a locale: add it to `tools/i18n/chrome-web-store-locales.json`, then `npm run i18n:bootstrap-locale -- <code>`.
- The title-case rule for the extension name is enforced by `npm run i18n:check`.

## Pull requests

Fill the PR template: what, why, how it was verified. `npm run verify` must pass; CI runs the same suite on Node 22.

## Reporting bugs / requesting features

Use the issue templates. For security, follow [`SECURITY.md`](SECURITY.md) instead of opening a public issue.

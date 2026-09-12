# Architecture

The canonical architecture document lives in **[docs/architecture.md](docs/architecture.md)** — components, contracts, the download/ZIP flow and the heartbeat flow.

Repository overview:

- Source under `src/`: content UI, MAIN-world bridge, background service worker, offscreen ZIP builder.
- Build: `npm run build` (Vite 6 + CRXJS) → `dist/` (load unpacked).
- Honest limits: [docs/limits.md](docs/limits.md). Recovery: [docs/troubleshooting.md](docs/troubleshooting.md).

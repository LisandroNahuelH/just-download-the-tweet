import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(repoRoot, "dist/manifest.json"), "utf8"));
const version = manifest.version;
const zipName = `just-download-the-tweet-${version}-chrome-store.zip`;
const releaseDir = resolve(repoRoot, "release");
const zipPath = resolve(releaseDir, zipName);
const distPath = resolve(repoRoot, "dist");

mkdirSync(releaseDir, { recursive: true });

const result = spawnSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${distPath}\\*' -DestinationPath '${zipPath}' -Force`
  ],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Release package created: release/${zipName}`);
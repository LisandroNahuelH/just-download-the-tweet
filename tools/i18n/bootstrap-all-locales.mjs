import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = resolve(repoRoot, "tools/i18n/chrome-web-store-locales.json");
const localesRoot = resolve(repoRoot, "public/_locales");
const englishSource = resolve(localesRoot, "en/messages.json");

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const englishCopy = readFileSync(englishSource, "utf8");
const runtimeFolders = [
  ...new Set(
    registry
      .filter((entry) => entry.runtimeStatus !== "alias")
      .map((entry) => entry.runtimeFolder)
  ),
].sort();

let created = 0;
let skipped = 0;

for (const folder of runtimeFolders) {
  const targetDir = resolve(localesRoot, folder);
  const targetFile = resolve(targetDir, "messages.json");

  mkdirSync(targetDir, { recursive: true });

  if (folder === "en") {
    skipped += 1;
    continue;
  }

  if (existsSync(targetFile)) {
    const existing = JSON.parse(readFileSync(targetFile, "utf8"));
    const english = JSON.parse(englishCopy);
    const existingKeys = Object.keys(existing).sort().join(",");
    const englishKeys = Object.keys(english).sort().join(",");

    if (existingKeys === englishKeys) {
      skipped += 1;
      continue;
    }
  }

  cpSync(englishSource, targetFile, { force: true });
  created += 1;
}

console.log(`Bootstrapped ${created} locale(s); skipped ${skipped}. Total runtime folders: ${runtimeFolders.length}.`);
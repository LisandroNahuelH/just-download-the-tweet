import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localesRoot = resolve(repoRoot, "public/_locales");
const englishPath = resolve(localesRoot, "en/messages.json");
const englishCatalog = JSON.parse(readFileSync(englishPath, "utf8"));
const englishKeys = Object.keys(englishCatalog).sort();
const issues = [];

const localeDirs = readdirSync(localesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const locale of localeDirs) {
  const localePath = resolve(localesRoot, locale, "messages.json");

  if (!existsSync(localePath)) {
    issues.push(`[${locale}] Missing messages.json`);
    continue;
  }

  const catalog = JSON.parse(readFileSync(localePath, "utf8"));
  const localeKeys = Object.keys(catalog).sort();

  if (localeKeys.join(",") !== englishKeys.join(",")) {
    issues.push(`[${locale}] Key mismatch. Expected ${englishKeys.length} keys, got ${localeKeys.length}.`);
  }

  for (const key of englishKeys) {
    const message = catalog[key]?.message;

    if (typeof message !== "string" || message.trim().length === 0) {
      issues.push(`[${locale}] ${key} must have a non-empty message.`);
    }
  }
}

if (issues.length > 0) {
  console.error("i18n check failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`i18n check passed for ${localeDirs.length} locale(s): ${localeDirs.join(", ")}`);
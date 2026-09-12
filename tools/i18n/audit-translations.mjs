import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localesRoot = resolve(repoRoot, "public/_locales");
const englishCatalog = JSON.parse(
  readFileSync(resolve(localesRoot, "en/messages.json"), "utf8")
);

const BRAND_KEYS = new Set(["extensionName"]);

const localeDirs = readdirSync(localesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const issues = [];

for (const locale of localeDirs) {
  if (locale === "en") {
    continue;
  }

  const catalog = JSON.parse(
    readFileSync(resolve(localesRoot, locale, "messages.json"), "utf8")
  );

  for (const key of Object.keys(englishCatalog)) {
    if (BRAND_KEYS.has(key)) {
      continue;
    }

    const englishMessage = englishCatalog[key]?.message;
    const localeMessage = catalog[key]?.message;

    if (localeMessage === englishMessage) {
      issues.push(`[${locale}] ${key} is still identical to English.`);
    }
  }
}

if (issues.length > 0) {
  console.error(`Translation audit found ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Translation audit passed for ${localeDirs.length - 1} non-English locale(s).`);
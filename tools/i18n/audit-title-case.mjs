import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capitalizeWordInitials, shouldApplyTitleCase } from "./capitalize-word-initials.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localesRoot = join(repoRoot, "public", "_locales");
const titleKey = "extensionName";
const issues = [];

for (const locale of readdirSync(localesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)) {
  if (!shouldApplyTitleCase(locale)) {
    continue;
  }

  const catalog = JSON.parse(readFileSync(join(localesRoot, locale, "messages.json"), "utf8"));
  const title = catalog[titleKey]?.message;

  if (typeof title !== "string") {
    issues.push(`[${locale}] Missing ${titleKey}.`);
    continue;
  }

  const expected = capitalizeWordInitials(title);
  if (title !== expected) {
    issues.push(`[${locale}] ${titleKey} must use title case: "${title}" -> "${expected}"`);
  }
}

if (issues.length > 0) {
  console.error("Title case audit failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Title case audit passed for ${titleKey}.`);

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localesRoot = resolve(repoRoot, "public/_locales");
const patches = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "locale-patches.json"), "utf8")
);

let updatedLocales = 0;

for (const locale of Object.keys(patches)) {
  const filePath = resolve(localesRoot, locale, "messages.json");
  const catalog = JSON.parse(readFileSync(filePath, "utf8"));
  let changed = false;

  for (const [key, message] of Object.entries(patches[locale])) {
    if (catalog[key]?.message !== message) {
      catalog[key].message = message;
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(filePath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
    updatedLocales += 1;
  }
}

console.log(`Applied locale patches to ${updatedLocales} locale(s).`);
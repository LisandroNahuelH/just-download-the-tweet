import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const registryPath = resolve(repoRoot, "tools/i18n/chrome-web-store-locales.json");
const localesRoot = resolve(repoRoot, "public/_locales");
const englishSource = resolve(localesRoot, "en/messages.json");
const locale = process.argv[2];

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const entry = registry.find((item) => item.code === locale);

if (!entry || entry.runtimeStatus === "alias") {
  console.error(`Unknown or alias-only locale: ${locale ?? "<none>"}`);
  process.exit(1);
}

const targetDir = resolve(localesRoot, entry.runtimeFolder);
const targetFile = resolve(targetDir, "messages.json");

mkdirSync(targetDir, { recursive: true });

if (entry.runtimeFolder === "en") {
  console.log("English source locale already exists.");
  process.exit(0);
}

cpSync(englishSource, targetFile, { force: true });
console.log(`Bootstrapped ${entry.runtimeFolder} from English source${existsSync(targetFile) ? "" : ""}.`);
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const HTML_TARGETS = ["src/offscreen/offscreen.html"];
const TS_DIRS = ["src/content", "src/background", "src/offscreen"];

const ALLOWED_TS_PATTERNS = [
  /^console\.(warn|error|log|info)\(/,
  /^throw new Error\(/,
  /^new Error\(/,
  /^`Missing element:/,
  /^"Missing element:/,
  /^`https:\/\//,
  /^"https:\/\//,
  /^'https:\/\//,
  /^"http:\/\//,
  /^'http:\/\//,
  /^"xd-/,
  /^'xd-/,
  /^"[a-z]+-[a-z-]+"/,
  /^'[a-z]+-[a-z-]+'/,
  /^"data-/,
  /^'data-/,
  /^"role"/,
  /^'role'/,
  /^"menu"/,
  /^'menu'/,
  /^"true"/,
  /^'true'/,
  /^"false"/,
  /^'false'/,
  /^"open"/,
  /^'open'/,
  /^"success"/,
  /^'success'/,
  /^"error"/,
  /^'error'/,
  /^"idle"/,
  /^'idle'/,
  /^"loading"/,
  /^'loading'/
];

const issues = [];

function collectTsFiles(dirPath) {
  const entries = readdirSync(dirPath);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
      continue;
    }

    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function auditHtml(relativePath) {
  const source = readFileSync(resolve(repoRoot, relativePath), "utf8");
  const titleMatch = source.match(/<title>([\s\S]*?)<\/title>/i);

  if (titleMatch?.[1]?.trim()) {
    issues.push(`${relativePath} contains a hardcoded <title>.`);
  }

  if (/\slang="/.test(source)) {
    issues.push(`${relativePath} contains a hardcoded html lang attribute.`);
  }

  const textPattern = />\s*([^<\s][^<]*[A-Za-zÀ-ÿ][^<]*)\s*</g;
  for (const match of source.matchAll(textPattern)) {
    const text = match[1].trim();
    if (text.length > 0) {
      issues.push(`${relativePath} contains hardcoded HTML text: "${text}".`);
    }
  }

  const attributePattern =
    /\s(?:aria-label|title|placeholder|alt)="([^"]*[A-Za-zÀ-ÿ][^"]*)"/g;
  for (const match of source.matchAll(attributePattern)) {
    const value = match[1].trim();
    if (value.length > 0) {
      issues.push(`${relativePath} contains hardcoded HTML attribute: "${value}".`);
    }
  }
}

function auditTypeScript(filePath) {
  const relativePath = filePath.replace(`${repoRoot}\\`, "").replaceAll("\\", "/");
  const source = readFileSync(filePath, "utf8");
  const assignmentPattern =
    /\.(?:textContent|innerText|title)\s*=\s*("([^"\\]|\\.)*"|'([^'\\]|\\.)*'|`([^`\\]|\\.)*`)/g;

  for (const match of source.matchAll(assignmentPattern)) {
    const assignmentStart = match.index ?? 0;
    const assignmentTarget = source.slice(Math.max(0, assignmentStart - 24), assignmentStart);

    if (/\bstyle\s*\.?\s*$/.test(assignmentTarget)) {
      continue;
    }

    const literal = match[1];
    const value = literal.slice(1, -1);

    if (value.length === 0 || literal.includes("${")) {
      continue;
    }

    if (ALLOWED_TS_PATTERNS.some((pattern) => pattern.test(literal) || pattern.test(value))) {
      continue;
    }

    if (!/[A-Za-zÀ-ÿ]{3,}/.test(value)) {
      continue;
    }

    issues.push(`${relativePath} assigns visible text without getMessage(): ${literal}`);
  }
}

for (const target of HTML_TARGETS) {
  auditHtml(target);
}

for (const dir of TS_DIRS) {
  const absoluteDir = resolve(repoRoot, dir);
  if (!existsSync(absoluteDir)) {
    continue;
  }

  for (const filePath of collectTsFiles(absoluteDir)) {
    auditTypeScript(filePath);
  }
}

if (issues.length > 0) {
  console.error("i18n literal audit failed:");
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

const tsCount = TS_DIRS.flatMap((dir) =>
  existsSync(resolve(repoRoot, dir)) ? collectTsFiles(resolve(repoRoot, dir)) : []
).length;

console.log(`i18n literal audit passed for ${HTML_TARGETS.length + tsCount} file(s).`);
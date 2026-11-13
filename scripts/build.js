#!/usr/bin/env node
/**
 * Inlines src-shared/*.js into every source under src/id/, writing the final
 * single-file extensions to javascript/anime/src/id/.
 *
 * Mangayomi loads exactly one file per source; there is no import mechanism.
 * Authoring stays DRY in src/, the built output in javascript/ is what users
 * install. Run `npm run build` after editing anything in src/ or src-shared/.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SHARED_DIR = path.join(ROOT, "src-shared");
const SRC_DIR = path.join(ROOT, "src", "id");
const OUT_DIR = path.join(ROOT, "javascript", "anime", "src", "id");
const MARKER = "// @@INLINE_SHARED@@";

function readShared() {
  if (!fs.existsSync(SHARED_DIR)) return "";
  const files = fs
    .readdirSync(SHARED_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();
  return files
    .map((file) => {
      const body = fs.readFileSync(path.join(SHARED_DIR, file), "utf8").trimEnd();
      return `// ---- inlined from src-shared/${file} ----\n${body}\n`;
    })
    .join("\n");
}

function buildOne(file, shared, banner) {
  const sourcePath = path.join(SRC_DIR, file);
  const original = fs.readFileSync(sourcePath, "utf8");
  if (original.indexOf(MARKER) === -1) {
    throw new Error(`${file}: missing "${MARKER}" marker`);
  }
  const built = original.replace(MARKER, shared.trimEnd());
  const header = `${banner}\n`;
  return header + built;
}

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`No sources in ${SRC_DIR}`);
    process.exit(1);
  }
  const shared = readShared();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".js")).sort();
  let count = 0;
  for (const file of files) {
    const banner =
      `// Generated file — do not edit directly.\n` +
      `// Source: src/id/${file} + src-shared/*.js. Run \`npm run build\` after editing.`;
    const output = buildOne(file, shared, banner);
    const outPath = path.join(OUT_DIR, file);
    const previous = fs.existsSync(outPath)
      ? fs.readFileSync(outPath, "utf8")
      : null;
    if (previous !== output) {
      fs.writeFileSync(outPath, output, "utf8");
      console.log(`built  javascript/anime/src/id/${file}`);
    } else {
      console.log(`same   javascript/anime/src/id/${file}`);
    }
    count++;
  }
  console.log(`\n${count} source(s) built.`);
}

main();

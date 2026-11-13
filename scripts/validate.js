#!/usr/bin/env node
/**
 * Validates every extension before it can ship.
 *
 * Checks run in two layers:
 *   1. Static: metadata shape, unique ids, files that exist, JS parses, no
 *      forbidden browser globals, preference keys used by the source are
 *      declared.
 *   2. Generated: the checked-in anime_index.json matches a fresh generation.
 *
 * Exit code 1 on any error. Warnings never fail the run.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  loadSources,
  sourceId,
  extractMetadataLiteral,
} = require("./lib/sources");

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

const REQUIRED_FIELDS = [
  "name",
  "lang",
  "baseUrl",
  "iconUrl",
  "typeSource",
  "itemType",
  "version",
  "pkgPath",
];

// Globals the Mangayomi QuickJS runtime does not provide. Using them fails at
// runtime with a cryptic "not a function" error, so catch them here.
//
// The lookbehinds skip definitions (`async fetch() {`), which are our own
// wrapper methods, not calls to a missing global.
const FORBIDDEN_GLOBALS = [
  [/\bwindow\s*\./, "window"],
  [/\bdocument\s*\./, "document (use new Document(html))"],
  [/(?<![.\w])(?<!async\s)(?<!function\s)(?<!get\s)(?<!set\s)fetch\s*\(/, "fetch (use new Client())"],
  [/(?<![.\w])atob\s*\(/, "atob (use b64Decode from the shared helpers)"],
  [/(?<![.\w])btoa\s*\(/, "btoa"],
  [/(?<![.\w])setTimeout\s*\(/, "setTimeout"],
  [/(?<![.\w])setInterval\s*\(/, "setInterval"],
  [/(?<![.\w])require\s*\(/, "require"],
  [/(?<![.\w])__dirname\b/, "__dirname"],
  [/(?<![.\w])process\s*\./, "process"],
  [/\bnew\s+URL\s*\(/, "new URL() (build strings with resolveUrl instead)"],
  [/\bTextDecoder\b/, "TextDecoder"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
];

/**
 * Blank out comments, strings and regex literals so a forbidden name mentioned
 * in a comment (or sent as a header value like "X-Requested-With") does not
 * fail the build, while a real call still does.
 *
 * This is a small scanner rather than a parser: it tracks the one bit of state
 * that matters (are we inside code?) and uses the standard "previous
 * significant character" heuristic to tell a regex literal from division.
 */
function stripNonCode(code) {
  const source = String(code);
  const out = [];
  let i = 0;
  // Whether a `/` at this point would start a regex literal rather than divide.
  // True after operators, punctuation and opening brackets; false after any
  // value (identifier, number, closing bracket, string).
  let regexAllowed = true;

  function blank(text) {
    // Keep newlines so nothing downstream depends on line layout.
    out.push(text.replace(/[^\n]/g, " "));
  }

  while (i < source.length) {
    const ch = source.charAt(i);
    const next = source.charAt(i + 1);

    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < source.length) {
        if (source.charAt(j) === "\\") {
          j += 2;
          continue;
        }
        if (source.charAt(j) === ch) break;
        j++;
      }
      blank(source.slice(i, Math.min(j + 1, source.length)));
      i = j + 1;
      regexAllowed = false;
      continue;
    }
    if (ch === "/" && regexAllowed) {
      let j = i + 1;
      let inClass = false;
      let isRegex = false;
      while (j < source.length) {
        const c = source.charAt(j);
        if (c === "\n") break;
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          isRegex = true;
          break;
        }
        j++;
      }
      if (isRegex) {
        let stop = j + 1;
        while (/[a-z]/i.test(source.charAt(stop) || "")) stop++;
        blank(source.slice(i, stop));
        i = stop;
        regexAllowed = false;
        continue;
      }
    }

    out.push(ch);
    i++;
    if (/\s/.test(ch)) continue;
    regexAllowed = !/[)\]}A-Za-z0-9_$]/.test(ch);
    if (!regexAllowed) {
      // `return /re/` and `typeof /re/` take a regex despite the letter before.
      const tail = out.join("").slice(-10);
      if (/(?:^|[^\w$])(?:return|typeof|case|in|of|new|delete|void|throw|do|else)$/.test(tail)) {
        regexAllowed = true;
      }
    }
  }
  return out.join("");
}

const REQUIRED_METHODS = [
  "getPopular",
  "getLatestUpdates",
  "search",
  "getDetail",
  "getVideoList",
  "getFilterList",
  "getSourcePreferences",
];

function checkMetadata(source) {
  const where = path.relative(ROOT, source.file);
  const entry = source.entry;

  for (const field of REQUIRED_FIELDS) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === "") {
      fail(`${where}: missing metadata field "${field}"`);
    }
  }

  if (entry.lang !== "id") {
    fail(`${where}: lang must be "id" (got ${JSON.stringify(entry.lang)})`);
  }
  if (entry.itemType !== 1) {
    fail(`${where}: itemType must be 1 (anime), got ${JSON.stringify(entry.itemType)}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(String(entry.version || ""))) {
    fail(`${where}: version must look like "1.2.3" (got ${entry.version})`);
  }
  if (/\/+$/.test(String(entry.baseUrl || ""))) {
    warn(`${where}: baseUrl should not end with a slash`);
  }
  if (!/^https?:\/\//.test(String(entry.baseUrl || ""))) {
    fail(`${where}: baseUrl must be absolute (got ${entry.baseUrl})`);
  }

  // pkgPath is relative to javascript/ and must point at this exact file.
  const expectedPkg = source.relative;
  if (entry.pkgPath !== expectedPkg) {
    fail(
      `${where}: pkgPath is "${entry.pkgPath}" but the file lives at ` +
        `"javascript/${expectedPkg}"`,
    );
  }

  // Icons must be committed and referenced relative to the repo root.
  if (entry.iconUrl && !/^https?:\/\//.test(entry.iconUrl)) {
    const iconPath = path.join(ROOT, entry.iconUrl);
    if (!fs.existsSync(iconPath)) {
      fail(`${where}: iconUrl "${entry.iconUrl}" does not exist`);
    }
  }

  if (entry.id !== undefined) {
    const pinned = Number.parseInt(entry.id, 10);
    const computed = sourceId(entry.lang, entry.name);
    if (!Number.isFinite(pinned)) {
      fail(`${where}: id must be an integer when pinned`);
    } else if (pinned !== computed) {
      warn(
        `${where}: pinned id ${pinned} differs from the computed ${computed}. ` +
          `That is fine only if it was pinned on purpose (renaming the source later ` +
          `would otherwise change its identity).`,
      );
    }
  }
}

function checkCode(source) {
  const where = path.relative(ROOT, source.file);
  const code = source.code;

  // 1. Syntax: parse as a classic script (no modules in QuickJS).
  try {
    new Function(code);
  } catch (error) {
    fail(`${where}: JavaScript syntax error — ${error.message}`);
    return;
  }

  // 2. No module syntax.
  if (/^\s*import\s/m.test(code) || /^\s*export\s/m.test(code)) {
    fail(`${where}: ES module syntax is not supported by the Mangayomi runtime`);
  }

  // 3. Required class and methods.
  if (!/class\s+DefaultExtension\s+extends\s+\w+/.test(code)) {
    fail(`${where}: must define "class DefaultExtension extends <MProvider or base>"`);
  }
  for (const method of REQUIRED_METHODS) {
    const pattern = new RegExp(`(async\\s+)?${method}\\s*\\(`);
    if (!pattern.test(code)) {
      fail(`${where}: missing method ${method}()`);
    }
  }
  if (!/get\s+supportsLatest\s*\(/.test(code)) {
    warn(`${where}: no "get supportsLatest()" — the app will assume the source has a latest list`);
  }

  // 4. Forbidden browser globals. Comments, strings and regex literals are
  //    blanked first: a comment saying "no fetch here" or a header *value* of
  //    "XMLHttpRequest" is not a call to a missing global.
  const codeOnly = stripNonCode(code);
  for (const [pattern, label] of FORBIDDEN_GLOBALS) {
    if (pattern.test(codeOnly)) {
      const line = codeOnly.slice(0, codeOnly.search(pattern)).split("\n").length;
      fail(`${where}:${line}: uses unavailable global: ${label}`);
    }
  }
}

function checkPreferences(source) {
  const where = path.relative(ROOT, source.file);
  const code = source.code;

  // Keys declared in getSourcePreferences(), e.g. key: "base_url".
  const declared = new Set();
  const keyRegex = /key\s*:\s*["']([a-z0-9_]+)["']/gi;
  let match;
  while ((match = keyRegex.exec(code)) !== null) declared.add(match[1]);

  // Keys read through SharedPreferences or the provider helpers.
  const readRegex = /\.(?:get|prefText|prefList|prefBool|prefMulti|preferredQualities|preferredServers)\(\s*["']([a-z0-9_]+)["']/gi;
  const read = new Set();
  while ((match = readRegex.exec(code)) !== null) read.add(match[1]);

  for (const key of read) {
    if (!declared.has(key)) {
      fail(
        `${where}: reads preference "${key}" but getSourcePreferences() never declares it ` +
          `(Mangayomi throws for unknown keys)`,
      );
    }
  }

  // Base URL override is mandatory in this repo.
  if (!declared.has("base_url")) {
    fail(`${where}: must declare the "base_url" preference (domains rotate)`);
  }
}

function checkGeneratedIndex(sources) {
  const indexPath = path.join(ROOT, "anime_index.json");
  if (!fs.existsSync(indexPath)) {
    fail("anime_index.json is missing — run `npm run generate`");
    return;
  }
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch (error) {
    fail(`anime_index.json is not valid JSON — ${error.message}`);
    return;
  }
  if (!Array.isArray(index)) {
    fail("anime_index.json must be a JSON array");
    return;
  }
  if (index.length !== sources.length) {
    fail(
      `anime_index.json has ${index.length} entries but ${sources.length} source(s) exist — ` +
        `run \`npm run generate\``,
    );
  }
  const ids = new Set();
  for (const entry of index) {
    if (!entry.id) fail(`anime_index.json: entry "${entry.name}" has no id`);
    if (ids.has(entry.id)) {
      fail(`anime_index.json: duplicate id ${entry.id} ("${entry.name}")`);
    }
    ids.add(entry.id);
    if (entry.itemType !== 1) {
      fail(`anime_index.json: "${entry.name}" must have itemType 1`);
    }
    if (entry.sourceCodeLanguage !== 1) {
      fail(`anime_index.json: "${entry.name}" must have sourceCodeLanguage 1`);
    }
    if (!/^https?:\/\//.test(entry.sourceCodeUrl || "")) {
      fail(`anime_index.json: "${entry.name}" has an invalid sourceCodeUrl`);
    }
    if (/OWNER\/REPO/.test(entry.sourceCodeUrl || "")) {
      fail(
        `anime_index.json: "${entry.name}" still points at the OWNER/REPO placeholder — ` +
          `set REPO_USER/REPO_NAME (or repo.json) before publishing`,
      );
    }
  }
}

function main() {
  let sources;
  try {
    sources = loadSources();
  } catch (error) {
    console.error(`✖ ${error.message}`);
    process.exit(1);
  }
  if (sources.length === 0) {
    console.error("✖ No sources found under javascript/");
    process.exit(1);
  }

  const seenNames = new Set();
  for (const source of sources) {
    checkMetadata(source);
    checkCode(source);
    checkPreferences(source);

    const id = sourceId(source.entry.lang, source.entry.name);
    if (seenNames.has(id)) {
      fail(`Duplicate source identity: "${source.entry.name}" (${source.entry.lang})`);
    }
    seenNames.add(id);
  }

  checkGeneratedIndex(sources);

  for (const warning of warnings) console.warn(`⚠ ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`✖ ${error}`);
    console.error(`\n${errors.length} error(s), ${warnings.length} warning(s).`);
    process.exit(1);
  }
  console.log(
    `✔ ${sources.length} source(s) validated${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`,
  );
}

// Exported so scripts/test-shared.js can pin the scanner: it is the only thing
// standing between a typo and a source that dies on its first request.
module.exports = { stripNonCode, FORBIDDEN_GLOBALS };

if (require.main === module) main();

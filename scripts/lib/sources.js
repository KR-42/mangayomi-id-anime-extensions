"use strict";

/**
 * Shared helpers for the tooling scripts: locating sources, parsing their
 * `mangayomiSources` metadata, and reproducing the app's source-id hash.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const JS_ROOT = path.join(ROOT, "javascript");
const REPO_JSON = path.join(ROOT, "repo.json");

/** Recursively list every .js file under a directory. */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

/**
 * Pull the literal array out of `const mangayomiSources = [ ... ];`.
 * The upstream generator uses the same non-greedy regex, so anything we parse
 * here is exactly what the app would have seen.
 */
function extractMetadataLiteral(code) {
  const match = /const\s+mangayomiSources\s*=\s*(\[[\s\S]*?\]);/.exec(code);
  return match ? match[1] : null;
}

/**
 * Parse a JS array literal that should be JSON. Tolerates trailing commas and
 * `//` comments, which authors sometimes leave in.
 */
function parseMetadataLiteral(literal) {
  const cleaned = literal
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(cleaned);
}

/**
 * Reads every source file and returns metadata + file info.
 * Throws with a readable message when a file has no usable metadata block.
 */
function loadSources() {
  const files = walk(JS_ROOT);
  const sources = [];
  for (const file of files) {
    const code = fs.readFileSync(file, "utf8");
    const literal = extractMetadataLiteral(code);
    if (!literal) {
      throw new Error(
        `${path.relative(ROOT, file)}: no "const mangayomiSources = [...];" block`,
      );
    }
    let entries;
    try {
      entries = parseMetadataLiteral(literal);
    } catch (error) {
      throw new Error(
        `${path.relative(ROOT, file)}: mangayomiSources is not valid JSON (${error.message})`,
      );
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error(`${path.relative(ROOT, file)}: mangayomiSources is empty`);
    }
    const relative = path.relative(JS_ROOT, file).split(path.sep).join("/");
    for (const entry of entries) {
      sources.push({
        entry,
        file,
        relative,
        code,
      });
    }
  }
  return sources;
}

/**
 * Dart's String.hashCode for the key the app builds:
 *   'mangayomi-"<lang>"."<name>"'.hashCode
 *
 * Replay-tested against kodjodevf/mangayomi-extensions/index.json and the
 * community indexes: every mismatch traced to a source pinning its own id.
 * Do not "improve" this — a drift in this number makes Mangayomi treat an
 * update as a brand new source.
 */
function dartStringHashCode(input) {
  const str = String(input);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash + str.charCodeAt(i)) & 0x1fffffff;
    hash = (hash + ((hash << 10) & 0x1fffffff)) & 0x1fffffff;
    hash ^= hash >>> 6;
  }
  hash = (hash + ((hash << 3) & 0x1fffffff)) & 0x1fffffff;
  hash ^= hash >>> 11;
  hash = (hash + ((hash << 15) & 0x1fffffff)) & 0x1fffffff;
  hash &= 0x3fffffff;
  return hash === 0 ? 0 : hash;
}

/** The id the app computes for a JS source when the block has no explicit id. */
function sourceId(lang, name) {
  return dartStringHashCode(`mangayomi-"${lang}"."${name}"`);
}

/** Repository coordinates, with sensible fallbacks for local runs. */
function repoInfo() {
  let file = {};
  if (fs.existsSync(REPO_JSON)) {
    file = JSON.parse(fs.readFileSync(REPO_JSON, "utf8"));
  }
  const user = process.env.REPO_USER || file.githubUser || "";
  const repo = process.env.REPO_NAME || file.githubRepo || "";
  const branch = process.env.REPO_BRANCH || file.branch || "main";
  const website =
    file.website ||
    (user && repo ? `https://github.com/${user}/${repo}` : "");
  return { name: file.name || "Mangayomi ID Anime", website, user, repo, branch, file };
}

/** Absolute raw URL for a file inside this repo (used for sourceCodeUrl). */
function rawUrl(relativePath) {
  const info = repoInfo();
  const base = process.env.REPO_RAW_BASE;
  if (base) return `${base.replace(/\/+$/, "")}/${relativePath}`;
  if (info.user && info.repo) {
    return `https://raw.githubusercontent.com/${info.user}/${info.repo}/${info.branch}/${relativePath}`;
  }
  // Local/offline builds: keep a stable, obviously-unset placeholder so the
  // validator can flag it before a release.
  return `https://raw.githubusercontent.com/OWNER/REPO/${info.branch}/${relativePath}`;
}

module.exports = {
  ROOT,
  JS_ROOT,
  REPO_JSON,
  walk,
  extractMetadataLiteral,
  parseMetadataLiteral,
  loadSources,
  dartStringHashCode,
  sourceId,
  repoInfo,
  rawUrl,
};

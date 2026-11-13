#!/usr/bin/env node
/**
 * Generates anime_index.json from the `mangayomiSources` block in every built
 * extension, mirroring what the app's own source_generator.dart produces for
 * JavaScript sources.
 *
 * Also regenerates repo.json when a GitHub user/repo is configured, so the
 * repository shows a friendly name in Mangayomi.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  loadSources,
  sourceId,
  repoInfo,
  rawUrl,
} = require("./lib/sources");

const ITEM_TYPE_ANIME = 1;

/** Build one index entry exactly as the app would parse it. */
function toIndexEntry(source, info) {
  const entry = source.entry;
  const lang = String(entry.lang || "");
  const name = String(entry.name || "");
  const explicitlyPinnedId =
    entry.id !== undefined && entry.id !== null
      ? Number.parseInt(entry.id, 10)
      : null;

  return {
    name,
    id:
      Number.isFinite(explicitlyPinnedId) && explicitlyPinnedId !== null
        ? explicitlyPinnedId
        : sourceId(lang, name),
    baseUrl: entry.baseUrl || "",
    lang,
    typeSource: entry.typeSource || "single",
    iconUrl: entry.iconUrl ? rawUrl(entry.iconUrl) : "",
    dateFormat: entry.dateFormat || "",
    dateFormatLocale: entry.dateFormatLocale || "",
    isNsfw: entry.isNsfw === true,
    hasCloudflare: entry.hasCloudflare === true,
    sourceCodeUrl: rawUrl(`javascript/${source.relative}`),
    apiUrl: entry.apiUrl || "",
    version: String(entry.version || "0.0.0"),
    isManga: false,
    itemType: ITEM_TYPE_ANIME,
    isFullData: entry.isFullData === true,
    appMinVerReq: entry.appMinVerReq || "0.5.0",
    additionalParams: entry.additionalParams || "",
    sourceCodeLanguage: 1,
    notes: entry.notes || "",
  };
}

function compareEntries(a, b) {
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  return a.lang.localeCompare(b.lang);
}

function main() {
  const info = repoInfo();
  const sources = loadSources();
  const entries = sources.map((source) => toIndexEntry(source, info));

  const seen = new Map();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      const other = seen.get(entry.id);
      throw new Error(
        `Duplicate source id ${entry.id}: "${entry.name}" (${entry.lang}) ` +
          `collides with "${other.name}" (${other.lang}). Names must be unique per language.`,
      );
    }
    seen.set(entry.id, entry);
  }

  entries.sort(compareEntries);
  const outputPath = path.join(ROOT, "anime_index.json");
  const json = JSON.stringify(entries, null, 2) + "\n";
  const previous = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf8")
    : null;

  if (previous !== json) {
    fs.writeFileSync(outputPath, json, "utf8");
    console.log(
      `anime_index.json: ${entries.length} source(s) written (${path.relative(ROOT, outputPath)})`,
    );
  } else {
    console.log(`anime_index.json: up to date (${entries.length} source(s))`);
  }

  // repo.json labels the repository in Mangayomi's Add-repo dialog. Extra keys
  // (githubUser/githubRepo/branch) are ours and must survive regeneration.
  if (info.user && info.repo) {
    const repoPath = path.join(ROOT, "repo.json");
    const existing = fs.existsSync(repoPath)
      ? JSON.parse(fs.readFileSync(repoPath, "utf8"))
      : {};
    const repoJson = { ...existing, name: info.name, website: info.website };
    const next = JSON.stringify(repoJson, null, 4) + "\n";
    const previous = fs.existsSync(repoPath)
      ? fs.readFileSync(repoPath, "utf8")
      : null;
    if (previous !== next) {
      fs.writeFileSync(repoPath, next, "utf8");
      console.log(`repo.json: ${info.website}`);
    }
  }
}

main();

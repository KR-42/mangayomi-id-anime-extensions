#!/usr/bin/env node
/**
 * Test harness for every built extension.
 *
 * For each source it drives the same flow the Mangayomi app drives:
 *
 *   getSourcePreferences() -> getFilterList() -> getPopular(1) ->
 *   getLatestUpdates(1) -> search() -> getDetail() -> getVideoList()
 *
 * In fixture mode the HTTP layer is served from scripts/test-harness/fixtures/
 * so the suite is offline, deterministic and safe for CI. `--live` hits the
 * real sites instead and is meant to detect markup drift, not to gate a PR.
 *
 * A test fails when a required field is empty: a listing item without a name
 * or link, a detail without episodes, an episode without a single playable
 * video. That is deliberate — an extension that returns [] "successfully" is
 * broken, and silent emptiness is the most common way these scrapers rot.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { createRuntime } = require("./runtime");
const { fixtureTransport, liveTransport } = require("./transport");
const { ROOT, JS_ROOT, loadSources } = require("../lib/sources");

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const VERBOSE = args.includes("--verbose");
const onlyArg = args.find((a) => a.startsWith("--source="));
const ONLY = onlyArg ? onlyArg.split("=")[1] : null;

const results = [];

function log(message) {
  if (VERBOSE) console.log(`    ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** Validate an MPages: { list: MManga[], hasNextPage: boolean }. */
function checkPages(page, label) {
  assert(page && typeof page === "object", `${label}: expected an object, got ${page}`);
  assert(Array.isArray(page.list), `${label}: "list" must be an array`);
  assert(page.list.length > 0, `${label}: returned an empty list`);
  assert(
    typeof page.hasNextPage === "boolean",
    `${label}: "hasNextPage" must be a boolean (got ${typeof page.hasNextPage})`,
  );
  for (const item of page.list) {
    assert(isNonEmptyString(item.name), `${label}: item without "name"`);
    assert(isNonEmptyString(item.link), `${label}: "${item.name}" has no "link"`);
    assert(
      !/^https?:\/\//i.test(item.link),
      `${label}: "${item.name}" stores an absolute link (${item.link}); ` +
        `store relative links so domain changes keep the library valid`,
    );
  }
  return page;
}

/** Validate an MManga detail object. */
function checkDetail(detail, label) {
  assert(detail && typeof detail === "object", `${label}: expected an object`);
  assert(isNonEmptyString(detail.name), `${label}: missing "name"`);
  assert(isNonEmptyString(detail.imageUrl), `${label}: missing "imageUrl"`);
  assert(isNonEmptyString(detail.link), `${label}: missing "link"`);
  assert(
    Array.isArray(detail.episodes) && detail.episodes.length > 0,
    `${label}: no episodes returned`,
  );
  for (const episode of detail.episodes) {
    assert(isNonEmptyString(episode.name), `${label}: episode without "name"`);
    assert(isNonEmptyString(episode.url), `${label}: "${episode.name}" has no "url"`);
    assert(
      !/^https?:\/\//i.test(episode.url),
      `${label}: episode "${episode.name}" stores an absolute url (${episode.url})`,
    );
  }
  if (detail.status !== undefined) {
    assert(
      Number.isInteger(detail.status) && detail.status >= 0 && detail.status <= 4,
      `${label}: "status" must be an integer 0-4 (got ${detail.status})`,
    );
  }
  return detail;
}

/** Validate the video list. */
function checkVideos(videos, label) {
  assert(Array.isArray(videos), `${label}: expected an array`);
  assert(videos.length > 0, `${label}: no playable video found`);
  for (const video of videos) {
    assert(isNonEmptyString(video.url), `${label}: video without "url"`);
    assert(isNonEmptyString(video.quality), `${label}: video without "quality"`);
    assert(
      isNonEmptyString(video.originalUrl),
      `${label}: video "${video.quality}" has no "originalUrl"`,
    );
    assert(
      video.headers && typeof video.headers === "object",
      `${label}: video "${video.quality}" has no "headers" (players need a Referer/UA)`,
    );
  }
  return videos;
}

function checkPreferences(list, label) {
  assert(Array.isArray(list), `${label}: getSourcePreferences() must return an array`);
  const keys = list.map((entry) => entry && entry.key).filter(Boolean);
  for (const required of ["base_url", "preferred_quality", "preferred_server"]) {
    assert(keys.includes(required), `${label}: missing "${required}" preference`);
  }
  return list;
}

function checkFilters(filters, label) {
  assert(Array.isArray(filters), `${label}: getFilterList() must return an array`);
  for (const filter of filters) {
    assert(
      filter && typeof filter === "object",
      `${label}: filter entry must be an object`,
    );
  }
  return filters;
}

/** Drive one source through the full flow. */
async function testSource(source) {
  const entry = source.entry;
  const name = entry.name;
  // source.relative is relative to javascript/ (pkgPath), not to the cwd.
  const file = path.join(JS_ROOT, source.relative);
  const steps = [];

  async function step(label, fn) {
    const started = Date.now();
    try {
      const value = await fn();
      steps.push({ label, ok: true, ms: Date.now() - started });
      return value;
    } catch (error) {
      steps.push({ label, ok: false, ms: Date.now() - started, error });
      throw error;
    }
  }

  const code = fs.readFileSync(file, "utf8");
  const transport = LIVE ? liveTransport() : fixtureTransport(source.fixtureId);

  const runtime = createRuntime({
    code,
    source: {
      name,
      id: entry.id,
      baseUrl: entry.baseUrl,
      lang: entry.lang,
      typeSource: entry.typeSource,
      itemType: entry.itemType,
      version: entry.version,
      pkgPath: entry.pkgPath,
    },
    transport: transport.transport,
  });

  const extension = runtime.extension;

  try {
    const preferences = await step("getSourcePreferences", async () =>
      checkPreferences(extension.getSourcePreferences(), name),
    );
    log(`declared keys: ${preferences.map((p) => p.key).join(", ")}`);

    await step("getFilterList", async () =>
      checkFilters(extension.getFilterList(), name),
    );

    const popular = await step("getPopular(1)", async () =>
      checkPages(await extension.getPopular(1), `${name} getPopular`),
    );
    log(`popular: ${popular.list.length} item(s), hasNextPage=${popular.hasNextPage}`);

    const latest = await step("getLatestUpdates(1)", async () =>
      checkPages(await extension.getLatestUpdates(1), `${name} getLatestUpdates`),
    );
    log(`latest: ${latest.list.length} item(s), hasNextPage=${latest.hasNextPage}`);

    await step("search()", async () => {
      // "naruto" is the usual probe; some catalogues simply do not carry it, so
      // fall back to a near-universal term before judging search broken.
      let result = await extension.search("naruto", 1, []);
      if (!result || !Array.isArray(result.list) || result.list.length === 0) {
        result = await extension.search("one", 1, []);
      }
      return checkPages(result, `${name} search`);
    });

    const detail = await step("getDetail()", async () =>
      checkDetail(await extension.getDetail(popular.list[0].link), `${name} getDetail`),
    );
    log(`detail: "${detail.name}" with ${detail.episodes.length} episode(s)`);

    const episode = detail.episodes[detail.episodes.length - 1];
    const videos = await step("getVideoList()", async () =>
      checkVideos(
        await extension.getVideoList(episode.url),
        `${name} getVideoList("${episode.name}")`,
      ),
    );
    log(`videos: ${videos.map((v) => v.quality).join(", ")}`);

    if (!LIVE) {
      const unused = [];
      for (const entryMap of transport.used) unused.push(entryMap.file);
      log(`fixtures used: ${unused.join(", ")}`);
    }

    // A source should never log an extractor crash silently.
    const errors = runtime.logs.filter((l) => l.level === "error");
    if (errors.length) {
      log(`console.error output:\n      ${errors.map((e) => e.message).join("\n      ")}`);
    }

    results.push({ name, ok: true, steps });
  } catch (error) {
    results.push({ name, ok: false, steps, error });
  }
}

function printReport() {
  let failed = 0;
  for (const result of results) {
    if (result.ok) {
      const slowest = result.steps.reduce(
        (max, step) => (step.ms > max ? step.ms : max),
        0,
      );
      console.log(`✔ ${result.name} (${result.steps.length} steps, slowest ${slowest} ms)`);
    } else {
      failed++;
      console.log(`✖ ${result.name}`);
      for (const step of result.steps) {
        const mark = step.ok ? "✔" : "✖";
        console.log(`    ${mark} ${step.label} (${step.ms} ms)`);
        if (!step.ok && step.error) {
          console.log(`        ${step.error.message.split("\n").join("\n        ")}`);
        }
      }
    }
  }
  console.log("");
  if (failed) {
    console.log(
      `${results.length - failed} passed, ${failed} failed${LIVE ? " (live mode)" : ""}.`,
    );
    process.exit(1);
  }
  console.log(`${results.length} source(s) passed${LIVE ? " (live mode)" : ""}.`);
}

async function main() {
  let sources;
  try {
    sources = loadSources();
  } catch (error) {
    console.error(`✖ ${error.message}`);
    process.exit(1);
  }

  // Only built files are testable, and loadSources already reads javascript/.
  const runnable = sources
    .map((source) => ({
      ...source,
      fixtureId: path.basename(source.file, ".js"),
    }))
    .filter((source) => !ONLY || source.entry.name === ONLY);

  if (runnable.length === 0) {
    console.error(ONLY ? `✖ No source named "${ONLY}"` : "✖ No sources to test");
    process.exit(1);
  }

  console.log(
    `Testing ${runnable.length} source(s) in ${LIVE ? "LIVE" : "fixture"} mode\n`,
  );

  for (const source of runnable) {
    await testSource(source);
  }

  printReport();
}

main();

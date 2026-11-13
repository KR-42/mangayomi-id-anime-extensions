/**
 * HTTP transport used by the mock Client.
 *
 * Two modes:
 *  - fixture (default): every request is served from
 *    scripts/test-harness/fixtures/<source>/map.json, so tests are offline,
 *    deterministic and safe to run in CI.
 *  - live (--live): real network calls, used to spot sites that changed.
 *
 * Requests with no fixture fail loudly. Silence would let a broken selector
 * pass as "empty page".
 */
"use strict";

const fs = require("fs");
const path = require("path");

const FIXTURES_ROOT = path.join(__dirname, "fixtures");

/**
 * Load map.json for a source: [{method, match, url, body?, file, status?}, ...].
 *
 * `body` is an optional regex tested against the POST body. Several sites post
 * different commands to the same endpoint (Otaku Desu's admin-ajax.php), so
 * the URL alone cannot tell those fixtures apart.
 */
function loadMap(sourceId) {
  const mapPath = path.join(FIXTURES_ROOT, sourceId, "map.json");
  if (!fs.existsSync(mapPath)) {
    return { entries: [], dir: path.join(FIXTURES_ROOT, sourceId), mapPath };
  }
  const raw = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const entries = (raw.responses || []).map((entry) => {
    if (!entry.url && !entry.match) {
      throw new Error(`${mapPath}: entry needs "url" or "match"`);
    }
    return {
      method: (entry.method || "GET").toUpperCase(),
      pattern: entry.url
        ? new RegExp("^" + escapeRegExp(entry.url) + "$")
        : new RegExp(entry.match),
      body: entry.body ? new RegExp(entry.body) : null,
      file: entry.file,
      status: entry.status,
      headers: entry.headers || {},
    };
  });
  return { entries, dir: path.join(FIXTURES_ROOT, sourceId), mapPath };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Offline transport. Throws when a request has no matching fixture. */
function fixtureTransport(sourceId) {
  const { entries, dir, mapPath } = loadMap(sourceId);
  const used = new Set();

  return {
    used,
    mapPath,
    transport(method, url, headers, body) {
      const normalized = method.toUpperCase();
      for (const entry of entries) {
        if (entry.method !== normalized) continue;
        if (!entry.pattern.test(url)) continue;
        if (entry.body && !entry.body.test(String(body == null ? "" : body))) continue;
        used.add(entry);
        const filePath = path.join(dir, entry.file);
        if (!fs.existsSync(filePath)) {
          throw new Error(`fixture missing: ${path.relative(process.cwd(), filePath)}`);
        }
        return {
          status: entry.status || 200,
          headers: entry.headers,
          body: fs.readFileSync(filePath, "utf8"),
        };
      }
      throw new Error(
        `no fixture for ${normalized} ${url}` +
          (body ? ` (body: ${String(body).slice(0, 120)})` : "") +
          `\n  add it to ${path.relative(process.cwd(), mapPath)} or run with --live`,
      );
    },
  };
}

const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Mobile Safari/537.36";

/** Live transport, mirroring the app's request semantics closely enough. */
function liveTransport() {
  const used = new Set();
  return {
    used,
    async transport(method, url, headers, body, options) {
      used.add(`${method} ${url}`);
      // The app fills in its stored browser UA when a source sends none.
      const sent = { ...headers };
      if (!Object.keys(sent).some((key) => key.toLowerCase() === "user-agent")) {
        sent["User-Agent"] = BROWSER_UA;
      }
      // `new Client({ followRedirects: false })` is how a source reads a
      // redirect's Location itself; honour it here too or the harness silently
      // follows the hop and the source sees a 200 body instead.
      const follow = !(options && options.followRedirects === false);
      const response = await fetch(url, {
        method,
        headers: sent,
        body: body === undefined ? undefined : body,
        redirect: follow ? "follow" : "manual",
      });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      };
    },
  };
}

module.exports = { fixtureTransport, liveTransport, FIXTURES_ROOT };

// Generated file — do not edit directly.
// Source: src/id/kuronime.js + src-shared/*.js. Run `npm run build` after editing.
// Kuronime (https://kuronime.sbs) — a WordPress site (WP Rocket lazy images).
//
// Listings, search and detail are plain HTML. Streams are not: an episode page
// only holds an encrypted id, the animeku.org API answers with AES-encrypted
// player data (CryptoJS JSON: {ct, iv, s}), and the passphrase comes from the
// site's own player script. This decryption is an exception the repo owner
// approved on 11 Nov 2026 (see docs/SITE_NOTES.md §3). The player's own HLS is
// left out: its segments are disguised as .jpg, which ffmpeg (the app's player)
// refuses. The decrypted mirror list (mp4upload, pixeldrain, vidhide, ...) is
// what gets played.

const mangayomiSources = [{
  "name": "Kuronime",
  "lang": "id",
  "baseUrl": "https://kuronime.sbs",
  "apiUrl": "",
  "iconUrl": "icons/kuronime.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.3",
  "pkgPath": "anime/src/id/kuronime.js",
  "hasCloudflare": false,
  "notes": "Video dari mirror (mp4upload, pixeldrain, vidhide). Bila semua episode kosong, kunci player situs mungkin berubah: perbarui ekstensi. Domain bisa berpindah; atur di Pengaturan sumber."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// ---- inlined from src-shared/00-util.js ----
// ---------------------------------------------------------------------------
// Shared utilities for the Indonesian anime sources.
//
// This file is inlined by scripts/build.js into every extension under
// javascript/anime/src/id/. Do not edit the built files directly.
//
// QuickJS in Mangayomi has no browser globals: no atob/btoa, no URL, no
// TextDecoder. Everything needed here is implemented with plain JS.
// ---------------------------------------------------------------------------

// --------------------------------------------------------------- base64

var B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decode base64 (with or without padding) to a byte string. */
function b64Decode(input) {
  // Mirror ids and mirror payloads arrive as base64url on some pages.
  var s = String(input || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/[^A-Za-z0-9+/]/g, "");
  var out = "";
  var i = 0;
  while (i < s.length) {
    var ca = s.charAt(i++);
    var cb = s.charAt(i++);
    var cc = s.charAt(i++);
    var cd = s.charAt(i++);
    // charAt past the end returns "" and indexOf("") is 0 — guard explicitly,
    // otherwise short input grows a trailing NUL byte.
    var a = ca ? B64_CHARS.indexOf(ca) : -1;
    var b = cb ? B64_CHARS.indexOf(cb) : -1;
    var c = cc ? B64_CHARS.indexOf(cc) : -1;
    var d = cd ? B64_CHARS.indexOf(cd) : -1;
    if (a < 0 || b < 0) break;
    out += String.fromCharCode(((a << 2) | (b >> 4)) & 0xff);
    if (c >= 0) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out += String.fromCharCode(((c & 3) << 6) | d);
  }
  return out;
}

/** Decode base64 into a UTF-8 string (sites encode Indonesian text this way). */
function b64DecodeUtf8(input) {
  return utf8Decode(b64Decode(input));
}

/** Encode a byte string (chars 0-255) to standard base64, with padding. */
function b64Encode(input) {
  var s = String(input || "");
  var out = "";
  for (var i = 0; i < s.length; i += 3) {
    var a = s.charCodeAt(i) & 0xff;
    var b = i + 1 < s.length ? (s.charCodeAt(i + 1) & 0xff) : -1;
    var c = i + 2 < s.length ? (s.charCodeAt(i + 2) & 0xff) : -1;
    out += B64_CHARS.charAt(a >> 2);
    out += B64_CHARS.charAt(((a & 3) << 4) | (b >= 0 ? b >> 4 : 0));
    out += b >= 0 ? B64_CHARS.charAt(((b & 15) << 2) | (c >= 0 ? c >> 6 : 0)) : "=";
    out += c >= 0 ? B64_CHARS.charAt(c & 63) : "=";
  }
  return out;
}

/** Decode a byte string (chars 0-255) into a proper UTF-8 JS string. */
function utf8Decode(bin) {
  var out = "";
  var i = 0;
  while (i < bin.length) {
    var c = bin.charCodeAt(i++) & 0xff;
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c >= 0xc0 && c < 0xe0 && i < bin.length) {
      var c2 = bin.charCodeAt(i++) & 0x3f;
      out += String.fromCharCode(((c & 0x1f) << 6) | c2);
    } else if (c >= 0xe0 && c < 0xf0 && i + 1 < bin.length) {
      var d2 = bin.charCodeAt(i++) & 0x3f;
      var d3 = bin.charCodeAt(i++) & 0x3f;
      out += String.fromCharCode(((c & 0x0f) << 12) | (d2 << 6) | d3);
    } else if (c >= 0xf0 && i + 2 < bin.length) {
      var e2 = bin.charCodeAt(i++) & 0x3f;
      var e3 = bin.charCodeAt(i++) & 0x3f;
      var e4 = bin.charCodeAt(i++) & 0x3f;
      var cp = ((c & 0x07) << 18) | (e2 << 12) | (e3 << 6) | e4;
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10));
      out += String.fromCharCode(0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(0xfffd);
    }
  }
  return out;
}

// ------------------------------------------------------------------ urls

/** Join a possibly-relative path onto a base URL (no URL class available). */
function resolveUrl(base, path) {
  var b = String(base || "").replace(/\/+$/, "");
  var p = String(path == null ? "" : path).trim();
  if (!p) return b;
  if (/^https?:\/\//i.test(p)) return p;
  if (p.indexOf("//") === 0) return "https:" + p;
  if (p.charAt(0) !== "/") p = "/" + p;
  return b + p;
}

/** Hostname of a URL, lowercased, without "www." ("" when unparseable). */
function hostOf(url) {
  var m = /^https?:\/\/([^/?#]+)/i.exec(String(url || ""));
  if (!m) return "";
  return m[1].toLowerCase().replace(/^www\./, "");
}

/** Path (and query) of an absolute URL; the URL itself when already relative. */
function pathOf(url) {
  var m = /^https?:\/\/[^/]+(\/[^#]*)?/i.exec(String(url || ""));
  if (!m) return String(url || "");
  return m[1] || "/";
}

/**
 * Store links relative to the source root so a changed domain does not break
 * the user's library. Absolute links on the same host become paths; links to
 * other hosts (mirrors, CDNs) are kept as they are.
 */
function toRelative(url, base) {
  var u = String(url || "").trim();
  if (!u) return "";
  if (u.charAt(0) === "/") return u;
  if (!/^https?:\/\//i.test(u)) return "/" + u.replace(/^\/+/, "");
  if (base && hostOf(u) === hostOf(base)) return pathOf(u);
  return u;
}

/** Query-string escaping that also handles the characters sites dislike. */
function encodeQuery(value) {
  return encodeURIComponent(String(value == null ? "" : value).trim());
}

/** Build a query string from an object, skipping empty values. */
function queryString(params) {
  var parts = [];
  var keys = Object.keys(params);
  for (var i = 0; i < keys.length; i++) {
    var value = params[keys[i]];
    if (value === undefined || value === null || value === "") continue;
    parts.push(encodeURIComponent(keys[i]) + "=" + encodeURIComponent(value));
  }
  return parts.join("&");
}

// ------------------------------------------------------------------ text

/** Collapse whitespace and trim. */
function cleanText(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip tags from a fragment of HTML. */
function stripTags(html) {
  return cleanText(String(html || "").replace(/<[^>]*>/g, " "));
}

/** Decode the handful of HTML entities these themes actually emit. */
function decodeEntities(value) {
  var s = String(value == null ? "" : value);
  var named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    hellip: "…",
    mdash: "—",
    ndash: "–",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
  };
  s = s.replace(/&#x([0-9a-f]+);/gi, function (_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  s = s.replace(/&#(\d+);/g, function (_, dec) {
    return String.fromCharCode(parseInt(dec, 10));
  });
  return s.replace(/&([a-z]+);/gi, function (all, name) {
    var key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : all;
  });
}

/** Trim "Sub Indo" style noise from a series title, keeping episode numbers. */
function cleanTitle(value) {
  var t = cleanText(decodeEntities(value));
  t = t.replace(/\s*[-–|]\s*$/g, "");
  t = t.replace(
    /^\s*(nonton\s+streaming|nonton|streaming|download)\s+/gi,
    "",
  );
  t = t.replace(
    /\s*\b(sub(title)?\s*(indonesia|indo|id)|subtitle\s*indonesia|nonton\s*streaming|streaming)\b\s*/gi,
    " ",
  );
  t = t.replace(/\s*\((sub\s*indo|subtitle\s*indonesia)\)\s*/gi, " ");
  t = t.replace(/\s{2,}/g, " ");
  return t.replace(/^[\s\-–|:]+|[\s\-–|:]+$/g, "").trim();
}

/** Title of an episode row, with the series prefix removed when present. */
function cleanEpisodeName(name, seriesName) {
  var n = cleanText(decodeEntities(name));
  if (seriesName) {
    var series = cleanText(seriesName);
    if (series && n.toLowerCase().indexOf(series.toLowerCase()) === 0) {
      n = n.substring(series.length).replace(/^[\s\-–|:]+/, "");
    }
  }
  n = n.replace(/\s*\b(subtitle\s*indonesia|sub\s*indo)\b\s*/gi, " ");
  return safeString(n).trim();
}

/** Coerce anything to a trimmed string (never null/undefined). */
function safeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/** First non-empty string among the arguments. */
function firstNonEmpty() {
  for (var i = 0; i < arguments.length; i++) {
    var v = safeString(arguments[i]);
    if (v) return v;
  }
  return "";
}

// ------------------------------------------------------------- qualities

var QUALITY_RE = /(\d{3,4})\s*p\b/i;

/** "720p", "720P", "HD 720p" -> 720, or 0 when absent. */
function qualityHeight(label) {
  var m = QUALITY_RE.exec(String(label || ""));
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Preference order for a list of "1080p"/"720p"/... values from a user
 * preference. Returns the array sorted high-to-low, keeping unknown labels at
 * the end.
 */
function sortQualities(values) {
  return (values || []).slice().sort(function (a, b) {
    return qualityHeight(b) - qualityHeight(a);
  });
}

/**
 * Sort videos: preferred qualities first (in the user's order), then any other
 * quality by resolution descending, then preferred hosts first.
 *
 * @param {Array} videos      MVideo-shaped objects
 * @param {string[]} qualities preferred quality labels ("1080p", "720p", ...)
 * @param {string[]} servers   preferred server/host names, lowercase
 */
function sortVideos(videos, qualities, servers) {
  var qualityRank = {};
  var q = qualities && qualities.length ? qualities : [];
  for (var i = 0; i < q.length; i++) qualityRank[safeString(q[i]).toLowerCase()] = i;

  var serverRank = {};
  var s = servers || [];
  for (var j = 0; j < s.length; j++) {
    serverRank[safeString(s[j]).toLowerCase()] = j;
  }

  function score(video) {
    var label = safeString(video.quality);
    var height = qualityHeight(label);
    var exact = -1;
    var lower = label.toLowerCase();
    var keys = Object.keys(qualityRank);
    for (var k = 0; k < keys.length; k++) {
      // "720p - Filedon" matches the "720p" preference.
      if (lower.indexOf(keys[k]) !== -1) {
        exact = qualityRank[keys[k]];
        break;
      }
    }
    var serverName = safeString(video.server || "").toLowerCase();
    var host = hostOf(video.originalUrl || video.url);
    var serverIndex = 999;
    var serverKeys = Object.keys(serverRank);
    // Exact name first: "odstream" must not claim "odstreamhd" just because it
    // sits earlier in the preference list.
    for (var e = 0; e < serverKeys.length; e++) {
      if (serverName === serverKeys[e] || host === serverKeys[e]) {
        serverIndex = serverRank[serverKeys[e]];
        break;
      }
    }
    // Substring matching is a weak fallback for labels like "Odstream (HD)" or
    // a CDN host under the mirror. It ranks behind every exact match, so an
    // unselected server can never leapfrog one the user did select.
    if (serverIndex === 999) {
      for (var m = 0; m < serverKeys.length; m++) {
        if (
          serverName.indexOf(serverKeys[m]) !== -1 ||
          host.indexOf(serverKeys[m]) !== -1
        ) {
          serverIndex = 500 + serverRank[serverKeys[m]];
          break;
        }
      }
    }
    return {
      exact: exact === -1 ? 1000 : exact,
      height: height || 0,
      server: serverIndex,
    };
  }

  return videos.slice().sort(function (a, b) {
    var sa = score(a);
    var sb = score(b);
    if (sa.exact !== sb.exact) return sa.exact - sb.exact;
    if (sa.height !== sb.height) return sb.height - sa.height;
    if (sa.server !== sb.server) return sa.server - sb.server;
    return 0;
  });
}

/**
 * Build a quality label that tells the truth about the format, e.g.
 * "720p · Hardsub ID · Filedon". Empty parts are dropped.
 */
function qualityLabel(quality, server, note) {
  var parts = [];
  if (safeString(quality)) parts.push(safeString(quality));
  if (safeString(note)) parts.push(safeString(note));
  if (safeString(server)) parts.push(safeString(server));
  return parts.length ? parts.join(" · ") : "Default";
}

// ------------------------------------------------------------ pagination

/**
 * Whether a "next" control exists. Accepts a Document plus a list of
 * selectors; a control counts when it exists, is not disabled, and its text or
 * href does not say "previous".
 *
 * A missed selector still returns an object (the app's null-element wrapper),
 * whose text and href are both "". Testing only `!el` would therefore treat a
 * missing control as a button-styled "next" and report another page forever.
 * "No text and no href" is the documented miss, so it is skipped explicitly.
 */
function hasNextPage(doc, selectors) {
  for (var i = 0; i < selectors.length; i++) {
    var el = doc.selectFirst(selectors[i]);
    if (!el) continue;
    var cls = safeString(el.className).toLowerCase();
    var text = safeString(el.text).toLowerCase();
    var href = safeString(el.attr("href")).toLowerCase();
    if (!cls && !text && !href) continue;
    if (cls.indexOf("disabled") !== -1) continue;
    if (href === "#" || href === "") {
      // A button-styled control: trust it unless it is marked disabled.
      if (text.indexOf("prev") !== -1) continue;
      return true;
    }
    if (text.indexOf("prev") !== -1 || href.indexOf("prev") !== -1) continue;
    return true;
  }
  return false;
}

/** Parse a page number out of a pagination container; 0 when unknown. */
function lastPageNumber(doc, selectors) {
  var max = 0;
  for (var i = 0; i < selectors.length; i++) {
    var elements = doc.select(selectors[i]) || [];
    for (var j = 0; j < elements.length; j++) {
      var text = safeString(elements[j].text);
      var n = parseInt(text, 10);
      if (!isNaN(n) && n > max) max = n;
      var href = safeString(elements[j].attr("href"));
      var m = /[?&]page[=/](\d+)/i.exec(href) || /\/page\/(\d+)/i.exec(href);
      if (m) {
        var p = parseInt(m[1], 10);
        if (p > max) max = p;
      }
    }
  }
  return max;
}

// ---------------------------------------------------------------- misc

/** Values of a <select> which the theme uses for genres. */
function selectOptions(element) {
  var out = [];
  if (!element) return out;
  var options = element.select("option") || [];
  for (var i = 0; i < options.length; i++) {
    var value = safeString(options[i].attr("value"));
    var name = cleanText(decodeEntities(options[i].text));
    if (name) out.push({ name: name, value: value });
  }
  return out;
}

/** Extract a social/embed URL from an iframe-looking fragment. */
function iframeSrc(html) {
  var m = /<iframe[^>]+src=["']([^"']+)["']/i.exec(String(html || ""));
  return m ? decodeEntities(m[1]) : "";
}

/** Show only the first N entries of a list (sites often pad with junk). */
function take(list, n) {
  return (list || []).slice(0, n);
}

// ---- inlined from src-shared/10-provider.js ----
// ---------------------------------------------------------------------------
// Base class shared by every source in this repo.
//
// Adds: a user-overridable base URL, consistent headers, a small retry-free
// fetch wrapper, and the preference-reading helpers used across sources.
//
// Inlined by scripts/build.js; edit src-shared/ instead of built files.
// ---------------------------------------------------------------------------

var DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
};

class IdBaseProvider extends MProvider {
  constructor(baseUrl) {
    super();
    this.client = new Client();
    this.prefs = new SharedPreferences();
    this.defaultBaseUrl = baseUrl || this.source.baseUrl;
    this._baseUrl = null;
  }

  /**
   * The base URL currently in use.
   *
   * The user can override the site's domain in the source settings. Stored
   * links are relative, so switching domains keeps the library intact.
   */
  getBaseUrl() {
    if (this._baseUrl) return this._baseUrl;
    var override = "";
    try {
      override = safeString(this.prefs.get("base_url"));
    } catch (_) {
      override = "";
    }
    var base = override || this.defaultBaseUrl || this.source.baseUrl;
    this._baseUrl = String(base).replace(/\/+$/, "");
    return this._baseUrl;
  }

  /** Absolute URL for a link stored relative (or already absolute). */
  resolve(path) {
    return resolveUrl(this.getBaseUrl(), path);
  }

  /** Relative link for storage, resolved against the current base URL. */
  relativize(url) {
    return toRelative(url, this.getBaseUrl());
  }

  /**
   * Browser identity sent with every request.
   *
   * Cloudflare's "Just a moment..." gate is triggered by a missing or obviously
   * scripted User-Agent for some hosts, so sources may override this. The
   * bypass itself (challenge solving, cf_clearance cookies) is done by the app,
   * not by us — see docs/MANGAYOMI_JS_API_NOTES.md §4.
   */
  userAgent() {
    return DEFAULT_HEADERS["User-Agent"];
  }

  getHeaders(url) {
    return {
      "User-Agent": this.userAgent(),
      Accept: DEFAULT_HEADERS.Accept,
      "Accept-Language": DEFAULT_HEADERS["Accept-Language"],
      Referer: this.getBaseUrl() + "/",
    };
  }

  /** Request headers with an explicit Referer (embed/CDN requests need it). */
  headersFor(referer) {
    var headers = this.getHeaders(referer);
    if (referer) headers.Referer = referer;
    return headers;
  }

  /** GET a page and return its body. Throws on non-2xx. */
  async fetch(url, headers) {
    var res = await this.client.get(url, headers || this.getHeaders(url));
    if (!res || !res.body) {
      throw new Error("Empty response from " + url);
    }
    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
      throw new Error("HTTP " + res.statusCode + " from " + url);
    }
    return res.body;
  }

  /**
   * GET a page and parse it. Returns null instead of throwing so a single
   * broken page does not take down a whole listing.
   */
  async fetchDoc(url, headers) {
    try {
      var html = await this.fetch(url, headers);
      return new Document(html);
    } catch (e) {
      console.log("fetchDoc failed for " + url + ": " + e);
      return null;
    }
  }

  /** POST a form body and return the raw response object. */
  async post(url, body, headers) {
    var h = headers || this.getHeaders(url);
    h["Content-Type"] =
      h["Content-Type"] || "application/x-www-form-urlencoded; charset=UTF-8";
    return await this.client.post(url, h, body);
  }

  /** POST a form and parse the JSON response body. */
  async postJson(url, body, headers) {
    var res = await this.post(url, body, headers);
    if (!res || !res.body) return null;
    try {
      return JSON.parse(res.body);
    } catch (e) {
      console.log("postJson: bad JSON from " + url + ": " + res.body.slice(0, 200));
      return null;
    }
  }

  // --------------------------------------------------------- preferences

  /** Text preference with a default. */
  prefText(key, fallback) {
    try {
      var value = safeString(this.prefs.get(key));
      return value || fallback;
    } catch (_) {
      return fallback;
    }
  }

  /** List preference value (entryValues), with a default. */
  prefList(key, fallback) {
    return this.prefText(key, fallback);
  }

  /** Boolean preference. */
  prefBool(key, fallback) {
    try {
      var value = this.prefs.get(key);
      if (value === undefined || value === null) return fallback;
      return value === true || value === "true";
    } catch (_) {
      return fallback;
    }
  }

  /** Multi-select preference as an array of strings. */
  prefMulti(key, fallback) {
    try {
      var value = this.prefs.get(key);
      if (value && value.length !== undefined) {
        return Array.prototype.slice.call(value).map(safeString);
      }
      return fallback;
    } catch (_) {
      return fallback;
    }
  }

  /** Preferred qualities, parsed from the multi-select, highest first. */
  preferredQualities(fallback) {
    var values = this.prefMulti("preferred_quality", fallback || ["1080p", "720p", "480p", "360p"]);
    // Keep declaration order when the user reordered; do not re-sort heroes.
    return values.length ? values : fallback || [];
  }

  /** Preferred server names, lowercase. */
  preferredServers(fallback) {
    var values = this.prefMulti("preferred_server", fallback || []);
    return values.map(function (v) {
      return safeString(v).toLowerCase();
    });
  }

  /**
   * Shared preference entries: base URL override and quality preference.
   * Sources append their own entries (e.g. server order) and return the list
   * from getSourcePreferences().
   */
  basePreferences(qualityEntries) {
    return [
      {
        key: "base_url",
        editTextPreference: {
          title: "Domain situs",
          summary:
            "Kosongkan untuk memakai domain bawaan. Ganti bila domain situs berpindah.",
          value: "",
          dialogTitle: "Domain situs",
          dialogMessage:
            "Contoh: https://situs-baru.example. Tanpa garis miring di akhir.",
        },
      },
      {
        key: "preferred_quality",
        multiSelectListPreference: {
          title: "Kualitas yang diutamakan",
          summary: "Urutan kualitas pada daftar video.",
          entries: ["1080p", "720p", "480p", "360p"],
          entryValues: ["1080p", "720p", "480p", "360p"],
          // 1080p leads the default order. A quality left out of this list is
          // sorted to the tail no matter how good it is, so omitting it here
          // buries the best mirror under the weakest one.
          values: ["1080p", "720p", "480p", "360p"],
        },
      },
      {
        key: "preferred_server",
        multiSelectListPreference: {
          title: "Server yang diutamakan",
          summary: "Server terpilih dicoba lebih dulu saat memuat video.",
          entries: qualityEntries || [],
          entryValues: qualityEntries || [],
          values: take(qualityEntries || [], 3),
        },
      },
    ];
  }

  // ------------------------------------------------------------- helpers

  /**
   * Run tasks with bounded concurrency. QuickJS has no timers, but plain
   * promise chaining is enough to avoid hammering a site.
   */
  async mapLimit(items, limit, worker) {
    var results = [];
    var index = 0;
    var self = this;
    async function next() {
      while (index < items.length) {
        var current = index++;
        try {
          results[current] = await worker(items[current], current);
        } catch (e) {
          console.log("task failed: " + e);
          results[current] = null;
        }
      }
    }
    var workers = [];
    for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(next());
    await Promise.all(workers);
    return results;
  }

  /** Standard "empty page" result. */
  emptyPage() {
    return { list: [], hasNextPage: false };
  }

  /** Standard listing item shape. */
  item(name, imageUrl, link) {
    return {
      name: cleanTitle(name),
      imageUrl: imageUrl || "",
      link: this.relativize(link),
    };
  }
}

// ---- inlined from src-shared/20-extractors.js ----
// ---------------------------------------------------------------------------
// Video host extractors.
//
// Each extractor turns an embed page URL into MVideo-shaped objects, or into
// an empty array when it cannot. Sources try these in order and fall back
// gracefully; one failing host must never fail the whole episode.
//
// Where Mangayomi already ships a native extractor (see
// docs/MANGAYOMI_JS_API_NOTES.md §4), we call the global bridge instead of
// re-implementing it. Native extractors run in Dart, so they keep working when
// the host obfuscates its player with code QuickJS cannot evaluate.
// ---------------------------------------------------------------------------

var NATIVE_EXTRACTORS = [
  {
    name: "mp4upload",
    display: "Mp4Upload",
    match: /mp4upload\./i,
    fn: function (provider, url) {
      return mp4UploadExtractor(
        url,
        provider.headersFor("https://mp4upload.com/"),
        "",
        "",
      );
    },
  },
  {
    name: "yourupload",
    display: "YourUpload",
    match: /yourupload\.|vidcache\.|\/yup\.php/i,
    fn: function (provider, url) {
      return yourUploadExtractor(
        url,
        provider.headersFor("https://www.yourupload.com/"),
        "",
        "",
      );
    },
  },
  {
    name: "okru",
    display: "Ok.ru",
    match: /ok\.ru\/|odnoklassniki\./i,
    fn: function (provider, url) {
      return okruExtractor(url);
    },
  },
  {
    name: "streamwish",
    display: "StreamWish",
    match: /streamwish\.|filelions\.|hgcloud\.|vidspeeds\.|playerwish\./i,
    fn: function (provider, url) {
      return streamWishExtractor(url, "");
    },
  },
  {
    name: "filemoon",
    display: "Filemoon",
    match: /filemoon\.|files\.im|byse\./i,
    fn: function (provider, url) {
      return filemoonExtractor(url, "", "");
    },
  },
  {
    name: "doodstream",
    display: "DoodStream",
    // The `playmogo`/`plamogo` pair is the DoodStream clone NekoPoi serves as
    // its stream 1 and 2; it answers to the same /pass_md5/ handshake.
    match: /dood\.|doods\.|d000d\.|dsvplay\.|doodstream\.|playmogo\.|plamogo\./i,
    fn: function (provider, url) {
      return doodExtractor(url, "");
    },
  },
  {
    name: "streamtape",
    display: "StreamTape",
    match: /streamtape\.|strtape\./i,
    fn: function (provider, url) {
      return streamTapeExtractor(url, "");
    },
  },
  {
    name: "voe",
    display: "Voe",
    match: /voe\.sx|voe\.to|voe\.re|voe\.network/i,
    fn: function (provider, url) {
      return voeExtractor(url, "");
    },
  },
  {
    name: "vidbom",
    display: "VidBom",
    match: /vidbom\.|vidshare\.|vidshar\./i,
    fn: function (provider, url) {
      return vidBomExtractor(url);
    },
  },
];

/**
 * Hosts the app does not implement. Ordered from most to least specific, since
 * some of these hosts share a CDN (vidhide family, streamwish family).
 */
var HOST_EXTRACTORS = [
  { name: "abyss", display: "Abyss", match: /abyssplayer\./i, fn: extractAbyss },
  { name: "desustream", display: "Desustream", match: /desustream\.|odstream\.|odcdn\.|ondesuhd\./i, fn: extractDesustream },
  { name: "blogger", display: "Blogger", match: /blogger\.com|blogspot\.com|googlevideo\./i, fn: extractBlogger },
  { name: "vidhide", display: "Vidhide", match: /vidhide|vidhidepro|vidhidevip|vidhidefast|odvidhide|streamhide/i, fn: extractVidhide },
  { name: "xtwap", display: "Xtwap", match: /play\.xtwap\.|xtwap\./i, fn: extractXtwap },
  { name: "gdplayer", display: "GDrive", match: /gdplayer\.|gdriveplayer\.|gdstream\.|gdrive-stream\./i, fn: extractGdplayer },
  { name: "pixeldrain", display: "Pixeldrain", match: /pixeldrain\./i, fn: extractPixeldrain },
  { name: "krakenfiles", display: "Krakenfiles", match: /krakenfiles\./i, fn: extractKrakenfiles },
  { name: "filedon", display: "Filedon", match: /filedon\.[a-z]+\/(?:embed|view)\//i, fn: extractFiledon },
  { name: "wibufile", display: "Wibufile", match: /wibufile\.com\/embed\//i, fn: extractWibufile },
  { name: "streampoi", display: "Streampoi", match: /streampoi\./i, fn: extractStreampoi },
  // Only the dood clones: the native extractor runs first and this is the
  // second attempt for the hosts that sometimes refuse the plain request.
  { name: "doodjs", display: "DoodStream", match: /playmogo\.|plamogo\./i, fn: extractDoodJs },
  { name: "wrapper", display: "Embed", match: /desudrive\.com\/stream\/|desudrive\.com\/iframe/i, fn: extractIframeWrapper },
  { name: "direct", display: "Direct", match: /\.(mp4|m3u8|webm)(\?|$)|r_file=chunklist\.m3u8/i, fn: extractDirect },
];

var ALL_EXTRACTORS = NATIVE_EXTRACTORS.concat(HOST_EXTRACTORS);

/**
 * Hosts whose embeds look resolvable but are not: the video URL only exists
 * inside a browser session (encrypted player config, referer-gated POST, or a
 * dead file). They are reported with an explicit "no stream" label so the user
 * is not left staring at an empty player.
 */
var UNSUPPORTED_HOSTS = [
  { match: /mega\.nz/i, label: "butuh aplikasi Mega" },
  { match: /dailymotion\./i, label: "video dihapus" },
  { match: /terabox\.|1fichier\.|gofile\./i, label: "unduhan, bukan stream" },
];

/** Human-readable reason this host cannot be played, or "" if unknown. */
function unsupportedReason(embedUrl) {
  for (var i = 0; i < UNSUPPORTED_HOSTS.length; i++) {
    if (UNSUPPORTED_HOSTS[i].match.test(embedUrl)) {
      return UNSUPPORTED_HOSTS[i].label;
    }
  }
  return "";
}

/**
 * Resolve an embed URL with the first extractor that recognises the host and
 * actually yields a playable URL.
 *
 * Native extractors are tried first: they do their own HTTP and JS unpacking.
 * A host may be claimed by more than one entry (vidhide vs streamwish); an
 * extractor that returns [] lets the next candidate try.
 *
 * @returns {{ videos: Array, host: string, tried: string[] }}
 */
async function extractByHost(provider, embedUrl, referer, siteQuality, note, depth) {
  var tried = [];
  var level = depth || 0;
  for (var i = 0; i < ALL_EXTRACTORS.length; i++) {
    var entry = ALL_EXTRACTORS[i];
    if (!entry.match.test(embedUrl)) continue;
    tried.push(entry.name);
    try {
      var videos = level < 2
        ? await entry.fn(provider, embedUrl, referer, siteQuality, level)
        : [];
      if (videos && videos.length) {
        return {
          videos: finishVideos(videos, provider, embedUrl, referer, siteQuality, note, entry.display),
          host: entry.name,
          tried: tried,
        };
      }
    } catch (e) {
      console.log("extractor " + entry.name + " failed for " + embedUrl + ": " + e);
    }
  }
  return { videos: [], host: hostOf(embedUrl), tried: tried };
}

/** Whether any registered extractor claims this URL. */
function isSupportedHost(embedUrl) {
  for (var i = 0; i < ALL_EXTRACTORS.length; i++) {
    if (ALL_EXTRACTORS[i].match.test(embedUrl)) return true;
  }
  return false;
}

/**
 * Normalise native extractor output (which carries its own labels and only
 * partial headers) into the shape this repo returns everywhere:
 *
 *   - `originalUrl` is the embed page, so de-duplication does not merge two
 *     hosts that happen to hand out the same CDN URL, and `preferred_server`
 *     can match on the host the user picked.
 *   - `headers` always carry our browser UA plus a Referer, merged under
 *     whatever headers the native extractor produced (those are kept because
 *     they are the ones the CDN actually validated).
 *   - `quality` follows "720p · Hardsub ID · Mp4Upload".
 */
function finishVideos(videos, provider, embedUrl, referer, siteQuality, note, serverName) {
  var out = [];
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i] || {};
    var url = safeString(v.url);
    if (!url || !/^https?:\/\//i.test(url)) continue;
    var resolution = resolutionOf(v.quality) || resolutionOf(siteQuality);
    var server = serverName || hostOf(embedUrl);
    out.push({
      url: url,
      originalUrl: embedUrl,
      quality: qualityLabel(resolution, server, note),
      server: server,
      headers: mergeHeaders(provider.headersFor(referer || embedUrl), v.headers),
      subtitles: v.subtitles || [],
      audios: v.audios || [],
    });
  }
  return out;
}

/** "Mp4Upload - 360p " -> "360p"; "" when the label carries no resolution. */
function resolutionOf(label) {
  var m = /(\d{3,4})\s*p\b/i.exec(safeString(label));
  return m ? m[1] + "p" : "";
}

/** base first, then overrides that are actually set. */
function mergeHeaders(base, extra) {
  var headers = {};
  var key;
  for (key in base) {
    if (Object.prototype.hasOwnProperty.call(base, key)) headers[key] = base[key];
  }
  if (extra && typeof extra === "object") {
    for (key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key) && extra[key]) {
        headers[key] = extra[key];
      }
    }
  }
  return headers;
}

// -------------------------------------------------------------- pahe-like

/** Everything that already is a media file URL. */
async function extractDirect(provider, url, referer, siteQuality) {
  if (!/\.(mp4|webm|m3u8)(\?|$)/i.test(url) && !/r_file=chunklist\.m3u8/i.test(url)) {
    return [];
  }
  return [
    {
      url: url,
      originalUrl: url,
      quality: resolutionOf(siteQuality) || "Direct",
      headers: provider.headersFor(referer),
    },
  ];
}

// ---------------------------------------------------------------- blogger
//
// `www.blogger.com/video.g?token=...` serves an HTML shell; the actual media is
// an `itag=18` MP4 on googlevideo.com (a 360p muxed stream, IP- and
// expiry-bound). Where the shell embeds `streamingData` JSON we prefer the
// format whose `qualityLabel` is present; otherwise we take the first
// videoplayback URL.

async function extractBlogger(provider, url, referer, siteQuality) {
  var html = await provider.fetch(url, provider.headersFor(referer));
  var sources = bloggerSources(html);
  if (!sources.length) return [];
  return sources.map(function (source) {
    return {
      url: source.url,
      originalUrl: url,
      quality: source.quality || resolutionOf(siteQuality) || "360p",
      headers: provider.headersFor("https://www.blogger.com/"),
    };
  });
}

/** Every googlevideo URL in a Blogger shell, de-duplicated, best first. */
function bloggerSources(html) {
  var text = String(html || "");
  // Blogger embeds the player data as JSON inside an attribute, so `=`, `&`
  // and `"` arrive escaped (\u003d, \u0026, &quot;) and slashes doubled.
  var decoded = text
    .replace(/\\u([0-9a-f]{4})/gi, function (_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/\\\//g, "/")
    .replace(/&quot;/g, '"');
  var urls = allMatches(
    decoded,
    /"(https:\/\/[A-Za-z0-9.-]*googlevideo\.com\/videoplayback\?[^"\\]+)"/g,
  );
  var seen = {};
  var out = [];
  for (var i = 0; i < urls.length; i++) {
    var clean = urls[i].replace(/\\+$/, "");
    if (!clean || seen[clean]) continue;
    seen[clean] = true;
    var quality = "";
    var qm = /"qualityLabel":"(\d{3,4}p)"/.exec(decoded);
    if (qm) quality = qm[1];
    else if (/[?&]itag=18(&|$)/.test(clean)) quality = "360p";
    out.push({ url: clean, quality: quality });
  }
  return out;
}

// ----------------------------------------------------------- desustream
//
// Otakudesu-style mirror. The embed page declares the file in a player setup
// object (`const videoURL = "..."` / `videoURL:` / `file:`). Some mirrors wrap a
// third-party player instead and only leave a plain `<source src>` pointing at
// it (e.g. otakuwatch7 -> Blogger googlevideo MP4), so that is the last resort.

async function extractDesustream(provider, url, referer, siteQuality, depth) {
  var html = await provider.fetch(url, provider.headersFor(referer));
  var file =
    firstMatch(html, /(?:const|var|let)\s+videoURL\s*=\s*["']([^"']+)["']/i) ||
    firstMatch(html, /videoURL\s*:\s*["']([^"']+)["']/i) ||
    // `otakudesu('{"file":"..."}')` — the desudrive player passes its config as
    // a JSON string, so the key arrives quoted.
    firstMatch(html, /["']file["']\s*:\s*["']([^"']+)["']/i) ||
    firstMatch(html, /file\s*:\s*["']([^"']+)["']/i) ||
    firstMatch(html, /file\s*:\s*'([^']+)'/i) ||
    firstMatch(html, /<source[^>]+src=["']([^"']+)["']/i);
  if (!file) {
    // `dstream/updesu/v5/index.php` carries no file at all: it is a shell whose
    // iframe points at a Blogger player. Hand the inner URL to the extractor
    // that owns it instead of reporting the mirror as dead.
    return followIframe(provider, url, html, siteQuality, depth);
  }
  // The desudrive player sometimes ships a Google Drive API URL with no file
  // id (`/drive/v3/files/?alt=media&key=...`); it answers 403, so it is dead.
  if (/googleapis\.com\/drive\/v3\/files\/?\?/i.test(file)) return [];
  if (file.indexOf("//") === 0) file = "https:" + file;
  return [
    {
      url: file,
      originalUrl: url,
      quality: resolutionOf(siteQuality) || "Desustream",
      headers: provider.headersFor("https://" + hostOf(url) + "/"),
    },
  ];
}

// --------------------------------------------------------- iframe wrapper
//
// Some mirrors (desudrive.com/stream/yuplod.php, desustream updesu) are a bare
// page whose only content is an iframe pointing at the real player. Follow one
// level so the extractor for the inner host can run.

async function extractIframeWrapper(provider, url, referer, siteQuality, depth) {
  var html = await provider.fetch(url, provider.headersFor(referer));
  return followIframe(provider, url, html, siteQuality, depth);
}

/** Shared by the wrapper and by desustream shells that carry no file. */
async function followIframe(provider, url, html, siteQuality, depth) {
  var src = iframeSrc(html);
  if (!src) return [];
  if (src.indexOf("//") === 0) src = "https:" + src;
  if (src.charAt(0) === "/") src = "https://" + hostOf(url) + src;
  if (!/^https?:\/\//i.test(src)) return [];
  if (hostOf(src) === hostOf(url)) return [];
  var inner = await extractByHost(provider, src, url, siteQuality, "", (depth || 0) + 1);
  return inner.videos;
}

// --------------------------------------------------------------- vidhide
//
// Vidhide family (vidhide, odvidhide, vidhidepro/vip/fast, streamhide): the
// player script is packed with the Dean Edwards p,a,c,k,e,d packer. The app
// exposes the same unpacker it uses for its native extractors as `unpackJs`,
// so we unpack with Dart instead of carrying a second JS implementation.

async function extractVidhide(provider, url, referer, siteQuality) {
  var html = await provider.fetch(url, provider.headersFor(referer));
  var script = unpackScripts(html);
  var file =
    firstMatch(script, /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/i) ||
    firstMatch(script, /["']?(?:hls2|hls|file)["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i) ||
    firstMatch(script, /(https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i);
  if (!file) return [];
  if (file.indexOf("//") === 0) file = "https:" + file;
  if (file.charAt(0) === "/") file = "https://" + hostOf(url) + file;
  return [
    {
      url: file,
      originalUrl: url,
      quality: resolutionOf(siteQuality) || "Vidhide",
      headers: provider.headersFor("https://" + hostOf(url) + "/"),
    },
  ];
}

/**
 * Return `html` plus the unpacked form of every packed script it contains.
 * Broken packers are ignored: the original HTML is always kept.
 */
function unpackScripts(html) {
  var text = String(html || "");
  var packed = /eval\(function\(p,a,c,k,e,[a-z]\)[\s\S]*?\.split\(['"]\|['"]\)\)\)/gi;
  var combined = text;
  var match;
  while ((match = packed.exec(text)) !== null) {
    try {
      var unpacked = unpackJs(match[0]);
      if (unpacked) combined += "\n" + unpacked;
    } catch (e) {
      console.log("unpackJs failed: " + e);
    }
  }
  return combined;
}

// ---------------------------------------------------------------- xtwap
//
// AnimeIndo's player: a JW Player page holding `"file":"https://hls.xtwap.top
// /.../index.m3u8"`. The HLS CDN only answers when the Referer is
// https://play.xtwap.top/, so that header travels with the video.

async function extractXtwap(provider, url, referer, siteQuality) {
  var html = await provider.fetch(url, provider.headersFor(referer));
  var file =
    firstMatch(html, /["']file["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i) ||
    firstMatch(html, /(https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*)/i);
  var headers = provider.headersFor("https://play.xtwap.top/");
  if (!file) {
    // The B-TUBE player has a plain <source>, a Blogger MP4 tied to this device's IP.
    var source = firstMatch(html, /<source[^>]+src=["']([^"']+)["']/i);
    if (!source) return [];
    return [{
      url: source,
      originalUrl: url,
      quality: /[?&]itag=18(&|$)/.test(source) ? "360p" : resolutionOf(siteQuality) || "360p",
      headers: headers,
    }];
  }

  var variants = [];
  try {
    variants = hlsVariants(file, await provider.fetch(file, headers));
  } catch (e) {
    console.log("xtwap: master playlist gagal: " + e);
  }
  if (variants.length) {
    return variants.map(function (variant) {
      return { url: variant.url, originalUrl: url, quality: variant.quality, headers: headers };
    });
  }

  var quality =
    resolutionOf(file) || resolutionOf(siteQuality) || resolutionOf(firstMatch(html, /(\d{3,4}p)/i));
  return [{ url: file, originalUrl: url, quality: quality || "HLS", headers: headers }];
}

/** [{url, quality}] from a master playlist, highest first; [] for a media one. */
function hlsVariants(masterUrl, text) {
  var lines = String(text || "").split(/\r?\n/);
  var base = masterUrl.split("?")[0];
  var folder = base.substring(0, base.lastIndexOf("/") + 1);
  var out = [];
  for (var i = 0; i < lines.length - 1; i++) {
    var size = /^#EXT-X-STREAM-INF:.*RESOLUTION=\d+x(\d+)/.exec(lines[i]);
    var target = safeString(lines[i + 1]);
    if (!size || !target || target.charAt(0) === "#") continue;
    var absolute = /^https?:\/\//i.test(target)
      ? target
      : target.charAt(0) === "/"
        ? "https://" + hostOf(masterUrl) + target
        : folder + target;
    out.push({ url: absolute, quality: size[1] + "p", height: parseInt(size[1], 10) });
  }
  return out.sort(function (a, b) { return b.height - a.height; });
}

// -------------------------------------------------------------- filedon
//
// Both `/view/<slug>` and `/embed/<slug>` are Inertia pages: the `data-page`
// attribute carries the props the player starts from, including a signed R2 URL
// for the file itself. That URL is what any visitor's player receives — it
// answers `206` with a byte range and plays as-is — and the only field this
// reads besides the file name and the host's own HLS rendition.
//
// `/view/` only lists the file; the URL lives on `/embed/`, so the path is
// rewritten first. The attribute is HTML-escaped, so it is unescaped before
// JSON.parse or it throws.

/** Any filedon file page -> its `/embed/<slug>` form. */
function filedonEmbedUrl(url) {
  var match = /^(https?:\/\/filedon\.[a-z]+)\/(?:view|download|embed)\/([^/?#]+)/i.exec(
    safeString(url),
  );
  if (!match) return safeString(url);
  return match[1] + "/embed/" + match[2];
}

async function extractFiledon(provider, url, referer, siteQuality) {
  var html = await provider.fetch(filedonEmbedUrl(url), provider.headersFor(referer));
  var raw = firstMatch(html, /data-page="([^"]*)"/);
  if (!raw) return [];
  var props;
  try {
    props = (JSON.parse(decodeEntities(raw)) || {}).props || {};
  } catch (e) {
    return [];
  }
  var media = props.media || {};
  var stream = safeString(media.hls_url) || safeString(props.url);
  if (!stream) return [];
  var file = props.files || {};
  return [{
    url: stream,
    originalUrl: url,
    quality: resolutionOf(file.name) || resolutionOf(siteQuality) || "1080p",
    headers: provider.headersFor("https://filedon.co/"),
  }];
}

// ------------------------------------------------------------- wibufile
//
// `api.wibufile.com/embed/<uuid>` is a JW Player page whose setup object names
// the file. Other Wibufile mirrors link the .mp4 directly (see extractDirect).

async function extractWibufile(provider, url, referer, siteQuality) {
  var html = await provider.fetch(url, provider.headersFor(referer));
  var file = firstMatch(html, /sources\s*:\s*\[\s*\{\s*"file"\s*:\s*"([^"]+)"/i);
  if (!file) return [];
  return [{
    url: file.replace(/\\\//g, "/"),
    originalUrl: url,
    quality: resolutionOf(siteQuality) || resolutionOf(file) || "480p",
    headers: provider.headersFor("https://api.wibufile.com/"),
  }];
}

// ------------------------------------------------------------ streampoi
//
// `streampoi.com/embed-<id>.html` is a plain JW8 page: the setup object names a
// single HLS master on the streamruby CDN, and a `qualityLabels` map spells out
// the renditions inside that master ("1699":"1080p (1700 kbps)", ...). The CDN
// is happy with the embed page as Referer, so the master is expanded into one
// entry per rendition when it can be read; otherwise the master itself is
// returned labelled with the best rendition, since it adapts anyway.

async function extractStreampoi(provider, url, referer, siteQuality) {
  var html = await provider.fetch(url, provider.headersFor(referer));
  var file = firstMatch(html, /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/i) ||
    firstMatch(html, /["']file["']\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
  if (!file) return [];
  file = file.replace(/\\\//g, "/");
  var headers = provider.headersFor(url);

  var variants = [];
  try {
    variants = hlsVariants(file, await provider.fetch(file, headers));
  } catch (e) {
    console.log("streampoi: master playlist gagal: " + e);
  }
  if (variants.length) {
    return variants.map(function (variant) {
      return { url: variant.url, originalUrl: url, quality: variant.quality, headers: headers };
    });
  }

  var quality = streampoiQuality(html) || resolutionOf(siteQuality) || "HLS";
  return [{ url: file, originalUrl: url, quality: quality, headers: headers }];
}

/** Best rendition named by the page's `qualityLabels` map: "1080p" or "". */
function streampoiQuality(html) {
  var text = String(html || "");
  var block = /qualityLabels['"]?\s*:\s*\{([^}]*)\}/i.exec(text);
  if (!block) return "";
  var labels = allMatches(block[1], /["']\d+["']\s*:\s*["']([^"']+)["']/i);
  var best = "";
  var bestHeight = 0;
  for (var i = 0; i < labels.length; i++) {
    var height = qualityHeight(labels[i]);
    if (height > bestHeight) {
      bestHeight = height;
      best = height + "p";
    }
  }
  return best;
}

// ------------------------------------------------------------- dood (JS)
//
// The same DoodStream handshake as the native extractor, in JS: the embed names
// a `/pass_md5/<id>/<token>` path and `token=`, the pass_md5 URL answers with
// the CDN prefix, and the file name is random chars with the token appended.
// Kept as a fallback because the native bridge returns [] when the host's page
// shape surprises it.

async function extractDoodJs(provider, url, referer, siteQuality) {
  var origin = /^(https?:\/\/[^/]+)/i.exec(url);
  if (!origin) return [];
  var html = await provider.fetch(url, provider.headersFor(referer));
  var pass = firstMatch(html, /(\/pass_md5\/[^'"\s]+)/i);
  var token = firstMatch(html, /[?&]token=([A-Za-z0-9]+)/i) ||
    firstMatch(html, /token=([A-Za-z0-9]+)/i);
  if (!pass || !token) return [];
  var base = (await provider.fetch(origin[1] + pass, provider.headersFor(url))).trim();
  if (base.indexOf("http") !== 0) return [];
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var suffix = "";
  for (var i = 0; i < 10; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  // The extension is what makes the player pick its downloader.
  return [{
    url: base + suffix + ".mp4?token=" + token + "&expiry=" + Date.now(),
    originalUrl: url,
    quality: resolutionOf(siteQuality) || "Dood",
    headers: { "User-Agent": provider.userAgent(), Referer: origin[1] + "/" },
  }];
}

// ----------------------------------------------------------- krakenfiles
//
// Krakenfiles needs a POST to /download/<id>/<hash> carrying the CSRF token
// found in a `<script>` block. It then answers with JSON { url }.

async function extractKrakenfiles(provider, url, referer, siteQuality) {
  var html = await provider.fetch(url, provider.headersFor(referer));
  var token = firstMatch(html, /name="csrf-token"[^>]*content="([^"]+)"/i);
  var action = firstMatch(html, /id="dl-form"[^>]*action="([^"]+)"/i);
  if (!token || !action) {
    var direct = firstMatch(html, /<source[^>]*src="([^"]+)"/i);
    if (!direct) return [];
    return [video(provider, direct, url, resolutionOf(siteQuality) || "Krakenfiles", referer)];
  }
  var body = queryString({ _token: token });
  var res = await provider.post(
    action.indexOf("http") === 0 ? action : resolveUrl(url, action),
    body,
    provider.headersFor(url),
  );
  var data = null;
  try {
    data = JSON.parse(res.body);
  } catch (e) {
    return [];
  }
  if (!data || !data.url) return [];
  return [video(provider, data.url, url, resolutionOf(siteQuality) || "Krakenfiles", referer)];
}

// ------------------------------------------------------------ pixeldrain

async function extractPixeldrain(provider, url, referer, siteQuality) {
  var match = /pixeldrain\.com\/u\/([A-Za-z0-9]+)/i.exec(url);
  if (!match) return [];
  var direct = "https://pixeldrain.com/api/file/" + match[1];
  return [video(provider, direct, url, resolutionOf(siteQuality) || "Pixeldrain", referer)];
}

// ------------------------------------------------------------- wrappers

/**
 * Blogger/Google links that are really a wrapper around the embed:
 * `*.blogspot.com/?combinedurl=<url>|sub...` only needs its query parameter.
 * The pipe is percent-encoded in the query string, so decode before splitting.
 */
function unwrapBloggerWrapper(url) {
  var m = /[?&]combinedurl=([^&]+)/i.exec(String(url || ""));
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]).split("|")[0];
  } catch (e) {
    return "";
  }
}

/** `yt:ID`, watch/shorts/youtu.be URLs -> privacy-friendly embed URL. */
function youtubeEmbed(value) {
  var s = safeString(value);
  if (!s) return "";
  var id = "";
  var m = /^yt:([A-Za-z0-9_-]{6,})$/i.exec(s);
  if (m) id = m[1];
  if (!id) {
    m = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i.exec(s);
    if (m) id = m[1];
  }
  return id ? "https://www.youtube-nocookie.com/embed/" + id : "";
}

/** Uniform MVideo factory used by the extractors above. */
function video(provider, url, originalUrl, quality, referer) {
  return {
    url: url,
    originalUrl: originalUrl || url,
    quality: quality,
    headers: provider.headersFor(referer || originalUrl),
  };
}

/** First capture group of the first match, or "". */
function firstMatch(text, regex) {
  var m = regex.exec(String(text || ""));
  return m && m[1] ? decodeEntities(m[1]) : "";
}

/** Collect every match of the first capture group. */
function allMatches(text, regex) {
  var out = [];
  var re = new RegExp(regex.source, regex.flags.indexOf("g") === -1 ? regex.flags + "g" : regex.flags);
  var m;
  while ((m = re.exec(String(text || ""))) !== null) {
    out.push(decodeEntities(m[1] || ""));
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}

// ---- inlined from src-shared/25-crypto.js ----
// ---------------------------------------------------------------------------
// Plain-JS crypto primitives for the encrypted player family.
//
// QuickJS in Mangayomi has no WebCrypto, no atob, no TextDecoder, and no
// crypto-js. Several hosts (gdplayer.to / gdriveplayer.*) hand out their source
// list as a base64 blob that is PBKDF2-SHA256 derived and AES-CBC encrypted, so
// the primitives have to be written out here.
//
// Shapes follow CryptoJS, because that is what the players call:
//   Base64.parse(payload)            -> WordArray, big-endian 32-bit words
//   salt  = words.slice(0, 4)        -> first 16 bytes of the payload
//   ct    = words.slice(4)           -> everything after them
//   PBKDF2(seed + ts, salt, { keySize: 12, iterations: 10000, hasher: SHA256 })
//   AES.decrypt({ciphertext: ct}, key, { iv, mode: CBC, padding: Pkcs7 })
//
// Everything below works on byte strings (chars 0-255), matching the helpers in
// 00-util.js, so results feed straight into utf8Decode / b64Decode.
// ---------------------------------------------------------------------------

// ------------------------------------------------------------- SHA-256

var CRYPT_SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** Rotate a 32-bit word right; JS `>>>` already coerces to unsigned. */
function cryptRotr(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** SHA-256 over a byte string. Returns a 32-byte binary string. */
function cryptSha256(bin) {
  var bytes = [];
  var i;
  for (i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i) & 0xff);
  var bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // Message length is 64-bit big-endian. These payloads are tiny, so the high
  // word is written from the float split rather than a BigInt (QuickJS has one
  // but the app's polyfill is not guaranteed to).
  var hi = Math.floor(bitLen / 4294967296);
  var lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

  var h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  var w = new Array(64);

  for (var off = 0; off < bytes.length; off += 64) {
    for (i = 0; i < 16; i++) {
      w[i] = ((bytes[off + 4 * i] << 24) |
        (bytes[off + 4 * i + 1] << 16) |
        (bytes[off + 4 * i + 2] << 8) |
        bytes[off + 4 * i + 3]) >>> 0;
    }
    for (i = 16; i < 64; i++) {
      var s0 = (cryptRotr(w[i - 15], 7) ^ cryptRotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      var s1 = (cryptRotr(w[i - 2], 17) ^ cryptRotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3];
    var e = h[4], f = h[5], g = h[6], hh = h[7];
    for (i = 0; i < 64; i++) {
      var S1 = (cryptRotr(e, 6) ^ cryptRotr(e, 11) ^ cryptRotr(e, 25)) >>> 0;
      var ch = ((e & f) ^ (~e & g)) >>> 0;
      var t1 = (hh + S1 + ch + CRYPT_SHA256_K[i] + w[i]) >>> 0;
      var S0 = (cryptRotr(a, 2) ^ cryptRotr(a, 13) ^ cryptRotr(a, 22)) >>> 0;
      var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      var t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  var out = "";
  for (i = 0; i < 8; i++) {
    out += String.fromCharCode((h[i] >>> 24) & 0xff);
    out += String.fromCharCode((h[i] >>> 16) & 0xff);
    out += String.fromCharCode((h[i] >>> 8) & 0xff);
    out += String.fromCharCode(h[i] & 0xff);
  }
  return out;
}

/** First half of HMAC's inner hash: SHA-256(ipad + message). Kept separate so
 *  PBKDF2 can precompute it once instead of once per iteration block. */
function cryptSha256WithIpads(ipadBin, msgBin) {
  return cryptSha256(ipadBin + msgBin);
}

function cryptBytesOf(bin) {
  var o = [];
  for (var i = 0; i < bin.length; i++) o.push(bin.charCodeAt(i) & 0xff);
  return o;
}

function cryptStrOf(bytes) {
  var o = "";
  for (var i = 0; i < bytes.length; i++) o += String.fromCharCode(bytes[i] & 0xff);
  return o;
}

/** HMAC-SHA256. keyBin/msgBin are byte strings; returns 32 bytes. */
function cryptHmacSha256(keyBin, msgBin) {
  var key = cryptBytesOf(keyBin);
  if (key.length > 64) key = cryptBytesOf(cryptSha256(keyBin));
  while (key.length < 64) key.push(0);
  var ipad = [], opad = [];
  for (var i = 0; i < 64; i++) {
    ipad.push(key[i] ^ 0x36);
    opad.push(key[i] ^ 0x5c);
  }
  var inner = cryptSha256(cryptStrOf(ipad) + msgBin);
  return cryptSha256(cryptStrOf(opad) + inner);
}

/**
 * PBKDF2-HMAC-SHA256. passwordBin/saltBin are byte strings; returns dkLen
 * bytes. Iteration counts here are 10000, which QuickJS handles in a few
 * hundred ms — the cost the player itself pays.
 */
function cryptPbkdf2Sha256(passwordBin, saltBin, iterations, dkLen) {
  var blocks = Math.ceil(dkLen / 32);
  var out = "";
  for (var block = 1; block <= blocks; block++) {
    var counter = String.fromCharCode(
      (block >>> 24) & 0xff, (block >>> 16) & 0xff, (block >>> 8) & 0xff, block & 0xff,
    );
    var u = cryptHmacSha256(passwordBin, saltBin + counter);
    var acc = cryptBytesOf(u);
    for (var i = 1; i < iterations; i++) {
      u = cryptHmacSha256(passwordBin, u);
      var uu = cryptBytesOf(u);
      for (var j = 0; j < 32; j++) acc[j] ^= uu[j];
    }
    out += cryptStrOf(acc);
  }
  return out.slice(0, dkLen);
}

// ----------------------------------------------------------- AES-CBC decrypt

var CRYPT_ISBOX = null;

/** Inverse S-box, derived from the forward one so only one table is stored. */
function cryptInvSbox() {
  if (CRYPT_ISBOX) return CRYPT_ISBOX;
  var sbox = abyssSbox();
  var inv = new Array(256);
  for (var i = 0; i < 256; i++) inv[sbox[i]] = i;
  CRYPT_ISBOX = inv;
  return inv;
}

function cryptGmul(a, b) {
  var p = 0;
  for (var i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    var hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p & 0xff;
}

/** One inverse round: InvShiftRows, InvSubBytes, AddRoundKey, InvMixColumns. */
function cryptDecryptBlock(block16, w, Nr) {
  var s = block16.slice();
  var inv = cryptInvSbox();
  function addRoundKey(round) {
    for (var c = 0; c < 4; c++) {
      var wk = w[4 * round + c];
      s[4 * c] ^= wk[0]; s[4 * c + 1] ^= wk[1];
      s[4 * c + 2] ^= wk[2]; s[4 * c + 3] ^= wk[3];
    }
  }
  function invShiftRows() {
    var t = s.slice();
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) s[r + 4 * c] = t[r + 4 * ((c - r + 4) % 4)];
    }
  }
  function invSubBytes() {
    for (var i = 0; i < 16; i++) s[i] = inv[s[i]];
  }
  function invMixColumns() {
    for (var c = 0; c < 4; c++) {
      var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
      s[4 * c] = cryptGmul(a0, 14) ^ cryptGmul(a1, 11) ^ cryptGmul(a2, 13) ^ cryptGmul(a3, 9);
      s[4 * c + 1] = cryptGmul(a0, 9) ^ cryptGmul(a1, 14) ^ cryptGmul(a2, 11) ^ cryptGmul(a3, 13);
      s[4 * c + 2] = cryptGmul(a0, 13) ^ cryptGmul(a1, 9) ^ cryptGmul(a2, 14) ^ cryptGmul(a3, 11);
      s[4 * c + 3] = cryptGmul(a0, 11) ^ cryptGmul(a1, 13) ^ cryptGmul(a2, 9) ^ cryptGmul(a3, 14);
    }
  }
  addRoundKey(Nr);
  for (var round = Nr - 1; round > 0; round--) {
    invShiftRows(); invSubBytes(); addRoundKey(round); invMixColumns();
  }
  invShiftRows(); invSubBytes(); addRoundKey(0);
  return s;
}

/**
 * AES-CBC decrypt with PKCS#7 unpadding. keyBin/ivBin/ctBin are byte strings.
 * Throws on a bad pad so the caller can fall through to another candidate
 * rather than silently returning half-decrypted JSON.
 */
function cryptAesCbcDecrypt(keyBin, ivBin, ctBin) {
  var key = cryptBytesOf(keyBin);
  var iv = cryptBytesOf(ivBin);
  var ct = cryptBytesOf(ctBin);
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new Error("AES key must be 16, 24 or 32 bytes (got " + key.length + ")");
  }
  if (iv.length !== 16) throw new Error("AES-CBC iv must be 16 bytes");
  if (!ct.length || ct.length % 16 !== 0) {
    throw new Error("AES-CBC ciphertext must be a positive multiple of 16");
  }
  var sched = abyssAesExpandKey(key);
  var w = sched.w, Nr = sched.Nr;
  var prev = iv;
  var out = [];
  for (var off = 0; off < ct.length; off += 16) {
    var block = ct.slice(off, off + 16);
    var plain = cryptDecryptBlock(block, w, Nr);
    for (var i = 0; i < 16; i++) out.push(plain[i] ^ prev[i]);
    prev = block;
  }
  var pad = out[out.length - 1];
  if (pad < 1 || pad > 16) throw new Error("bad PKCS#7 padding");
  for (var p = out.length - pad; p < out.length; p++) {
    if (out[p] !== pad) throw new Error("bad PKCS#7 padding");
  }
  return cryptStrOf(out.slice(0, out.length - pad));
}

/** Hex dump of a byte string; used by the tests and the extractor logs. */
function cryptHex(bin) {
  var out = "";
  for (var i = 0; i < bin.length; i++) {
    var b = bin.charCodeAt(i) & 0xff;
    out += "0123456789abcdef".charAt(b >> 4) + "0123456789abcdef".charAt(b & 15);
  }
  return out;
}

/** Hex digest helper for tests and logs (SHA-256). */
function cryptSha256Hex(bin) {
  return cryptHex(cryptSha256(bin));
}

// ---- inlined from src-shared/30-abyss.js ----
// ---------------------------------------------------------------------------
// Abyssplayer (player.abyssplayer.com) extractor.
//
// The player page embeds a base64 `datas` payload (`window.SoTrym(JSON.parse
// (atob(datas)))`). `datas` is a JSON object:
//
//   { slug, md5_id, user_id, media }
//
// where `media` is AES-256-CTR ciphertext. The player decrypts it to get the
// per-quality source list, then builds a signed CDN URL for each:
//
//   domain  = domains.find(d => d.includes(source.sub))
//   req     = "/mp4/" + md5_id + "/" + res_id + "/" + size + "?v=" + slug
//   token   = btoa(btoa(AES256-CTR(req)).replace(/=/g,"")).replace(/=/g,"")
//   url     = "https://" + domain + "/sora/" + size + "/" + token
//
// Key derivation (shared by the media decrypt and the token):
//   the player passes a value to its embedded md5 and feeds the 32-hex result
//   to AES as an ASCII key. Two quirks make the key different from a plain
//   md5(string):
//     * the md5 input for the media pass is the string `user_id:slug:md5_id`,
//       but the input for the token is the number `size`; the embedded md5
//       coerces a non-string argument with toString() and then treats each
//       decimal digit as a single byte 0-9 (so md5(123196367) hashes the nine
//       bytes [1,2,3,1,9,6,3,6,7], not the ASCII "123196367").
//     * the AES key is the full 32-hex string as ASCII (32 bytes) with the
//       first 16 hex chars (as ASCII) as the CTR counter, i.e. AES-256.
//
// The /sora/ CDN only answers when the request carries a Referer of the player
// page (a bare UA gives HTTP 403), so each video carries that header.
//
// QuickJS has no WebCrypto/atob/TextDecoder, so the crypto below is plain JS
// (validated in research/tools/abyss_crypto_proto.js against Node crypto +
// WebCrypto and against the live CDN).
// ---------------------------------------------------------------------------

// --------------------------------------------------------------- MD5
// RFC 1321 over a byte string (chars 0-255); returns 32 lowercase hex chars.

var ABYSS_MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
var ABYSS_MD5_K = (function () {
  var k = [];
  for (var i = 0; i < 64; i++) k.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
  return k;
})();

function abyssMd5(bin) {
  var bytes = [];
  for (var i = 0; i < bin.length; i++) bytes.push(bin.charCodeAt(i) & 0xff);
  var len = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  var bitLen = len * 8;
  for (var b = 0; b < 8; b++) bytes.push((bitLen / Math.pow(256, b)) & 0xff);
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (var off = 0; off < bytes.length; off += 64) {
    var M = [];
    for (var t = 0; t < 16; t++)
      M[t] = bytes[off + 4 * t] | (bytes[off + 4 * t + 1] << 8) | (bytes[off + 4 * t + 2] << 16) | (bytes[off + 4 * t + 3] << 24);
    var A = a0, B = b0, C = c0, D = d0;
    for (var j = 0; j < 64; j++) {
      var F, g;
      if (j < 16) { F = (B & C) | (~B & D); g = j; }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
      else if (j < 48) { F = B ^ C ^ D; g = (3 * j + 5) % 16; }
      else { F = C ^ (B | (~D)); g = (7 * j) % 16; }
      F = (F + A + ABYSS_MD5_K[j] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + (((F << ABYSS_MD5_S[j]) | (F >>> (32 - ABYSS_MD5_S[j]))))) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  function h(w) {
    var s = "";
    for (var k = 0; k < 4; k++) { var bb = (w >>> (8 * k)) & 0xff; s += (bb < 16 ? "0" : "") + bb.toString(16); }
    return s;
  }
  return h(a0) + h(b0) + h(c0) + h(d0);
}

// MD5 of a number the way the embedded md5 does: each decimal digit becomes one
// byte 0-9 (NOT the ASCII digits). Used for the per-source token key.
function abyssMd5Number(n) {
  var s = String(n);
  var bin = "";
  for (var i = 0; i < s.length; i++) bin += String.fromCharCode(s.charCodeAt(i) - 48);
  return abyssMd5(bin);
}

// --------------------------------------------------------- AES (256-bit CTR)

var ABYSS_SBOX = null;
function abyssSbox() {
  if (ABYSS_SBOX) return ABYSS_SBOX;
  function rotr8(x, c) { return ((x >>> c) | (x << (8 - c))) & 0xff; }
  function gmul(a, b) {
    var p = 0;
    for (var i = 0; i < 8; i++) { if (b & 1) p ^= a; var hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b; b >>= 1; }
    return p;
  }
  var sb = new Array(256);
  sb[0] = 0x63;
  for (var a = 1; a < 256; a++) {
    var inv = 1;
    for (var e = 0; e < 254; e++) inv = gmul(inv, a);
    sb[a] = (inv ^ rotr8(inv, 4) ^ rotr8(inv, 5) ^ rotr8(inv, 6) ^ rotr8(inv, 7) ^ 0x63) & 0xff;
  }
  ABYSS_SBOX = sb;
  return sb;
}
var ABYSS_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
function abyssXtime(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; }

// Key schedule for AES-128 (16-byte key) or AES-256 (32-byte key).
function abyssAesExpandKey(key) {
  var Nk = key.length / 4, Nr = Nk + 6;
  var w = new Array(4 * Nr + 4);
  for (var i = 0; i < Nk; i++) w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
  for (var n = Nk; n < 4 * Nr + 4; n++) {
    var tmp = w[n - 1].slice();
    if (n % Nk === 0) {
      tmp = [tmp[1], tmp[2], tmp[3], tmp[0]];
      for (var j = 0; j < 4; j++) tmp[j] = abyssSbox()[tmp[j]];
      tmp[0] ^= ABYSS_RCON[n / Nk - 1];
    } else if (Nk > 6 && n % Nk === 4) {
      for (var j2 = 0; j2 < 4; j2++) tmp[j2] = abyssSbox()[tmp[j2]];
    }
    var m = n - Nk;
    w[n] = [w[m][0] ^ tmp[0], w[m][1] ^ tmp[1], w[m][2] ^ tmp[2], w[m][3] ^ tmp[3]];
  }
  return { w: w, Nr: Nr };
}

function abyssAesEncryptBlock(block16, w, Nr) {
  var s = block16.slice();
  function addRoundKey(round) {
    for (var c = 0; c < 4; c++) {
      var wk = w[4 * round + c];
      s[4 * c] ^= wk[0]; s[4 * c + 1] ^= wk[1]; s[4 * c + 2] ^= wk[2]; s[4 * c + 3] ^= wk[3];
    }
  }
  function subBytes() { for (var i = 0; i < 16; i++) s[i] = abyssSbox()[s[i]]; }
  function shiftRows() {
    var t = s.slice();
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) s[r + 4 * c] = t[r + 4 * ((c + r) % 4)];
  }
  function mixColumns() {
    for (var c = 0; c < 4; c++) {
      var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
      var x0 = abyssXtime(a0), x1 = abyssXtime(a1), x2 = abyssXtime(a2), x3 = abyssXtime(a3);
      s[4 * c] = x0 ^ (x1 ^ a1) ^ a2 ^ a3;
      s[4 * c + 1] = a0 ^ x1 ^ (x2 ^ a2) ^ a3;
      s[4 * c + 2] = a0 ^ a1 ^ x2 ^ (x3 ^ a3);
      s[4 * c + 3] = (x0 ^ a0) ^ a1 ^ a2 ^ x3;
    }
  }
  addRoundKey(0);
  for (var round = 1; round < Nr; round++) { subBytes(); shiftRows(); mixColumns(); addRoundKey(round); }
  subBytes(); shiftRows(); addRoundKey(Nr);
  return s;
}

function abyssBytesOf(bin) {
  var o = [];
  for (var i = 0; i < bin.length; i++) o.push(bin.charCodeAt(i) & 0xff);
  return o;
}
function abyssIncCounter(c) {
  var i = 15;
  while (i >= 0) { if (c[i] === 0xff) { c[i] = 0; i--; } else { c[i]++; break; } }
}

/**
 * AES-CTR (128- or 256-bit, chosen by key length) over byte strings. Symmetric:
 * the same call encrypts and decrypts. keyBin/counterBin are byte strings whose
 * char codes are the key/counter bytes.
 */
function abyssAesCtr(keyBin, counterBin, dataBin) {
  var sched = abyssAesExpandKey(abyssBytesOf(keyBin));
  var w = sched.w, Nr = sched.Nr;
  var counter = abyssBytesOf(counterBin).slice(0, 16);
  var out = "";
  var i = 0;
  while (i < dataBin.length) {
    var ks = abyssAesEncryptBlock(counter.slice(), w, Nr);
    var n = Math.min(16, dataBin.length - i);
    for (var j = 0; j < n; j++) out += String.fromCharCode((dataBin.charCodeAt(i + j) & 0xff) ^ ks[j]);
    i += 16;
    abyssIncCounter(counter);
  }
  return out;
}

// --------------------------------------------------------------- extractor

/**
 * Resolve a player.abyssplayer.com page into its /sora/ mp4 stream URLs.
 * Returns [] when it cannot, so the host falls through like any other.
 */
async function extractAbyss(provider, url, referer, siteQuality) {
  var html;
  try {
    html = await provider.fetch(url, provider.headersFor(url));
  } catch (e) {
    console.log("abyssplayer: halaman player gagal: " + e);
    return [];
  }
  var m = /datas\s*=\s*"([A-Za-z0-9+/=]{40,})"/.exec(String(html || ""));
  if (!m) {
    console.log("abyssplayer: payload datas tidak ditemukan");
    return [];
  }
  var datas;
  try {
    datas = JSON.parse(b64Decode(m[1]));
  } catch (e) {
    console.log("abyssplayer: datas rusak: " + e);
    return [];
  }
  var userId = safeString(datas.user_id);
  var slug = safeString(datas.slug);
  var md5Id = safeString(datas.md5_id);
  var mediaCipher = safeString(datas.media);
  if (!slug || !md5Id || !mediaCipher) {
    console.log("abyssplayer: field datas tidak lengkap");
    return [];
  }

  // Decrypt `media` (key = md5 of the string `user_id:slug:md5_id`).
  var mediaHex = abyssMd5(userId + ":" + slug + ":" + md5Id);
  var mediaJson;
  try {
    mediaJson = JSON.parse(utf8Decode(abyssAesCtr(mediaHex, mediaHex.substring(0, 16), mediaCipher)));
  } catch (e) {
    console.log("abyssplayer: decrypt media gagal: " + e);
    return [];
  }
  var mp4 = mediaJson && mediaJson.mp4 || {};
  var sources = mp4.sources || [];
  var domains = mp4.domains || [];

  var videos = [];
  for (var i = 0; i < sources.length; i++) {
    var src = sources[i];
    if (!src || !src.status || src.codec === "av1") continue;
    var sub = safeString(src.sub);
    if (!sub) continue;
    var domain = "";
    for (var d = 0; d < domains.length; d++) {
      if (safeString(domains[d]).indexOf(sub) !== -1) { domain = safeString(domains[d]); break; }
    }
    if (!domain) continue;
    var req = "/mp4/" + md5Id + "/" + src.res_id + "/" + src.size + "?v=" + slug;
    var sizeHex = abyssMd5Number(src.size);
    var token = b64Encode(abyssAesCtr(sizeHex, sizeHex.substring(0, 16), req)).replace(/=/g, "");
    token = b64Encode(token).replace(/=/g, "");
    videos.push({
      url: "https://" + domain + "/sora/" + src.size + "/" + token,
      quality: safeString(src.label) || resolutionOf(siteQuality) || "Abyss",
      headers: provider.headersFor(url),
    });
  }
  return videos;
}

// ---- inlined from src-shared/40-gdplayer.js ----
// ---------------------------------------------------------------------------
// gdplayer.to / gdriveplayer.* embed extractor.
//
// These players never put a video URL in the page. The embed carries an
// aaencoded config script whose decoded body is
//
//   window.apx    = "<base64 of the api endpoint>-config"
//   window.__ts   = "<epoch seconds>"
//   window.__nc   = "<nonce>"
//   window.__sg   = "<signature>"
//   window.kaken  = "<sealed request token>"
//
// POSTing `kaken` to the endpoint named by `apx` (with X-Ts / X-Nc / X-Sg)
// returns a sealed payload:
//
//   base64( salt[16] || AES-256-CBC(PBKDF2-SHA256(seed + ts + nc, salt, 10000)) )
//
// and the plaintext is the player's own config JSON: `query.host`, `query.id`,
// `sources[]`, `title`. For the mp4upload-backed episodes the real CDN URL is
// one more hop away — `query.id` opens `www.mp4upload.com/embed-<id>.html`,
// which carries the direct `.mp4` in its player setup. That URL answers range
// requests, so seeking works; the `sources[0].file` gateway
// (`gdplayer.to/stream-vid/...`) does not, so it is kept only as a fallback.
//
// Everything here is read from public embed pages. Nothing logs in.
// ---------------------------------------------------------------------------

// --------------------------------------------------------- aaencode decode
// The blast is a kaomoji-encoded *expression* that builds one string of octal
// escapes; QuickJS cannot evaluate it, so the escapes are read out of the
// source text instead of running anything.

var AA_BACKSLASH = "(ﾟДﾟ)[ﾟεﾟ]";
var AA_QUOTE = "(ﾟДﾟ)[ﾟoﾟ]";

// Atom values after the blob's own preamble: o=3, c=0, ﾟΘﾟ=1, ﾟｰﾟ=4.
var AA_ATOMS = [
  ["(o^_^o)", 3],
  ["(c^_^o)", 0],
  ["(ﾟΘﾟ)", 1],
  ["(ﾟｰﾟ)", 4],
];

/** Numeric value of one aaencode term (a digit, possibly a sum/difference). */
function aaTermValue(term) {
  var s = term.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");
  for (var a = 0; a < AA_ATOMS.length; a++) {
    s = s.split(AA_ATOMS[a][0]).join(String(AA_ATOMS[a][1]));
  }
  if (!s) return -1;
  // Anything that is not plain arithmetic means the atom table drifted (the
  // site changed its encoder). Bail instead of emitting garbage.
  if (/[^0-9+\-()]/.test(s)) return -1;
  var i = 0;
  function expr() {
    var v = unary();
    while (i < s.length && (s.charAt(i) === "+" || s.charAt(i) === "-")) {
      var op = s.charAt(i++);
      var r = unary();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function unary() {
    if (s.charAt(i) === "-") { i++; return -unary(); }
    if (s.charAt(i) === "+") { i++; return unary(); }
    if (s.charAt(i) === "(") {
      i++;
      var v = expr();
      if (s.charAt(i) === ")") i++;
      return v;
    }
    var start = i;
    while (i < s.length && s.charAt(i) >= "0" && s.charAt(i) <= "9") i++;
    return start === i ? 0 : parseInt(s.slice(start, i), 10);
  }
  var value = expr();
  return i === s.length ? value : -1;
}

/**
 * Split an escape group on top-level '+' only: `+1+4+(4+1)` is three octal
 * digits (145), while the parenthesised `(4+1)` is a single digit (5).
 */
function aaSplitTerms(group) {
  var terms = [];
  var depth = 0;
  var current = "";
  for (var i = 0; i < group.length; i++) {
    var ch = group.charAt(i);
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "+" && depth === 0) {
      if (current.replace(/\s+/g, "")) terms.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.replace(/\s+/g, "")) terms.push(current.trim());
  return terms;
}

/** Octal escape group -> character. Digits are concatenated, not summed. */
function aaGroupChar(group) {
  var terms = aaSplitTerms(group);
  var digits = "";
  for (var i = 0; i < terms.length; i++) {
    var v = aaTermValue(terms[i]);
    if (v < 0) return null;
    digits += String(v);
  }
  if (!digits || !/^[0-7]+$/.test(digits)) return null;
  var code = parseInt(digits, 8);
  return code >= 0 && code <= 0x10ffff ? String.fromCharCode(code) : null;
}

/** Unescape a JavaScript string body: \" \\ \n \xNN \uNNNN \ooo. */
function aaUnescapeJs(body) {
  var out = "";
  for (var i = 0; i < body.length; i++) {
    var ch = body.charAt(i);
    if (ch !== "\\") { out += ch; continue; }
    var n = body.charAt(++i);
    if (n === "n") out += "\n";
    else if (n === "r") out += "\r";
    else if (n === "t") out += "\t";
    else if (n === "b") out += "\b";
    else if (n === "f") out += "\f";
    else if (n === "v") out += "\v";
    else if (n === "0" && !/[0-7]/.test(body.charAt(i + 1))) out += "\0";
    else if (n === "x") { out += String.fromCharCode(parseInt(body.substr(i + 1, 2), 16)); i += 2; }
    else if (n === "u") { out += String.fromCharCode(parseInt(body.substr(i + 1, 4), 16)); i += 4; }
    else if (n >= "0" && n <= "7") {
      var oct = n;
      while (oct.length < 3 && body.charAt(i + 1) >= "0" && body.charAt(i + 1) <= "7") {
        oct += body.charAt(++i);
      }
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += n;
  }
  return out;
}

/** The escaped literal an aaencode blob carries, or null if it is not one. */
function aaDecodeString(blob) {
  var src = String(blob || "");
  // The first BACKSLASH+ in the blob is the preamble's own `='\\'` assignment,
  // so the payload really starts at the first BACKSLASH+ that FOLLOWS a quote.
  var groupAt = -1;
  var quoteAt = -1;
  var scan = 0;
  for (;;) {
    var bs = src.indexOf(AA_BACKSLASH + "+", scan);
    if (bs < 0) break;
    var q = src.lastIndexOf(AA_QUOTE, bs);
    if (q >= 0) { groupAt = bs; quoteAt = q; break; }
    scan = bs + 1;
  }
  if (groupAt < 0) return null;
  var end = src.lastIndexOf(AA_QUOTE);
  if (end <= quoteAt) return null;
  var groups = src.slice(groupAt, end).split(AA_BACKSLASH);
  var out = "";
  for (var i = 0; i < groups.length; i++) {
    // The leading "+" is the concatenation glue, not part of the escapes.
    var group = groups[i].replace(/^(\s*\+\s*)+/, "");
    if (!group.replace(/\s+/g, "")) continue;
    var c = aaGroupChar(group);
    if (c === null) return null;
    out += c;
  }
  return out;
}

/**
 * Dean Edwards packer unpacked in plain JS
 * (`eval(function(p,a,c,k,e,d){...}('body',base,count,'w|o|r|d'.split('|')))`).
 * The app's own `unpackJs` bridge does the same, but a shared extractor must
 * not depend on that bridge existing, so the loop is written out.
 */
function aaUnpackJs(packed) {
  var src = String(packed || "").trim();
  var m = /^(?:eval\s*\(\s*)?function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)[\s\S]*?\}\s*\(\s*'([\s\S]*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*)'\s*\.\s*split\s*\(\s*'\|'\s*\)\s*\)\s*\)?\s*$/.exec(src);
  if (!m) return "";
  var body = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var base = parseInt(m[2], 10);
  var count = parseInt(m[3], 10);
  var words = m[4].split("|");
  if (!base || !isFinite(count)) return "";
  var out = body;
  for (var i = count - 1; i >= 0; i--) {
    if (!words[i]) continue;
    var key = aaBaseKey(i, base);
    if (!key) continue;
    out = aaReplaceWord(out, key, words[i]);
  }
  return out;
}

/**
 * Replace `token` with `word` only at identifier boundaries. A plain split/join
 * would rewrite the inside of longer identifiers ("window" contains "w") and
 * shred the script, which is what the packer's `\b` guards against.
 */
function aaReplaceWord(text, token, word) {
  var out = "";
  var from = 0;
  var at = text.indexOf(token, from);
  while (at >= 0) {
    var before = at > 0 ? text.charAt(at - 1) : "";
    var after = text.charAt(at + token.length);
    var leftFree = !before || !/[A-Za-z0-9_$]/.test(before);
    var rightFree = !after || !/[A-Za-z0-9_$]/.test(after);
    if (leftFree && rightFree) {
      out += text.slice(from, at) + word;
      from = at + token.length;
      at = text.indexOf(token, from);
    } else {
      at = text.indexOf(token, at + 1);
    }
  }
  return out + text.slice(from);
}

/**
 * Packer word index -> its token. The original is
 * `e(c) = (c < a ? "" : e(c / a | 0)) + (c % a > 35 ? chr(c % a + 29) : (c % a).toString(36))`
 * so the tokens run through base-`a`, which is not necessarily <= 36.
 */
function aaBaseKey(n, base) {
  if (n < 0 || !isFinite(n)) return "";
  var head = n < base ? "" : aaBaseKey(Math.floor(n / base), base);
  var r = n % base;
  return head + (r > 35 ? String.fromCharCode(r + 29) : r.toString(36));
}

/** Full aaencode blob -> the config script it carries. */
function aaDecodeConfig(blob) {
  var literal = aaDecodeString(blob);
  if (literal === null) return "";
  // The literal is `return"<js>"` — the source of a Function body.
  var m = /^return\s*"([\s\S]*)"\s*$/.exec(literal);
  var inner = m ? aaUnescapeJs(m[1]) : literal;
  // ...and <js> is usually `eval("<real config>")`.
  var e = /^\s*eval\s*\(\s*"([\s\S]*)"\s*\)\s*;?\s*$/.exec(inner);
  var script = e ? aaUnescapeJs(e[1]) : inner;
  if (script.indexOf("function(p,a,c,k,e,d)") !== -1) {
    var unpacked = aaUnpackJs(script);
    if (unpacked) return unpacked;
  }
  return script;
}

/** Reads `window.<name>="..."` out of a decoded config script. */
function aaConfigValue(config, name) {
  var m = new RegExp(
    "(?:^|[^A-Za-z0-9_$])" + name + "\\s*=\\s*\"([^\"]*)\"",
  ).exec(String(config || ""));
  return m ? m[1] : "";
}

// ------------------------------------------------------------- decryption

// Seed the player ships in its own bundle.
var GD_SEED = "V8xK2mP9qR4wT6yA3bN7cJ5dF1gH0eL";

/**
 * Unseal one api payload: base64 -> (salt[16] || ciphertext), key material from
 * PBKDF2-SHA256(seed + ts + nc, salt, 10000, 48); head 32 bytes are the key,
 * tail 16 the CBC iv. Plain JSON is passed through untouched so a future
 * unencrypted endpoint keeps working.
 */
function gdUnseal(payload, ts, nc) {
  var text = String(payload || "").trim();
  if (!text) return "";
  if (text.charAt(0) === "{") return text;
  var raw = b64Decode(text);
  if (raw.length < 32) return "";
  var salt = raw.slice(0, 16);
  var ct = raw.slice(16);
  var material = cryptPbkdf2Sha256(GD_SEED + ts + nc, salt, 10000, 48);
  return cryptAesCbcDecrypt(material.slice(0, 32), material.slice(32, 48), ct);
}

/** The config script inside an embed page, or "" when the page has none. */
function gdConfigOf(html) {
  var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html))) {
    if (m[1].indexOf("(ﾟДﾟ)") !== -1) {
      var config = aaDecodeConfig(m[1]);
      if (config) return config;
    }
  }
  return "";
}

/** Direct `.mp4` from an mp4upload embed page, or "". */
function gdMp4UploadUrl(provider, id, referer) {
  var page = "https://www.mp4upload.com/embed-" + id + ".html";
  return provider
    .fetch(page, provider.headersFor("https://www.mp4upload.com/"))
    .then(function (html) {
      var m = /src\s*:\s*"([^"]+\.mp4[^"]*)"/.exec(html);
      return m ? m[1] : "";
    })
    .catch(function (e) {
      console.log("gdplayer: mp4upload embed failed: " + e);
      return "";
    });
}

/**
 * Resolve one gdplayer/gdriveplayer embed into playable sources. Returns [] when
 * the page shape changed, so the host falls through like any other.
 */
async function extractGdplayer(provider, url, referer) {
  var html;
  try {
    html = await provider.fetch(url, provider.headersFor(referer || url));
  } catch (e) {
    console.log("gdplayer: embed fetch failed: " + e);
    return [];
  }

  var config = gdConfigOf(html);
  if (!config) {
    console.log("gdplayer: no aaencode config in " + url);
    return [];
  }

  var apx = aaConfigValue(config, "apx");
  var ts = aaConfigValue(config, "__ts");
  var nc = aaConfigValue(config, "__nc");
  var sg = aaConfigValue(config, "__sg");
  var kaken = aaConfigValue(config, "kaken");
  if (!apx || !ts || !nc || !sg || !kaken) {
    console.log("gdplayer: incomplete config (apx=" + !!apx + " ts=" + !!ts +
      " nc=" + !!nc + " sg=" + !!sg + " kaken=" + !!kaken + ")");
    return [];
  }

  // "https://gdplayer.to/api-config/" -> "https://gdplayer.to/api/"
  var endpoint = b64Decode(apx).replace(/-config/g, "").replace(/\/+$/, "/");
  if (!/^https?:\/\//i.test(endpoint)) {
    console.log("gdplayer: bad endpoint " + endpoint);
    return [];
  }

  var res;
  try {
    res = await provider.post(endpoint, kaken, {
      "User-Agent": provider.getHeaders(url)["User-Agent"],
      Accept: "*/*",
      Referer: url,
      "Content-Type": "text/plain",
      "X-Ts": ts,
      "X-Nc": nc,
      "X-Sg": sg,
    });
  } catch (e) {
    console.log("gdplayer: api-config failed: " + e);
    return [];
  }
  var payload = res && res.body ? String(res.body) : "";
  if (!payload) {
    console.log("gdplayer: empty api payload");
    return [];
  }

  var plain;
  try {
    plain = gdUnseal(payload, ts, nc);
  } catch (e) {
    console.log("gdplayer: unseal failed: " + e);
    return [];
  }
  if (!plain) {
    console.log("gdplayer: unseal produced nothing");
    return [];
  }

  var data;
  try {
    data = JSON.parse(plain);
  } catch (e) {
    console.log("gdplayer: payload is not JSON: " + plain.slice(0, 120));
    return [];
  }

  // The title carries the real resolution ("...-720p--.mp4"). Report that
  // rather than inheriting the site's 1080p assumption.
  var quality = resolutionOf(data.title) || resolutionOf(String(data.title || ""));
  var videos = [];

  var query = data.query || {};
  if (/mp4upload/i.test(safeString(query.host)) && query.id) {
    var direct = await gdMp4UploadUrl(provider, safeString(query.id), url);
    if (direct) {
      videos.push({
        url: direct,
        quality: quality,
        headers: { Referer: "https://www.mp4upload.com/" },
      });
    }
  }

  // `sources[].file` is the gdplayer stream gateway. It answers 403 to
  // non-browser clients, so it is only offered when there is nothing better —
  // otherwise every gdplayer embed would show a second, dead entry.
  if (!videos.length) {
    var sources = data.sources || [];
    for (var i = 0; i < sources.length; i++) {
      var file = safeString(sources[i] && sources[i].file);
      if (file && /^https?:\/\//i.test(file)) {
        videos.push({ url: file, quality: quality, headers: { Referer: url } });
      }
    }
  }

  if (!videos.length) console.log("gdplayer: nothing playable in payload");
  return videos;
}

const KURO_API = "https://animeku.org/api/v9/sources";
// From the string table of the site's player script; changes when the site
// updates it, and then every episode comes back empty.
const KURO_PASSPHRASE = "3&!Z0M,VIZ;dZW==";

const KURO_GENRES = [
  ["Action", "action"], ["Adult Cast", "adult-cast"], ["Adventure", "adventure"],
  ["Anthropomorphic", "anthropomorphic"], ["Avant Garde", "avant-garde"], ["Award Winning", "award-winning"],
  ["Boys Love", "boys-love"], ["Cars", "cars"], ["CGDCT", "cgdct"], ["Childcare", "childcare"],
  ["Combat Sports", "combat-sports"], ["Comedy", "comedy"], ["Crime", "crime"],
  ["Crossdressing", "crossdressing"], ["Cultivation", "cultivation"], ["Delinquents", "delinquents"],
  ["Dementia", "dementia"], ["Demons", "demons"], ["Detective", "detective"], ["Donghua", "donghua"],
  ["Drama", "drama"], ["Ecchi", "ecchi"], ["Educational", "educational"], ["Family", "family"],
  ["Fantasy", "fantasy"], ["Gag Humor", "gag-humor"], ["Game", "game"], ["Girls Love", "girls-love"],
  ["Gore", "gore"], ["Gourmet", "gourmet"], ["Harem", "harem"], ["High Stakes Game", "high-stakes-game"],
  ["Historical", "historical"], ["Horror", "horror"], ["Idols (Female)", "idols-female"],
  ["Idols (Male)", "idols-male"], ["Isekai", "isekai"], ["Iyashikei", "iyashikei"], ["Josei", "josei"],
  ["Kids", "kids"], ["Love Polygon", "love-polygon"], ["Magic", "magic"], ["Mahou Shoujo", "mahou-shoujo"],
  ["Martial Arts", "martial-arts"], ["Mecha", "mecha"], ["Medical", "medical"], ["Military", "military"],
  ["Music", "music"], ["Mystery", "mystery"], ["Mythology", "mythology"],
  ["Organized Crime", "organized-crime"], ["Otaku Culture", "otaku-culture"], ["Parody", "parody"],
  ["Performing Arts", "performing-arts"], ["Pets", "pets"], ["Police", "police"],
  ["Psychological", "psychological"], ["Racing", "racing"], ["Reincarnation", "reincarnation"],
  ["Reverse Harem", "reverse-harem"], ["Romance", "romance"], ["Romantic Subtext", "romantic-subtext"],
  ["Samurai", "samurai"], ["School", "school"], ["Sci-Fi", "sci-fi"], ["Seinen", "seinen"],
  ["Shoujo", "shoujo"], ["Shoujo Ai", "shoujo-ai"], ["Shounen", "shounen"], ["Shounen Ai", "shounen-ai"],
  ["Showbiz", "showbiz"], ["Slice of Life", "slice-of-life"], ["Space", "space"], ["Sports", "sports"],
  ["Strategy Game", "strategy-game"], ["Super Power", "super-power"], ["Supernatural", "supernatural"],
  ["Survival", "survival"], ["Suspense", "suspense"], ["Team Sports", "team-sports"],
  ["Thriller", "thriller"], ["Time Travel", "time-travel"], ["Tokusatsu", "tokusatsu"],
];
const KURO_STATUS = [["Semua", ""], ["Ongoing", "ongoing"], ["Completed", "completed"]];
const KURO_TYPES = [["Semua", ""], ["TV", "TV"], ["Movie", "Movie"], ["OVA", "OVA"], ["ONA", "ONA"], ["Special", "Special"]];
const KURO_ORDERS = [["Terbaru diperbarui", "update"], ["Terpopuler", "popular"], ["Terbaru ditambahkan", "latest"], ["Judul A-Z", "title"], ["Judul Z-A", "titlereverse"]];
const KURO_SERVERS = ["Mp4Upload", "Pixeldrain", "Krakenfiles", "Vidhide"];
const KURO_QUALITIES = ["v1080p", "v720p", "v480p", "v360p"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://kuronime.sbs");
  }

  get supportsLatest() {
    return true;
  }

  /** A refusal throws, so it reaches the app's error card instead of a blank. */
  async pageDoc(url) {
    const res = await this.client.get(url, this.getHeaders(url));
    const challenged = res && res.headers && res.headers["cf-mitigated"];
    if (res && (res.statusCode === 403 || res.statusCode === 503 || challenged)) {
      throw new Error("Situs menolak permintaan (HTTP " + res.statusCode +
        "). Buka WebView lalu coba lagi.");
    }
    if (!res || !res.body || res.statusCode >= 400) {
      console.log("kuronime: gagal memuat " + url);
      return null;
    }
    return new Document(res.body);
  }

  // ------------------------------------------------------------- listings

  async getPopular(page) {
    return this.catalogue({ order: "popular" }, page);
  }

  async getLatestUpdates(page) {
    return this.catalogue({ order: "update" }, page);
  }

  async search(query, page, filters) {
    const text = cleanText(query);
    if (!text) return this.catalogue(this.selected(filters), page);
    const n = Math.max(1, parseInt(page, 10) || 1);
    const path = (n === 1 ? "/" : "/page/" + n + "/") + "?s=" + encodeQuery(text);
    return this.listing(path);
  }

  async catalogue(params, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const query = [];
    ["status", "type", "order"].forEach(function (key) {
      if (params[key]) query.push(key + "=" + encodeQuery(params[key]));
    });
    if (params.genre) query.push("genre%5B%5D=" + encodeQuery(params.genre));
    return this.listing((n === 1 ? "/anime/" : "/anime/page/" + n + "/") + "?" + query.join("&"));
  }

  async listing(path) {
    const doc = await this.pageDoc(this.resolve(path));
    if (!doc) return this.emptyPage();
    const cards = doc.select("div.listupd article.bs") || [];
    const list = [];
    for (let i = 0; i < cards.length; i++) {
      const anchor = cards[i].selectFirst("div.bsx > a[href]");
      const href = anchor ? anchor.attr("href") : "";
      if (!href) continue;
      const title = cards[i].selectFirst("h2[itemprop=headline]");
      list.push(this.item(
        title ? title.text : anchor.attr("title"),
        kuroImage(cards[i].selectFirst("img[itemprop=image]")),
        href,
      ));
    }
    const next = doc.selectFirst(".pagination a.next");
    return { list: list, hasNextPage: !!(next && next.attr("href")) };
  }

  selected(filters) {
    const out = { order: "update", status: "", type: "", genre: "" };
    (filters || []).forEach(function (filter) {
      if (!filter || !filter.values || !filter.type) return;
      const option = filter.values[parseInt(filter.state, 10) || 0];
      if (option) out[filter.type] = safeString(option.value);
    });
    if (!out.order) out.order = "update";
    return out;
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    const seriesUrl = await this.seriesUrlOf(this.resolve(url));
    const doc = seriesUrl ? await this.pageDoc(seriesUrl) : null;
    if (!doc) return empty;

    const name = cleanTitle(doc.selectFirst("h1.entry-title").text);
    if (!name) {
      console.log("kuronime: detail tidak ditemukan: " + seriesUrl);
      return empty;
    }
    const info = {};
    const rows = doc.select("div.infodetail ul li") || [];
    for (let i = 0; i < rows.length; i++) {
      const match = /^([^:]+):\s*([\s\S]*)$/.exec(cleanText(rows[i].text));
      if (match) info[match[1].trim().toLowerCase()] = match[2].trim();
    }
    const facts = ["tipe", "tayang", "season", "durasi"].filter(function (key) {
      return info[key];
    }).map(function (key) {
      return key.charAt(0).toUpperCase() + key.slice(1) + ": " + info[key];
    });
    const synopsis = cleanText(decodeEntities(doc.selectFirst("div.conx span.const").text));

    const detail = {
      name: name,
      imageUrl: kuroImage(doc.selectFirst("div.l[itemprop=image] img")),
      link: this.relativize(seriesUrl),
      description: [synopsis, facts.join(" · ")].filter(Boolean).join("\n\n"),
      author: info.studio || "",
      artist: "",
      genre: (info.genre || "").split(",").map(cleanText).filter(Boolean),
      episodes: this.episodesOf(doc),
    };
    if (/ongoing/i.test(info.status)) detail.status = 0;
    else if (/completed/i.test(info.status)) detail.status = 1;
    return detail;
  }

  /** A series URL as given; an episode URL resolved through its breadcrumb. */
  async seriesUrlOf(url) {
    if (/\/anime\/[^/]+\/?$/.test(url.split("?")[0])) return url;
    const episode = await this.pageDoc(url);
    if (!episode) return "";
    const anchors = episode.select(".breadcrumbs a[href]") || [];
    for (let i = anchors.length - 1; i >= 0; i--) {
      const href = anchors[i].attr("href");
      if (/\/anime\/[^/]+\/?$/.test(href || "")) return this.resolve(pathOf(href));
    }
    console.log("kuronime: tautan seri tidak ditemukan di " + url);
    return "";
  }

  /** The site lists episodes newest first, the order the app shows. */
  episodesOf(doc) {
    const anchors = doc.select("div.bixbox.bxcl ul li span.lchx a[href]") || [];
    const seen = {};
    const out = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href");
      if (!href) continue;
      const link = this.relativize(this.resolve(pathOf(href)));
      if (seen[link]) continue;
      seen[link] = true;
      const label = cleanText(anchors[i].text);
      out.push({ name: label || "Episode", url: link, dateUpload: "", scanlator: "" });
    }
    return out;
  }

  // --------------------------------------------------------------- videos

  /**
   * Every failure throws with the stage that failed, so the app shows it
   * instead of an empty player.
   */
  async getVideoList(url) {
    const pageUrl = this.resolve(url);
    const res = await this.client.get(pageUrl, this.getHeaders(pageUrl));
    const html = res && res.statusCode === 200 ? safeString(res.body) : "";
    const blob = /var\s+_0x[0-9a-f]+\s*=\s*"([A-Za-z0-9+/=]{40,})"/.exec(html);
    if (!blob) {
      throw new Error("Kuronime: id player tidak ditemukan di halaman episode (HTTP " +
        (res && res.statusCode) + ").");
    }
    const mirror = await this.playerMirrors(blob[1]);

    const embeds = kuroEmbeds(mirror);
    if (!embeds.length) throw new Error("Kuronime: player tidak memberi mirror untuk episode ini.");
    const self = this;
    const found = await this.mapLimit(embeds, 2, function (embed) {
      return self.resolveEmbed(embed, pageUrl);
    });
    const results = [];
    found.forEach(function (videos) {
      (videos || []).forEach(function (video) {
        results.push(video);
      });
    });
    if (!results.length) {
      throw new Error("Kuronime: " + embeds.length + " mirror dicoba (" +
        embeds.map(function (e) { return e.server + " " + e.quality; }).join(", ") +
        "), tidak ada yang menghasilkan video.");
    }
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /** POST the page's id to the player API and decrypt its `mirror` field. Throws on failure. */
  async playerMirrors(id) {
    const base = this.getBaseUrl();
    const headers = this.headersFor(base + "/");
    headers.Origin = base;
    headers["Content-Type"] = "application/json";
    headers.Accept = "application/json, text/plain, */*";
    // An object, not a JSON string: with a JSON Content-Type the app encodes
    // the body itself, and a string would arrive double-encoded (HTTP 500).
    const res = await this.client.post(KURO_API, headers, { id: id });
    let data = null;
    try {
      data = res && res.body ? JSON.parse(res.body) : null;
    } catch (_) {
      data = null;
    }
    if (!data || !data.mirror) {
      throw new Error("Kuronime: API player menolak (HTTP " + (res && res.statusCode) + ": " +
        safeString(res && res.body).slice(0, 80) + ").");
    }
    const plain = kuroDecrypt(data.mirror);
    try {
      return JSON.parse(plain);
    } catch (_) {
      throw new Error("Kuronime: dekripsi gagal (" + (plain ? "hasil bukan JSON" : "hasil kosong") +
        "); kunci player mungkin berubah, perbarui ekstensi.");
    }
  }

  async resolveEmbed(embed, pageUrl) {
    const label = function (video) {
      video.server = embed.server;
      video.quality = qualityLabel(resolutionOf(video.quality) || embed.quality, embed.server, "Hardsub ID");
      return video;
    };
    if (embed.server === "Mp4Upload") {
      const video = await this.mp4upload(embed.url);
      return video ? [label(video)] : [];
    }
    const reason = unsupportedReason(embed.url);
    if (reason) {
      console.log("kuronime: server " + embed.server + " tidak didukung (" + reason + ")");
      return [];
    }
    if (!isSupportedHost(embed.url)) {
      console.log("kuronime: server " + embed.server + " tidak didukung (belum ada ekstraktor untuk " + hostOf(embed.url) + ")");
      return [];
    }
    const found = await extractByHost(this, embed.url, pageUrl, embed.quality, "Hardsub ID");
    if (!found.videos.length) console.log("kuronime: " + embed.server + " " + embed.quality + " tidak menghasilkan stream");
    return found.videos.map(label);
  }

  /** The embed page names its file as `src: "https://aN.mp4upload.com:183/.../video.mp4"`. */
  async mp4upload(embedUrl) {
    try {
      const html = await this.fetch(embedUrl, this.headersFor(this.getBaseUrl() + "/"));
      const match = /src:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/.exec(html);
      if (!match) {
        console.log("kuronime: mp4upload tanpa file: " + embedUrl);
        return null;
      }
      return { url: match[1], originalUrl: embedUrl, quality: "", headers: this.headersFor("https://www.mp4upload.com/") };
    } catch (e) {
      console.log("kuronime: mp4upload gagal: " + e);
      return null;
    }
  }

  // -------------------------------------------------------- configuration

  getFilterList() {
    const select = function (type, name, pairs) {
      return {
        type_name: "SelectFilter",
        type: type,
        name: name,
        state: 0,
        values: pairs.map(function (pair) {
          return { type_name: "SelectOption", name: pair[0], value: pair[1] };
        }),
      };
    };
    return [
      select("order", "Urutkan", KURO_ORDERS),
      select("status", "Status", KURO_STATUS),
      select("type", "Tipe", KURO_TYPES),
      select("genre", "Genre", [["Semua", ""]].concat(KURO_GENRES)),
      { type_name: "HeaderFilter", type: "note", name: "Filter diabaikan saat mencari dengan kata kunci." },
    ];
  }

  getSourcePreferences() {
    return this.basePreferences(KURO_SERVERS);
  }
}

/** WP Rocket puts the real image in data-lazy-src and an SVG placeholder in src. */
function kuroImage(img) {
  if (!img) return "";
  const candidates = [img.attr("data-lazy-src"), img.attr("data-src"), img.attr("src")];
  for (let i = 0; i < candidates.length; i++) {
    const src = decodeEntities(safeString(candidates[i]));
    if (src && !/^data:/i.test(src)) return src;
  }
  return "";
}

/**
 * The API ships CryptoJS JSON `base64({ct, iv, s})`. Its iv is the one
 * EVP_BytesToKey derives from the salt, so the payload is re-packed into the
 * OpenSSL `Salted__` container the app's decryptAESCryptoJS reads.
 */
function kuroDecrypt(field) {
  const payload = JSON.parse(b64Decode(field));
  let salt = "";
  for (let i = 0; i + 1 < payload.s.length; i += 2) {
    salt += String.fromCharCode(parseInt(payload.s.substr(i, 2), 16));
  }
  const container = b64Encode("Salted__" + salt + b64Decode(payload.ct));
  return decryptAESCryptoJS(container, KURO_PASSPHRASE);
}

const KURO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 of a byte string (chars 0-255); QuickJS has no btoa. */
function b64Encode(bin) {
  let out = "";
  for (let i = 0; i < bin.length; i += 3) {
    const a = bin.charCodeAt(i) & 0xff;
    const b = i + 1 < bin.length ? bin.charCodeAt(i + 1) & 0xff : -1;
    const c = i + 2 < bin.length ? bin.charCodeAt(i + 2) & 0xff : -1;
    out += KURO_B64.charAt(a >> 2);
    out += KURO_B64.charAt(((a & 3) << 4) | (b < 0 ? 0 : b >> 4));
    out += b < 0 ? "=" : KURO_B64.charAt(((b & 15) << 2) | (c < 0 ? 0 : c >> 6));
    out += c < 0 ? "=" : KURO_B64.charAt(c & 63);
  }
  return out;
}

/** `{embed: {v1080p: {mp4upload: url, ...}, ...}}` as {url, server, quality}, best first. */
function kuroEmbeds(mirror) {
  const table = (mirror && mirror.embed) || {};
  const names = { mp4upload: "Mp4Upload", pixeldrain: "Pixeldrain", krakenfiles: "Krakenfiles", filelions: "Vidhide", doodstream: "Doodstream" };
  const seen = {};
  const out = [];
  for (let q = 0; q < KURO_QUALITIES.length; q++) {
    const hosts = table[KURO_QUALITIES[q]] || {};
    for (const host in hosts) {
      if (!Object.prototype.hasOwnProperty.call(hosts, host)) continue;
      const url = safeString(hosts[host]);
      // dsvplay/dood hosts do not resolve; the app's extractor would wait on each.
      if (!/^https?:\/\//i.test(url) || seen[url] || host === "doodstream") continue;
      seen[url] = true;
      out.push({ url: url, server: names[host] || host, quality: KURO_QUALITIES[q].slice(1) });
    }
  }
  return out;
}

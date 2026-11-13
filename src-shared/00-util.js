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

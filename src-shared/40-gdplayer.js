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
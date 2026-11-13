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

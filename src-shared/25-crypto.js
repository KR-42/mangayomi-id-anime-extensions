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
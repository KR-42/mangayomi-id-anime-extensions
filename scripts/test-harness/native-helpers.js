/**
 * Mocks for the native helper bridges Mangayomi exposes to JavaScript
 * (lib/eval/javascript/utils.dart). Only the helpers extensions in this repo
 * actually call are implemented; each one mirrors the Dart behaviour closely
 * enough that a fixture test fails when the extension misuses it.
 *
 * Nothing here is shipped to users.
 */
"use strict";

const crypto = require("crypto");

// ---------------------------------------------------------------- unpackJs
//
// The app uses dart `js_packer`, a Dean Edwards p,a,c,k,e,d unpacker. The packer
// emits `eval(<decoder-expression>)`; shadowing `eval` captures the decoded
// source without running it.
//
// This evaluates the decoder IIFE from fixture HTML, which is trusted input
// (saved by us) — but it is still a `new Function`, so keep fixtures out of the
// repo's test path if that ever stops being true.

function unpackJs(packed) {
  const input = String(packed || "");
  // Only feed the harness something that is actually a packer invocation.
  if (!/eval\(function\(p,a,c,k,e,[a-z]\)/.test(input)) return "";
  let captured = "";
  const capture = (code) => {
    captured = String(code || "");
    return captured;
  };
  try {
    new Function("eval", input)(capture);
  } catch (_) {
    return "";
  }
  return captured;
}

function unpackJsAndCombine(scriptBlock) {
  const input = String(scriptBlock || "");
  const parts = [input];
  const re = /eval\(function\(p,a,c,k,e,[a-z]\)[\s\S]*?\.split\(['"]\|['"]\)\)\)/gi;
  let match;
  while ((match = re.exec(input)) !== null) {
    const unpacked = unpackJs(match[0]);
    if (unpacked) parts.push(unpacked);
  }
  return parts.join("\n");
}

// ----------------------------------------------------------------- crypto

/** Raw AES-CBC with a literal UTF-8 key and iv (app: CryptoAES helpers). */
function cryptoHandler(text, iv, secretKeyString, encrypt) {
  try {
    const key = Buffer.from(String(secretKeyString), "utf8");
    const ivBuf = Buffer.from(String(iv), "utf8");
    const cipher = `aes-${key.length * 8}-cbc`;
    if (encrypt) {
      const enc = crypto.createCipheriv(cipher, key, ivBuf);
      return Buffer.concat([enc.update(String(text), "utf8"), enc.final()]).toString("base64");
    }
    const dec = crypto.createDecipheriv(cipher, key, ivBuf);
    return Buffer.concat([
      dec.update(Buffer.from(String(text), "base64")),
      dec.final(),
    ]).toString("utf8");
  } catch (_) {
    return text;
  }
}

/** CryptoJS "Salted__" container: salt at bytes 8..16, payload after 16. */
function deriveKeyAndIv(passphrase, salt) {
  const password = Buffer.from(String(passphrase), "utf8");
  let concatenated = Buffer.alloc(0);
  let current = Buffer.alloc(0);
  while (concatenated.length < 48) {
    const pre = Buffer.concat(
      current.length ? [current, password, salt] : [password, salt],
    );
    current = crypto.createHash("md5").update(pre).digest();
    concatenated = Buffer.concat([concatenated, current]);
  }
  return {
    key: concatenated.subarray(0, 32),
    iv: concatenated.subarray(32, 48),
  };
}

function decryptAESCryptoJS(encrypted, passphrase) {
  const raw = Buffer.from(String(encrypted).trim(), "base64");
  const salt = raw.subarray(8, 16);
  const payload = raw.subarray(16);
  const { key, iv } = deriveKeyAndIv(passphrase, salt);
  const dec = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([dec.update(payload), dec.final()]).toString("utf8");
}

function encryptAESCryptoJS(plainText, passphrase) {
  const salt = crypto.randomBytes(8);
  const { key, iv } = deriveKeyAndIv(passphrase, salt);
  const enc = crypto.createCipheriv("aes-256-cbc", key, iv);
  const payload = Buffer.concat([
    enc.update(String(plainText).trim(), "utf8"),
    enc.final(),
  ]);
  return Buffer.concat([Buffer.from("Salted__", "utf8"), salt, payload]).toString(
    "base64",
  );
}

function decryptAESGCM(encrypted, keyHex, ivHex, tagHex) {
  try {
    const key = Buffer.from(String(keyHex), "hex");
    const iv = Buffer.from(String(ivHex), "hex");
    const tag = Buffer.from(String(tagHex || ""), "hex");
    const data = Buffer.from(String(encrypted), "base64");
    const dec = crypto.createDecipheriv(`aes-${key.length * 8}-gcm`, key, iv);
    // PointyCastle (the app) wants ciphertext||tag; Node wants them apart.
    if (tag.length) dec.setAuthTag(tag);
    return Buffer.concat([dec.update(data), dec.final()]).toString("utf8");
  } catch (_) {
    return encrypted;
  }
}

function deobfuscateJsPassword(input) {
  // The Dart version reverses and unescapes; extensions in this repo do not
  // rely on it yet, so the mock is an explicit pass-through.
  return String(input == null ? "" : input);
}

// ------------------------------------------------------------ misc bridges

function parseDates(values, format, locale) {
  const list = Array.isArray(values) ? values : [values];
  const out = [];
  for (const value of list) {
    const text = String(value == null ? "" : value).trim();
    const ms = Date.parse(text);
    out.push(isNaN(ms) ? "" : String(ms));
  }
  return out;
}

function createHlsProxyUrl(url) {
  // The app rewrites the playlist through a loopback proxy. For tests the
  // upstream URL is the honest stand-in: a fixture test only asserts that the
  // extension asked for a proxy at all (via the call log), not its shape.
  return String(url || "");
}

function evaluateJavascriptViaWebview() {
  return "";
}

module.exports = {
  unpackJs,
  unpackJsAndCombine,
  cryptoHandler,
  encryptAESCryptoJS,
  decryptAESCryptoJS,
  decryptAESGCM,
  deobfuscateJsPassword,
  parseDates,
  createHlsProxyUrl,
  evaluateJavascriptViaWebview,
};

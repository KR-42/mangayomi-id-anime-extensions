// ---------------------------------------------------------------------------
// Nekopoi playback scenarios the plain fixture run cannot express.
//
// The fixture harness serves every request the same way, whatever client sent
// it. Since 0.2.10 Nekopoi's DoodStream path depends on *which* HTTP client
// Cloudflare lets through (verified live 24 Nov 2026: the same playmogo URL
// answered 200 or 403 "cf-mitigated: challenge" depending only on the client),
// so these scenarios drive the built extension with a transport that refuses
// one client and serves the other, and with a stubbed app WebView.
//
// Offline and deterministic: pages come from fixtures/nekopoi/.
// ---------------------------------------------------------------------------
"use strict";

const fs = require("fs");
const path = require("path");
const { createRuntime } = require("./runtime");
const { JS_ROOT } = require("../lib/sources");

const FIXTURES = path.join(__dirname, "fixtures", "nekopoi");
const BUILT = path.join(JS_ROOT, "anime", "src", "id", "nekopoi.js");
const EPISODE = "/uncensored-hitozukiai-ga-nigate-na-miboujin-no-yukionna-san-to-noroi-no-yubiwa-episode-7-subtitle-indonesia/";

const failures = [];
let checks = 0;

function ok(condition, message) {
  checks++;
  if (!condition) failures.push(message);
}

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

const CHALLENGE = {
  status: 403,
  headers: { "cf-mitigated": "challenge", server: "cloudflare" },
  body: "<title>Just a moment...</title><script>window._cf_chl_opt={}</script>",
};

/**
 * Transport for the live-shaped episode (two playmogo servers).
 * `refuse(options)` decides, per request, whether playmogo challenges it.
 */
function transportFor(refuse, calls) {
  return async function transport(method, url, headers, body, options) {
    const dart = !!(options && options.useDartHttpClient);
    calls.push({ method, url, headers: Object.assign({}, headers), dart });
    if (url === "https://nekopoi.care" + EPISODE) {
      return { status: 200, headers: {}, body: fixture("episode_playmogo.html") };
    }
    if (/^https:\/\/playmogo\.com\//.test(url)) {
      if (method === "HEAD") return { status: 403, headers: CHALLENGE.headers, body: "" };
      if (refuse({ dart, headers })) return CHALLENGE;
      if (/\/pass_md5\//.test(url)) return { status: 200, headers: {}, body: fixture("playmogo_pass_md5.txt") };
      return { status: 200, headers: {}, body: fixture("playmogo_embed.html") };
    }
    throw new Error("no scenario response for " + method + " " + url);
  };
}

function runtimeWith(refuse, webview) {
  const calls = [];
  const webviewCalls = [];
  const rt = createRuntime({
    code: fs.readFileSync(BUILT, "utf8"),
    source: {
      name: "Nekopoi", id: 1, baseUrl: "https://nekopoi.care", lang: "id",
      typeSource: "single", itemType: 1, version: "0.0.0", pkgPath: "anime/src/id/nekopoi.js",
    },
    transport: transportFor(refuse, calls),
    globals: {
      evaluateJavascriptViaWebview: async (url, headers, scripts, seconds) => {
        webviewCalls.push({ url, scripts, seconds });
        return webview ? webview(url) : "";
      },
    },
  });
  return { rt, calls, webviewCalls };
}

function hasUserAgent(headers) {
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === "user-agent");
}

async function challengedDefaultClientFallsBackToDart() {
  const { rt, calls, webviewCalls } = runtimeWith(({ dart }) => !dart);
  const videos = await rt.extension.getVideoList(EPISODE);
  ok(videos.length === 2, "two playmogo servers -> two streams via the Dart client, got " + videos.length);
  ok(webviewCalls.length === 0, "no WebView needed when the Dart client passes");
  ok(videos.every((v) => /^https:\/\/ab123c\.cloudatacdn\.com\/u5kjfixturepassmd5prefix[A-Za-z0-9]{10}\.mp4\?token=[A-Za-z0-9]+&expiry=\d+$/.test(v.url)),
    "stream URL = pass_md5 prefix + 10 random chars + .mp4?token=&expiry=");
  ok(videos.every((v) => v.headers && v.headers.Referer === "https://playmogo.com/"),
    "every stream carries the embed origin as Referer (the CDN 302s without it)");
  ok(videos.every((v) => !hasUserAgent(v.headers)),
    "streams leave the User-Agent to the player (the CDN ignores it)");
  ok(videos.every((v) => /^https:\/\/playmogo\.com\/e\//.test(v.originalUrl)), "originalUrl is the embed page");
  const playmogo = calls.filter((c) => /playmogo\.com/.test(c.url) && c.method === "GET");
  ok(playmogo.every((c) => !hasUserAgent(c.headers)),
    "playmogo requests send no User-Agent, so the app's stored clearance UA applies");
  // Server 1: default refused, Dart passed (embed); then Dart first for pass_md5
  // and for all of Server 2. One refused attempt per episode, not per request.
  const refused = playmogo.filter((c) => !c.dart).length;
  ok(refused === 1, "the refused client is tried once, then the passing one is remembered (refused: " + refused + ")");
}

/**
 * Live finding, 24 Nov 2026: a non-browser client claiming desktop Chrome (or
 * the app's UA, whatever it is) is challenged while an Android WebView UA
 * passes. Model the worst case: only the WebView UA gets through.
 */
async function onlyAndroidUaPasses() {
  const { rt, calls, webviewCalls } = runtimeWith(({ headers }) => {
    const ua = Object.keys(headers).filter((k) => k.toLowerCase() === "user-agent").map((k) => headers[k])[0] || "";
    return !/; wv\)/.test(ua);
  });
  const videos = await rt.extension.getVideoList(EPISODE);
  ok(videos.length === 2, "Android WebView UA round -> two streams, got " + videos.length);
  ok(webviewCalls.length === 0, "no WebView needed when the Android UA passes");
  const gets = calls.filter((c) => /playmogo\.com/.test(c.url) && c.method === "GET");
  ok(gets.filter((c) => !hasUserAgent(c.headers)).length === 2,
    "the app's own UA is tried first on both clients, once per episode");
  // Server 1 embed + pass_md5, Server 2 embed + pass_md5: four requests, all
  // on the attempt that passed, with no second round of refusals.
  ok(gets.filter((c) => hasUserAgent(c.headers)).length === 4,
    "after that the passing Android-UA attempt is reused for every playmogo request");
}

async function openDefaultClientNeedsNoRetry() {
  const { rt, calls } = runtimeWith(() => false);
  const videos = await rt.extension.getVideoList(EPISODE);
  ok(videos.length === 2, "open playmogo -> two streams, got " + videos.length);
  ok(calls.every((c) => !c.dart), "the Dart client is not touched when the default client passes");
}

async function bothChallengedUsesHardenedWebView() {
  const { rt, webviewCalls } = runtimeWith(
    () => true,
    () => "https://xy987z.cloudatacdn.com/u5kjwebviewAbCdEfGhIj.mp4?token=t0k&expiry=1",
  );
  const videos = await rt.extension.getVideoList(EPISODE);
  ok(webviewCalls.length === 1, "WebView pass runs once and stops at the first stream");
  ok(videos.length === 1 && videos[0].headers.Referer === "https://playmogo.com/" && !hasUserAgent(videos[0].headers),
    "WebView stream carries only the embed Referer");
  const script = (webviewCalls[0] && webviewCalls[0].scripts[0]) || "";
  ok(/intent\|market\|android-app/.test(script), "WebView script refuses every intent:/market: navigation");
  ok(/shopee\|lazada\|tokopedia/.test(script), "WebView script refuses shop ad targets");
  ok(/locked=true/.test(script) && /a\.host!==location\.host/.test(script),
    "WebView script locks navigation to the player once the handshake markers show");
  ok(/HTMLAnchorElement\.prototype\.click/.test(script), "WebView script neutralises scripted anchor clicks");
  let syntaxOk = true;
  try {
    new Function(script); // eslint-disable-line no-new-func
  } catch (e) {
    syntaxOk = false;
  }
  ok(syntaxOk, "WebView script is valid JavaScript");
}

async function nothingPassesExplainsTheWayOut() {
  const { rt } = runtimeWith(() => true, () => "");
  let message = "";
  try {
    await rt.extension.getVideoList(EPISODE);
  } catch (e) {
    message = e.message;
  }
  ok(/dns\.adguard-dns\.com/.test(message) && /Tampilan Web/.test(message) && /FlareSolverr/.test(message),
    "the error card names DNS Pribadi, Tampilan Web and FlareSolverr: " + message.slice(0, 120));
}

async function main() {
  if (!fs.existsSync(BUILT)) {
    console.error("nekopoi-scenarios: build output missing, run `npm run build` first");
    process.exit(1);
  }
  const scenarios = {
    challengedDefaultClientFallsBackToDart,
    onlyAndroidUaPasses,
    openDefaultClientNeedsNoRetry,
    bothChallengedUsesHardenedWebView,
    nothingPassesExplainsTheWayOut,
  };
  for (const [name, run] of Object.entries(scenarios)) {
    const before = failures.length;
    try {
      await run();
    } catch (error) {
      failures.push(name + ": threw " + error.message);
    }
    console.log((failures.length === before ? "✔ " : "✖ ") + "nekopoi " + name);
  }
  if (failures.length) {
    for (const failure of failures) console.error("✖ " + failure);
    console.error("\n" + failures.length + " of " + checks + " Nekopoi scenario check(s) failed.");
    process.exit(1);
  }
  console.log(checks + " Nekopoi scenario check(s) passed.\n");
}

main();

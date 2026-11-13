// ---------------------------------------------------------------------------
// Tests for the shared helpers in src-shared/.
//
// These run without any extension: the build output does not exist yet at the
// time Fase 1 lands, and a broken helper is the most expensive bug in this repo
// (every source inherits it). The helpers under test are read straight from
// src-shared/ and evaluated in the same mock environment the harness uses.
// ---------------------------------------------------------------------------
"use strict";

const fs = require("fs");
const path = require("path");
const { ROOT } = require("./lib/sources");
const { Document } = require("./test-harness/runtime");
const nativeHelpers = require("./test-harness/native-helpers");
const { stripNonCode, FORBIDDEN_GLOBALS } = require("./validate");

// Match scripts/build.js: every src-shared/*.js, sorted by name, so a new
// shared file is picked up here automatically (no more hard-coded list to drift).
const SHARED_FILES = fs
  .readdirSync(path.join(ROOT, "src-shared"))
  .filter((f) => f.endsWith(".js"))
  .sort();

const failures = [];
let checks = 0;

function ok(condition, message) {
  checks++;
  if (!condition) failures.push(message);
}

function eq(actual, expected, message) {
  ok(
    actual === expected,
    `${message}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
  );
}

/** Load src-shared/ into one realm, exactly like a built extension. */
function loadShared() {
  const code = SHARED_FILES.map((file) =>
    fs.readFileSync(path.join(ROOT, "src-shared", file), "utf8"),
  ).join("\n");

  const names = [
    ...Object.keys(nativeHelpers),
    "Document",
    "MProvider",
    "Client",
    "SharedPreferences",
    "console",
    "encodeURIComponent",
    "decodeURIComponent",
  ];
  const values = {
    Document,
    MProvider: class {},
    Client: class {},
    SharedPreferences: class {
      get() {
        return "";
      }
    },
    console,
    encodeURIComponent,
    decodeURIComponent,
    ...nativeHelpers,
  };

  const factory = new Function(
    ...names,
    `${code}
     return {
       b64Decode, b64DecodeUtf8, utf8Decode, resolveUrl, hostOf, pathOf, toRelative,
       cleanText, decodeEntities, cleanTitle, cleanEpisodeName, qualityHeight,
       sortVideos, qualityLabel, lastPageNumber, hasNextPage, iframeSrc,
       resolutionOf, bloggerSources, youtubeEmbed, unwrapBloggerWrapper,
       unpackScripts, mergeHeaders, unsupportedReason, isSupportedHost,
       extractDesustream, extractIframeWrapper, extractAbyss, extractGdplayer,
       extractStreampoi, extractDoodJs, streampoiQuality,
       cryptBytesOf, cryptStrOf, cryptHex, cryptSha256Hex, cryptHmacSha256,
       cryptPbkdf2Sha256, cryptAesCbcDecrypt,
       gdUnseal, gdConfigOf, aaConfigValue, aaDecodeConfig
     };`,
  );
  return factory(...names.map((name) => values[name]));
}

function testBase64(api) {
  const pairs = [
    ["SGVsbG8=", "Hello"],
    ["SGVsbG8sIEluZG9uZXNpYQ==", "Hello, Indonesia"],
    ["4oCT", "–"],
  ];
  for (const [encoded, decoded] of pairs) {
    eq(api.b64DecodeUtf8(encoded), decoded, `b64DecodeUtf8(${encoded})`);
  }
  eq(api.b64Decode("SGVsbG8"), "Hello", "b64Decode tolerates missing padding");
}

function testUrls(api) {
  eq(api.resolveUrl("https://a.test", "/x/y"), "https://a.test/x/y", "resolveUrl path");
  eq(api.resolveUrl("https://a.test/", "x"), "https://a.test/x", "resolveUrl bare segment");
  eq(api.resolveUrl("https://a.test", "https://b.test/z"), "https://b.test/z", "resolveUrl absolute");
  eq(api.hostOf("https://www.Samehada.com/x"), "samehada.com", "hostOf strips www and lowercases");
  eq(api.pathOf("https://a.test/x?y=1#z"), "/x?y=1", "pathOf keeps query, drops fragment");

  eq(api.toRelative("https://a.test/ongoing/", "https://a.test"), "/ongoing/", "toRelative same host");
  eq(
    api.toRelative("https://cdn.test/v.mp4", "https://a.test"),
    "https://cdn.test/v.mp4",
    "toRelative keeps other hosts absolute",
  );
}

function testText(api) {
  eq(
    api.cleanTitle("Nonton One Piece Sub Indo - Streaming"),
    "One Piece",
    "cleanTitle strips noise",
  );
  eq(api.cleanTitle("Solo Leveling"), "Solo Leveling", "cleanTitle keeps plain titles");
  eq(
    api.cleanEpisodeName("One Piece Episode 1080 Sub Indo", "One Piece"),
    "Episode 1080",
    "cleanEpisodeName removes the series prefix",
  );
  eq(api.decodeEntities("A &amp; B &#8211; C"), "A & B – C", "decodeEntities named + numeric");

  eq(api.qualityHeight("720p"), 720, "qualityHeight");
  eq(api.qualityHeight("unknown"), 0, "qualityHeight unknown");
  eq(api.resolutionOf("Mp4Upload - 360p "), "360p", "resolutionOf trims extractor labels");
  eq(api.resolutionOf("Unknown resolution"), "", "resolutionOf without a number");

  eq(
    api.qualityLabel("720p", "Mp4Upload", "Hardsub ID"),
    "720p · Hardsub ID · Mp4Upload",
    "qualityLabel order is quality · note · server",
  );
  eq(api.qualityLabel("", "", ""), "Default", "qualityLabel fallback");
}

function testSorting(api) {
  const videos = [
    { quality: "360p", server: "DoodStream" },
    { quality: "720p", server: "Mp4Upload" },
    { quality: "1080p", server: "Filedon" },
    { quality: "480p", server: "Mp4Upload" },
  ];
  const sorted = api.sortVideos(videos, ["1080p", "720p"], ["mp4upload"]);
  eq(
    sorted.map((v) => v.quality).join(","),
    "1080p,720p,480p,360p",
    "sortVideos prefers listed qualities, then resolution",
  );

  const withServerPreference = api.sortVideos(
    [
      { quality: "720p", server: "Other" },
      { quality: "720p", server: "Mp4Upload" },
    ],
    ["720p"],
    ["mp4upload"],
  );
  eq(
    withServerPreference[0].server,
    "Mp4Upload",
    "sortVideos breaks quality ties by preferred server",
  );

  // "odstream" is a prefix of "odstreamhd"; the shorter name must not borrow
  // the longer one's rank just because it is listed first.
  const prefixed = api.sortVideos(
    [
      { quality: "720p", server: "odstream" },
      { quality: "720p", server: "odstreamhd" },
      { quality: "720p", server: "vidhide" },
    ],
    ["720p"],
    ["vidhide", "odstream", "odstreamhd"],
  );
  eq(
    prefixed.map((v) => v.server).join(","),
    "vidhide,odstream,odstreamhd",
    "sortVideos ranks an exact server name before a prefix match",
  );

  // A server the user did not select must never outrank one they did, even
  // when its name contains the selected one ("odstreamhd" vs "odstream").
  const unselected = api.sortVideos(
    [
      { quality: "720p", server: "odstreamhd" },
      { quality: "720p", server: "odstream" },
    ],
    ["720p"],
    ["odstream"],
  );
  eq(
    unselected[0].server,
    "odstream",
    "sortVideos keeps an unselected prefix match behind the selected server",
  );
}

function testPagination(api) {
  const doc = new Document(
    '<div class="pagination"><span class="page-numbers current">1</span>' +
      '<a class="page-numbers" href="/ongoing-anime/page/2/">2</a>' +
      '<a class="page-numbers" href="/ongoing-anime/page/12/">12</a></div>',
  );
  eq(api.lastPageNumber(doc, ["div.pagination a.page-numbers"]), 12, "lastPageNumber");

  const none = new Document('<div class="pagination"><span>1</span></div>');
  eq(api.lastPageNumber(none, ["div.pagination a.page-numbers"]), 0, "lastPageNumber absent");

  const next = new Document(
    '<div class="pagination"><a class="next page-numbers" href="/x/page/2/">Berikutnya</a></div>',
  );
  eq(
    api.hasNextPage(next, ["div.pagination a.next.page-numbers"]),
    true,
    "hasNextPage sees a real next link",
  );

  // A missed selector returns the null-element wrapper, whose class, text and
  // href are all "". That is not a next control; treating it as one makes an
  // out-of-range page report hasNextPage forever.
  eq(
    api.hasNextPage(none, ["div.pagination a.next.page-numbers"]),
    false,
    "hasNextPage ignores the null element a missed selector returns",
  );
}

function testExtractors(api) {
  // Blogger's shell escapes every quote and `=` inside the data attribute.
  const blogger =
    '<c-wiz jsdata="deferred-i1" data-p="%.@.&quot;https://www.blogger.com/video.g?token\\u003dABC&quot;,' +
    '[&quot;https://rr3---sn.googlevideo.com/videoplayback?expire\\u003d1\\u0026itag\\u003d18\\u0026id\\u003dabc&quot;,' +
    '[18]]&quot;">';
  const sources = api.bloggerSources(blogger);
  eq(sources.length, 1, "bloggerSources finds the videoplayback URL");
  eq(
    sources[0].url,
    "https://rr3---sn.googlevideo.com/videoplayback?expire=1&itag=18&id=abc",
    "bloggerSources unescapes \\u003d and \\u0026",
  );
  eq(sources[0].quality, "360p", "bloggerSources labels itag 18 as 360p");

  eq(api.youtubeEmbed("yt:abc123def45"), "https://www.youtube-nocookie.com/embed/abc123def45", "youtubeEmbed yt:");
  eq(
    api.youtubeEmbed("https://youtu.be/abc123def45?t=1"),
    "https://www.youtube-nocookie.com/embed/abc123def45",
    "youtubeEmbed short URL",
  );
  eq(api.youtubeEmbed("https://example.com/x"), "", "youtubeEmbed ignores other hosts");

  eq(
    api.unwrapBloggerWrapper("https://x.blogspot.com/?combinedurl=https%3A%2F%2Fa.b%2Fv.mp4%7Csub"),
    "https://a.b/v.mp4",
    "unwrapBloggerWrapper takes the first combinedurl part",
  );

  const merged = api.mergeHeaders({ "User-Agent": "ua", Referer: "r" }, { Referer: "", "X-Test": "1" });
  eq(JSON.stringify(merged), JSON.stringify({ "User-Agent": "ua", Referer: "r", "X-Test": "1" }),
    "mergeHeaders keeps base values and ignores empty overrides");

  ok(
    api.isSupportedHost("https://www.mp4upload.com/embed-abc.html"),
    "isSupportedHost knows mp4upload",
  );
  ok(
    api.isSupportedHost("https://player.abyssplayer.com/x"),
    "isSupportedHost now knows abyssplayer",
  );
  ok(
    !api.isSupportedHost("https://unknown.example/e/1"),
    "isSupportedHost rejects unknown hosts",
  );
  eq(
    api.unsupportedReason("https://player.abyssplayer.com/x"),
    "",
    "abyssplayer is no longer an unsupported host",
  );
  eq(
    api.unsupportedReason("https://www.dailymotion.com/video/x"),
    "video dihapus",
    "unsupportedReason still names a dead host",
  );
}

function testUnpack(api) {
  // Minimal Dean Edwards packer: the decoder maps tokens back through `k`.
  const packed =
    "eval(function(p,a,c,k,e,d){e=function(c){return c};if(!''.replace(/^/,String))" +
    "{while(c--)d[e(c)]=k[c]||e(c);k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1;}" +
    ";while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c]);return p}" +
    "('var x=\"<script>file:\\'0\\'</script>\";',1,1,'https://cdn.test/v.m3u8'.split('|'),0,{}))";
  const combined = api.unpackScripts(packed);
  ok(
    combined.indexOf("https://cdn.test/v.m3u8") !== -1,
    "unpackScripts appends the unpacked source (native unpackJs bridge)",
  );
}

/**
 * Known-answer vectors for the encrypted-player family. Every value here was
 * produced by Node's own crypto module, so a regression in the hand-rolled
 * SHA-256 / HMAC / PBKDF2 / AES-CBC shows up as a diff, not as a dead source.
 */
function testCrypto(api) {
  eq(
    api.cryptSha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "sha256 of empty input",
  );
  eq(
    api.cryptSha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    "sha256 of abc",
  );
  eq(
    api.cryptSha256Hex("The bench is lit, Vietnam Number One."),
    "40b83de8889b38d9c43cf90048003229650ac39689f20ba68f6b61967fd66af5",
    "sha256 of a longer ascii string",
  );

  eq(
    api.cryptHex(api.cryptHmacSha256("key", "The quick brown fox jumps over the lazy dog")),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    "hmac-sha256 (rfc 4231 test case 1)",
  );
  eq(
    api.cryptHex(api.cryptHmacSha256("bench-secret", Array(101).join("A"))),
    "390e1fec432cd36e4d3b834d706d9e38f58354d338d769068dc7a59439e6dbce",
    "hmac-sha256 with a multi-block message",
  );

  eq(
    api.cryptHex(api.cryptPbkdf2Sha256("password", "salt", 1, 32)),
    "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b",
    "pbkdf2-sha256 iterations=1",
  );
  eq(
    api.cryptHex(api.cryptPbkdf2Sha256("pw", "s", 2, 32)),
    "1303d8cfaacdfe5e8aa6e2017b814587b7c031c506fcf97d29a74f0d48ab2957",
    "pbkdf2-sha256 iterations=2",
  );
  eq(
    api.cryptHex(api.cryptPbkdf2Sha256("gdplayer", "saltysaltysalty1", 10000, 48)),
    "1515c6665d04ac731d8e0e313e4904de14a4de83b610f5fe81901f8345cfdef3" +
      "86dd3cf6718fa56dc37ebe8040494720",
    "pbkdf2-sha256 dkLen=48 spans two blocks",
  );

  // AES-CBC round trip through a vector generated with the same key/iv in Node.
  const key = api.cryptStrOf(new Array(32).fill(7));
  const iv = api.cryptStrOf(new Array(16).fill(9));
  const cipher =
    "YNvPY+PpRUIzU8SYJ/uaIJaWwMpsQUzDq92G8ff4/WZBZCzgIw/af6HueTF1yZTV";
  eq(
    api.cryptAesCbcDecrypt(key, iv, api.b64Decode(cipher)),
    "AES-CBC known answer vector, bench side.",
    "aes-256-cbc decrypt + pkcs7 strip",
  );
  let threw = false;
  try {
    api.cryptAesCbcDecrypt(key, iv, api.b64Decode(cipher).slice(0, 16));
  } catch (error) {
    threw = true;
  }
  ok(threw, "aes-256-cbc rejects a bad pkcs7 pad");
}

function testGdplayerDecode(api) {
  // The shipped decoder must agree with the reference implementation used during
  // the reverse engineering: same config text, same key values, same plaintext.
  const packedConfig =
    'var a="";var localKey="b57ffcab4bf52759abc3747f4e8581f0";' +
    'var apx="aHR0cHM6Ly9nZHBsYXllci50by9hcGktY29uZmlnLw==";' +
    'var __ts="1794467904";var __nc="d2ad0287af55cba3e275f9e4ce524959";' +
    'var __sg="cced3340071d84ab30b7a40e1a6382f4497f7c4ff7016f30120ab784da6e6597";' +
    'var kaken="a25aekc0";';
  eq(
    api.aaConfigValue(packedConfig, "apx"),
    "aHR0cHM6Ly9nZHBsYXllci50by9hcGktY29uZmlnLw==",
    "aaConfigValue reads apx",
  );
  eq(api.aaConfigValue(packedConfig, "__nc"), "d2ad0287af55cba3e275f9e4ce524959", "aaConfigValue reads __nc");
  eq(api.aaConfigValue(packedConfig, "missing"), "", "aaConfigValue returns empty for a missing key");

  // A JSON payload passes through unsealed (the player sometimes answers plain).
  const plain = '{"status":"ok","message":"Success"}';
  eq(api.gdUnseal(plain, "1", "2"), plain, "gdUnseal passes plain JSON through");
  eq(api.gdUnseal("", "1", "2"), "", "gdUnseal on empty input");
}

/**
 * End-to-end check of the gdplayer chain with no network: the embed HTML, the
 * api payload and the mp4upload page are all fixtures captured from a live
 * episode, so a shape change on either side fails here first.
 */
async function testGdplayerOffline(api) {
  const payload = require("./test-harness/fixtures/gdplayer/api-payload.json");
  const plain = api.gdUnseal(payload.body, payload.ts, payload.nc);
  const data = JSON.parse(plain);
  eq(data.status, "ok", "gdplayer payload decrypts to a successful body");
  eq(data.query.host, "mp4upload", "gdplayer payload names the backing host");

  const videos = await api.extractGdplayer(
    {
      headersFor: () => ({ "User-Agent": "test" }),
      getHeaders: () => ({ "User-Agent": "test" }),
      fetch(url) {
        if (url.indexOf("mp4upload.com/embed-") !== -1) return Promise.resolve(payload.mp4upload);
        return Promise.resolve(payload.embed);
      },
      post() {
        return Promise.resolve({ statusCode: 200, body: payload.body });
      },
    },
    payload.embedUrl,
    payload.referer,
  );
  ok(videos.length > 0, "extractGdplayer resolves at least one source offline");
  ok(
    /^https:\/\/a4\.mp4upload\.com:183\/d\/[A-Za-z0-9]+\/video\.mp4$/.test(videos[0].url),
    "extractGdplayer returns the direct mp4upload cdn url",
  );
  eq(videos[0].headers.Referer, "https://www.mp4upload.com/", "extractGdplayer keeps the mp4upload referer");
  eq(videos[0].quality, "720p", "extractGdplayer reports the resolution from the payload title");
}

function testPageHelpers(api) {
  const html = '<iframe width="1" src="https://desustream.net/dstream/odcdn/?id=1"></iframe>';
  eq(
    api.iframeSrc(html),
    "https://desustream.net/dstream/odcdn/?id=1",
    "iframeSrc reads src",
  );
  const empty = new Document("<div></div>");
  eq(api.iframeSrc(""), "", "iframeSrc on empty input");
  eq(empty.select("a").length, 0, "Document.select on empty document");
}

async function testHostExtractors(api) {
  // Minimal provider: the host extractors only use fetch() and headersFor().
  function providerFor(pages) {
    return {
      pages,
      calls: [],
      headersFor() {
        return { "User-Agent": "ua" };
      },
      userAgent() {
        return "ua";
      },
      async fetch(url) {
        this.calls.push(url);
        return Object.prototype.hasOwnProperty.call(pages, url) ? pages[url] : "";
      },
    };
  }

  const desudrive = providerFor({
    "https://desudrive.com/stream/x.php":
      '<script>otakudesu(\'{"file":"https://cdn.test/a.mp4"}\');</script>',
  });
  const videos = await api.extractDesustream(
    desudrive,
    "https://desudrive.com/stream/x.php",
    "",
    "720p",
  );
  eq(videos.length, 1, "extractDesustream reads a quoted JSON key");
  eq(videos[0].url, "https://cdn.test/a.mp4", "extractDesustream takes the file URL");

  // No file id -> 403, so the mirror must report nothing rather than a dead link.
  const dead = providerFor({
    "https://desudrive.com/stream/d.php":
      '<script>otakudesu(\'{"file":"https://www.googleapis.com/drive/v3/files/?alt=media&key=k"}\');</script>',
  });
  eq(
    (await api.extractDesustream(dead, "https://desudrive.com/stream/d.php", "", "")).length,
    0,
    "extractDesustream rejects the id-less Google Drive URL",
  );

  // A wrapper page delegates to the extractor for the host inside it. The inner
  // host here is desustream rather than yourupload: only local extractors exist
  // in this realm, and the point is that the wrapper hands off at all.
  const wrapper = providerFor({
    "https://desudrive.com/stream/w.php":
      '<iframe src="https://desustream.net/dstream/odcdn/?id=abc"></iframe>',
    "https://desustream.net/dstream/odcdn/?id=abc":
      '<script>var videoURL = "https://cdn.test/yu.mp4";</script>',
  });
  const inner = await api.extractIframeWrapper(
    wrapper,
    "https://desudrive.com/stream/w.php",
    "",
    "480p",
    0,
  );
  eq(inner.length, 1, "extractIframeWrapper follows the iframe to the inner host");
  eq(inner[0].url, "https://cdn.test/yu.mp4", "extractIframeWrapper returns the inner stream");
  ok(
    wrapper.calls.indexOf("https://desustream.net/dstream/odcdn/?id=abc") !== -1,
    "extractIframeWrapper fetched the inner embed",
  );

  // A wrapper that points at itself must stop instead of looping.
  const selfRef = providerFor({
    "https://desudrive.com/stream/s.php":
      '<iframe src="https://desudrive.com/stream/s.php"></iframe>',
  });
  eq(
    (await api.extractIframeWrapper(
      selfRef,
      "https://desudrive.com/stream/s.php",
      "",
      "",
      0,
    )).length,
    0,
    "extractIframeWrapper ignores a self-referencing iframe",
  );

  // dstream/updesu pages carry no file at all, only an iframe to a Blogger
  // shell; extractDesustream must follow it instead of reporting a dead mirror.
  const updesu = providerFor({
    "https://desustream.net/dstream/updesu/v5/index.php?id=abc":
      '<iframe src="https://www.blogger.com/video.g?token=t"></iframe>',
    "https://www.blogger.com/video.g?token=t":
      '<script>"streams":[{"play_url":"https:\\/\\/rr1---sn-x.googlevideo.com\\/videoplayback?itag=18"}]</script>',
  });
  const followed = await api.extractDesustream(
    updesu,
    "https://desustream.net/dstream/updesu/v5/index.php?id=abc",
    "",
    "480p",
    0,
  );
  eq(followed.length, 1, "extractDesustream follows an iframe-only shell");
  ok(
    followed[0].url.indexOf("googlevideo.com/videoplayback") !== -1,
    "extractDesustream returns the stream behind the iframe",
  );
  eq(
    followed[0].quality,
    "360p · Blogger",
    "extractDesustream keeps the Blogger itag=18 quality",
  );

  // streampoi: one HLS master on the streamruby CDN. When the master can be
  // read, every rendition becomes its own entry, highest first.
  const streampoi = providerFor({
    "https://streampoi.com/embed-abc.html":
      'jwplayer("v").setup({sources:[{file:"https:\\/\\/x.streamruby.net\\/hls2\\/01\\/1\\/k_,l,n,h,.urlset\\/master.m3u8?t=a"}],' +
      ' qualityLabels:{"548":"720p","528":"480p","337":"360p"}});',
    "https://x.streamruby.net/hls2/01/1/k_,l,n,h,.urlset/master.m3u8?t=a":
      "#EXTM3U\n" +
      "#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360\n360/index.m3u8\n" +
      "#EXT-X-STREAM-INF:BANDWIDTH=2,RESOLUTION=1280x720\n720/index.m3u8\n",
  });
  const renditions = await api.extractStreampoi(
    streampoi,
    "https://streampoi.com/embed-abc.html",
    "",
    "Sub Indo",
  );
  eq(renditions.length, 2, "extractStreampoi expands the master playlist");
  eq(
    renditions[0].url,
    "https://x.streamruby.net/hls2/01/1/k_,l,n,h,.urlset/720/index.m3u8",
    "extractStreampoi resolves a rendition against the master's folder",
  );
  eq(renditions[0].quality, "720p", "extractStreampoi labels renditions by height");
  eq(renditions[1].quality, "360p", "extractStreampoi lists the lowest rendition last");

  // The CDN refuses the playlist but the page still says what the master holds,
  // so the master is returned labelled with the best named rendition.
  const noMaster = providerFor({
    "https://streampoi.com/embed-xyz.html":
      'setup({sources:[{file:"https://x.streamruby.net/hls2/02/master.m3u8"}],' +
      " qualityLabels':{\"1699\":\"1080p (1700 kbps)\",\"528\":\"480p (529 kbps)\"}});",
  });
  const fallback = await api.extractStreampoi(
    noMaster,
    "https://streampoi.com/embed-xyz.html",
    "",
    "Sub Indo",
  );
  eq(fallback.length, 1, "extractStreampoi falls back to the bare master");
  eq(fallback[0].url, "https://x.streamruby.net/hls2/02/master.m3u8", "extractStreampoi keeps the master URL");
  eq(fallback[0].quality, "1080p", "extractStreampoi reads the best qualityLabels entry");

  // No stream at all -> nothing, never a dead entry.
  eq(
    (await api.extractStreampoi(
      providerFor({ "https://streampoi.com/embed-dead.html": "<html>404</html>" }),
      "https://streampoi.com/embed-dead.html",
      "",
      "",
    )).length,
    0,
    "extractStreampoi reports nothing when the embed has no source",
  );
  eq(api.streampoiQuality("<html>no labels</html>"), "", "streampoiQuality on a page without labels");

  // playmogo/plamogo is the DoodStream clone behind Nekopoi's stream 1 and 2:
  // `/pass_md5/` names the CDN prefix, `token=` is appended to a random name.
  const dood = providerFor({
    "https://plamogo.com/e/abc": 'var url = "/pass_md5/abc/def123"; var t = "token=ghi456";',
    "https://plamogo.com/pass_md5/abc/def123": "https://cdn.test/dood/",
  });
  const doodVideos = await api.extractDoodJs(dood, "https://plamogo.com/e/abc", "", "720p");
  eq(doodVideos.length, 1, "extractDoodJs completes the pass_md5 handshake");
  ok(
    doodVideos[0].url.indexOf("https://cdn.test/dood/") === 0 &&
      doodVideos[0].url.indexOf(".mp4?token=ghi456&expiry=") !== -1,
    "extractDoodJs appends a random name and the token",
  );
  eq(doodVideos[0].quality, "720p", "extractDoodJs keeps the site quality");
  eq(
    doodVideos[0].headers.Referer,
    "https://plamogo.com/",
    "extractDoodJs sends the host root as Referer",
  );
  eq(
    (await api.extractDoodJs(
      providerFor({ "https://plamogo.com/e/none": "<html>no pass</html>" }),
      "https://plamogo.com/e/none",
      "",
      "",
    )).length,
    0,
    "extractDoodJs reports nothing without a pass_md5 path",
  );
}

function testForbiddenGlobals() {
  function hits(code) {
    const stripped = stripNonCode(code);
    return FORBIDDEN_GLOBALS.filter(([pattern]) => pattern.test(stripped));
  }
  const cases = [
    ["await fetch(url)", true],
    ["await this.fetch(url)", false],
    ["async fetch(url, headers) {", false],
    ["// fetch( is banned", false],
    ['const s = "fetch(x)";', false],
    ["JSON.parse(atob(x))", true],
    ['el.attr("data-src")', false],
    ["new URL(x)", true],
    ["new TextDecoder().decode(x)", true],
    ['headers["X-Requested-With"] = "XMLHttpRequest";', false],
    ["var re = /fetch\\(/;", false],
    ["var a = b / c; var d = fetch(x);", true],
    ["process.env", true],
  ];
  for (const [code, expect] of cases) {
    ok(hits(code).length > 0 === expect, `forbidden-global scan of ${JSON.stringify(code)}`);
  }
}

async function main() {
  const api = loadShared();
  const groups = {
    base64: () => testBase64(api),
    urls: () => testUrls(api),
    text: () => testText(api),
    sorting: () => testSorting(api),
    pagination: () => testPagination(api),
    extractors: () => testExtractors(api),
    hostExtractors: () => testHostExtractors(api),
    unpack: () => testUnpack(api),
    pageHelpers: () => testPageHelpers(api),
    crypto: () => testCrypto(api),
    gdplayerDecode: () => testGdplayerDecode(api),
    gdplayerOffline: () => testGdplayerOffline(api),
    forbiddenGlobals: () => testForbiddenGlobals(),
  };

  for (const [name, run] of Object.entries(groups)) {
    const before = failures.length;
    try {
      await run();
    } catch (error) {
      failures.push(`${name}: threw ${error.message}`);
    }
    if (failures.length === before) console.log(`✔ ${name}`);
    else console.log(`✖ ${name}`);
  }

  console.log("");
  if (failures.length) {
    for (const failure of failures) console.error(`✖ ${failure}`);
    console.error(`\n${failures.length} of ${checks} shared-helper check(s) failed.`);
    process.exit(1);
  }
  console.log(`${checks} shared-helper check(s) passed.`);
}

main();

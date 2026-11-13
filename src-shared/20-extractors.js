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

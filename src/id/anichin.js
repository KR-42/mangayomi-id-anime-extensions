// Anichin (https://anichin.moe) — donghua (Chinese animation) only.
//
// anichin.care calls itself the official gateway and points to anichin.moe as
// the main site. anichin.help is a different site (a copy of AnimeXin's "AX"
// uploads on gomunime.top's build) and is not used here.
//
// WordPress, theme "animestream" (Themesia):
//   - catalogue /anime/?order=&status=&type=&genre[]=, paginated with &page=N
//     and a "Selanjutnya" (div.hpage a.r) link; search ?s= and /genres/<slug>/
//     paginate as /page/N/ with .pagination a.next.
//   - series /<slug>/, episodes /<slug>-episode-N-subtitle-indonesia/.
//   - an episode page lists servers in select.mirror; each option value is a
//     base64 <iframe>.
//
// Servers used: OK.ru (read from the embed's public data-options, which lists
// one .mp4 per quality up to 1080p; the app's own okruExtractor only reads
// `ondemandHls`, which these videos do not have), Abyss ("New Player"), VidHide
// and DoodStream. Odysee (401 without the player's auth), Dailymotion (manifest
// 403), Rumble (blocked by Indonesian ISPs) and Mega are skipped.

const mangayomiSources = [{
  "name": "Anichin (Donghua)",
  "lang": "id",
  "baseUrl": "https://anichin.moe",
  "apiUrl": "",
  "iconUrl": "icons/anichin.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.0",
  "pkgPath": "anime/src/id/anichin.js",
  "hasCloudflare": true,
  "notes": "Khusus donghua (animasi China) subtitle Indonesia. Video dari OK.ru (sampai 1080p) dan server cadangan (Abyss, VidHide, DoodStream); bisa diunduh lewat tombol unduh Mangayomi. Domain bisa berpindah: alamat terbaru diumumkan di anichin.care, lalu atur di Pengaturan sumber."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const ANICHIN_GENRES = [
  ["Action", "action"], ["Adventure", "adventure"], ["Blood", "blood"], ["Comedy", "comedy"],
  ["Crossdressing", "crossdressing"], ["Cultivation", "cultivation"], ["Demons", "demons"],
  ["Drama", "drama"], ["Ecchi", "ecchi"], ["Fantasy", "fantasy"], ["Friendship", "friendship"],
  ["Game", "game"], ["Gore", "gore"], ["Gourmet", "gourmet"], ["Guoman", "guoman"],
  ["Harem", "harem"], ["Historical", "historical"], ["Horror", "horror"], ["Isekai", "isekai"],
  ["Life", "life"], ["Magic", "magic"], ["Martial Arts", "martial-arts"], ["Mecha", "mecha"],
  ["Military", "military"], ["Music", "music"], ["Mystery", "mystery"],
  ["Psychological", "psychological"], ["Reincarnation", "reincarnation"], ["Romance", "romance"],
  ["School", "school"], ["Sci-fi", "sci-fi"], ["Shoujo", "shoujo"], ["Shounen", "shounen"],
  ["Slice of Life", "slice-of-life"], ["Space", "space"], ["Sports", "sports"],
  ["Super Power", "super-power"], ["Supernatural", "supernatural"], ["Suspense", "suspense"],
  ["Thriller", "thriller"], ["Time Travel", "time-travel"], ["Urban Fantasy", "urban-fantasy"],
  ["Vampire", "vampire"], ["Video Game", "video-game"], ["Youth", "youth"],
];
const ANICHIN_ORDERS = [["Baru diperbarui", "update"], ["Terpopuler", "popular"],
  ["Baru ditambahkan", "latest"], ["Rating tertinggi", "rating"], ["Judul A-Z", "title"], ["Judul Z-A", "titlereverse"]];
const ANICHIN_STATUS = [["Semua", ""], ["Ongoing", "ongoing"], ["Completed", "completed"],
  ["Upcoming", "upcoming"], ["Hiatus", "hiatus"]];
const ANICHIN_TYPES = [["Semua", ""], ["Donghua", "donghua"], ["TV", "tv"], ["ONA", "ona"],
  ["Movie", "movie"], ["Special", "special"], ["OVA", "ova"]];
const ANICHIN_SERVERS = ["OK.ru", "Abyss", "VidHide", "DoodStream"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://anichin.moe");
  }

  get supportsLatest() {
    return true;
  }

  /** A refusal throws, so it reaches the app's error card instead of a blank. */
  async pageDoc(url) {
    const res = await this.client.get(url, this.getHeaders(url));
    const challenged = res && res.headers && res.headers["cf-mitigated"];
    if (res && (res.statusCode === 403 || challenged)) {
      throw new Error("Situs menolak permintaan (HTTP " + res.statusCode +
        "). Buka WebView lalu coba lagi.");
    }
    if (!res || !res.body || res.statusCode >= 400) {
      console.log("anichin: gagal memuat " + url);
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
    const n = Math.max(1, parseInt(page, 10) || 1);
    const text = cleanText(query);
    if (text) {
      return this.listing((n === 1 ? "/" : "/page/" + n + "/") + "?s=" + encodeQuery(text));
    }
    return this.catalogue(anichinSelected(filters), page);
  }

  /** /anime/ takes its filters as query parameters and paginates with &page=N. */
  async catalogue(params, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const query = [];
    ["status", "type", "order"].forEach(function (key) {
      if (params[key]) query.push(key + "=" + encodeQuery(params[key]));
    });
    if (params.genre) query.push("genre%5B%5D=" + encodeQuery(params.genre));
    if (n > 1) query.push("page=" + n);
    return this.listing("/anime/?" + query.join("&"));
  }

  async listing(path) {
    const doc = await this.pageDoc(this.resolve(path));
    if (!doc) return this.emptyPage();
    const cards = doc.select("div.listupd article.bs div.bsx > a[href]") || [];
    const list = [];
    const seen = {};
    for (let i = 0; i < cards.length; i++) {
      const href = cards[i].attr("href") || cards[i].getHref;
      if (!href || seen[href]) continue;
      seen[href] = true;
      const title = cards[i].selectFirst("h2[itemprop=headline]");
      const img = cards[i].selectFirst("img");
      list.push(this.item(
        cleanTitle(decodeEntities((title && title.text) || cards[i].attr("title"))),
        this.absolute(img.attr("data-src") || img.attr("src")),
        href,
      ));
    }
    const next = doc.selectFirst("div.hpage a.r[href]") || doc.selectFirst(".pagination a.next[href]");
    return { list: list, hasNextPage: !!(next && next.attr("href")) };
  }

  absolute(src) {
    return src ? this.resolve(decodeEntities(src)) : "";
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    const seriesUrl = await this.seriesUrlOf(this.resolve(url));
    const doc = seriesUrl ? await this.pageDoc(seriesUrl) : null;
    if (!doc) return empty;

    const name = cleanTitle(doc.selectFirst("h1.entry-title").text);
    if (!name) {
      console.log("anichin: detail tidak ditemukan: " + seriesUrl);
      return empty;
    }
    const info = {};
    const rows = doc.select("div.info-content div.spe span") || [];
    for (let i = 0; i < rows.length; i++) {
      const match = /^([^:]+):\s*([\s\S]*)$/.exec(cleanText(rows[i].text));
      if (match) info[match[1].trim().toLowerCase()] = match[2].trim();
    }
    const genres = [];
    (doc.select("div.genxed a") || []).forEach(function (a) {
      const g = cleanText(a.text);
      if (g && genres.indexOf(g) === -1) genres.push(g);
    });
    const detail = {
      name: name,
      imageUrl: this.absolute(doc.selectFirst("div.thumb img").attr("src")),
      link: this.relativize(seriesUrl),
      description: cleanText(decodeEntities(doc.selectFirst("div.entry-content[itemprop=description]").text)),
      author: info.studio || "",
      artist: "",
      genre: genres,
      episodes: this.episodesOf(doc),
    };
    if (/ongoing/i.test(info.status)) detail.status = 0;
    else if (/completed/i.test(info.status)) detail.status = 1;
    else if (/hiatus/i.test(info.status)) detail.status = 2;
    return detail;
  }

  /** A series URL as given; an episode URL resolved through its "Semua Episode" link. */
  async seriesUrlOf(url) {
    if (!/-episode-/i.test(pathOf(url))) return url;
    const episode = await this.pageDoc(url);
    if (!episode) return "";
    const anchor = episode.selectFirst("div.nvs.nvsc a[href]") || episode.selectFirst("span.year a[href]");
    const href = anchor.attr("href") || anchor.getHref;
    if (href) return this.resolve(href);
    console.log("anichin: tautan seri tidak ditemukan di " + url);
    return "";
  }

  /** The site lists episodes newest first, the order the app shows. */
  episodesOf(doc) {
    const anchors = doc.select("div.eplister ul li a[href]") || [];
    const seen = {};
    const out = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href") || anchors[i].getHref;
      if (!href) continue;
      const link = this.relativize(this.resolve(href));
      if (seen[link]) continue;
      seen[link] = true;
      const num = cleanText(anchors[i].selectFirst("div.epl-num").text);
      const title = cleanText(anchors[i].selectFirst("div.epl-title").text);
      const time = Date.parse(cleanText(anchors[i].selectFirst("div.epl-date").text));
      out.push({
        name: /^\d+(\.\d+)?$/.test(num) ? "Episode " + num : title || num || "Episode",
        url: link,
        dateUpload: isNaN(time) ? "" : String(time),
        scanlator: "",
      });
    }
    return out;
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const pageUrl = this.resolve(url);
    const doc = await this.pageDoc(pageUrl);
    if (!doc) return [];

    const embeds = anichinEmbeds(doc, this);
    const results = [];
    const tried = [];
    // DoodStream goes last and only runs when nothing else played: from
    // Indonesia its host usually answers with a Cloudflare challenge.
    const ordered = embeds.filter(function (e) { return e.server !== "DoodStream"; })
      .concat(embeds.filter(function (e) { return e.server === "DoodStream"; }));
    for (let i = 0; i < ordered.length; i++) {
      const embed = ordered[i];
      if (embed.server === "DoodStream" && results.length) continue;
      tried.push(embed.server);
      let videos = [];
      if (embed.server === "OK.ru") {
        videos = await this.okru(embed.url);
      } else if (isSupportedHost(embed.url)) {
        videos = (await extractByHost(this, embed.url, pageUrl, "", "Hardsub ID")).videos;
      }
      for (let v = 0; v < videos.length; v++) {
        const video = videos[v];
        video.server = embed.server;
        video.quality = qualityLabel(resolutionOf(video.quality), embed.server, "Sub Indo");
        video.url = anichinDownloadableAbyss(video.url);
        results.push(video);
      }
      if (!videos.length) console.log("anichin: " + embed.server + " tidak menghasilkan stream");
    }
    if (!results.length) {
      throw new Error("Anichin: tidak ada server yang bisa diputar" +
        (tried.length ? " (" + tried.join(", ") + ")" : "") + ".");
    }
    const self = this;
    await this.mapLimit(results, 3, function (video) {
      return self.followAbyssRedirect(video);
    });
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /**
   * OK.ru's embed page carries its player config in `data-options`: a JSON
   * object whose flashvars.metadata (itself JSON) lists one .mp4 per quality.
   * This is the public data the OK.ru player reads. The files have no
   * extension in their path (`https://<host>/?expires=...`), so each gets an
   * originalUrl ending in .mp4: Mangayomi downloads `url` when `url` or
   * `originalUrl` looks like a video file, and reads originalUrl only for local
   * playback, so that address is a hint and is never fetched.
   */
  async okru(embedUrl) {
    const url = /^\/\//.test(embedUrl) ? "https:" + embedUrl : embedUrl;
    let html = "";
    try {
      html = await this.fetch(url, this.headersFor(this.getBaseUrl() + "/"));
    } catch (e) {
      console.log("anichin: OK.ru gagal dimuat: " + e);
      return [];
    }
    const videos = okruVideos(html);
    const headers = this.headersFor("https://ok.ru/");
    return videos.map(function (v) {
      return {
        url: v.url,
        originalUrl: safeString(v.url).replace(/[?#].*$/, "").replace(/\/+$/, "") + "/anichin-" + v.quality + ".mp4",
        quality: v.quality,
        headers: headers,
      };
    });
  }

  /**
   * Same fix as Oploverz 0.2.5: an Abyss /sora/ URL answers with a 302 to an
   * edge that only serves the file when Referer is the player page, and the
   * app's downloader rewrites Referer on redirect (403). Hand over the edge URL
   * itself. The app's default rhttp client ignores followRedirects:false, so the
   * Dart client is required; Range keeps a followed redirect small.
   */
  async followAbyssRedirect(video) {
    if (!/\/sora\/\d+\//.test(safeString(video.url))) return;
    try {
      const client = new Client({ useDartHttpClient: true, followRedirects: false });
      const headers = mergeHeaders(video.headers || {}, { Range: "bytes=0-0" });
      const res = await client.get(video.url, headers);
      const loc = safeString(res && res.headers && (res.headers.location || res.headers.Location));
      if (res && res.statusCode >= 300 && res.statusCode < 400 && loc) {
        video.url = anichinDownloadableAbyss(resolveUrl(video.url, loc));
      }
    } catch (e) {
      console.log("anichin: redirect Abyss gagal dibaca: " + e);
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
      select("order", "Urutkan", ANICHIN_ORDERS),
      select("status", "Status", ANICHIN_STATUS),
      select("type", "Tipe", ANICHIN_TYPES),
      select("genre", "Genre", [["Semua", ""]].concat(ANICHIN_GENRES)),
      { type_name: "HeaderFilter", type: "note", name: "Filter diabaikan saat mencari dengan kata kunci." },
    ];
  }

  getSourcePreferences() {
    return this.basePreferences(ANICHIN_SERVERS);
  }
}

function anichinSelected(filters) {
  const out = { order: "update", status: "", type: "", genre: "" };
  (filters || []).forEach(function (filter) {
    if (!filter || !filter.values || !filter.type || !(filter.type in out)) return;
    const option = filter.values[parseInt(filter.state, 10) || 0];
    if (option) out[filter.type] = safeString(option.value);
  });
  if (!out.order) out.order = "update";
  return out;
}

/** select.mirror options as {url, server}, one per supported host, in page order. */
function anichinEmbeds(doc, provider) {
  const options = doc.select("select.mirror option") || [];
  const out = [];
  const seen = {};
  for (let i = 0; i < options.length; i++) {
    const value = safeString(options[i].attr("value"));
    if (!value) continue;
    let iframe = "";
    try {
      iframe = b64Decode(value);
    } catch (e) {
      continue;
    }
    const src = decodeEntities(safeString((/src=["']([^"']+)["']/i.exec(iframe) || [])[1]));
    if (!src || seen[src]) continue;
    seen[src] = true;
    const server = anichinServer(src);
    if (!server) {
      console.log("anichin: server " + cleanText(options[i].text) + " dilewati (" + hostOf(src.replace(/^\/\//, "https://")) + ")");
      continue;
    }
    out.push({ url: provider.resolve(src.replace(/^\/\//, "https://")), server: server });
  }
  return out;
}

function anichinServer(src) {
  if (/(^|\/\/|\.)ok\.ru\/videoembed\//i.test(src)) return "OK.ru";
  if (/abyssplayer\./i.test(src)) return "Abyss";
  if (/vidhide|vidhidepro|vidhidevip|odvidhide|filelions/i.test(src)) return "VidHide";
  if (/playmogo\.|plamogo\.|dood/i.test(src)) return "DoodStream";
  return "";
}

const OKRU_QUALITY = { full: "1080p", hd: "720p", sd: "480p", low: "360p", quad: "1440p", ultra: "2160p" };

/** `[{url, quality}]` from an OK.ru embed page, best first; 144p/240p are left out. */
function okruVideos(html) {
  const attr = /data-options="([^"]+)"/.exec(safeString(html));
  if (!attr) {
    // Older uploads get pulled for copyright; OK.ru then serves a notice page.
    console.log("anichin: video OK.ru tidak tersedia (dihapus atau diblokir OK.ru)");
    return [];
  }
  let meta = null;
  try {
    const options = JSON.parse(decodeEntities(attr[1]));
    const raw = options && options.flashvars && options.flashvars.metadata;
    meta = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.log("anichin: data OK.ru tidak terbaca: " + e);
    return [];
  }
  const out = [];
  ((meta && meta.videos) || []).forEach(function (v) {
    const quality = OKRU_QUALITY[v && v.name];
    if (quality && v.url) out.push({ url: v.url, quality: quality });
  });
  out.sort(function (a, b) { return parseInt(b.quality, 10) - parseInt(a.quality, 10); });
  return out;
}

/**
 * Mangayomi's downloader only takes a URL whose path ends in a video extension;
 * Abyss's `/sora/<size>/<token>` has none. The CDN serves the same file at
 * `<token>.mp4` (verified for Oploverz, 20 Nov 2026).
 */
function anichinDownloadableAbyss(url) {
  const value = safeString(url);
  const m = /^(https?:\/\/[^/?#]+\/sora\/\d+\/[^/?#]+?)((?:[?#].*)?)$/i.exec(value);
  if (!m || /\.mp4$/i.test(m[1])) return value;
  return m[1] + ".mp4" + m[2];
}

// AnimeXin (https://animexin.dev) — donghua (Chinese animation) only.
//
// Every episode is uploaded twice, hardsubbed in Indonesian and in English
// ("Hardsub Indonesia ... AX" / "Hardsub English ... AX"), plus "All Sub
// Player" mirrors with several subtitle tracks. Videos are labelled with their
// language, and the Indonesian ones are listed first. (anichin.help reposts
// these same "AX" uploads.)
//
// WordPress, theme "animestream" (Themesia), the same layout as Anichin:
//   - catalogue /anime/?order=&status=&type=&genre[]=, paginated with &page=N
//     and a "Next" (div.hpage a.r) link; search ?s= and /genres/<slug>/
//     paginate as /page/N/ with .pagination a.next.
//   - series /<slug>/, episodes /<slug>-episode-N-indonesia-english-sub/.
//   - an episode page lists servers in select.mirror; each option value is a
//     base64 <iframe>.
//
// Servers used: OK.ru (read from the embed's public data-options, which lists
// one .mp4 per quality up to 1080p; the app's own okruExtractor only reads
// `ondemandHls`, which these videos do not have) and DoodStream. Dailymotion
// (manifest 403), Odysee (401 without the player's auth), Rumble (blocked by
// Indonesian ISPs), D-Tube and Mega are skipped.

const mangayomiSources = [{
  "name": "AnimeXin (Donghua)",
  "lang": "id",
  "baseUrl": "https://animexin.dev",
  "apiUrl": "",
  "iconUrl": "icons/animexin.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.0",
  "pkgPath": "anime/src/id/animexin.js",
  "hasCloudflare": true,
  "notes": "Khusus donghua (animasi China). Tiap episode tersedia dengan subtitle Indonesia dan English; sub Indonesia ditampilkan paling atas. Video dari OK.ru (sampai 1080p) dan DoodStream sebagai cadangan; bisa diunduh lewat tombol unduh Mangayomi. Domain bisa berpindah; atur di Pengaturan sumber."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const AX_GENRES = [
  ["Action", "action"], ["Adventure", "adventure"], ["Chinese horror", "chinese-horror"],
  ["Chinese Style", "chinese-style"], ["Comedy", "comedy"],
  ["Comic adaptation", "comic-adaptation"], ["Cultivation", "cultivation"],
  ["Dark humor", "dark-humor"], ["Demons", "demons"], ["Drama", "drama"],
  ["Encouraging", "encouraging"], ["Fantasy", "fantasy"], ["Folklore", "folklore"],
  ["Game", "game"], ["Historical", "historical"], ["Inspiring", "inspiring"], ["Isekai", "isekai"],
  ["Magic", "magic"], ["Martial Arts", "martial-arts"], ["Monsters", "monsters"],
  ["Mystery", "mystery"], ["Mythology", "mythology"], ["Novel Adaptation", "novel-adaptation"],
  ["Over Power", "over-power"], ["Reincarnation", "reincarnation"], ["Romance", "romance"],
  ["School", "school"], ["Sci-fi", "sci-fi"],
  ["Sci-Fi (Urban Cultivation)", "sci-fi-urban-cultivation"], ["Shounen", "shounen"],
  ["Slice of Life", "slice-of-life"], ["Super Power", "super-power"],
  ["Supernatural", "supernatural"], ["Time Travel", "time-travel"],
  ["Vitality-themed", "vitality-themed"], ["War", "war"], ["Wuxia", "wuxia"],
  ["Xianxia", "xianxia"],
];
const AX_ORDERS = [["Baru diperbarui", "update"], ["Terpopuler", "popular"],
  ["Baru ditambahkan", "latest"], ["Rating tertinggi", "rating"], ["Judul A-Z", "title"], ["Judul Z-A", "titlereverse"]];
const AX_STATUS = [["Semua", ""], ["Ongoing", "ongoing"], ["Completed", "completed"],
  ["Upcoming", "upcoming"], ["Hiatus", "hiatus"]];
const AX_TYPES = [["Semua", ""], ["ONA", "ona"], ["TV", "tv"], ["Movie", "movie"],
  ["Special", "special"], ["OVA", "ova"]];
const AX_SERVERS = ["OK.ru Indo", "DoodStream Multi", "OK.ru English", "DoodStream English", "DoodStream Indo"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://animexin.dev");
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
      console.log("animexin: gagal memuat " + url);
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
    return this.catalogue(axSelected(filters), page);
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
      console.log("animexin: detail tidak ditemukan: " + seriesUrl);
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
    console.log("animexin: tautan seri tidak ditemukan di " + url);
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

    const embeds = axEmbeds(doc, this);
    const results = [];
    const tried = [];
    // DoodStream goes last and only runs when nothing else played: from
    // Indonesia its host usually answers with a Cloudflare challenge.
    const ordered = embeds.filter(function (e) { return e.host !== "DoodStream"; })
      .concat(embeds.filter(function (e) { return e.host === "DoodStream"; }));
    for (let i = 0; i < ordered.length; i++) {
      const embed = ordered[i];
      if (embed.host === "DoodStream" && results.length) continue;
      tried.push(embed.server);
      let videos = [];
      if (embed.host === "OK.ru") {
        videos = await this.okru(embed.url);
      } else if (isSupportedHost(embed.url)) {
        videos = (await extractByHost(this, embed.url, pageUrl, "", "Hardsub ID")).videos;
      }
      for (let v = 0; v < videos.length; v++) {
        const video = videos[v];
        video.server = embed.server;
        video.quality = qualityLabel(resolutionOf(video.quality), embed.host, AX_LANG_LABEL[embed.lang]);
        video.url = axDownloadableAbyss(video.url);
        results.push(video);
      }
      if (!videos.length) console.log("animexin: " + embed.server + " tidak menghasilkan stream");
    }
    if (!results.length) {
      throw new Error("AnimeXin: tidak ada server yang bisa diputar" +
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
    // OK.ru now and then answers an embed with an empty page (seen on the
    // second of two back-to-back embeds, 26 Nov 2026); one retry recovers it.
    // A real removal carries a notice ("заблокировано"), which is not retried.
    let html = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        html = await this.fetch(url, this.headersFor(this.getBaseUrl() + "/"));
      } catch (e) {
        console.log("animexin: OK.ru gagal dimuat: " + e);
        html = "";
      }
      if (/data-options=/.test(html) || /заблокирован|удален|blocked|removed/i.test(html)) break;
    }
    const videos = okruVideos(html);
    const headers = this.headersFor("https://ok.ru/");
    return videos.map(function (v) {
      return {
        url: v.url,
        originalUrl: safeString(v.url).replace(/[?#].*$/, "").replace(/\/+$/, "") + "/animexin-" + v.quality + ".mp4",
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
        video.url = axDownloadableAbyss(resolveUrl(video.url, loc));
      }
    } catch (e) {
      console.log("animexin: redirect Abyss gagal dibaca: " + e);
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
      select("order", "Urutkan", AX_ORDERS),
      select("status", "Status", AX_STATUS),
      select("type", "Tipe", AX_TYPES),
      select("genre", "Genre", [["Semua", ""]].concat(AX_GENRES)),
      { type_name: "HeaderFilter", type: "note", name: "Filter diabaikan saat mencari dengan kata kunci." },
    ];
  }

  getSourcePreferences() {
    return this.basePreferences(AX_SERVERS);
  }
}

function axSelected(filters) {
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
function axEmbeds(doc, provider) {
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
    const host = axServer(src);
    if (!host) {
      console.log("animexin: server " + cleanText(options[i].text) + " dilewati (" + hostOf(src.replace(/^\/\//, "https://")) + ")");
      continue;
    }
    const lang = axLanguage(options[i].text);
    out.push({ url: provider.resolve(src.replace(/^\/\//, "https://")), host: host, lang: lang, server: host + " " + lang });
  }
  return out;
}

const AX_LANG_LABEL = { Indo: "Sub Indo", English: "Sub English", Multi: "Multi Sub" };

/** "Hardsub Indonesia Ok.ru AX" -> Indo, "Hardsub English ..." -> English, "All Sub Player ..." -> Multi. */
function axLanguage(label) {
  const text = cleanText(label);
  if (/indonesia|\bindo\b/i.test(text)) return "Indo";
  if (/english|\beng\b/i.test(text)) return "English";
  return "Multi";
}

function axServer(src) {
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
    console.log("animexin: video OK.ru tidak tersedia (dihapus atau diblokir OK.ru)");
    return [];
  }
  let meta = null;
  try {
    const options = JSON.parse(decodeEntities(attr[1]));
    const raw = options && options.flashvars && options.flashvars.metadata;
    meta = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.log("animexin: data OK.ru tidak terbaca: " + e);
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
function axDownloadableAbyss(url) {
  const value = safeString(url);
  const m = /^(https?:\/\/[^/?#]+\/sora\/\d+\/[^/?#]+?)((?:[?#].*)?)$/i.exec(value);
  if (!m || /\.mp4$/i.test(m[1])) return value;
  return m[1] + ".mp4" + m[2];
}

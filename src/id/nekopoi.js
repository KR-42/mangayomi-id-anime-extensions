// Nekopoi (https://nekopoi.care) — sumber 18+ (NSFW).
//
// Situs ini memblokir alamat IP Indonesia di level TLS (SNI), jadi dari
// jaringan lokal halaman hanya bisa dibuka lewat VPN. Ekstensi ini hanya
// membaca halaman publik: daftar, detail seri, halaman episode, dan halaman
// embed player. Tidak ada halaman login, akun, atau pembayaran yang disentuh.
//
// Alur penontonan:
//   beranda -> kartu episode/posting -> halaman episode
//   halaman episode -> #nk-stream-N iframe -> playmogo/plamogo (DoodStream)
//                                          -> streampoi (JW Player, m3u8)
//
// Catatan halaman: server 1 = 360p/480p, server 2 = 720p, server 3 = alternatif
// (biasanya streampoi). Mirror unduhan di halaman episode semuanya lewat
// ouo.io menuju Mp4Upload/Pixeldrain/KrakenFiles — itu tautan unduh, bukan
// stream, jadi sengaja tidak ditawarkan sebagai video.

const mangayomiSources = [{
  "name": "Nekopoi",
  "lang": "id",
  "baseUrl": "https://nekopoi.care",
  "apiUrl": "",
  "iconUrl": "icons/nekopoi.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": true,
  "version": "0.1.0",
  "pkgPath": "anime/src/id/nekopoi.js",
  "hasCloudflare": true,
  "notes": "Konten 18+. Situs memblokir IP Indonesia, jadi sumber ini hanya jalan lewat VPN. Domain bisa berpindah; atur di Pengaturan sumber. Server 1/2 (playmogo) kadang kena tantangan Cloudflare — kalau gagal, pakai Server 3 (streampoi). Daftar populer hanya satu halaman, sesuai blok 'Direkomendasikan' di situs."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const NEKOPOI_SERVERS = ["Server 1", "Server 2", "Server 3"];

/** The DoodStream clones the site serves as Server 1 / Server 2. */
const NEKOPOI_DOOD_HOST = /playmogo\.|plamogo\.|dood[a-z0-9-]*\.|d000d\.|dsvplay\./i;

/**
 * Month names the site writes in Indonesian, for `parseDates`.
 *
 * The app stores `dateUpload` as milliseconds-since-epoch: it feeds the value
 * straight to `int.parse()` and renders it with `DateTime.fromMillisecondsSinceEpoch`.
 * The site's "20 Februari 2023" is not a number, so handing it over unconverted
 * threw inside the episode tile and left that part of the page blank/grey.
 */
const NEKOPOI_MONTHS = {
  januari: "January", februari: "February", maret: "March", april: "April",
  mei: "May", juni: "June", juli: "July", agustus: "August",
  september: "September", oktober: "October", november: "November",
  desember: "December",
};

/** Convert the collected episode rows into MChapter objects. */
function nekopoiEpisodes(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const episode = {
      name: rows[i].name,
      url: rows[i].url,
      dateUpload: nekopoiTimestamp(rows[i].date),
      scanlator: "",
    };
    // A non-null thumbnailUrl is what makes the app draw the 50x65 preview.
    if (rows[i].thumb) episode.thumbnailUrl = rows[i].thumb;
    out.push(episode);
  }
  return out;
}

/**
 * "20 Februari 2023" -> milliseconds-since-epoch string, "" when unparsable.
 *
 * One call per row instead of one for the whole list: `parseDates` drops empty
 * inputs, which would shift every later index in a mixed list.
 */
function nekopoiTimestamp(value) {
  const text = nekopoiDate(value);
  if (!text) return "";
  try {
    const parsed = parseDates([text], "d MMMM yyyy", "en");
    return safeString(parsed && parsed[0]);
  } catch (e) {
    console.log("nekopoi: tanggal \"" + text + "\" gagal diurai: " + e);
    return "";
  }
}

/** "20 Februari 2023" -> "20 February 2023"; "" stays ""; numbers pass through. */
function nekopoiDate(value) {
  const text = cleanText(value);
  if (!text || /^\d+$/.test(text)) return text;
  return text.replace(/[A-Za-z]+/g, function (word) {
    return NEKOPOI_MONTHS[word.toLowerCase()] || word;
  });
}

/** Kategori menu utama, lalu genre dari /genre-list/. */
const NEKOPOI_CATEGORIES = [
  ["Hentai", "/category/hentai/"],
  ["2D Animation", "/category/2d-animation/"],
  ["3D Hentai", "/category/3d-hentai/"],
  ["JAV", "/category/jav/"],
  ["JAV Cosplay", "/category/jav-cosplay/"],
];

const NEKOPOI_GENRES = [
  ["Action", "action"], ["Ahegao", "ahegao"], ["Anal", "anal"], ["Armpit", "armpit"],
  ["BDSM", "bdsm"], ["Big Oppai", "big-oppai"], ["Blackmail", "blackmail"],
  ["Blonde", "blonde"], ["Blowjob", "blowjob"], ["Bondage", "bondage"],
  ["Cheating", "cheating"], ["Comedy", "comedy"], ["Creampie", "creampie"],
  ["Dark Skin", "dark-skin"], ["Dilf", "dilf"], ["Elf", "elf"],
  ["Exhibitionist", "exhibitionist"], ["Fellatio", "fellatio"],
  ["Female Monster", "female-monster"], ["Femdom", "femdom"], ["Footjob", "footjob"],
  ["Forced", "forced"], ["Furry", "furry"], ["Futanari", "futanari"],
  ["Gangbang", "gangbang"], ["Gore", "gore"], ["Gyaru", "gyaru"], ["Handjob", "handjob"],
  ["Harem", "harem"], ["Horror", "horror"], ["Housewife", "housewife"],
  ["Humiliation", "humiliation"], ["Hypnotize", "hypnotize"], ["Incest", "incest"],
  ["Intercrural", "intercrural"], ["JAV", "jav"], ["Lactation", "lactation"],
  ["Loli", "loli"], ["Maid", "maid"], ["Male Monster", "male-monster"],
  ["Masturbation", "masturbation"], ["Megane", "megane"], ["MILF", "milf"],
  ["Mind Control", "mind-control"], ["Monster", "monster"], ["Netorare", "netorare"],
  ["Nipple Fuck", "nipple-fuck"], ["Nurse", "nurse"], ["Old Man", "old-man"],
  ["Onee-san", "onee-san"], ["Oral", "oral"], ["Paihame", "paihame"],
  ["Paizuri", "paizuri"], ["Pantyhose", "pantyhose"], ["Pregnant", "pregnant"],
  ["Prostitution", "prostitution"], ["Rape", "rape"], ["Romance", "romance"],
  ["Saimin", "saimin"], ["Schoolgirl", "schoolgirl"], ["Semi Hentai", "semi-hentai"],
  ["Sex Toys", "sex-toys"], ["Shibari", "shibari"], ["Shota", "shota"],
  ["Stocking", "stocking"], ["Succubus", "succubus"], ["Supranatural", "supranatural"],
  ["Swimsuit", "swimsuit"], ["Tentacles", "tentacles"], ["Threesome", "threesome"],
  ["Tsundere", "tsundere"], ["Ugly Bastard", "ugly-bastard"], ["Uncensored", "uncensored"],
  ["Vanilla", "vanilla"], ["Virgin", "virgin"], ["Yaoi", "yaoi"], ["Yuri", "yuri"],
];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://nekopoi.care");
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
        "). Sumber ini butuh VPN; buka WebView lalu coba lagi.");
    }
    if (!res || !res.body || res.statusCode >= 400) {
      console.log("nekopoi: gagal memuat " + url);
      return null;
    }
    return new Document(res.body);
  }

  pagedPath(base, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    return n === 1 ? base : base + "page/" + n + "/";
  }

  // ------------------------------------------------------------- listings

  /**
   * The site's "Direkomendasikan" ticker plus the series grid under it; both
   * only ever appear on the home page, so there is no page 2 to fetch.
   */
  async getPopular(page) {
    if ((parseInt(page, 10) || 1) > 1) return this.emptyPage();
    const doc = await this.pageDoc(this.resolve("/"));
    if (!doc) return this.emptyPage();

    const list = [];
    const seen = {};
    const ticker = doc.select(".nk-recommended .nk-ticker a.nk-series-link") || [];
    for (let i = 0; i < ticker.length; i++) {
      const href = seriesHref(ticker[i]);
      if (!href || seen[href]) continue;
      seen[href] = true;
      list.push(this.item(
        ticker[i].text,
        this.absolute(tooltipImage(ticker[i].attr("original-title"))),
        href,
      ));
    }

    const grid = doc.select(".nk-hentai-grid a.nk-series-link") || [];
    for (let i = 0; i < grid.length; i++) {
      const href = seriesHref(grid[i]);
      if (!href || seen[href]) continue;
      seen[href] = true;
      list.push(this.item(
        grid[i].selectFirst(".title").text || grid[i].text,
        this.absolute(backgroundUrl(grid[i].selectFirst(".nk-hentai-thumb").attr("style"))),
        href,
      ));
    }

    // Tema lama: sidebar "Rekomendasi" berupa ticker dengan kelas .series.
    if (!list.length) {
      const legacy = doc.select(".rekomendasi .showticker a.series") || [];
      for (let i = 0; i < legacy.length; i++) {
        const href = legacy[i].attr("href") || legacy[i].getHref;
        if (!href || seen[href]) continue;
        seen[href] = true;
        list.push(this.item(legacy[i].text, this.absolute(tooltipImage(
          legacy[i].attr("original-title"))), href));
      }
    }

    return { list: list, hasNextPage: false };
  }

  /**
   * Latest = the "post" grid (each card is one episode or one standalone
   * video). The series grid is only used when the post grid is empty.
   */
  async getLatestUpdates(page) {
    const doc = await this.pageDoc(this.resolve(this.pagedPath("/", page)));
    if (!doc) return this.emptyPage();

    const list = this.parseCards(doc);
    if (!list.length) {
      const fallback = this.parseSeriesGrid(doc);
      return { list: fallback, hasNextPage: nekopoiHasNext(doc) };
    }
    return { list: list, hasNextPage: nekopoiHasNext(doc) };
  }

  /** Cards of the post grid: thumb, title, link. */
  parseCards(doc) {
    const cards = doc.select("#nk-episode-grid .nk-post-card") || [];
    const list = [];
    for (let i = 0; i < cards.length; i++) {
      const anchor = cards[i].selectFirst("h2 a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href) continue;
      list.push(this.item(
        anchor.text,
        this.absolute(backgroundUrl(cards[i].selectFirst(".nk-thumb-crop").attr("style"))),
        href,
      ));
    }
    if (list.length) return list;

    // Tema lama: .animeseries ul li a.series dengan <img> dan div.title.
    const legacy = doc.select(".animeseries ul li a.series[href]") || [];
    for (let i = 0; i < legacy.length; i++) {
      const href = legacy[i].attr("href") || legacy[i].getHref;
      if (!href) continue;
      const img = legacy[i].selectFirst("img");
      list.push(this.item(
        legacy[i].selectFirst("div.title").text || legacy[i].text,
        this.absolute(img.attr("src")),
        href,
      ));
    }
    return list;
  }

  /** Series grid under the ticker — used as the latest fallback. */
  parseSeriesGrid(doc) {
    const anchors = doc.select(".nk-hentai-grid a.nk-series-link") || [];
    const list = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = seriesHref(anchors[i]);
      if (!href) continue;
      list.push(this.item(
        anchors[i].selectFirst(".title").text || anchors[i].text,
        this.absolute(backgroundUrl(anchors[i].selectFirst(".nk-hentai-thumb").attr("style"))),
        href,
      ));
    }
    return list;
  }

  // ---------------------------------------------------------------- search

  /**
   * Two modes:
   *   - a category/genre picked in the filter, which lists series;
   *   - a text query, which lists posts (episodes and standalone videos).
   * Both render the same `.nk-search-results` block.
   */
  async search(query, page, filters) {
    const text = cleanText(query);
    const route = this.selectedRoute(filters);
    const n = Math.max(1, parseInt(page, 10) || 1);

    if (route) {
      const doc = await this.pageDoc(this.resolve(this.pagedPath(route, n)));
      if (!doc) return this.emptyPage();
      let list = this.parseResults(doc);
      if (text) {
        const needle = text.toLowerCase();
        list = list.filter(function (entry) {
          return entry.name.toLowerCase().indexOf(needle) !== -1;
        });
      }
      return { list: list, hasNextPage: nekopoiHasNext(doc) };
    }

    if (!text) return this.emptyPage();
    // The query takes a path segment, not a parameter: /search/<q>/page/N/.
    // `?s=<q>` redirects here, and `?paged=N` is ignored (page 1 again).
    const base = "/search/" + encodeQuery(text) + "/";
    const doc = await this.pageDoc(this.resolve(this.pagedPath(base, n)));
    if (!doc) return this.emptyPage();
    return { list: this.parseResults(doc), hasNextPage: nekopoiHasNext(doc) };
  }

  selectedRoute(filters) {
    if (!filters || !filters.length) return "";
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (!filter || filter.name !== "Kategori") continue;
      const option = (filter.values || [])[parseInt(filter.state, 10) || 0];
      return option ? safeString(option.value) : "";
    }
    return "";
  }

  /** The `.nk-search-results` list, shared by search, category, and genre. */
  parseResults(doc) {
    const anchors = doc.select(".nk-search-results a.nk-search-item[href]") || [];
    const seen = {};
    const list = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href") || anchors[i].getHref;
      if (!href || seen[href]) continue;
      seen[href] = true;
      list.push(this.item(
        anchors[i].selectFirst(".nk-search-info h2").text || anchors[i].text,
        this.absolute(backgroundUrl(anchors[i].selectFirst(".nk-search-thumb").attr("style"))),
        href,
      ));
    }
    if (list.length) return list;

    // Tema lama: div.result > ul > li > h2 > a (judul + thumbnail terpisah).
    const legacy = doc.select("div.result ul li") || [];
    for (let i = 0; i < legacy.length; i++) {
      const anchor = legacy[i].selectFirst("h2 a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href || seen[href]) continue;
      seen[href] = true;
      const img = legacy[i].selectFirst("img");
      list.push(this.item(anchor.text, this.absolute(img.attr("src")), href));
    }
    return list;
  }

  absolute(src) {
    return src ? this.resolve(decodeEntities(src)) : "";
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    const pageUrl = this.resolve(url);
    const doc = await this.pageDoc(pageUrl);
    if (!doc) return empty;

    // A series page carries .nk-series-info; an episode/standalone post page
    // links back to its series, which is where the full episode list lives.
    let seriesDoc = doc;
    let seriesUrl = pageUrl;
    if (!doc.selectFirst(".nk-series-info")) {
      const back = doc.selectFirst("a.nk-player-series").attr("href");
      if (back) {
        const candidate = this.resolve(decodeEntities(back));
        if (candidate !== pageUrl) {
          const seriesPage = await this.pageDoc(candidate);
          if (seriesPage) {
            seriesDoc = seriesPage;
            seriesUrl = candidate;
          }
        }
      }
    }

    const hasSeries = !!seriesDoc.selectFirst(".nk-series-info");
    const name = cleanTitle(firstNonEmpty(
      metaContent(seriesDoc, "og:title"),
      hasSeries ? seriesDoc.selectFirst(".nk-series-synopsis b").text : "",
      hasSeries ? seriesDoc.selectFirst(".nk-series-info > h2").text : "",
      seriesDoc.selectFirst("h1").text,
    ));
    if (!name) {
      console.log("nekopoi: detail tidak ditemukan: " + pageUrl);
      return empty;
    }

    const poster = backgroundUrl(seriesDoc.selectFirst(".nk-series-poster").attr("style"));
    const description = cleanText(
      stripTags(firstNonEmpty(
        hasSeries ? seriesDoc.selectFirst(".nk-series-synopsis p").text : "",
        metaContent(doc, "og:description"),
      )),
    );
    const meta = metaMap(seriesDoc);

    let episodes = this.episodesOf(seriesDoc, name);
    if (!episodes.length) {
      // Standalone post (no series): the page itself is the only episode.
      episodes = [{
        name: cleanTitle(seriesDoc.selectFirst("h1").text) || name,
        url: this.relativize(pageUrl),
        dateUpload: "",
        scanlator: "",
      }];
    }

    return {
      name: name,
      imageUrl: this.absolute(firstNonEmpty(
        poster,
        metaContent(seriesDoc, "og:image"),
        metaContent(doc, "og:image"),
      )),
      link: this.relativize(seriesUrl),
      description: description,
      author: meta["produser"] || "",
      artist: "",
      genre: this.genresOf(seriesDoc),
      status: /completed|selesai/i.test(meta["status"] || "") ? 1 : 0,
      episodes: episodes,
    };
  }

  genresOf(doc) {
    const links = doc.select(".nk-series-meta-list a[href*='/genres/']") || [];
    const out = [];
    for (let i = 0; i < links.length; i++) {
      const genre = cleanText(links[i].text);
      if (genre && out.indexOf(genre) === -1) out.push(genre);
    }
    return out;
  }

  /** Episode cards on a series page, in the order the site lists them. */
  episodesOf(doc, seriesName) {
    const anchors = doc.select("a.nk-episode-card[href]") || [];
    const seen = {};
    const rows = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href") || anchors[i].getHref;
      if (!href) continue;
      const url = this.relativize(this.resolve(decodeEntities(href)));
      if (seen[url]) continue;
      seen[url] = true;
      const badge = cleanText(anchors[i].selectFirst(".nk-episode-badge").text);
      const title = cleanText(anchors[i].selectFirst(".nk-episode-card-title").text) ||
        cleanText(anchors[i].text);
      rows.push({
        name: badge ? "Episode " + badge.replace(/^ep\s*/i, "") :
          (cleanTitle(cleanEpisodeName(title, seriesName)) || "Episode"),
        url: url,
        date: cleanText(anchors[i].selectFirst(".nk-episode-card-date").text),
        thumb: this.absolute(backgroundUrl(
          anchors[i].selectFirst(".nk-episode-card-thumb").attr("style"))),
      });
    }
    if (rows.length) return nekopoiEpisodes(rows);

    // Tema lama: .episodelist ul.leftoff li span a — tanpa tanggal & thumbnail.
    const legacy = doc.select(".episodelist .leftoff a[href]") || [];
    for (let i = 0; i < legacy.length; i++) {
      const href = legacy[i].attr("href") || legacy[i].getHref;
      if (!href) continue;
      const url = this.relativize(this.resolve(decodeEntities(href)));
      if (seen[url]) continue;
      seen[url] = true;
      rows.push({
        name: cleanTitle(cleanEpisodeName(legacy[i].text, seriesName)) || "Episode",
        url: url,
        date: "",
        thumb: "",
      });
    }
    return nekopoiEpisodes(rows);
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const pageUrl = this.resolve(url);
    const doc = await this.pageDoc(pageUrl);
    if (!doc) return [];

    const embeds = this.embedsOf(doc);
    if (!embeds.length) {
      throw new Error("Nekopoi: halaman episode ini tidak memuat player. " +
        "Buka lewat tombol Tampilan Web untuk memeriksanya.");
    }

    const results = [];
    const failed = [];
    for (let i = 0; i < embeds.length; i++) {
      const embed = embeds[i];
      const label = embed.server + " (" + hostOf(embed.url) + ")";
      const reason = unsupportedReason(embed.url);
      if (reason) {
        console.log("nekopoi: server " + label + " tidak didukung (" + reason + ")");
        failed.push(label + ": " + reason);
        continue;
      }
      if (!isSupportedHost(embed.url)) {
        console.log("nekopoi: server " + label +
          " tidak didukung (belum ada ekstraktor untuk " + hostOf(embed.url) + ")");
        failed.push(label + ": belum ada ekstraktor");
        continue;
      }
      const found = await extractByHost(this, embed.url, pageUrl, "", "Sub Indo");
      for (let v = 0; v < found.videos.length; v++) {
        const video = found.videos[v];
        video.server = embed.server;
        video.quality = qualityLabel(resolutionOf(video.quality), "Sub Indo", embed.server);
        results.push(video);
      }
      if (!found.videos.length) {
        console.log("nekopoi: " + label + " tidak menghasilkan stream");
        failed.push(label + ": tidak menghasilkan stream");
      }
    }

    // Second pass, DoodStream only: the request that failed above may have been
    // the one Cloudflare refused. The app's WebView already carries a solved
    // challenge cookie, so replay the /pass_md5 handshake from inside it.
    if (!results.length) {
      for (let i = 0; i < embeds.length; i++) {
        if (!NEKOPOI_DOOD_HOST.test(embeds[i].url)) continue;
        const streams = await this.doodViaWebview(embeds[i].url);
        if (!streams.length) {
          failed.push(embeds[i].server + " (WebView): tantangan Cloudflare belum terlewati");
          continue;
        }
        for (let s = 0; s < streams.length; s++) {
          const stream = streams[s];
          stream.server = embeds[i].server;
          stream.quality = qualityLabel(resolutionOf(stream.quality), "Sub Indo", embeds[i].server);
          results.push(stream);
        }
      }
    }

    if (!results.length) {
      // An empty list renders as "Daftar video kosong", which hides the reason.
      throw new Error("Nekopoi: tidak ada server yang bisa diputar. " +
        failed.join("; ") +
        ". Server 1/2 memakai DoodStream yang sering menantang Cloudflare — " +
        "buka episode ini sekali di Tampilan Web supaya tantangannya lewat, " +
        "atau pakai Server 3 (streampoi) bila ada.");
    }
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /**
   * DoodStream handshake replayed inside the app's WebView.
   *
   * `/e/<id>` names a `/pass_md5/<path>` whose body is the CDN prefix; the file
   * name is random characters plus the page's `token`. In the WebView the
   * challenge cookie of the shared session is sent along, which is exactly what
   * the plain request in extractDoodJs is missing.
   */
  async doodViaWebview(embedUrl) {
    const script =
      "(function(){" +
      "var chars=\"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\";" +
      "function done(v){try{window.flutter_inappwebview.callHandler(\"setResponse\",v)}catch(e){}}" +
      "function rnd(n){var s=\"\";for(var i=0;i<n;i++){s+=chars.charAt(Math.floor(Math.random()*chars.length))}return s}" +
      "var n=0;" +
      "function go(){fetch(location.href,{credentials:\"include\"})" +
      ".then(function(r){return r.text()})" +
      ".then(function(h){" +
      "var p=/\\/pass_md5\\/[A-Za-z0-9_\\/-]+/.exec(h);" +
      "var t=/token=([A-Za-z0-9]+)/.exec(h);" +
      "if(!p||!t){if(n<15){n++;setTimeout(go,2000)}else{done(\"\")}return}" +
      "fetch(location.origin+p[0],{credentials:\"include\"})" +
      ".then(function(r){return r.text()})" +
      ".then(function(b){b=b.replace(/\\s+/g,\"\");" +
      "if(b.indexOf(\"http\")!==0){done(\"\");return}" +
      "done(b+rnd(10)+\".mp4?token=\"+t[1]+\"&expiry=\"+Date.now())})" +
      ".catch(function(){done(\"\")})})" +
      ".catch(function(){if(n<15){n++;setTimeout(go,2000)}else{done(\"\")}})}" +
      "go();" +
      "})();";
    let stream = "";
    try {
      stream = safeString(await evaluateJavascriptViaWebview(embedUrl, {}, [script], 40));
    } catch (e) {
      console.log("nekopoi: WebView Dood gagal: " + e);
      return [];
    }
    if (!/^https?:\/\/\S+$/i.test(stream)) return [];
    return [{
      url: stream,
      originalUrl: embedUrl,
      quality: "",
      headers: this.headersFor(embedUrl),
    }];
  }

  /**
   * One iframe per stream tab. The page also carries ad iframes earlier in the
   * body, so the player container is the only place to look — a bare
   * `iframe[src]` scan would hand the ad server to the extractors.
   */
  embedsOf(doc) {
    const labels = {};
    const tabs = doc.select("#nk-player-tabs a[href]") || [];
    for (let i = 0; i < tabs.length; i++) {
      const target = safeString(tabs[i].attr("href")).replace(/^#/, "");
      if (target) labels[target] = cleanText(tabs[i].text);
    }

    const out = [];
    const frames = doc.select("#nk-player .nk-player-frame") || [];
    for (let i = 0; i < frames.length; i++) {
      const id = safeString(frames[i].attr("id"));
      const src = safeString(frames[i].selectFirst("iframe").attr("src"));
      if (!src) continue;
      out.push({
        url: this.resolve(decodeEntities(src)),
        server: labels[id] || ("Server " + (i + 1)),
      });
    }
    if (out.length) return out;

    // Tema lama: satu iframe player tanpa tab.
    const legacy = doc.select("#player iframe[src], .player iframe[src]") || [];
    for (let i = 0; i < legacy.length; i++) {
      const src = safeString(legacy[i].attr("src"));
      if (!src) continue;
      out.push({ url: this.resolve(decodeEntities(src)), server: "Server " + (i + 1) });
    }
    return out;
  }

  // -------------------------------------------------------- configuration

  getFilterList() {
    const options = [{ type_name: "SelectOption", name: "Semua", value: "" }];
    for (let i = 0; i < NEKOPOI_CATEGORIES.length; i++) {
      options.push({
        type_name: "SelectOption",
        name: NEKOPOI_CATEGORIES[i][0],
        value: NEKOPOI_CATEGORIES[i][1],
      });
    }
    for (let i = 0; i < NEKOPOI_GENRES.length; i++) {
      options.push({
        type_name: "SelectOption",
        name: NEKOPOI_GENRES[i][0],
        value: "/genres/" + NEKOPOI_GENRES[i][1] + "/",
      });
    }
    return [{
      type_name: "SelectFilter",
      type: "kategori",
      name: "Kategori",
      state: 0,
      values: options,
    }];
  }

  getSourcePreferences() {
    return this.basePreferences(NEKOPOI_SERVERS);
  }
}

/** Series links are `/hentai/<slug>/`; posts are everything else. */
function seriesHref(anchor) {
  const href = safeString(anchor.attr("href") || anchor.getHref);
  if (!href) return "";
  return href.indexOf("/hentai/") !== -1 ? href : "";
}

/** `background-image: url('…')` -> "…". The theme puts every thumb inline. */
function backgroundUrl(style) {
  const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(safeString(style));
  return m ? cleanText(m[1]) : "";
}

/** The ticker anchors carry their thumbnail inside the tooltip markup. */
function tooltipImage(attribute) {
  const html = String(attribute == null ? "" : attribute)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m ? m[1] : "";
}

/** `<meta property="og:x" content="…">`, or "". */
function metaContent(doc, property) {
  const element = doc.selectFirst("meta[property='" + property + "']") ||
    doc.selectFirst("meta[name='" + property + "']");
  return element ? decodeEntities(safeString(element.attr("content"))) : "";
}

/** { "judul jepang": "…", "status": "Completed", … } from the meta list. */
function metaMap(doc) {
  const items = doc.select(".nk-series-meta-list li") || [];
  const out = {};
  for (let i = 0; i < items.length; i++) {
    const text = cleanText(items[i].text);
    const colon = text.indexOf(":");
    if (colon <= 0) continue;
    const key = cleanText(text.substring(0, colon)).toLowerCase();
    out[key] = cleanText(text.substring(colon + 1));
  }
  return out;
}

/** The theme's pagination block; "Selanjutnya" is an `a.next`. */
function nekopoiHasNext(doc) {
  return hasNextPage(doc, [
    "nav.navigation.pagination a.next",
    "a.next.page-numbers",
    "#nav-below a.next",
  ]);
}

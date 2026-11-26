// Astronime (https://astronime.id) — WordPress (theme "pureholic", east player).
//
// The anime list lives at /gomunime/, a list page Astronime titles "Gomunime"
// for search traffic; it is Astronime's own catalogue, not the old Gomunime
// site. It takes ?order=update|popular|latest|rating|favorite plus &status=
// and &type=; genres have their own /genre/<slug>/ routes. Every list
// paginates as <route>/page/N/ and prints "Halaman X dari Y".
//
// An episode page lists its servers as .east_player_option buttons; the
// iframe comes from admin-ajax.php (action=player_ajax). Two servers exist:
//   - Hydrax = player.abyssplayer.com (Abyss, shared extractor; .mp4 per
//     resolution, the same host Oploverz uses).
//   - Apollo = apollo.astronime.id, whose config is hidden behind AAEncode,
//     crypto-js and a DevTools detector. That is a deliberate protection, so
//     it is skipped rather than reversed.

const mangayomiSources = [{
  "name": "Astronime",
  "lang": "id",
  "baseUrl": "https://astronime.id",
  "apiUrl": "",
  "iconUrl": "icons/astronime.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.1",
  "pkgPath": "anime/src/id/astronime.js",
  "hasCloudflare": true,
  "notes": "Domain bisa berpindah; atur di Pengaturan sumber. Video dari server Hydrax (sampai 1080p) dan bisa diunduh lewat tombol unduh Mangayomi; kualitas unduhan mengikuti Kualitas yang diutamakan. Server Apollo belum didukung. v0.1.1: peringatan unduhan 1080p lambat dihapus, karena di HP unduhannya ternyata cepat."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const ASTRO_GENRES = [
  ["Action", "action"], ["Adult Cast", "adult-cast"], ["Adventure", "adventure"],
  ["Animasi", "animasi"], ["Anthropomorphic", "anthropomorphic"], ["Avant Garde", "avant-garde"],
  ["Award Winning", "award-winning"], ["Boys Love", "boys-love"], ["CGDCT", "cgdct"],
  ["Childcare", "childcare"], ["Comedy", "comedy"], ["Crossdressing", "crossdressing"],
  ["Delinquents", "delinquents"], ["Detective", "detective"], ["Drama", "drama"],
  ["Ecchi", "ecchi"], ["Educational", "educational"], ["Erotica", "erotica"],
  ["Fantasy", "fantasy"], ["Gag Humor", "gag-humor"], ["Girls Love", "girls-love"],
  ["Gore", "gore"], ["Gourmet", "gourmet"], ["Harem", "harem"],
  ["High Stakes Game", "high-stakes-game"], ["Historical", "historical"], ["Horror", "horror"],
  ["Idols (Female)", "idols-female"], ["Idols (Male)", "idols-male"], ["Isekai", "isekai"],
  ["Iyashikei", "iyashikei"], ["Josei", "josei"], ["Kids", "kids"],
  ["Love Polygon", "love-polygon"], ["Love Status Quo", "love-status-quo"],
  ["Magical Sex Shift", "magical-sex-shift"], ["Mahou Shoujo", "mahou-shoujo"],
  ["Martial Arts", "martial-arts"], ["Mecha", "mecha"], ["Medical", "medical"],
  ["Military", "military"], ["Music", "music"], ["Mystery", "mystery"], ["Mythology", "mythology"],
  ["Organized Crime", "organized-crime"], ["Otaku Culture", "otaku-culture"], ["Parody", "parody"],
  ["Performing Arts", "performing-arts"], ["Pets", "pets"], ["Psychological", "psychological"],
  ["Racing", "racing"], ["Reincarnation", "reincarnation"], ["Reverse Harem", "reverse-harem"],
  ["Romance", "romance"], ["Samurai", "samurai"], ["School", "school"], ["Sci-fi", "sci-fi"],
  ["Seinen", "seinen"], ["Shoujo", "shoujo"], ["Shounen", "shounen"], ["Showbiz", "showbiz"],
  ["Slice of Life", "slice-of-life"], ["Space", "space"], ["Sports", "sports"],
  ["Strategy Game", "strategy-game"], ["Super Power", "super-power"],
  ["Supernatural", "supernatural"], ["Survival", "survival"], ["Suspense", "suspense"],
  ["Team Sports", "team-sports"], ["Time Travel", "time-travel"],
  ["Urban Fantasy", "urban-fantasy"], ["Vampire", "vampire"], ["Video Game", "video-game"],
  ["Villainess", "villainess"], ["Visual Arts", "visual-arts"], ["Workplace", "workplace"],
];

const ASTRO_SERVERS = ["Hydrax", "Apollo"];
const ASTRO_LIST = "/gomunime/";

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://astronime.id");
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
      console.log("astronime: gagal memuat " + url);
      return null;
    }
    return new Document(res.body);
  }

  /** "/route/" + page -> "/route/page/N/", keeping any query string. */
  pagedUrl(route, query, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    return this.resolve(route + (n > 1 ? "page/" + n + "/" : "") + (query ? "?" + query : ""));
  }

  // ------------------------------------------------------------- listings

  async getPopular(page) {
    return this.listPage(this.pagedUrl(ASTRO_LIST, "order=popular", page));
  }

  async getLatestUpdates(page) {
    return this.listPage(this.pagedUrl(ASTRO_LIST, "order=update", page));
  }

  async search(query, page, filters) {
    const text = cleanText(query);
    if (text) {
      return this.listPage(this.pagedUrl("/", "s=" + encodeQuery(text), page));
    }
    const picked = astroSelected(filters);
    if (picked.genre) {
      return this.listPage(this.pagedUrl("/genre/" + picked.genre + "/", "", page));
    }
    const params = ["order=" + encodeQuery(picked.order || "update")];
    if (picked.status) params.push("status=" + encodeQuery(picked.status));
    if (picked.type) params.push("type=" + encodeQuery(picked.type));
    return this.listPage(this.pagedUrl(ASTRO_LIST, params.join("&"), page));
  }

  /** Series cards (article.animpost) of any list page; the sidebar is skipped. */
  async listPage(url) {
    const doc = await this.pageDoc(url);
    if (!doc) return this.emptyPage();
    const cards = doc.select("article.animpost div.animposx > a[href]") || [];
    const list = [];
    const seen = {};
    for (let i = 0; i < cards.length; i++) {
      const href = cards[i].attr("href") || cards[i].getHref;
      if (!href || href.indexOf("/anime/") === -1 || seen[href]) continue;
      seen[href] = true;
      const img = cards[i].selectFirst("img");
      const name = cleanTitle(decodeEntities(cards[i].attr("title") ||
        cards[i].selectFirst("h2").text || img.attr("alt")));
      list.push(this.item(name, this.absolute(img.attr("src")), href));
    }
    return { list: list, hasNextPage: astroHasNext(doc) };
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

    const name = cleanTitle(doc.selectFirst("div.infox h1.entry-title").text ||
      doc.selectFirst("h1.entry-title").text);
    if (!name) {
      console.log("astronime: detail tidak ditemukan: " + seriesUrl);
      return empty;
    }
    const status = cleanText(doc.selectFirst("div.alternati").text);
    return {
      name: name,
      imageUrl: this.absolute(doc.selectFirst("div.thumb img").attr("src")),
      link: this.relativize(seriesUrl),
      description: cleanText(decodeEntities(doc.selectFirst("div.desc div.entry-content").text)),
      author: "",
      artist: "",
      status: /ongoing/i.test(status) ? 0 : /completed|tamat|finished/i.test(status) ? 1 : 5,
      genre: this.genresOf(doc),
      episodes: this.episodesOf(doc),
    };
  }

  /** A series URL as given; an episode URL resolved through its author box. */
  async seriesUrlOf(url) {
    if (url.indexOf("/anime/") !== -1) return url;
    const episode = await this.pageDoc(url);
    if (!episode) return "";
    const anchor = episode.selectFirst("div.authorbox a[href]");
    const href = anchor.attr("href") || anchor.getHref;
    if (href && href.indexOf("/anime/") !== -1) return this.resolve(href);
    console.log("astronime: tautan seri tidak ditemukan di " + url);
    return "";
  }

  genresOf(doc) {
    const links = doc.select("div.genre-info a") || [];
    const out = [];
    for (let i = 0; i < links.length; i++) {
      const genre = cleanText(links[i].text);
      if (genre && out.indexOf(genre) === -1) out.push(genre);
    }
    return out;
  }

  /** The site lists newest first, which is the order Mangayomi expects. */
  episodesOf(doc) {
    const rows = doc.select("div.lstepsiode ul li") || [];
    const seen = {};
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const anchor = rows[i].selectFirst("span.lchx a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href) continue;
      const key = this.relativize(this.resolve(href));
      if (seen[key]) continue;
      seen[key] = true;
      const number = cleanText(rows[i].selectFirst("span.eps a").text).replace(/^0+(?=\d)/, "");
      out.push({
        name: /^\d/.test(number) ? "Episode " + number : cleanText(anchor.text) || "Episode",
        url: key,
        dateUpload: astroDate(rows[i].selectFirst("span.date").text),
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

    const buttons = doc.select(".east_player_option") || [];
    const results = [];
    const skipped = [];
    for (let i = 0; i < buttons.length; i++) {
      const server = cleanText(buttons[i].text) || "Server " + (i + 1);
      const src = await this.ajaxEmbed(buttons[i], pageUrl);
      if (!src) {
        console.log("astronime: server " + server + " tidak memberi iframe");
        skipped.push(server);
        continue;
      }
      if (/apollo\./i.test(hostOf(src))) {
        console.log("astronime: server " + server + " dilewati (player terproteksi)");
        skipped.push(server);
        continue;
      }
      if (!isSupportedHost(src)) {
        console.log("astronime: server " + server + " tidak didukung (" + hostOf(src) + ")");
        skipped.push(server);
        continue;
      }
      const found = await extractByHost(this, src, pageUrl, "", "Hardsub ID");
      for (let v = 0; v < found.videos.length; v++) {
        const video = found.videos[v];
        video.server = server;
        video.quality = qualityLabel(resolutionOf(video.quality), server, "Hardsub ID");
        video.url = astroDownloadableAbyss(video.url);
        results.push(video);
      }
      if (!found.videos.length) {
        console.log("astronime: " + server + " tidak menghasilkan stream");
        skipped.push(server);
      }
    }
    if (!results.length && buttons.length) {
      throw new Error("Astronime: tidak ada server yang bisa diputar (" + skipped.join(", ") + ").");
    }
    const self = this;
    await this.mapLimit(results, 3, function (video) {
      return self.followAbyssRedirect(video);
    });
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  async ajaxEmbed(button, pageUrl) {
    const body = "action=player_ajax" +
      "&post=" + encodeQuery(button.attr("data-post")) +
      "&nume=" + encodeQuery(button.attr("data-nume")) +
      "&type=" + encodeQuery(button.attr("data-type") || "urliframe");
    const headers = this.headersFor(pageUrl);
    headers["X-Requested-With"] = "XMLHttpRequest";
    try {
      const res = await this.post(this.resolve("/wp-admin/admin-ajax.php"), body, headers);
      const src = res && res.body ? iframeSrc(res.body) : "";
      return src ? this.resolve(decodeEntities(src)) : "";
    } catch (e) {
      console.log("astronime: admin-ajax gagal: " + e);
      return "";
    }
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
        video.url = astroDownloadableAbyss(resolveUrl(video.url, loc));
      }
    } catch (e) {
      console.log("astronime: redirect Abyss gagal dibaca: " + e);
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
      select("order", "Urutkan", [["Baru diperbarui", "update"], ["Terpopuler", "popular"],
        ["Baru ditambahkan", "latest"], ["Rating tertinggi", "rating"], ["Favorit", "favorite"]]),
      select("status", "Status", [["Semua", ""], ["Sedang tayang", "Currently Airing"], ["Tamat", "Finished Airing"]]),
      select("type", "Tipe", [["Semua", ""], ["TV", "TV"], ["OVA", "OVA"], ["ONA", "ONA"],
        ["Special", "Special"], ["Movie", "Movie"]]),
      select("genre", "Genre", [["Semua", ""]].concat(ASTRO_GENRES)),
      { type_name: "HeaderFilter", type: "note",
        name: "Filter diabaikan saat mencari dengan kata kunci. Bila genre dipilih, urutan/status/tipe diabaikan." },
    ];
  }

  getSourcePreferences() {
    return this.basePreferences(ASTRO_SERVERS);
  }
}

function astroSelected(filters) {
  const out = { order: "", status: "", type: "", genre: "" };
  (filters || []).forEach(function (filter) {
    if (!filter || !filter.values || !filter.type || !(filter.type in out)) return;
    const option = filter.values[parseInt(filter.state, 10) || 0];
    if (option) out[filter.type] = safeString(option.value);
  });
  return out;
}

/** "Halaman 2 dari 7" -> another page exists. */
function astroHasNext(doc) {
  const text = cleanText(doc.selectFirst("div.pagination span").text);
  const m = /(\d+)\s*dari\s*(\d+)/i.exec(text);
  return !!(m && parseInt(m[1], 10) < parseInt(m[2], 10));
}

/** "24/11/2026" -> milliseconds as a string; "" when unreadable. */
function astroDate(value) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(safeString(value));
  if (!m) return "";
  const time = Date.UTC(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  return isNaN(time) ? "" : String(time);
}

/**
 * Mangayomi's downloader only takes a URL whose path ends in a video extension;
 * Abyss's `/sora/<size>/<token>` has none. The CDN serves the same file at
 * `<token>.mp4` (verified for Oploverz, 20 Nov 2026).
 */
function astroDownloadableAbyss(url) {
  const value = safeString(url);
  const m = /^(https?:\/\/[^/?#]+\/sora\/\d+\/[^/?#]+?)((?:[?#].*)?)$/i.exec(value);
  if (!m || /\.mp4$/i.test(m[1])) return value;
  return m[1] + ".mp4" + m[2];
}

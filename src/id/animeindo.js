// AnimeIndo (https://anime-indo.lol) — classic PHP site, no JSON routes.
//
// Latest cards link to an episode, and the episode slug does not always match
// the series slug, so those entries keep the episode link and getDetail follows
// its "Semua Episode" link. Every stream option is a `data-video` attribute on
// the episode page.

const mangayomiSources = [{
  "name": "AnimeIndo",
  "lang": "id",
  "baseUrl": "https://anime-indo.lol",
  "apiUrl": "",
  "iconUrl": "icons/animeindo.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.1",
  "pkgPath": "anime/src/id/animeindo.js",
  "hasCloudflare": true,
  "notes": "Domain bisa berpindah; atur di Pengaturan sumber. Tab Popular hanya satu halaman, sesuai daftar populer di situs."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const INDO_GENRES = [
  ["Action", "action"], ["Adventure", "adventure"], ["Anthropomorphic", "anthropomorphic"],
  ["Avant Garde", "avant-garde"], ["Cars", "cars"], ["CGDCT", "cgdct"], ["Childcare", "childcare"],
  ["Comedy", "comedy"], ["Crossdressing", "crossdressing"], ["Delinquents", "delinquents"],
  ["Dementia", "dementia"], ["Demons", "demons"], ["Detective", "detective"], ["Donghua", "donghua"],
  ["Drama", "drama"], ["Ecchi", "ecchi"], ["Educational", "educational"], ["Family", "family"],
  ["Fantasy", "fantasy"], ["Gag Humor", "gag-humor"], ["Game", "game"], ["Girls Love", "girls-love"],
  ["Gore", "gore"], ["Gourmet", "gourmet"], ["Harem", "harem"], ["High Stakes Game", "high-stakes-game"],
  ["Historical", "historical"], ["Horror", "horror"], ["Idols (Female)", "idols-female"],
  ["Idols (Male)", "idols-male"], ["Isekai", "isekai"], ["Iyashikei", "iyashikei"], ["Josei", "josei"],
  ["Kids", "kids"], ["Life", "life"], ["Live Action", "live-action"], ["Love Polygon", "love-polygon"],
  ["Love Status Quo", "love-status-quo"], ["Magic", "magic"], ["Magical Sex Shift", "magical-sex-shift"],
  ["Mahou Shoujo", "mahou-shoujo"], ["Martial Arts", "martial-arts"], ["Mecha", "mecha"],
  ["Medical", "medical"], ["Military", "military"], ["Music", "music"], ["Mystery", "mystery"],
  ["Mythology", "mythology"], ["Organized Crime", "organized-crime"], ["Otaku Culture", "otaku-culture"],
  ["Parody", "parody"], ["Performing Arts", "performing-arts"], ["Pets", "pets"], ["Police", "police"],
  ["Psychological", "psychological"], ["Racing", "racing"], ["Reincarnation", "reincarnation"],
  ["Reverse Harem", "reverse-harem"], ["Romance", "romance"], ["Romantic Subtext", "romantic-subtext"],
  ["Samurai", "samurai"], ["School", "school"], ["Sci-Fi", "sci-fi"], ["Seinen", "seinen"],
  ["Shoujo", "shoujo"], ["Shoujo Ai", "shoujo-ai"], ["Shounen", "shounen"], ["Shounen Ai", "shounen-ai"],
  ["Showbiz", "showbiz"], ["Slice of Life", "slice-of-life"], ["Space", "space"], ["Sports", "sports"],
  ["Strategy Game", "strategy-game"], ["Super Power", "super-power"], ["Supernatural", "supernatural"],
  ["Survival", "survival"], ["Suspense", "suspense"], ["Team Sports", "team-sports"],
  ["Thriller", "thriller"], ["Time Travel", "time-travel"], ["Tokusatsu", "tokusatsu"],
  ["Urban Fantasy", "urban-fantasy"], ["Vampire", "vampire"], ["Video Game", "video-game"],
  ["Villainess", "villainess"], ["Visual Arts", "visual-arts"], ["Work Life", "work-life"],
  ["Workplace", "workplace"],
];

const INDO_SERVERS = ["CEPAT", "B-TUBE", "MP4", "YUP"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://anime-indo.lol");
  }

  get supportsLatest() {
    return true;
  }

  /** A refusal throws, so it reaches the app's error card instead of a blank. */
  async pageDoc(url) {
    const res = await this.client.get(url, this.getHeaders(url));
    // The site answers 503 ("Waktu habis") for a series that does not exist, so
    // only 403 or Cloudflare's own marker counts as a refusal.
    const challenged = res && res.headers && res.headers["cf-mitigated"];
    if (res && (res.statusCode === 403 || challenged)) {
      throw new Error("Situs menolak permintaan (HTTP " + res.statusCode +
        "). Buka WebView lalu coba lagi.");
    }
    if (!res || !res.body || res.statusCode >= 400) {
      console.log("animeindo: gagal memuat " + url);
      return null;
    }
    return new Document(res.body);
  }

  pagedPath(base, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    return n === 1 ? base : base + "page/" + n + "/";
  }

  // ------------------------------------------------------------- listings

  /** The site has no popularity route beyond its one-page sidebar list. */
  async getPopular(page) {
    if ((parseInt(page, 10) || 1) > 1) return this.emptyPage();
    const doc = await this.pageDoc(this.resolve("/"));
    if (!doc) return this.emptyPage();
    const rows = doc.select("div.nganan table.ztable") || [];
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const anchor = rows[i].selectFirst("td.zvidesc a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href || href.indexOf("/anime/") === -1) continue;
      list.push(this.item(anchor.text, this.absolute(rows[i].selectFirst("td.zvithumb img").attr("src")), href));
    }
    return { list: list, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    const doc = await this.pageDoc(this.resolve(this.pagedPath("/", page)));
    if (!doc) return this.emptyPage();
    const anchors = doc.select("div.ngiri div.menu > a[href]") || [];
    const seen = {};
    const list = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href") || anchors[i].getHref;
      const series = indoSeriesKey(href);
      if (!series || seen[series]) continue;
      seen[series] = true;
      const img = anchors[i].selectFirst("img");
      list.push(this.item(
        anchors[i].selectFirst("p").text || img.attr("alt"),
        this.absolute(img.attr("data-original") || img.attr("src")),
        href,
      ));
    }
    return { list: list, hasNextPage: indoHasNext(doc) };
  }

  /**
   * Search has no working pagination: page 2 is a different subset and page 3
   * repeats it. Both are fetched once and merged into a single page.
   */
  async search(query, page, filters) {
    const text = cleanText(query);
    const route = this.selectedRoute(filters);
    if (route) {
      const doc = await this.pageDoc(this.resolve(this.pagedPath(route, page)));
      if (!doc) return this.emptyPage();
      let list = this.parseRows(doc);
      if (text) {
        const needle = text.toLowerCase();
        list = list.filter(function (entry) {
          return entry.name.toLowerCase().indexOf(needle) !== -1;
        });
      }
      return { list: list, hasNextPage: indoHasNext(doc) };
    }
    if (!text || (parseInt(page, 10) || 1) > 1) return this.emptyPage();

    const base = "/search/" + encodeQuery(text) + "/";
    const first = await this.pageDoc(this.resolve(base));
    if (!first) return this.emptyPage();
    const list = this.parseRows(first);
    const second = await this.pageDoc(this.resolve(base + "page/2/"));
    const seen = {};
    list.forEach(function (entry) { seen[entry.link] = true; });
    if (second) {
      this.parseRows(second).forEach(function (entry) {
        if (!seen[entry.link]) {
          seen[entry.link] = true;
          list.push(entry);
        }
      });
    }
    return { list: list, hasNextPage: false };
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

  parseRows(doc) {
    const rows = doc.select("table.otable") || [];
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const anchor = rows[i].selectFirst("td.videsc a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href || href.indexOf("/anime/") === -1) continue;
      list.push(this.item(anchor.text, this.absolute(rows[i].selectFirst("td.vithumb img").attr("src")), href));
    }
    return list;
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

    const name = cleanTitle(doc.selectFirst("h1.title").text);
    if (!name) {
      console.log("animeindo: detail tidak ditemukan: " + this.resolve(url));
      return empty;
    }

    return {
      name: name,
      imageUrl: this.absolute(doc.selectFirst("div.detail img").attr("src")),
      link: this.relativize(seriesUrl),
      description: cleanText(decodeEntities(doc.selectFirst("div.detail p").text)),
      author: "",
      artist: "",
      genre: this.genresOf(doc),
      episodes: this.episodesOf(doc),
    };
  }

  /** A series URL as given; an episode URL resolved through its nav link. */
  async seriesUrlOf(url) {
    if (url.indexOf("/anime/") !== -1) return url;
    const episode = await this.pageDoc(url);
    if (!episode) return "";
    const anchors = episode.select("div.navi a[href]") || [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href") || anchors[i].getHref;
      if (href && href.indexOf("/anime/") !== -1) return this.resolve(href);
    }
    console.log("animeindo: tautan seri tidak ditemukan di " + url);
    return "";
  }

  genresOf(doc) {
    const links = doc.select("div.detail li a") || [];
    const out = [];
    for (let i = 0; i < links.length; i++) {
      const genre = cleanText(links[i].text);
      if (genre && out.indexOf(genre) === -1) out.push(genre);
    }
    return out;
  }

  /** The site already lists episodes oldest first. */
  episodesOf(doc) {
    const anchors = doc.select("div.ep a[href]") || [];
    const seen = {};
    const out = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href") || anchors[i].getHref;
      if (!href) continue;
      const key = this.relativize(this.resolve(href));
      if (seen[key]) continue;
      seen[key] = true;
      const label = cleanText(anchors[i].text);
      out.push({
        name: /^\d/.test(label) ? "Episode " + label.replace(/^0+(?=\d)/, "") : label || "Episode",
        url: key,
        dateUpload: "",
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

    const results = [];
    const embeds = this.embedsOf(doc);
    for (let i = 0; i < embeds.length; i++) {
      const embed = embeds[i];
      const reason = unsupportedReason(embed.url);
      if (reason) {
        console.log("animeindo: server " + embed.server + " tidak didukung (" + reason + ")");
        continue;
      }
      if (!isSupportedHost(embed.url)) {
        console.log("animeindo: server " + embed.server +
          " tidak didukung (belum ada ekstraktor untuk " + hostOf(embed.url) + ")");
        continue;
      }
      const found = await extractByHost(this, embed.url, pageUrl, "", "Hardsub ID");
      for (let v = 0; v < found.videos.length; v++) {
        const video = found.videos[v];
        video.server = embed.server;
        video.quality = qualityLabel(resolutionOf(video.quality), embed.server, "Hardsub ID");
        results.push(video);
      }
      if (!found.videos.length) {
        console.log("animeindo: " + embed.server + " tidak menghasilkan stream");
      }
    }
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /** {url, server} per server button; the default player covers an empty list. */
  embedsOf(doc) {
    const anchors = doc.select("div.servers a.server") || [];
    const out = [];
    for (let i = 0; i < anchors.length; i++) {
      const src = anchors[i].attr("data-video");
      if (!src) continue;
      out.push({ url: this.resolve(decodeEntities(src)), server: cleanText(anchors[i].text) || "Server" });
    }
    if (!out.length) {
      const src = doc.selectFirst("iframe#tontonin").attr("src");
      if (src) out.push({ url: this.resolve(decodeEntities(src)), server: "AnimeIndo" });
    }
    return out;
  }

  // -------------------------------------------------------- configuration

  getFilterList() {
    const options = [
      { type_name: "SelectOption", name: "Semua", value: "" },
      { type_name: "SelectOption", name: "Film", value: "/movie/" },
    ];
    for (let i = 0; i < INDO_GENRES.length; i++) {
      options.push({
        type_name: "SelectOption",
        name: INDO_GENRES[i][0],
        value: "/genres/" + INDO_GENRES[i][1] + "/",
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
    return this.basePreferences(INDO_SERVERS);
  }
}

/** "/black-clover-episode-6/" -> "black-clover", to list a series only once. */
function indoSeriesKey(href) {
  const match = /([^/]+?)-episode-[^/]*\/?$/.exec(safeString(href));
  return match ? match[1] : "";
}

/** Only the last pagination element is a link when another page exists. */
function indoHasNext(doc) {
  const anchors = doc.select("div.pag a") || [];
  if (!anchors.length) return false;
  return anchors[anchors.length - 1].text.indexOf("»") !== -1;
}

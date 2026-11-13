// Samehadaku (https://v2.samehadaku.how) — WordPress theme "samehada".
//
// Cloudflare sits in front of the site and challenges some clients on some
// routes (`/anime/*` and paginated listings most often). The extension never
// solves a challenge: it opens those pages in the app's own WebView, as a normal
// browser does, because the app's HTTP client is refused there even when the
// WebView is not. First listing pages and episode pages use that WebView only
// after a refusal. A check that needs a person to tick a box still needs the
// person; it then surfaces as an error with the app's button.
//
// Every stream option is already on the episode page as `data-embed`, an
// escaped `<iframe>`. Blogger, Filedon and Wibufile play. Mega and gdriveplayer
// (the only option on many older episodes) are reported as unsupported.

const mangayomiSources = [{
  "name": "Samehadaku",
  "lang": "id",
  "baseUrl": "https://v2.samehadaku.how",
  "apiUrl": "",
  "iconUrl": "icons/samehadaku.jpg",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.6",
  "pkgPath": "anime/src/id/samehadaku.js",
  "hasCloudflare": true,
  "notes": "Domain bisa berpindah; atur di Pengaturan sumber. Bila muncul error Cloudflare, buka WebView dari layar error lalu coba lagi."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const SAME_GENRES = [
  ["Action", "action"], ["Adult Cast", "adult-cast"], ["Adventure", "adventure"],
  ["Anthropomorphic", "anthropomorphic"], ["Avant Garde", "avant-garde"],
  ["Award Winning", "award-winning"], ["CGDCT", "cgdct"], ["Childcare", "childcare"],
  ["Comedy", "comedy"], ["Delinquents", "delinquents"], ["Dementia", "dementia"],
  ["Demons", "demons"], ["Detective", "detective"], ["Drama", "drama"],
  ["Ecchi", "ecchi"], ["Family", "family"], ["Fantasy", "fantasy"],
  ["Gag Humor", "gag-humor"], ["Game", "game"], ["Gore", "gore"],
  ["Gourmet", "gourmet"], ["Harem", "harem"], ["High Stakes Game", "high-stakes-game"],
  ["Historical", "historical"], ["Horror", "horror"], ["Isekai", "isekai"],
  ["Iyashikei", "iyashikei"], ["Josei", "josei"], ["Kids", "kids"],
  ["Love Polygon", "love-polygon"], ["Love Status Quo", "love-status-quo"],
  ["Magic", "magic"], ["Mahou Shoujo", "mahou-shoujo"], ["Martial Arts", "martial-arts"],
  ["Mecha", "mecha"], ["Medical", "medical"], ["Military", "military"],
  ["Music", "music"], ["Mystery", "mystery"], ["Mythology", "mythology"],
  ["Organized Crime", "organized-crime"], ["Otaku Culture", "otaku-culture"],
  ["Parody", "parody"], ["Performing Arts", "performing-arts"], ["Police", "police"],
  ["Psychological", "psychological"], ["Reincarnation", "reincarnation"],
  ["Romance", "romance"], ["Romantic Subtext", "romantic-subtext"], ["Samurai", "samurai"],
  ["School", "school"], ["Sci-Fi", "sci-fi"], ["Seinen", "seinen"], ["Shoujo", "shoujo"],
  ["Shoujo Ai", "shoujo-ai"], ["Shounen", "shounen"], ["Showbiz", "showbiz"],
  ["Slice of Life", "slice-of-life"], ["Space", "space"], ["Sports", "sports"],
  ["Strategy Game", "strategy-game"], ["Super Power", "super-power"],
  ["Supernatural", "supernatural"], ["Survival", "survival"], ["Suspense", "suspense"],
  ["Team Sports", "team-sports"], ["Thriller", "thriller"], ["Time Travel", "time-travel"],
  ["Urban Fantasy", "urban-fantasy"], ["Vampire", "vampire"], ["Video Game", "video-game"],
  ["Villainess", "villainess"], ["Visual Arts", "visual-arts"], ["Work Life", "work-life"],
  ["Workplace", "workplace"],
];

const SAME_MONTHS = {
  januari: "January", februari: "February", maret: "March", april: "April",
  mei: "May", juni: "June", juli: "July", agustus: "August",
  september: "September", oktober: "October", november: "November",
  desember: "December",
};

// Labels as printed on the episode page. Mega is absent because its files are
// end-to-end encrypted, and "Server 2" because that is gdriveplayer.
const SAME_SERVERS = [
  "VIP STREAMING", "Wibufile 1080p", "Wibufile 720p", "Wibufile 480p", "Blogspot",
];

const SAME_NEXT_PAGE = ["div.pagination i#nextpagination"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://v2.samehadaku.how");
  }

  get supportsLatest() {
    return true;
  }

  // ------------------------------------------------------------- fetching

  /**
   * No User-Agent for the site itself. cf_clearance is bound to the UA that
   * earned it, and the app only attaches its stored UA when the request has
   * none, so an explicit one here makes every cleared request fail again.
   * The app also uses these headers for cover images.
   */
  getHeaders(url) {
    const headers = super.getHeaders(url);
    delete headers["User-Agent"];
    return headers;
  }

  /** Embed hosts and the player are not behind the site's Cloudflare. */
  headersFor(referer) {
    const headers = super.headersFor(referer);
    headers["User-Agent"] = this.userAgent();
    return headers;
  }

  /**
   * Like fetchDoc, but a Cloudflare refusal throws. A blank result here would
   * read as "this anime has no episodes" and hide the app's WebView button.
   */
  async pageDoc(url) {
    const res = await this.client.get(url, this.getHeaders(url));
    if (res && (res.statusCode === 403 || res.statusCode === 503)) {
      throw new Error("Cloudflare menolak permintaan (HTTP " + res.statusCode +
        "). Buka WebView lalu coba lagi.");
    }
    if (!res || !res.body || res.statusCode >= 400) {
      console.log("samehadaku: gagal memuat " + url);
      return null;
    }
    return new Document(res.body);
  }

  /**
   * The WebView goes first here. Plain HTTP on this route only earns a refusal,
   * after the app has spent up to 30 seconds on its resolver and raised its
   * "verification required" prompt.
   */
  async webviewFirstDoc(url, selector, marker) {
    const html = await this.webviewHtml(url, selector, marker);
    return html ? new Document(html) : this.pageDoc(url);
  }

  async webviewAfterRefusalDoc(url, selector, marker) {
    try {
      return await this.pageDoc(url);
    } catch (refused) {
      const html = await this.webviewHtml(url, selector, marker);
      if (!html) throw refused;
      return new Document(html);
    }
  }

  detailDoc(url) {
    return this.webviewFirstDoc(url, "h1[itemprop='headline']", 'itemprop="headline"');
  }

  episodeDoc(url) {
    return this.webviewAfterRefusalDoc(url, "div.player-server-btn", "player-server-btn");
  }

  /** Page 2 onward is where scrolling used to stall on the app's resolver. */
  listingDoc(url, page, selector, marker) {
    return parseInt(page, 10) > 1
      ? this.webviewFirstDoc(url, selector, marker)
      : this.webviewAfterRefusalDoc(url, selector, marker);
  }

  /** "" when the WebView is unavailable or never reached the real page. */
  async webviewHtml(url, selector, marker) {
    // Waits for the page's own content, so a page that is still loading (or a
    // browser check still running) is not returned as if it were the result.
    const script = "(function(){var n=0;var t=setInterval(function(){n++;" +
      "if(document.querySelector(" + JSON.stringify(selector) + ")||n>=100){" +
      "clearInterval(t);window.flutter_inappwebview.callHandler(" +
      "'setResponse',document.documentElement.outerHTML);}},250);})();";
    try {
      const html = safeString(await evaluateJavascriptViaWebview(url, {}, [script], 30));
      if (html.indexOf(marker) !== -1) return html;
      console.log("samehadaku: WebView tidak sampai ke halaman: " + url);
    } catch (e) {
      console.log("samehadaku: WebView gagal: " + e);
    }
    return "";
  }

  // ------------------------------------------------------------- listings

  catalogUrl(page, params) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const path = n === 1 ? "/daftar-anime-2/" : "/daftar-anime-2/page/" + n + "/";
    return this.resolve(path) + "?" + params;
  }

  catalogParams(title, status, type, order, genres) {
    let params = "title=" + encodeQuery(title) +
      "&status=" + encodeQuery(status) +
      "&type=" + encodeQuery(type) +
      "&order=" + encodeQuery(order);
    for (let i = 0; i < genres.length; i++) {
      params += "&genre%5B%5D=" + encodeQuery(genres[i]);
    }
    return params;
  }

  async catalog(page, params) {
    const doc = await this.listingDoc(this.catalogUrl(page, params), page, "article.animepost", "animepost");
    if (!doc) return this.emptyPage();
    return { list: this.parseCards(doc), hasNextPage: hasNextPage(doc, SAME_NEXT_PAGE) };
  }

  async getPopular(page) {
    return this.catalog(page, this.catalogParams("", "", "", "popular", []));
  }

  async getLatestUpdates(page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const path = n === 1 ? "/anime-terbaru/" : "/anime-terbaru/page/" + n + "/";
    const doc = await this.listingDoc(this.resolve(path), n, "div.post-show ul li", "post-show");
    if (!doc) return this.emptyPage();

    const rows = doc.select("div.post-show ul li") || [];
    const seen = {};
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      // The thumbnail links to the episode; the headline links to the series.
      const anchor = rows[i].selectFirst("h2.entry-title a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href || href.indexOf("/anime/") === -1 || seen[href]) continue;
      seen[href] = true;
      list.push(this.item(anchor.text, this.imageOf(rows[i].selectFirst("div.thumb img")), href));
    }
    return { list: list, hasNextPage: hasNextPage(doc, SAME_NEXT_PAGE) };
  }

  /**
   * `/?s=` mixes episode and batch posts into the results (one title can fill
   * 60 pages), so search goes through the catalog's own title filter instead.
   */
  async search(query, page, filters) {
    const text = cleanText(query);
    const status = this.selectValue(filters, "Status");
    const type = this.selectValue(filters, "Tipe");
    const order = this.selectValue(filters, "Urutan") || (text ? "title" : "latest");
    return this.catalog(
      page,
      this.catalogParams(text, status, type, order, this.checkedGenres(filters)),
    );
  }

  selectValue(filters, name) {
    if (!filters || !filters.length) return "";
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (!filter || filter.name !== name) continue;
      const option = (filter.values || [])[parseInt(filter.state, 10) || 0];
      return option ? safeString(option.value) : "";
    }
    return "";
  }

  checkedGenres(filters) {
    const out = [];
    if (!filters || !filters.length) return out;
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (!filter || filter.name !== "Genre") continue;
      const boxes = filter.state || [];
      for (let b = 0; b < boxes.length; b++) {
        if (boxes[b] && boxes[b].state === true) out.push(safeString(boxes[b].value));
      }
    }
    return out;
  }

  parseCards(doc) {
    const cards = doc.select("article.animepost") || [];
    const list = [];
    for (let i = 0; i < cards.length; i++) {
      const anchor = cards[i].selectFirst("div.animposx > a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href || href.indexOf("/anime/") === -1) continue;
      const name = anchor.attr("title") || cards[i].selectFirst("div.title h2").text;
      list.push(this.item(name, this.imageOf(cards[i].selectFirst("img.anmsa")), href));
    }
    return list;
  }

  imageOf(img) {
    return firstNonEmpty(img.attr("src"), img.getSrc, img.attr("data-src"), img.getDataSrc);
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    const doc = await this.detailDoc(this.resolve(url));
    if (!doc) return empty;

    const heading = doc.selectFirst("h1[itemprop='headline']");
    if (!cleanText(heading.text)) {
      console.log("samehadaku: detail tidak ditemukan: " + this.resolve(url));
      return empty;
    }
    const name = cleanTitle(heading.text);
    const info = this.infoFields(doc);
    const status = sameStatus(info.Status);

    const detail = {
      name: name,
      imageUrl: this.coverOf(doc),
      link: this.relativize(this.resolve(url)),
      description: this.descriptionOf(doc),
      author: info.Studio || "",
      artist: "",
      genre: this.genresOf(doc),
      episodes: this.episodesOf(doc, name),
    };
    if (status !== null) detail.status = status;
    return detail;
  }

  coverOf(doc) {
    return firstNonEmpty(
      this.imageOf(doc.selectFirst("img.object-cover")),
      doc.selectFirst("meta[property='og:image']").attr("content"),
    );
  }

  descriptionOf(doc) {
    const paragraphs = doc.select("div.entry-content-single p") || [];
    const parts = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const text = cleanText(decodeEntities(paragraphs[i].text));
      if (!text || /^judul lengkap\s*:/i.test(text) || /^sinopsis\s*:?$/i.test(text)) continue;
      parts.push(text.replace(/^sinopsis\s*:\s*/i, ""));
    }
    if (parts.length) return parts.join("\n\n");
    return cleanText(doc.selectFirst("meta[property='og:description']").attr("content"));
  }

  /** The "Status / Type / Studio ..." grid, keyed by its printed label. */
  infoFields(doc) {
    const rows = doc.select("div.grid > div.flex") || [];
    const out = {};
    for (let i = 0; i < rows.length; i++) {
      const spans = rows[i].select("span") || [];
      if (spans.length < 2) continue;
      out[cleanText(spans[0].text)] = cleanText(spans[1].text);
    }
    return out;
  }

  genresOf(doc) {
    // rel="tag" links belong to the recommendation cards further down.
    const links = doc.select("div.flex-wrap a[href*='/genre/']") || [];
    const out = [];
    for (let i = 0; i < links.length; i++) {
      if (links[i].attr("rel") === "tag") continue;
      const genre = cleanText(links[i].text);
      if (genre && out.indexOf(genre) === -1) out.push(genre);
    }
    return out;
  }

  episodesOf(doc, seriesName) {
    const items = doc.select("div.custom-scrollbar div.flex.items-center") || [];
    const seen = {};
    const rows = [];
    for (let i = 0; i < items.length; i++) {
      const anchor = items[i].selectFirst("h4 a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href || href.indexOf("/batch/") !== -1) continue;
      const key = this.relativize(resolveUrl(this.getBaseUrl(), href));
      if (seen[key]) continue;
      seen[key] = true;
      rows.push({
        name: cleanEpisodeName(anchor.text, seriesName),
        url: key,
        date: cleanText(items[i].selectFirst("div.flex-grow span").text),
      });
    }

    // The site lists newest first.
    rows.reverse();

    const dates = parseDates(
      rows.map(function (row) { return sameDate(row.date); }),
      "d MMMM yyyy",
      "en",
    );
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      out.push({
        name: rows[i].name || "Episode",
        url: rows[i].url,
        dateUpload: dates[i] || "",
        scanlator: "",
      });
    }
    return out;
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const pageUrl = this.resolve(url);
    const doc = await this.episodeDoc(pageUrl);
    if (!doc) return [];

    const embeds = await this.embedsOf(doc);
    const results = [];
    for (let i = 0; i < embeds.length; i++) {
      const embed = embeds[i];
      const reason = unsupportedReason(embed.url);
      if (reason) {
        console.log("samehadaku: server " + embed.server + " tidak didukung (" + reason + ")");
        continue;
      }
      if (!isSupportedHost(embed.url)) {
        console.log("samehadaku: server " + embed.server +
          " tidak didukung (belum ada ekstraktor untuk " + hostOf(embed.url) + ")");
        continue;
      }
      // Blogger serves a muxed MP4, so its subtitles are burned in. Filedon
      // hands over the raw .mkv, whose subtitles are the file's own tracks.
      const note = /blogger\.com|blogspot\.com/i.test(embed.url) ? "Hardsub ID" : "";
      const found = await extractByHost(this, embed.url, pageUrl, embed.server, note);
      for (let v = 0; v < found.videos.length; v++) {
        const video = found.videos[v];
        video.server = embed.server;
        video.quality = qualityLabel(
          resolutionOf(video.quality) || resolutionOf(embed.server),
          embed.server,
          note,
        );
        results.push(video);
      }
      if (!found.videos.length) {
        console.log("samehadaku: " + embed.server + " tidak menghasilkan stream");
      }
    }
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /** {url, server} per player button; AJAX covers an empty data-embed. */
  async embedsOf(doc) {
    const buttons = doc.select("div.player-server-btn") || [];
    const nonce = firstMatch(doc.outerHtml || "", /"nonce"\s*:\s*"([0-9a-f]+)"/i);
    const resolved = await this.mapLimit(buttons, 2, async (button) => {
      const server = cleanText(button.selectFirst("span").text) || "Server";
      let src = iframeSrc(decodeEntities(button.attr("data-embed")));
      if (!src && nonce) src = await this.ajaxEmbed(button, nonce);
      return src ? { url: src, server: server } : null;
    });

    const out = resolved.filter(function (entry) { return !!entry; });
    if (!out.length) {
      const iframe = doc.selectFirst("div#pembed iframe");
      const src = iframe.attr("src") || iframe.getSrc;
      if (src) out.push({ url: decodeEntities(src), server: "Samehadaku" });
    }
    return out;
  }

  async ajaxEmbed(button, nonce) {
    const body = "action=player_ajax&nonce=" + encodeQuery(nonce) +
      "&post=" + encodeQuery(button.attr("data-post")) +
      "&nume=" + encodeQuery(button.attr("data-nume")) +
      "&type=" + encodeQuery(button.attr("data-type") || "schtml");
    const headers = this.getHeaders();
    headers["X-Requested-With"] = "XMLHttpRequest";
    const res = await this.post(this.resolve("/wp-admin/admin-ajax.php"), body, headers);
    return res && res.body ? iframeSrc(res.body) : "";
  }

  // -------------------------------------------------------- configuration

  getFilterList() {
    const select = function (name, pairs) {
      return {
        type_name: "SelectFilter",
        type: name.toLowerCase(),
        name: name,
        state: 0,
        values: pairs.map(function (pair) {
          return { type_name: "SelectOption", name: pair[0], value: pair[1] };
        }),
      };
    };
    return [
      select("Status", [["Semua", ""], ["Sedang tayang", "Currently Airing"], ["Tamat", "Finished Airing"]]),
      select("Tipe", [["Semua", ""], ["TV", "TV"], ["OVA", "OVA"], ["ONA", "ONA"], ["Special", "Special"], ["Movie", "Movie"]]),
      select("Urutan", [["Bawaan", ""], ["Terpopuler", "popular"], ["Terbaru", "latest"], ["Baru diperbarui", "update"], ["Judul A-Z", "title"], ["Judul Z-A", "titlereverse"]]),
      {
        type_name: "GroupFilter",
        type: "genre",
        name: "Genre",
        state: SAME_GENRES.map(function (genre) {
          return { type_name: "CheckBox", type: "genre", name: genre[0], value: genre[1], state: false };
        }),
      },
    ];
  }

  getSourcePreferences() {
    const prefs = this.basePreferences(SAME_SERVERS);
    // Blogger only offers 360p; without 1080p here it would outrank the HD hosts.
    prefs[1].multiSelectListPreference.values = ["1080p", "720p", "480p", "360p"];
    return prefs;
  }
}

function sameStatus(value) {
  const text = safeString(value).toLowerCase();
  if (!text) return null;
  if (text.indexOf("currently") !== -1 || text.indexOf("ongoing") !== -1) return 0;
  if (text.indexOf("finished") !== -1 || text.indexOf("completed") !== -1) return 1;
  return null;
}

/** "10 November 2026" with the month name in English, for parseDates. */
function sameDate(value) {
  return safeString(value).replace(/[A-Za-z]+/g, function (word) {
    return SAME_MONTHS[word.toLowerCase()] || word;
  });
}

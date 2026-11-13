// Animangahub (https://animeindo.cloud) — a Nuxt site over a public JSON API.
//
// A different site from the other "AnimeIndo" (anime-indo.lol): same nickname,
// different operator. Everything (listings, detail, episodes, video sources)
// comes from `/api/anime-indo/...`, clean JSON, no gate.
//
// Video: the primary player is a Blogger embed (plays directly). Higher
// resolutions — up to MKV 1080p — are listed as mirrors (Filedon, Pixeldrain,
// ...) behind `link.desustream.com`, a redirector that decodes its token
// server-side and answers with a plain `302` to the real host. That hop needs
// nothing from us: read `Location`, hand the host to its extractor. The
// redirector is only probed for the File/Pixel mirrors this repo can play, and
// a single refused hop skips that mirror rather than the whole list.

const mangayomiSources = [{
  "name": "Animangahub",
  "lang": "id",
  "baseUrl": "https://animeindo.cloud",
  "apiUrl": "https://animeindo.cloud/api/anime-indo",
  "iconUrl": "icons/animangahub.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.3",
  "pkgPath": "anime/src/id/animangahub.js",
  "hasCloudflare": true,
  "notes": "Video utama Blogger (kualitas seadanya). Mirror Filedon/Pixeldrain membawa 1080p MP4 maupun MKV; keduanya diambil lewat redirector link.desustream.com yang membalas 302 ke host aslinya, jadi tidak ada gerbang yang perlu ditembus. Domain bisa berpindah; atur di Pengaturan."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const AMH_PER_PAGE = 24;
// Mirror labels this repo can actually play, best first. Every tier the site
// lists these under is tried (1080p MP4 and MKV both), so the highest quality
// the site holds is what the user sees.
const AMH_STREAM_MIRRORS = ["Filedon", "Pdrain", "KFiles"];
// Each mirror is resolved through link.desustream.com, which the app can only
// reach via a WebView hop (its HTTP client gets bounced). WebView hops are slow,
// so only this many are taken per episode — enough for a few qualities/servers
// without a long wait. The primary Desustream/Blogger server is always included.
const AMH_MIRROR_BUDGET = 6;
const AMH_SERVERS = ["Blogger", "Filedon", "Pixeldrain", "Krakenfiles"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://animeindo.cloud");
    this.apiBase = null;
  }

  get supportsLatest() {
    return true;
  }

  api() {
    if (this.apiBase) return this.apiBase;
    this.apiBase = this.getBaseUrl() + "/api/anime-indo";
    return this.apiBase;
  }

  /** GET a JSON API path. Throws on a Cloudflare refusal so the app can resolve it. */
  async getJson(path) {
    const url = /^https?:/i.test(path) ? path : this.api() + path;
    const res = await this.client.get(url, this.jsonHeaders());
    const challenged = res && res.headers && res.headers["cf-mitigated"];
    if (res && (res.statusCode === 403 || challenged)) {
      throw new Error("Situs menolak permintaan (HTTP " + res.statusCode + "). Buka WebView lalu coba lagi.");
    }
    if (!res || res.statusCode >= 400 || !res.body) {
      console.log("animangahub: API gagal " + url + " (HTTP " + (res && res.statusCode) + ")");
      return null;
    }
    try {
      return JSON.parse(res.body);
    } catch (e) {
      console.log("animangahub: JSON rusak dari " + url);
      return null;
    }
  }

  jsonHeaders() {
    return {
      "User-Agent": this.userAgent(),
      Accept: "application/json, text/plain, */*",
      "Accept-Language": DEFAULT_HEADERS["Accept-Language"],
      Referer: this.getBaseUrl() + "/",
    };
  }

  // ------------------------------------------------------------- listings

  async getPopular(page) {
    return this.browse("ongoing", page);
  }

  async getLatestUpdates(page) {
    if ((parseInt(page, 10) || 1) > 1) return this.emptyPage();
    const data = await this.getJson("/home");
    const rows = (data && data.data && data.data.recent_episodes) || [];
    const seen = {};
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const slug = safeString(rows[i].anime_slug);
      if (!slug || seen[slug]) continue;
      seen[slug] = true;
      list.push(this.item(rows[i].title, rows[i].thumb, "/anime/" + slug));
    }
    return { list: list, hasNextPage: false };
  }

  async search(query, page, filters) {
    const text = cleanText(query);
    if (!text) {
      const route = this.selectedRoute(filters);
      return route ? this.browse(route, page) : this.getPopular(page);
    }
    const n = Math.max(1, parseInt(page, 10) || 1);
    const data = await this.getJson("/search?q=" + encodeQuery(text) + "&page=" + n);
    const rows = (data && data.data) || [];
    const self = this;
    return {
      list: rows.map(function (row) { return self.item(row.title, row.thumb, "/anime/" + row.slug); }),
      hasNextPage: !!(data && data.total_page && n < parseInt(data.total_page, 10)),
    };
  }

  async browse(route, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    // Completed has no paged endpoint; the home list is a single page.
    if (route === "completed") {
      if (n > 1) return this.emptyPage();
      const data = await this.getJson("/home");
      return { list: oneHome(data, "completed").map(this.seriesItem, this), hasNextPage: false };
    }
    const path = route === "ongoing" ? "/ongoing?page=" + n : route;
    const data = await this.getJson(path);
    const block = (data && data.data) || {};
    const rows = block.items || [];
    const pag = block.pagination || {};
    return {
      list: rows.map(this.seriesItem, this),
      hasNextPage: !!(pag.page && pag.total && parseInt(pag.page, 10) < parseInt(pag.total, 10)),
    };
  }

  seriesItem(row) {
    return this.item(row.title, row.thumb, "/anime/" + row.slug);
  }

  selectedRoute(filters) {
    if (!filters || !filters.length) return "";
    for (let i = 0; i < filters.length; i++) {
      if (!filters[i] || filters[i].name !== "Kategori") continue;
      const option = (filters[i].values || [])[parseInt(filters[i].state, 10) || 0];
      return option ? safeString(option.value) : "";
    }
    return "";
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const slug = amhSlug(url);
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    if (!slug) return empty;
    const data = await this.getJson("/detail/" + encodeQuery(slug));
    const anime = data && data.data && data.data.anime;
    if (!anime) {
      console.log("animangahub: detail tidak ditemukan: " + slug);
      return empty;
    }
    const episodes = (data.data.episodes || []).map(function (ep) {
      const number = safeString(ep.number);
      return {
        name: number ? "Episode " + number : cleanText(ep.title) || "Episode",
        url: "/episode/" + safeString(ep.slug),
        dateUpload: amhDate(ep.date),
        scanlator: "",
      };
    });
    const facts = [];
    if (anime.type) facts.push("Tipe: " + anime.type);
    if (anime.studio) facts.push("Studio: " + anime.studio);
    if (anime.season && anime.season_year) facts.push("Musim: " + anime.season + " " + anime.season_year);
    if (anime.duration) facts.push("Durasi: " + anime.duration + " mnt");
    if (anime.score) facts.push("Skor: " + anime.score);
    const synopsis = cleanText(decodeEntities(anime.description));

    const detail = {
      name: cleanTitle(anime.title),
      imageUrl: safeString(anime.thumb),
      link: "/anime/" + slug,
      description: [synopsis, facts.join(" · ")].filter(Boolean).join("\n\n"),
      author: safeString(anime.studio),
      artist: safeString(anime.producer),
      genre: Array.isArray(anime.genre) ? anime.genre.map(safeString).filter(Boolean) : [],
      episodes: episodes,
    };
    if (/airing|ongoing/i.test(anime.status)) detail.status = 0;
    else if (/finished|completed|selesai/i.test(anime.status)) detail.status = 1;
    return detail;
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const slug = amhSlug(url);
    if (!slug) return [];
    const data = await this.getJson("/sources/" + encodeQuery(slug));
    if (!data) return [];
    const results = [];

    // Primary players first: a Blogger embed, or a desustream.net player reached
    // through a `?url=` proxy/worker wrapper. Different episodes use different
    // ones, so every source is unwrapped and de-duplicated.
    const sources = data.sources || [];
    const seen = {};
    for (let i = 0; i < sources.length; i++) {
      const target = amhUnwrap(safeString(sources[i].url));
      if (!/^https?:\/\//i.test(target) || seen[target]) continue;
      seen[target] = true;
      const videos = await this.resolveEmbed(target, cleanText(sources[i].label) || "Server");
      videos.forEach(function (v) { results.push(v); });
    }

    // Mirror tiers, highest resolution first, so 1080p leads every list. The
    // WebView hop is rationed (AMH_MIRROR_BUDGET) and the host order is honoured,
    // so the budget is spent on the best qualities/servers first.
    this._desuWebview = false;
    this._webviewBudget = AMH_MIRROR_BUDGET;
    const tiers = this.orderedTiers(data.resolutions || []);
    const resolvedSeen = {};
    for (let t = 0; t < tiers.length; t++) {
      const tier = tiers[t];
      const mirrors = (tier.mirrors || []).filter(function (m) {
        return AMH_STREAM_MIRRORS.indexOf(safeString(m.label)) !== -1;
      }).sort(function (a, b) {
        return AMH_STREAM_MIRRORS.indexOf(safeString(a.label)) - AMH_STREAM_MIRRORS.indexOf(safeString(b.label));
      });
      for (let m = 0; m < mirrors.length; m++) {
        const real = await this.resolveDesustream(mirrors[m].url);
        if (!real || resolvedSeen[real]) continue;
        resolvedSeen[real] = true;
        const videos = await this.resolveEmbed(real, cleanText(mirrors[m].label), tier.resolution);
        videos.forEach(function (v) { results.push(v); });
      }
    }
    if (!results.length) console.log("animangahub: tidak ada server yang bisa diputar untuk " + slug);
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /** MKV/MP4 tiers, highest resolution first (1080p leads). */
  orderedTiers(resolutions) {
    return (resolutions || []).slice().sort(function (a, b) {
      return (parseInt(b.resolution, 10) || 0) - (parseInt(a.resolution, 10) || 0);
    });
  }

  /**
   * One link.desustream.com hop: a server-side token→host mapper that answers
   * `302` with the real mirror under `Location`. Returns that URL, or "" when
   * there is no usable location (the mirror is then simply skipped).
   */
  async resolveDesustream(mirrorUrl) {
    const url = safeString(mirrorUrl);
    if (!/link\.desustream\./i.test(url)) return url;
    // Fast path: the HTTP client reads the 302 Location directly. This works on
    // some networks; where `link.desustream.com` bounces the app's client (by
    // its TLS fingerprint), the Location points back to a landing page instead.
    if (!this._desuWebview) {
      const viaHttp = await this.desustreamHttp(url);
      if (viaHttp) return viaHttp;
      // Bounced once — a real browser is accepted, so switch to the WebView and
      // stay there for the rest of this episode.
      this._desuWebview = true;
    }
    return this.desustreamWebview(url);
  }

  async desustreamHttp(url) {
    try {
      const client = new Client({ followRedirects: false });
      const res = await client.get(url, this.headersFor(this.getBaseUrl() + "/"));
      const loc = safeString(res && res.headers && (res.headers.location || res.headers.Location));
      return desustreamReal(loc) ? loc : "";
    } catch (e) {
      console.log("animangahub: hop desustream (http) gagal: " + e);
      return "";
    }
  }

  /**
   * link.desustream.com hands the real mirror host to a browser but bounces the
   * app's HTTP client. Loading it in the app WebView (a real browser) follows
   * the 302 to filedon/pixeldrain; the final URL is read back. Hops are rationed
   * by `_webviewBudget` because each one is a full page load.
   */
  async desustreamWebview(url) {
    if (!this._webviewBudget || this._webviewBudget <= 0) return "";
    this._webviewBudget--;
    const script = "(function(){var n=0;var t=setInterval(function(){n++;" +
      "if(!/link\\.desustream/i.test(location.href)||n>=80){clearInterval(t);" +
      "window.flutter_inappwebview.callHandler('setResponse',location.href);}},250);})();";
    try {
      const href = safeString(await evaluateJavascriptViaWebview(url, {}, [script], 25));
      if (desustreamReal(href)) return href;
      console.log("animangahub: WebView desustream mendarat di " + hostOf(href) + "; dilewati");
    } catch (e) {
      console.log("animangahub: WebView desustream gagal: " + e);
    }
    return "";
  }

  async resolveEmbed(embedUrl, serverLabel, siteQuality) {
    const url = safeString(embedUrl);
    const server = amhServer(url, serverLabel);
    const reason = unsupportedReason(url);
    if (reason) {
      console.log("animangahub: server " + server + " tidak didukung (" + reason + ")");
      return [];
    }
    if (!isSupportedHost(url)) {
      console.log("animangahub: server " + server + " tidak didukung (belum ada ekstraktor untuk " + hostOf(url) + ")");
      return [];
    }
    const found = await extractByHost(this, url, this.getBaseUrl() + "/", siteQuality || "", "Hardsub ID");
    return found.videos.map(function (video) {
      video.server = server;
      video.quality = qualityLabel(resolutionOf(video.quality) || resolutionOf(siteQuality), server, "Hardsub ID");
      return video;
    });
  }

  // -------------------------------------------------------- configuration

  getFilterList() {
    const options = [
      { type_name: "SelectOption", name: "Ongoing", value: "ongoing" },
      { type_name: "SelectOption", name: "Completed", value: "completed" },
    ];
    for (let i = 0; i < AMH_GENRES.length; i++) {
      options.push({ type_name: "SelectOption", name: AMH_GENRES[i][0], value: "/genre/" + AMH_GENRES[i][1] });
    }
    return [{ type_name: "SelectFilter", type: "kategori", name: "Kategori", state: 0, values: options }];
  }

  getSourcePreferences() {
    return this.basePreferences(AMH_SERVERS);
  }
}

const AMH_GENRES = [
  ["Action", "action"], ["Adventure", "adventure"], ["Comedy", "comedy"], ["Demons", "demons"],
  ["Drama", "drama"], ["Ecchi", "ecchi"], ["Fantasy", "fantasy"], ["Game", "game"],
  ["Harem", "harem"], ["Historical", "historical"], ["Horror", "horror"], ["Josei", "josei"],
  ["Magic", "magic"], ["Martial Arts", "martial-arts"], ["Mecha", "mecha"], ["Military", "military"],
  ["Music", "music"], ["Mystery", "mystery"], ["Parody", "parody"], ["Police", "police"],
  ["Psychological", "psychological"], ["Romance", "romance"], ["Samurai", "samurai"],
  ["School", "school"], ["Sci-Fi", "sci-fi"], ["Seinen", "seinen"], ["Shoujo", "shoujo"],
  ["Shounen", "shounen"], ["Slice of Life", "slice-of-life"], ["Space", "space"], ["Sports", "sports"],
  ["Super Power", "super-power"], ["Supernatural", "supernatural"], ["Thriller", "thriller"],
  ["Vampire", "vampire"],
];

/** home response -> one of its lists. */
function oneHome(data, key) {
  return (data && data.data && data.data[key]) || [];
}

/** `/desustream-proxy?url=X`, `embed-resolver…workers.dev/?url=X` -> X. */
function amhUnwrap(url) {
  if (!/desustream-proxy|embed-resolver|workers\.dev/i.test(url)) return url;
  const match = /[?&]url=([^&]+)/.exec(url);
  if (!match) return url;
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
}

/** "/anime/<slug>", "/episode/<ep-slug>", or a bare slug -> the slug. */
function amhSlug(url) {
  const s = safeString(url);
  const match = /\/(?:anime|episode|detail|sources|nonton)\/([^/?#]+)/.exec(s);
  if (match) return match[1];
  return s.replace(/^\/+|\/+$/g, "").split("/").pop();
}

/** "11 November,2026" / "12 Nov" -> milliseconds string, or "". */
function amhDate(text) {
  const t = Date.parse(safeString(text).replace(",", " "));
  return t > 0 ? String(t) : "";
}

/** A desustream hop that reached a real file host (not a landing/bounce). */
function desustreamReal(loc) {
  const url = safeString(loc);
  if (!/^https?:\/\//i.test(url)) return false;
  return !/link\.desustream|otakudesu\.|animeindo\.cloud|animangahub\./i.test(hostOf(url));
}

function amhServer(url, label) {
  const host = hostOf(url);
  if (/blogger|blogspot|googlevideo/i.test(host)) return "Blogger";
  if (/filedon/i.test(host)) return "Filedon";
  if (/pixeldrain/i.test(host)) return "Pixeldrain";
  if (/krakenfiles/i.test(host)) return "Krakenfiles";
  if (/desustream|odcloud|odcdn|odstream|archive\.org/i.test(host)) return "Desustream";
  const name = cleanText(label);
  return name || host || "Server";
}

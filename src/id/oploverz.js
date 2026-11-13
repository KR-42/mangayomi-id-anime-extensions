// Oploverz (https://oploverz.diy) — a SvelteKit front end over a public JSON API
// (backapi.oploverz.ac, `access-control-allow-origin: *`).
//
// Everything comes from the API: series lists, a series, its episodes, and one
// episode's `streamUrl` list. Two video back-ends carry the streams:
//   - upbolt.to (XFileSharing, most new episodes): the embed is a click-to-play
//     form; the extension submits it the way the play button does and reads the
//     HLS master from the player page. Using upbolt was approved 11 Nov 2026.
//     The /dl POST is Cloudflare-gated: the app resolves the challenge itself
//     (headless WebView / FlareSolverr) and, failing that, the extension replays
//     the POST in the app's WebView (evaluateJavascriptViaWebview). If that still
//     does not clear, the user solves it once via the WebView button.
//   - player.abyssplayer.com (~40% of episodes): the page embeds a base64
//     `datas` payload whose `media` field is AES-256-CTR encrypted; the
//     extension decrypts it in pure JS and builds the signed /sora/ mp4 URLs
//     (see src-shared/30-abyss.js). Only public content is read.

const mangayomiSources = [{
  "name": "Oploverz",
  "lang": "id",
  "baseUrl": "https://oploverz.diy",
  "apiUrl": "https://backapi.oploverz.ac/api",
  "iconUrl": "icons/oploverz.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.2.1",
  "pkgPath": "anime/src/id/oploverz.js",
  "hasCloudflare": true,
  "notes": "Data dari API situs. Episode di upbolt dan abyssplayer bisa diputar langsung; bila upbolt menampilkan tantangan Cloudflare, selesaikan lewat tombol WebView atau atur FlareSolverr. Tab Popular berisi seri berlabel hot."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const OPLO_API = "https://backapi.oploverz.ac/api";
const OPLO_UPLOADS = "https://backapi.oploverz.ac/uploads/";
const OPLO_PER_PAGE = 24;
const OPLO_GENRES = [
  ["Action", "action"], ["Adventure", "adventure"], ["Cars", "cars"], ["Comedy", "comedy"],
  ["Crime", "crime"], ["Demons", "demons"], ["Donghua", "donghua"], ["Drama", "drama"],
  ["Ecchi", "ecchi"], ["Fantasy", "fantasy"], ["Game", "game"], ["Gore", "gore"], ["Gourmet", "gourmet"],
  ["Harem", "harem"], ["Historical", "historical"], ["Horror", "horror"], ["Isekai", "isekai"],
  ["Josei", "josei"], ["Live Action", "live-action"], ["Magic", "magic"], ["Martial Arts", "martial-arts"],
  ["Mecha", "mecha"], ["Medical", "medical"], ["Military", "military"], ["Music", "music"],
  ["Mystery", "mystery"], ["Mythology", "mythology"], ["Parody", "parody"], ["Police", "police"],
  ["Psychological", "psychological"], ["Racing", "racing"], ["Reincarnation", "reincarnation"],
  ["Romance", "romance"], ["Samurai", "samurai"], ["School", "school"], ["Sci-Fi", "sci-fi"],
  ["Seinen", "seinen"], ["Shoujo", "shoujo"], ["Shounen", "shounen"], ["Showbiz", "showbiz"],
  ["Slice of Life", "slice-of-life"], ["Space", "space"], ["Sports", "sports"],
  ["Super Power", "super-power"], ["Supernatural", "supernatural"], ["Survival", "survival"],
  ["Suspense", "suspense"], ["Thriller", "thriller"], ["Vampire", "vampire"],
];
const OPLO_SORTS = [["Terbaru ditambahkan", "createdAt-desc"], ["Tanggal rilis", "releaseDate-desc"], ["Judul A-Z", "title-asc"], ["Judul Z-A", "title-desc"]];
const OPLO_SERVERS = ["Upbolt", "Abyss", "Filedon", "Blogger"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://oploverz.diy");
  }

  get supportsLatest() {
    return true;
  }

  async api(path) {
    const res = await this.client.get(OPLO_API + path, { "User-Agent": this.userAgent(), Accept: "application/json" });
    if (!res || res.statusCode !== 200) {
      if (res && (res.statusCode === 403 || res.statusCode === 503)) {
        throw new Error("API Oploverz menolak permintaan (HTTP " + res.statusCode + ").");
      }
      console.log("oploverz: API " + path + " -> HTTP " + (res && res.statusCode));
      return null;
    }
    try {
      return JSON.parse(res.body);
    } catch (e) {
      console.log("oploverz: JSON rusak dari " + path);
      return null;
    }
  }

  // ------------------------------------------------------------- listings

  async getPopular(page) {
    return this.seriesPage("hot=true&sortBy=createdAt-desc", page);
  }

  /** Newest episodes site-wide, one entry per series. */
  async getLatestUpdates(page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const data = await this.api("/episodes?page=" + n + "&pageSize=" + OPLO_PER_PAGE * 2 + "&sort=latest");
    if (!data || !data.data) return this.emptyPage();
    const seen = {};
    const list = [];
    for (let i = 0; i < data.data.length; i++) {
      const series = data.data[i].series;
      if (!series || !series.slug || seen[series.slug]) continue;
      seen[series.slug] = true;
      list.push(this.seriesItem(series));
    }
    return { list: list, hasNextPage: oploHasNext(data.meta) };
  }

  async search(query, page, filters) {
    const params = [];
    const text = cleanText(query);
    if (text) params.push("q=" + encodeQuery(text));
    const picked = oploSelected(filters);
    if (picked.genre) params.push("genres=" + encodeQuery(picked.genre));
    params.push("sortBy=" + encodeQuery(picked.sort || "createdAt-desc"));
    return this.seriesPage(params.join("&"), page);
  }

  async seriesPage(query, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const data = await this.api("/series?page=" + n + "&pageSize=" + OPLO_PER_PAGE + "&" + query);
    if (!data || !data.data) return this.emptyPage();
    const self = this;
    return {
      list: data.data.map(function (series) { return self.seriesItem(series); }),
      hasNextPage: oploHasNext(data.meta),
    };
  }

  seriesItem(series) {
    return this.item(series.title, oploPoster(series.poster), "/series/" + series.slug);
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const slug = oploSlug(url);
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    if (!slug) return empty;
    const one = await this.api("/series/" + encodeQuery(slug));
    const series = one && one.data;
    if (!series) {
      console.log("oploverz: seri tidak ditemukan: " + slug);
      return empty;
    }
    const facts = [];
    if (series.japaneseTitle && series.japaneseTitle !== series.title) facts.push("Judul Jepang: " + series.japaneseTitle);
    if (series.releaseType) facts.push("Tipe: " + series.releaseType);
    if (series.season && series.season.name) facts.push("Musim: " + series.season.name);
    if (series.duration) facts.push("Durasi: " + series.duration);
    if (series.score) facts.push("Skor: " + series.score);

    const detail = {
      name: cleanTitle(series.title),
      imageUrl: oploPoster(series.poster),
      link: "/series/" + slug,
      description: [cleanText(series.description), facts.join(" · ")].filter(Boolean).join("\n\n"),
      author: series.studio && series.studio.name ? safeString(series.studio.name) : "",
      artist: "",
      genre: (series.genres || []).map(function (g) { return safeString(g && g.name); }).filter(Boolean),
      episodes: await this.episodesOf(slug, series),
    };
    if (/ongoing/i.test(series.status)) detail.status = 0;
    else if (/completed/i.test(series.status)) detail.status = 1;
    return detail;
  }

  /** The API lists newest first, the order the app shows; 500 per request. */
  async episodesOf(slug, series) {
    const out = [];
    const movie = /movie/i.test(series.releaseType);
    for (let page = 1; page <= 10; page++) {
      const data = await this.api("/series/" + encodeQuery(slug) + "/episodes?page=" + page + "&pageSize=500");
      if (!data || !data.data) break;
      for (let i = 0; i < data.data.length; i++) {
        const ep = data.data[i];
        const number = safeString(ep.episodeNumber);
        if (!number) continue;
        const title = cleanText(ep.title);
        out.push({
          name: movie && data.data.length === 1 && page === 1 ? "Film" : "Episode " + number + (title ? ": " + title : ""),
          url: "/series/" + slug + "/episode/" + number,
          dateUpload: oploDate(ep.releasedAt || ep.createdAt),
          scanlator: safeString(ep.subbed),
        });
      }
      if (!oploHasNext(data.meta)) break;
    }
    return out;
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const match = /\/series\/([^/?#]+)\/episode\/([^/?#]+)/.exec(safeString(url));
    if (!match) return [];
    const data = await this.api("/series/" + encodeQuery(match[1]) + "/episodes/" + encodeQuery(match[2]));
    const episode = data && data.data;
    if (!episode) throw new Error("Oploverz: episode tidak ditemukan di API.");
    const streams = (episode.streamUrl || []).filter(function (s) {
      return s && /^https?:\/\//i.test(safeString(s.url));
    });

    const pageUrl = this.resolve("/series/" + match[1] + "/episode/" + match[2]);
    this.upboltChallenged = false;
    const self = this;
    const found = await this.mapLimit(streams, 2, function (stream) {
      return self.resolveStream(stream, pageUrl);
    });
    const results = [];
    found.forEach(function (videos) {
      (videos || []).forEach(function (video) { results.push(video); });
    });
    if (!results.length) {
      if (this.upboltChallenged) {
        throw new Error("Oploverz: Upbolt menampilkan tantangan Cloudflare yang belum terlewati. " +
          "Selesaikan sekali lewat tombol WebView, atau atur FlareSolverr/Byparr di Pengaturan umum, " +
          "lalu buka episode ini lagi.");
      }
      const hosts = streams.map(function (s) { return hostOf(s.url); });
      throw new Error("Oploverz: tidak ada server yang bisa diputar" +
        (hosts.length ? " (" + hosts.filter(function (h, i) { return hosts.indexOf(h) === i; }).join(", ") + ")" : "") + ".");
    }
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  async resolveStream(stream, pageUrl) {
    const url = safeString(stream.url);
    const siteQuality = resolutionOf(stream.source);
    const server = oploServer(url);
    const label = function (video) {
      video.server = server;
      video.quality = qualityLabel(resolutionOf(video.quality) || siteQuality, server, "Hardsub ID");
      return video;
    };
    if (/upbolt\./i.test(url)) return (await this.upbolt(url)).map(label);
    const reason = unsupportedReason(url);
    if (reason) {
      console.log("oploverz: " + server + " tidak didukung (" + reason + ")");
      return [];
    }
    if (!isSupportedHost(url)) {
      console.log("oploverz: " + server + " tidak didukung (belum ada ekstraktor untuk " + hostOf(url) + ")");
      return [];
    }
    const found = await extractByHost(this, url, pageUrl, siteQuality, "Hardsub ID");
    return found.videos.map(label);
  }

  /**
   * `upbolt.to/e/<code>` shows a play button whose form posts
   * `op=embed&file_code=<code>&auto=1` to `/dl`; the answer is the player page,
   * with `file:"<HLS master>"` in its jwplayer setup.
   *
   * The POST is usually Cloudflare-challenged (`cf-mitigated: challenge`). The
   * app's client resolves that itself (headless WebView / FlareSolverr, up to
   * two tries) before we read the response. When it still does not clear, we
   * open the page in the app's WebView and replay the /dl POST in-page, where
   * the WebView's own cf_clearance applies (evaluateJavascriptViaWebview).
   */
  async upbolt(embedUrl) {
    const origin = (/^https?:\/\/[^/]+/.exec(embedUrl) || [""])[0];
    const code = safeString(embedUrl.split("?")[0].split("/").pop()).replace(/\.html$/, "");
    if (!origin || !code) return [];
    const body = "op=embed&file_code=" + encodeQuery(code) + "&auto=1&referer=" + encodeQuery(this.getBaseUrl() + "/");

    let master = "";
    let challenged = false;
    try {
      const headers = this.headersFor(embedUrl);
      headers.Origin = origin;
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const res = await this.client.post(origin + "/dl", headers, body);
      if (res && res.statusCode === 200) {
        const m = /file\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/.exec(safeString(res.body));
        master = m ? m[1] : "";
      } else if (res && oploUpboltChallenge(res)) {
        challenged = true;
      } else {
        console.log("oploverz: upbolt menjawab HTTP " + (res && res.statusCode));
      }
    } catch (e) {
      console.log("oploverz: upbolt POST gagal: " + e);
    }
    if (master) return this.upboltFromMaster(embedUrl, origin, master);

    if (challenged) {
      console.log("oploverz: upbolt tertahan Cloudflare; mencoba lewat WebView");
      const webMaster = await this.upboltViaWebview(embedUrl, body);
      if (webMaster) return this.upboltFromMaster(embedUrl, origin, webMaster);
      this.upboltChallenged = true;
      return [];
    }
    console.log("oploverz: upbolt tanpa playlist (" + code + ")");
    return [];
  }

  /** A /dl master URL -> the per-variant video list (fetch and split the playlist). */
  async upboltFromMaster(embedUrl, origin, masterUrl) {
    const playHeaders = this.headersFor(origin + "/");
    let variants = [];
    try {
      variants = hlsVariants(masterUrl, await this.fetch(masterUrl, playHeaders));
    } catch (e) {
      console.log("oploverz: master upbolt gagal: " + e);
    }
    const list = variants.length ? variants : [{ url: masterUrl, quality: "" }];
    return list.map(function (v) {
      return { url: v.url, originalUrl: embedUrl, quality: v.quality, headers: playHeaders };
    });
  }

  /**
   * Cloudflare fallback for upbolt: load the embed page in the app's WebView
   * (it solves the challenge), then POST /dl in-page and poll until the player
   * page answers with its HLS master. Returns the master URL, or "" on failure.
   */
  async upboltViaWebview(embedUrl, dlBody) {
    const script =
      "(function(){" +
      "var b=" + JSON.stringify(dlBody) + ";" +
      'function done(v){try{window.flutter_inappwebview.callHandler("setResponse",v)}catch(e){}}' +
      "var n=0;" +
      'function go(){fetch("/dl",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:b,credentials:"include"})' +
      ".then(function(r){return r.text()})" +
      '.then(function(h){var m=/file\\s*:\\s*"([^"]+\\.m3u8[^"]*)"/.exec(h);' +
      "if(m){done(m[1]);return}" +
      'if(n<40){n++;setTimeout(go,1000)}else done("")})' +
      '.catch(function(){if(n<40){n++;setTimeout(go,1000)}else done("")});' +
      "}" +
      "go();" +
      "})();";
    try {
      const out = safeString(await evaluateJavascriptViaWebview(embedUrl, {}, [script], 45));
      const m = /^(https?:\/\/[^\s"]+\.m3u8[^\s"]*)$/i.exec(out);
      return m ? m[1] : "";
    } catch (e) {
      console.log("oploverz: WebView upbolt gagal: " + e);
      return "";
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
      select("sort", "Urutkan", OPLO_SORTS),
      select("genre", "Genre", [["Semua", ""]].concat(OPLO_GENRES)),
    ];
  }

  getSourcePreferences() {
    return this.basePreferences(OPLO_SERVERS);
  }
}

function oploSelected(filters) {
  const out = { sort: "", genre: "" };
  (filters || []).forEach(function (filter) {
    if (!filter || !filter.values || !filter.type) return;
    const option = filter.values[parseInt(filter.state, 10) || 0];
    if (option) out[filter.type] = safeString(option.value);
  });
  return out;
}

function oploHasNext(meta) {
  return !!(meta && meta.currentPage < meta.lastPage);
}

/** Posters arrive absolute or as `posters/<file>` under the uploads folder. */
function oploPoster(poster) {
  const value = safeString(poster);
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : OPLO_UPLOADS + value.replace(/^\/+/, "").replace(/^uploads\//, "");
}

/** "/series/<slug>", "/series/<slug>/episode/3", "/movie/<slug>/..." -> "<slug>". */
function oploSlug(url) {
  const match = /\/(?:series|movie)\/([^/?#]+)/.exec(safeString(url));
  return match ? match[1] : "";
}

/** Milliseconds as a string, the form the app stores; "" for the API's 1970 placeholder. */
function oploDate(iso) {
  const time = Date.parse(safeString(iso));
  return time > 86400000 ? String(time) : "";
}

function oploServer(url) {
  const host = hostOf(url);
  if (/upbolt/i.test(host)) return "Upbolt";
  if (/filedon/i.test(host)) return "Filedon";
  if (/blogger|blogspot/i.test(host)) return "Blogger";
  if (/abyss/i.test(host)) return "Abyss";
  if (/dailymotion/i.test(host)) return "Dailymotion";
  return host || "Server";
}

/**
 * True when a client response is a Cloudflare challenge. The app flags the
 * real signal in the `cf-mitigated: challenge` response header; the "Just a
 * moment" body marker is a fallback for responses that carry it without the
 * header. Either one means the plain request did not get through.
 */
function oploUpboltChallenge(res) {
  if (!res || res.statusCode < 400) return false;
  const headers = res.headers || {};
  for (const key in headers) {
    if (key.toLowerCase() === "cf-mitigated" && safeString(headers[key]).toLowerCase() === "challenge") {
      return true;
    }
  }
  return /Just a moment|challenge-platform/i.test(safeString(res.body));
}

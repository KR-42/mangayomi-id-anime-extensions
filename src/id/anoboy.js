// Anoboy (https://anoboy.at) — a WordPress site (ezyreader theme).
//
// Anoboy changes domain often, so the active domain is user-settable: a
// dropdown of known domains plus a free-text field for a new one. Only domains
// that run THIS same build (ezyreader, date-based post URLs) can share this
// parser — the other anoboy.* domains are different builds and are not listed.
//
// Cards everywhere (home, search, browse, a series page) link to an *episode*
// post. getDetail follows an episode to its series: the episode page's category
// feed link names the series term page, which lists every episode. Each episode
// page holds its servers as `data-video` proxies: `adsbatch*.php?url=<token>`
// wraps a Blogger video, and `yup/data.php?data=...` wraps YourUpload embeds.

const mangayomiSources = [{
  "name": "Anoboy",
  "lang": "id",
  "baseUrl": "https://anoboy.at",
  "apiUrl": "",
  "iconUrl": "icons/anoboy.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.1",
  "pkgPath": "anime/src/id/anoboy.js",
  "hasCloudflare": true,
  "notes": "Domain Anoboy sering berpindah: pilih di 'Domain cepat' atau isi 'Domain manual' di Pengaturan. Hanya domain build yang sama (mis. anoboy.at) yang didukung; .by/.ws beda struktur. Streaming maksimal 720p."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

// Domains known to run the same ezyreader build. Add new ones here or via the
// manual field in Settings.
const ANOBOY_DOMAINS = [
  ["anoboy.at", "https://anoboy.at"],
];
const ANOBOY_GENRES = [
  ["Action", "action"], ["Adventure", "adventure"], ["Comedy", "comedy"], ["Demons", "demons"],
  ["Drama", "drama"], ["Ecchi", "ecchi"], ["Fantasy", "fantasy"], ["Game", "game"],
  ["Harem", "harem"], ["Historical", "historical"], ["Horror", "horror"], ["Josei", "josei"],
  ["Magic", "magic"], ["Martial Arts", "martial-arts"], ["Mecha", "mecha"], ["Military", "military"],
  ["Music", "music"], ["Mystery", "mystery"], ["Psychological", "psychological"], ["Romance", "romance"],
  ["Samurai", "samurai"], ["School", "school"], ["Sci-Fi", "sci-fi"], ["Seinen", "seinen"],
  ["Shoujo", "shoujo"], ["Shounen", "shounen"], ["Slice of Life", "slice-of-life"], ["Space", "space"],
  ["Sports", "sports"], ["Super Power", "super-power"], ["Supernatural", "supernatural"],
  ["Thriller", "thriller"], ["Vampire", "vampire"],
];
const ANOBOY_SERVERS = ["Blogger", "YourUpload", "Mp4Upload"];
// yup/data.php lists YourUpload codes in this order.
const ANOBOY_YUP_QUALITY = ["240p", "360p", "480p", "720p"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://anoboy.at");
  }

  get supportsLatest() {
    return true;
  }

  /** Dropdown choice, overridden by a non-empty manual field. */
  getBaseUrl() {
    var manual = "";
    var pick = "";
    try { manual = safeString(this.prefs.get("base_url")); } catch (_) { manual = ""; }
    try { pick = safeString(this.prefs.get("domain_pilihan")); } catch (_) { pick = ""; }
    var base = manual || pick || this.defaultBaseUrl || this.source.baseUrl;
    return String(base).replace(/\/+$/, "");
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
      console.log("anoboy: gagal memuat " + url);
      return null;
    }
    return new Document(res.body);
  }

  pagedPath(base, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    if (n === 1) return base;
    const cut = base.indexOf("?");
    if (cut === -1) return base.replace(/\/?$/, "/") + "page/" + n + "/";
    return base.slice(0, cut).replace(/\/?$/, "/") + "page/" + n + "/" + base.slice(cut);
  }

  // ------------------------------------------------------------- listings

  async getPopular(page) {
    return this.listing("/anime/ongoing/", page);
  }

  async getLatestUpdates(page) {
    return this.listing("/", page);
  }

  async search(query, page, filters) {
    const text = cleanText(query);
    if (text) return this.listing("/?s=" + encodeQuery(text), page);
    const route = this.selectedRoute(filters);
    return this.listing(route || "/anime/ongoing/", page);
  }

  async listing(path, page) {
    const doc = await this.pageDoc(this.resolve(this.pagedPath(path, page)));
    if (!doc) return this.emptyPage();
    const list = this.cards(doc);
    const next = doc.selectFirst("a.nextpostslink") || doc.selectFirst(".pagination a.next");
    return { list: list, hasNextPage: !!(next && (next.attr("href") || next.getHref)) || list.length >= 15 && this.hasNumberedNext(doc, page) };
  }

  hasNumberedNext(doc, page) {
    const n = (parseInt(page, 10) || 1) + 1;
    const anchors = doc.select(".pagination a, .pagenavi a, a.page-numbers") || [];
    for (let i = 0; i < anchors.length; i++) {
      if (new RegExp("/page/" + n + "/").test(anchors[i].attr("href") || "")) return true;
    }
    return false;
  }

  /** One item per anime card; the link is an episode, deduped by series title. */
  cards(doc) {
    const anchors = doc.select("a[rel=bookmark]") || [];
    const seen = {};
    const list = [];
    for (let i = 0; i < anchors.length; i++) {
      const box = anchors[i].selectFirst("div.amv");
      if (!box) continue;
      const href = anchors[i].attr("href") || anchors[i].getHref;
      const heading = box.selectFirst("h3");
      const title = anoboySeriesName(heading ? heading.text : anchors[i].attr("title"));
      if (!href || !title || seen[title.toLowerCase()]) continue;
      seen[title.toLowerCase()] = true;
      const img = box.selectFirst("img");
      list.push(this.item(title, this.absolute(img ? img.attr("src") : ""), href));
    }
    return list;
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

  absolute(src) {
    return src ? this.resolve(decodeEntities(src)) : "";
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const resolved = this.resolve(url);
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    const seriesUrl = await this.seriesUrlOf(resolved);
    const doc = seriesUrl ? await this.pageDoc(seriesUrl) : null;
    if (!doc) return empty;

    const name = cleanTitle(anoboyMetaTitle(doc));
    if (!name) {
      console.log("anoboy: detail tidak ditemukan: " + seriesUrl);
      return empty;
    }
    let episodes = this.episodesOf(doc);
    // A movie/single is a dated post that carries servers but no episode list.
    if (!episodes.length && (doc.select("[data-video]") || []).length) {
      episodes = [{ name: "Film", url: this.relativize(seriesUrl), dateUpload: "", scanlator: "" }];
    }
    const completed = episodes.some(function (ep) {
      return /\b(selesai|end|tamat)\b/i.test(ep.name);
    });
    const info = anoboyInfo(doc);
    const facts = ["source", "durasi", "studio", "score"].filter(function (key) {
      return info[key];
    }).map(function (key) {
      return key.charAt(0).toUpperCase() + key.slice(1) + ": " + info[key];
    });
    const detail = {
      name: name,
      imageUrl: this.absolute(anoboyPoster(doc)),
      link: this.relativize(seriesUrl),
      description: facts.join(" · "),
      author: info.studio || "",
      artist: "",
      genre: (info.genre || "").split(",").map(cleanText).filter(Boolean),
      episodes: episodes,
      status: completed ? 1 : 0,
    };
    return detail;
  }

  /**
   * A series page as given; only an *episode* post is resolved to its series,
   * through the category feed link in its head. A dated series post (no
   * "episode" in the slug) and a term page are already series pages.
   */
  async seriesUrlOf(url) {
    if (!/\/\d{4}\/\d{2}\/[^/]*(?:episode|-eps-|-eps\/|-eps$)/i.test(url)) return url;
    const res = await this.client.get(url, this.getHeaders(url));
    const html = res && res.statusCode === 200 ? safeString(res.body) : "";
    if (!html) {
      console.log("anoboy: halaman episode gagal dimuat: " + url);
      return "";
    }
    const slug = anoboySeriesSlug(html, this.getBaseUrl());
    if (!slug) {
      console.log("anoboy: tautan seri tidak ditemukan di " + url);
      return "";
    }
    return this.resolve("/" + slug + "/");
  }

  /**
   * Episodes, newest first. A dated series post lists them in `ul.lcp_catlist`
   * (and its sidebar carries unrelated amv cards, so that list is authoritative
   * when present); a term page lists them as its own amv cards.
   */
  episodesOf(doc) {
    const seen = {};
    const out = [];
    const self = this;
    const add = function (href, text) {
      if (!href || !/\/\d{4}\/\d{2}\//.test(href) || /download/i.test(href)) return;
      if (!/episode|eps/i.test(href + " " + text)) return;
      const key = self.relativize(self.resolve(href));
      if (seen[key]) return;
      seen[key] = true;
      out.push({ name: anoboyEpisodeLabel(text), url: key, dateUpload: "", scanlator: "" });
    };
    const lcp = doc.select("ul.lcp_catlist li a") || [];
    if (lcp.length) {
      for (let i = 0; i < lcp.length; i++) add(lcp[i].attr("href") || lcp[i].getHref, lcp[i].text);
      return out;
    }
    const anchors = doc.select("a[rel=bookmark]") || [];
    for (let i = 0; i < anchors.length; i++) {
      const box = anchors[i].selectFirst("div.amv");
      if (!box) continue;
      const heading = box.selectFirst("h3");
      add(anchors[i].attr("href") || anchors[i].getHref, heading ? heading.text : "");
    }
    return out;
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const pageUrl = this.resolve(url);
    const doc = await this.pageDoc(pageUrl);
    if (!doc) return [];
    const options = doc.select("[data-video]") || [];
    const embeds = [];
    for (let i = 0; i < options.length; i++) {
      const raw = decodeEntities(options[i].attr("data-video"));
      const label = cleanText(options[i].text);
      anoboyEmbeds(raw, label, this.getBaseUrl()).forEach(function (embed) {
        embeds.push(embed);
      });
    }
    if (!embeds.length) console.log("anoboy: tidak ada server di " + pageUrl);

    const self = this;
    const found = await this.mapLimit(embeds, 2, function (embed) {
      return self.resolveEmbed(embed, pageUrl);
    });
    const results = [];
    found.forEach(function (videos) {
      (videos || []).forEach(function (video) { results.push(video); });
    });
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  async resolveEmbed(embed, pageUrl) {
    let url = embed.url;
    // An unknown local proxy page: read the iframe/host out of its body once.
    if (embed.proxy) {
      try {
        const html = await this.fetch(this.resolve(url), this.headersFor(pageUrl));
        const inner = /<iframe[^>]+src=["']([^"']+)["']/i.exec(html) || /https?:\/\/[^"'\s]+\.(?:mp4|m3u8)/i.exec(html);
        if (!inner) { console.log("anoboy: proxy tanpa video: " + url); return []; }
        url = inner[1] || inner[0];
      } catch (e) {
        console.log("anoboy: proxy gagal: " + e);
        return [];
      }
    }
    const server = anoboyServer(url);
    const reason = unsupportedReason(url);
    if (reason) {
      console.log("anoboy: server " + server + " tidak didukung (" + reason + ")");
      return [];
    }
    if (!isSupportedHost(url)) {
      console.log("anoboy: server " + server + " tidak didukung (belum ada ekstraktor untuk " + hostOf(url) + ")");
      return [];
    }
    const found = await extractByHost(this, url, pageUrl, embed.quality, "Hardsub ID");
    return found.videos.map(function (video) {
      video.server = server;
      video.quality = qualityLabel(resolutionOf(video.quality) || embed.quality, server, "Hardsub ID");
      return video;
    });
  }

  // -------------------------------------------------------- configuration

  getFilterList() {
    const options = [
      { type_name: "SelectOption", name: "Ongoing", value: "/anime/ongoing/" },
      { type_name: "SelectOption", name: "Completed", value: "/anime/completed/" },
    ];
    for (let i = 0; i < ANOBOY_GENRES.length; i++) {
      options.push({ type_name: "SelectOption", name: ANOBOY_GENRES[i][0], value: "/category/" + ANOBOY_GENRES[i][1] + "/" });
    }
    return [{ type_name: "SelectFilter", type: "kategori", name: "Kategori", state: 0, values: options }];
  }

  getSourcePreferences() {
    const prefs = this.basePreferences(ANOBOY_SERVERS);
    prefs.unshift({
      key: "domain_pilihan",
      listPreference: {
        title: "Domain cepat",
        summary: "Pilih domain Anoboy yang aktif. Diabaikan bila 'Domain manual' diisi.",
        valueIndex: 0,
        entries: ANOBOY_DOMAINS.map(function (d) { return d[0]; }),
        entryValues: ANOBOY_DOMAINS.map(function (d) { return d[1]; }),
      },
    });
    return prefs;
  }
}

/** "Chii Fuyo Episode 6" / "Chii Fuyo Episode 25 Selesai" -> "Chii Fuyo". */
function anoboySeriesName(text) {
  return cleanTitle(decodeEntities(text).replace(/\s*(?:episode|eps)\b.*$/i, ""));
}

/** "Chii Fuyo Episode 6 Subtitle Indonesia" -> "Episode 6". */
function anoboyEpisodeLabel(text) {
  const t = cleanText(decodeEntities(text));
  const match = /(?:episode|eps)\s*([0-9]+(?:[.,][0-9]+)?)([^|]*)?/i.exec(t);
  if (!match) return t.replace(/\s*subtitle indonesia\s*$/i, "") || "Episode";
  const extra = /selesai|end|tamat/i.test(match[2] || "") ? " (Selesai)" : "";
  return "Episode " + match[1].replace(/,/, ".") + extra;
}

/** The series term page title, without the " anoBoy" site suffix. */
function anoboyMetaTitle(doc) {
  const og = doc.selectFirst("meta[property=og:title]");
  const raw = og && og.attr("content") ? og.attr("content") : (doc.selectFirst("h1") ? doc.selectFirst("h1").text : "");
  return decodeEntities(raw).replace(/\s*[-–|]?\s*anoboy\s*$/i, "");
}

/**
 * The series info table, as a lowercased label -> value map. Rows are
 * `<tr><th>Genre</th><td id="genre">...</td></tr>`; the `#genre` id is shared
 * with the filter <select>, so the table is read by its rows, not by id.
 */
function anoboyInfo(doc) {
  const rows = doc.select("table tr") || [];
  const info = {};
  for (let i = 0; i < rows.length; i++) {
    const th = rows[i].selectFirst("th");
    const td = rows[i].selectFirst("td");
    if (!th || !td) continue;
    const key = cleanText(th.text).toLowerCase();
    if (key) info[key] = cleanText(decodeEntities(td.text));
  }
  return info;
}

/**
 * The series slug, from the category feed link WordPress prints in the head:
 * `<base>/<series-slug>/feed/`. The site feed (`<base>/feed/`) has no slug and
 * the comment feed is "comments", so the first other single-segment slug wins.
 */
function anoboySeriesSlug(html, base) {
  const host = hostOf(base);
  const re = new RegExp('href="https?://' + host.replace(/\./g, "\\.") + '/([a-z0-9][a-z0-9-]*)/feed/"', "ig");
  let match;
  while ((match = re.exec(html))) {
    const slug = match[1];
    if (slug !== "comments" && slug !== "category") return slug;
  }
  return "";
}

/**
 * The embed URLs behind one `data-video` proxy.
 * - `adsbatch*.php?url=<token>` wraps a Blogger video.
 * - `yup/data.php?data=A&data2=B...` wraps YourUpload embeds (240/360/480/720).
 * - an absolute URL is used as-is; any other local `.php` is fetched later.
 */
function anoboyEmbeds(raw, label, base) {
  const value = safeString(raw);
  if (!value) return [];
  const quality = resolutionOf(label) || resolutionOf(value);
  const blogger = /[?&]url=(AD6v5[A-Za-z0-9_-]+)/.exec(value);
  if (/adsbatch[0-9]*\.php/i.test(value) && blogger) {
    return [{ url: "https://www.blogger.com/video.g?token=" + blogger[1], quality: quality || "720p" }];
  }
  if (/\/yup\/data\.php/i.test(value)) {
    const out = [];
    const params = ["data", "data2", "data3", "data4"];
    for (let i = 0; i < params.length; i++) {
      const code = new RegExp("[?&]" + params[i] + "=([^&]+)").exec(value);
      if (code && code[1]) out.push({ url: "https://www.yourupload.com/embed/" + code[1], quality: ANOBOY_YUP_QUALITY[i] });
    }
    return out;
  }
  if (/^https?:\/\//i.test(value)) return [{ url: value, quality: quality }];
  if (/^\/?[^?]*\.php/i.test(value)) return [{ url: value.charAt(0) === "/" ? value : "/" + value, quality: quality, proxy: true }];
  return [];
}

/** A series poster: the `/img/upload/` image (card thumb or the post poster). */
function anoboyPoster(doc) {
  const amv = doc.selectFirst("div.amv img");
  if (amv && amv.attr("src")) return amv.attr("src");
  const imgs = doc.select("img") || [];
  for (let i = 0; i < imgs.length; i++) {
    const src = safeString(imgs[i].attr("src"));
    if (/\/img\/upload\//i.test(src)) return src;
  }
  const og = doc.selectFirst("meta[property=og:image]");
  return og ? og.attr("content") : "";
}

function anoboyServer(url) {
  const host = hostOf(url);
  if (/blogger|blogspot|googlevideo/i.test(host)) return "Blogger";
  if (/yourupload|vidcache/i.test(host)) return "YourUpload";
  if (/mp4upload/i.test(host)) return "Mp4Upload";
  return host || "Server";
}

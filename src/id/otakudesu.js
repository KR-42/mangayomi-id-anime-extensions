// ---------------------------------------------------------------------------
// Otaku Desu (otakudesu.blog)
//
// WordPress + Animestream. No Cloudflare challenge (verified 2026-11-09): only
// a right-click blocker in the browser, irrelevant to HTTP scraping.
//
// Two routes are unusual:
//   * There is no popularity route at all (/popular/ 302s off-site, the
//     ordering parameters answer 403). "Popular" is therefore the completed
//     list — the newest finished series — exactly like the reference extension.
//   * Streams are not in the episode HTML. Mirror buttons carry a base64
//     payload that must be exchanged at admin-ajax.php for an iframe, and the
//     admin-ajax endpoints require a nonce fetched separately first.
//
// Episode ordering on detail pages is newest-first; it is reversed here so the
// app's "next episode" always goes forward.
// ---------------------------------------------------------------------------

const mangayomiSources = [{
  "name": "Otaku Desu",
  "lang": "id",
  "baseUrl": "https://otakudesu.blog",
  "apiUrl": "",
  "iconUrl": "icons/otakudesu.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.3.3",
  "pkgPath": "anime/src/id/otakudesu.js",
  "hasCloudflare": false,
  "notes": "Domain bisa berpindah; atur di Pengaturan sumber. Tidak ada rute popularitas, jadi tab Popular memakai daftar anime tamat."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

// admin-ajax.php actions, read from the episode page's inline script with these
// as fallback. The hashes are stable for months but the site does rotate them.
const OTAKU_NONCE_ACTION = "aa1208d27f29ca340c92c66d1926f13f";
const OTAKU_MIRROR_ACTION = "2a3505c93b0035d3f455df82bf976b84";

// Genre index from /genre-list/ (36 entries, static). Kept inline because
// getFilterList() is synchronous — it runs while the filter sheet opens.
const OTAKU_GENRES = [
  ["Action", "action"], ["Adventure", "adventure"], ["Comedy", "comedy"],
  ["Demons", "demons"], ["Drama", "drama"], ["Ecchi", "ecchi"],
  ["Fantasy", "fantasy"], ["Game", "game"], ["Harem", "harem"],
  ["Historical", "historical"], ["Horror", "horror"], ["Josei", "josei"],
  ["Magic", "magic"], ["Martial Arts", "martial-arts"], ["Mecha", "mecha"],
  ["Military", "military"], ["Music", "music"], ["Mystery", "mystery"],
  ["Parody", "parody"], ["Police", "police"], ["Psychological", "psychological"],
  ["Romance", "romance"], ["Samurai", "samurai"], ["School", "school"],
  ["Sci-Fi", "sci-fi"], ["Seinen", "seinen"], ["Shoujo", "shoujo"],
  ["Shoujo Ai", "shoujo-ai"], ["Shounen", "shounen"], ["Slice of Life", "slice-of-life"],
  ["Space", "space"], ["Sports", "sports"], ["Super Power", "super-power"],
  ["Supernatural", "supernatural"], ["Thriller", "thriller"], ["Vampire", "vampire"],
];

const OTAKU_MONTHS = {
  januari: "January", februari: "February", maret: "March", april: "April",
  mei: "May", juni: "June", juli: "July", agustus: "August",
  september: "September", oktober: "October", november: "November",
  desember: "December",
};

// Servers offered in the preference, ordered by how often they actually
// produced a stream in the 2026-11-10 census (125 episodes: last episode of
// every series on popular pages 1-3 and latest pages 1-2). The first group was
// verified end to end from this machine; the second group only shows up on
// older BD/batch/movie entries; the third is served by the app's native
// extractors (filemoon, mp4upload, yourupload), which the Node harness cannot
// run, so they are listed after the verified ones.
// mega and filedon are deliberately absent: both are download hosts here, not
// streams, so offering them would promise a playback the source cannot deliver.
// ondesuvip is absent too: it redirects to `drive.google.com/uc?id=` with an
// empty id, so every one of its mirrors is dead at the source.
// nekoclouds and upbolt are absent for the same reason: nekoclouds 302s to
// `desustream.com/maintenance/` (0 of 21 mirrors produced a stream) and upbolt
// answers 403 with a Cloudflare challenge. Both are skipped in mirrorsOf().
const OTAKU_SERVERS = [
  "vidhide", "odstream", "odstreamhd", "otakuwatch6", "otakuwatch6hd",
  "odcdn", "ondesuhd", "blogs", "ondesu2hd", "otakuwatch7", "otakuwatch7hd",
  "updesu", "otakustream",
  "playdesu", "filelions", "pdrain", "moeplay", "otakuwatch", "desuwatch",
  "desudrive",
  "hadestream", "mp4load", "yourupload",
];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://otakudesu.blog");
    this._nonce = "";
  }

  get supportsLatest() { return true; }

  // ------------------------------------------------------------- listings

  /**
   * Page 1 has a canonical URL without /page/1/; the paginated form answers
   * 301, which costs an extra hop on every fresh listing.
   */
  listingPath(section, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    return n === 1 ? "/" + section + "/" : "/" + section + "/page/" + n + "/";
  }

  async listing(section, page) {
    const doc = await this.fetchDoc(this.resolve(this.listingPath(section, page)));
    if (!doc) return this.emptyPage();
    return {
      list: this.parseCards(doc),
      hasNextPage: hasNextPage(doc, [
        "div.pagination div.pagenavix a.next",
        "div.pagination a.next.page-numbers",
      ]),
    };
  }

  async getPopular(page) {
    return this.listing("complete-anime", page);
  }

  async getLatestUpdates(page) {
    return this.listing("ongoing-anime", page);
  }

  /** div.detpost cards, used by ongoing/complete lists and the homepage. */
  parseCards(doc) {
    const out = [];
    const cards = doc.select("div.venz > ul > li > div.detpost") || [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const link = card.selectFirst("div.thumb a[href]");
      const href = link.attr("href") || link.getHref;
      if (!href) continue;
      const title = card.selectFirst("h2.jdlflm");
      const image = card.selectFirst(".thumbz img");
      let name = cleanText(decodeEntities(title.text));
      if (!name) name = image.attr("alt");
      if (!name) continue;
      out.push(this.item(name, this.imageOf(image), href));
    }
    return out;
  }

  /** Genre pages use a different markup set (div.col-anime). */
  parseGenreCards(doc) {
    const out = [];
    const cards = doc.select("div.col-anime") || [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const link = card.selectFirst(".col-anime-title a[href]");
      const href = link.attr("href") || link.getHref;
      if (!href) continue;
      const name = cleanText(decodeEntities(link.text));
      if (!name) continue;
      out.push(this.item(name, this.imageOf(card.selectFirst(".col-anime-cover img")), href));
    }
    return out;
  }

  /** Search results (ul.chivsrc li) have their own markup too. */
  parseSearchCards(doc) {
    const out = [];
    const rows = doc.select("ul.chivsrc > li") || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const link = row.selectFirst("h2 a[href]");
      const href = link.attr("href") || link.getHref;
      if (!href) continue;
      const name = cleanText(decodeEntities(link.text));
      if (!name) continue;
      out.push(this.item(name, this.imageOf(row.selectFirst("img")), href));
    }
    return out;
  }

  /** Covers are plain <img src>; some themes move them to data-src. */
  imageOf(element) {
    if (!element) return "";
    return (
      element.attr("src") ||
      element.getSrc ||
      element.attr("data-src") ||
      element.getDataSrc ||
      element.attr("data-original") ||
      ""
    );
  }

  // --------------------------------------------------------------- search

  /**
   * The site has one search route (capped at 12 results, no pagination) and a
   * separate genre route. The Genre filter chooses the route: with a query we
   * search and keep matches, without one we browse the genre itself.
   */
  async search(query, page, filters) {
    const genre = this.selectedGenre(filters);
    const text = cleanText(query);
    if (genre) {
      const n = Math.max(1, parseInt(page, 10) || 1);
      const path = n === 1
        ? "/genres/" + genre + "/"
        : "/genres/" + genre + "/page/" + n + "/";
      const doc = await this.fetchDoc(this.resolve(path));
      if (!doc) return this.emptyPage();
      let list = this.parseGenreCards(doc);
      if (text) {
        const needle = text.toLowerCase();
        list = list.filter(function (entry) {
          return entry.name.toLowerCase().indexOf(needle) !== -1;
        });
      }
      return {
        list: list,
        hasNextPage: hasNextPage(doc, [
          "div.pagination div.pagenavix a.next",
          "div.pagination a.next.page-numbers",
        ]),
      };
    }
    if (!text) return this.emptyPage();

    const doc = await this.fetchDoc(
      this.resolve("/?s=" + encodeQuery(text) + "&post_type=anime"),
    );
    if (!doc) return this.emptyPage();
    return { list: this.parseSearchCards(doc), hasNextPage: false };
  }

  selectedGenre(filters) {
    if (!filters || !filters.length) return "";
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      if (!filter || filter.name !== "Genre") continue;
      const values = filter.values || [];
      const state = parseInt(filter.state, 10) || 0;
      const option = values[state];
      if (!option) return "";
      return safeString(option.value);
    }
    return "";
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const doc = await this.fetchDoc(this.resolve(url));
    if (!doc) {
      return { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    }

    // A missing series answers 200 with the site landing page (tagline as h1,
    // logo as og:image), so markup presence decides, not the status code.
    // `.text` is the documented "did it match" signal: a miss is "".
    const heading =
      doc.selectFirst("div.venser div.jdlrx h1") || doc.selectFirst("h1.posttl");
    if (!cleanText(heading.text)) {
      console.log("otakudesu: detail tidak ditemukan: " + this.resolve(url));
      return { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    }
    let name = cleanTitle(heading.text);
    // "Nippon Sangoku (Episode 1 – 12) Subtitle Indonesia" -> "Nippon Sangoku"
    name = cleanText(name.replace(/\(\s*episode\s*[\d\s–—\-.]+\s*\)/gi, ""));

    const info = this.infoFields(doc);
    const status = otakuStatus(info.Status);

    const detail = {
      name: name,
      imageUrl: this.coverOf(doc),
      link: this.relativize(this.resolve(url)),
      description: this.descriptionOf(doc),
      author: info.Studio || "",
      artist: "",
      genre: this.genresOf(doc, info.Genre),
      episodes: this.episodesOf(doc, name),
    };
    // MManga wants 0-4; anything else must be omitted, not guessed.
    if (status !== null) detail.status = status;
    return detail;
  }

  /**
   * Cover from the detail block, falling back to the Open Graph image. A few
   * entries (e.g. "Replica datte, Koi wo Suru") ship an empty div.fotoanime and
   * only carry the artwork in the page metadata.
   */
  coverOf(doc) {
    const image = this.imageOf(doc.selectFirst("div.fotoanime img"));
    if (image) return image;
    const meta = doc.selectFirst("meta[property='og:image']");
    const content = cleanText(meta.attr("content") || meta.attr("value"));
    return /^https?:\/\//i.test(content) ? content : "";
  }

  /**
   * Synopsis from div.sinopc, falling back to the page description meta tag
   * when the theme leaves the block empty.
   */
  descriptionOf(doc) {
    const synopsis = cleanText(doc.selectFirst("div.sinopc").text);
    if (synopsis) return synopsis;
    const og = doc.selectFirst("meta[property='og:description']");
    const plain = doc.selectFirst("meta[name='description']");
    const content = cleanText(og.attr("content")) || cleanText(plain.attr("content"));
    return content ? decodeEntities(content) : "";
  }

  /** "Label: value" pairs from div.infozingle, keyed by the label text. */
  infoFields(doc) {
    const out = {};
    const rows = doc.select("div.infozin div.infozingle p") || [];
    for (let i = 0; i < rows.length; i++) {
      const text = cleanText(rows[i].text);
      const colon = text.indexOf(":");
      if (colon <= 0) continue;
      out[cleanText(text.substring(0, colon))] = cleanText(text.substring(colon + 1));
    }
    return out;
  }

  genresOf(doc, fallbackLine) {
    const tags = doc.select("div.infozingle a[rel='tag']") || [];
    const out = [];
    for (let i = 0; i < tags.length; i++) {
      const name = cleanText(decodeEntities(tags[i].text));
      if (name) out.push(name);
    }
    if (out.length) return out;
    return (fallbackLine || "")
      .split(",")
      .map(function (part) { return cleanText(part); })
      .filter(function (part) { return part !== ""; });
  }

  /**
   * Episode rows from the "Episode List" block. The batch and download-only
   * ("Lengkap") blocks are skipped: those pages carry no player, so adding them
   * would produce entries whose getVideoList always comes back empty.
   *
   * The site lists newest-first; the app wants ascending.
   */
  episodesOf(doc, seriesName) {
    const blocks = doc.select("div.episodelist") || [];
    const seen = {};
    const rows = [];

    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b];
      const heading = cleanText(block.selectFirst(".monktit").text).toLowerCase();
      if (heading.indexOf("batch") !== -1) continue;
      if (heading.indexOf("lengkap") !== -1) continue;
      if (heading && heading.indexOf("episode list") === -1) continue;

      const items = block.select("ul li") || [];
      for (let i = 0; i < items.length; i++) {
        const anchor = items[i].selectFirst("a[href]");
        const href = anchor.attr("href") || anchor.getHref;
        if (!href || href.indexOf("/episode/") === -1) continue;
        const key = this.relativize(resolveUrl(this.getBaseUrl(), href));
        if (seen[key]) continue;
        seen[key] = true;
        rows.push({
          name: cleanEpisodeName(anchor.text, seriesName),
          url: key,
          date: cleanText(items[i].selectFirst("span.zeebr").text),
          index: i,
        });
      }
    }

    // Safety net for themes that drop the .monktit heading entirely.
    if (!rows.length) {
      const links = doc.select("a[href*='/episode/']") || [];
      for (let i = 0; i < links.length; i++) {
        const href = links[i].attr("href") || links[i].getHref;
        if (!href) continue;
        const key = this.relativize(resolveUrl(this.getBaseUrl(), href));
        if (seen[key]) continue;
        seen[key] = true;
        rows.push({
          name: cleanEpisodeName(links[i].text, seriesName),
          url: key,
          date: "",
          index: i,
        });
      }
    }

    rows.reverse();

    const dates = parseDates(
      rows.map(function (row) { return otakuDate(row.date); }),
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
    const doc = await this.fetchDoc(pageUrl);
    if (!doc) return [];

    const actions = this.ajaxActions(doc);
    const mirrors = this.mirrorsOf(doc);
    const embeds = [];

    if (mirrors.length) {
      // One nonce for the whole episode: fetching it inside the concurrent
      // workers would send the same request several times on a cold cache.
      let nonce = "";
      try {
        nonce = await this.nonce(pageUrl, actions);
      } catch (e) {
        console.log("otakudesu: nonce gagal: " + e);
      }
      if (nonce) {
        const resolved = await this.mapLimit(mirrors, 2, async (mirror) => {
          const embed = await this.mirrorEmbed(pageUrl, mirror, actions, nonce);
          if (!embed) return null;
          return { url: embed, server: mirror.server, quality: mirror.quality };
        });
        for (let i = 0; i < resolved.length; i++) {
          if (resolved[i]) embeds.push(resolved[i]);
        }
      }
    }

    // The default player is normally one of the mirrors; only use it when the
    // mirror exchange produced nothing (e.g. the script's hashes changed).
    if (!embeds.length) {
      const iframe = doc.selectFirst("div#pembed iframe");
      const src = iframe.attr("src") || iframe.getSrc;
      if (src) embeds.push({ url: src, server: "Otakudesu", quality: "" });
    }

    const results = [];
    for (let i = 0; i < embeds.length; i++) {
      const embed = embeds[i];
      const reason = unsupportedReason(embed.url);
      if (reason) {
        console.log(
          "otakudesu: server " + embed.server + " tidak didukung (" + reason + ")",
        );
        continue;
      }
      if (!isSupportedHost(embed.url)) {
        console.log(
          "otakudesu: server " + embed.server + " tidak didukung (belum ada ekstraktor untuk " +
            hostOf(embed.url) + ")",
        );
        continue;
      }
      const found = await extractByHost(
        this,
        embed.url,
        pageUrl,
        embed.quality,
        "Hardsub ID",
      );
      for (let v = 0; v < found.videos.length; v++) {
        const video = found.videos[v];
        if (embed.server && embed.server !== "Otakudesu") {
          // Label with the mirror the user actually clicked, not the extractor
          // family, so preferred_server can match it.
          video.server = embed.server;
          video.quality = qualityLabel(
            resolutionOf(video.quality) || resolutionOf(embed.quality),
            embed.server,
            "Hardsub ID",
          );
        }
        results.push(video);
      }
      if (!found.videos.length) {
        console.log("otakudesu: " + embed.server + " tidak menghasilkan stream");
      }
    }

    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /** {id, i, q} payloads from div.mirrorstream, with host label and quality. */
  mirrorsOf(doc) {
    const out = [];
    const seen = {};
    const lists = doc.select("div.mirrorstream ul") || [];
    for (let l = 0; l < lists.length; l++) {
      const list = lists[l];
      const match = /m(\d{3,4})p/.exec(list.className);
      const listQuality = match ? match[1] + "p" : "";
      const anchors = list.select("li a[data-content]") || [];
      for (let a = 0; a < anchors.length; a++) {
        const anchor = anchors[a];
        const payload = otakuDecodePayload(anchor.attr("data-content"));
        if (!payload || !payload.id) continue;
        const server = cleanText(anchor.text) || "Mirror";
        if (/mega|filedon/i.test(server)) {
          console.log("otakudesu: lewati server " + server + " (unduhan, bukan stream)");
          continue;
        }
        // Every ondesuvip mirror 302s to `drive.google.com/uc?id=` with an empty
        // id, i.e. there is no file behind it at all. Skip the round-trip.
        if (/ondesuvip/i.test(server)) {
          console.log("otakudesu: lewati server " + server + " (tautan mati di sumber)");
          continue;
        }
        // nekoclouds redirects to `desustream.com/maintenance/` and upbolt
        // answers 403 with a Cloudflare challenge; 0 of 21 nekoclouds mirrors
        // produced a stream in the 2026-11-10 census. Neither is recoverable.
        if (/nekoclouds|upbolt/i.test(server)) {
          console.log("otakudesu: lewati server " + server + " (tautan mati di sumber)");
          continue;
        }
        const quality = safeString(payload.q) || listQuality;
        const index = payload.i === undefined || payload.i === null ? 0 : payload.i;
        const key = server + "|" + quality + "|" + index;
        if (seen[key]) continue;
        seen[key] = true;
        out.push({
          id: payload.id,
          i: index,
          q: quality,
          quality: quality,
          server: server,
        });
      }
    }
    return out;
  }

  /** The two action hashes from the inline mirror script, with fallbacks. */
  ajaxActions(doc) {
    const scripts = doc.select("script") || [];
    let text = "";
    for (let i = 0; i < scripts.length; i++) text += "\n" + scripts[i].text;
    const nonce = firstMatch(
      text,
      /data:\s*\{\s*action:\s*["']([0-9a-f]{20,})["']/i,
    );
    const mirror = firstMatch(
      text,
      /nonce:\s*[^,]{1,40},\s*action:\s*["']([0-9a-f]{20,})["']/i,
    );
    return {
      nonce: nonce || OTAKU_NONCE_ACTION,
      mirror: mirror || OTAKU_MIRROR_ACTION,
    };
  }

  /**
   * The nonce is not bound to cookies and outlives one episode page, so it is
   * cached on the instance. `refresh` forces a new one after a 403.
   */
  async nonce(pageUrl, actions, refresh) {
    if (this._nonce && !refresh) return this._nonce;
    const res = await this.postAjax(pageUrl, queryString({ action: actions.nonce }));
    const json = otakuJson(res);
    const nonce = json && json.data ? safeString(json.data) : "";
    if (!nonce) {
      this._nonce = "";
      throw new Error("nonce kosong (HTTP " + (res ? res.statusCode : "?") + ")");
    }
    this._nonce = nonce;
    return nonce;
  }

  /** Exchange one mirror payload for its iframe URL. "" when unavailable. */
  async mirrorEmbed(pageUrl, mirror, actions, nonce) {
    let json = otakuJson(await this.postAjax(
      pageUrl,
      otakuMirrorBody(mirror, nonce, actions.mirror),
    ));
    if (!json || !json.data) {
      // The nonce expires; one refresh is enough and costs two requests.
      const fresh = await this.nonce(pageUrl, actions, true);
      json = otakuJson(await this.postAjax(
        pageUrl,
        otakuMirrorBody(mirror, fresh, actions.mirror),
      ));
    }
    if (!json || !json.data) return "";
    return iframeSrc(b64DecodeUtf8(json.data));
  }

  postAjax(pageUrl, body) {
    const headers = this.headersFor(pageUrl);
    headers["X-Requested-With"] = "XMLHttpRequest";
    return this.post(this.getBaseUrl() + "/wp-admin/admin-ajax.php", body, headers);
  }

  // --------------------------------------------------- filters & prefs

  getFilterList() {
    const options = [{ type_name: "SelectOption", name: "Semua genre", value: "" }];
    for (let i = 0; i < OTAKU_GENRES.length; i++) {
      options.push({
        type_name: "SelectOption",
        name: OTAKU_GENRES[i][0],
        value: OTAKU_GENRES[i][1],
      });
    }
    return [{
      type_name: "SelectFilter",
      type: "genre",
      name: "Genre",
      state: 0,
      values: options,
    }];
  }

  getSourcePreferences() {
    return this.basePreferences(OTAKU_SERVERS);
  }
}

// ------------------------------------------------------------------ helpers

function otakuMirrorBody(mirror, nonce, action) {
  return queryString({
    id: mirror.id,
    i: mirror.i,
    q: mirror.q,
    nonce: nonce,
    action: action,
  });
}

/** data-content is base64 of {"id":206810,"i":0,"q":"480p"}. */
function otakuDecodePayload(value) {
  const text = safeString(value);
  if (!text) return null;
  try {
    const payload = JSON.parse(b64DecodeUtf8(text));
    if (payload && payload.id !== undefined && payload.id !== null) return payload;
  } catch (e) {
    console.log("otakudesu: payload mirror tidak valid: " + text);
  }
  return null;
}

function otakuJson(res) {
  if (!res || !res.body) return null;
  try {
    return JSON.parse(res.body);
  } catch (e) {
    console.log("otakudesu: respons bukan JSON: " + safeString(res.body).slice(0, 120));
    return null;
  }
}

/** "Ongoing" -> 0, "Completed" -> 1, ...; null when the site says something else. */
function otakuStatus(value) {
  const text = safeString(value).toLowerCase();
  if (!text) return null;
  if (text.indexOf("ongoing") !== -1) return 0;
  if (text.indexOf("completed") !== -1) return 1;
  if (text.indexOf("hiatus") !== -1) return 2;
  if (text.indexOf("dropped") !== -1 || text.indexOf("cancel") !== -1) return 3;
  return null;
}

/**
 * "9 November,2026" -> "9 November 2026". The site writes Indonesian month
 * names with no space after the comma; parseDates' fallback chain does not
 * recognise "Oktober", so months are translated before parsing.
 */
function otakuDate(value) {
  const text = cleanText(value).replace(/,/g, " ");
  if (!text) return "";
  return text.replace(/[A-Za-z]+/g, function (word) {
    const translated = OTAKU_MONTHS[word.toLowerCase()];
    return translated || word;
  });
}

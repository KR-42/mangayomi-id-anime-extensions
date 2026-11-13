// Kuronime (https://kuronime.sbs) — a WordPress site (WP Rocket lazy images).
//
// Listings, search and detail are plain HTML. Streams are not: an episode page
// only holds an encrypted id, the animeku.org API answers with AES-encrypted
// player data (CryptoJS JSON: {ct, iv, s}), and the passphrase comes from the
// site's own player script. This decryption is an exception the repo owner
// approved on 11 Nov 2026 (see docs/SITE_NOTES.md §3). The player's own HLS is
// left out: its segments are disguised as .jpg, which ffmpeg (the app's player)
// refuses. The decrypted mirror list (mp4upload, pixeldrain, vidhide, ...) is
// what gets played.

const mangayomiSources = [{
  "name": "Kuronime",
  "lang": "id",
  "baseUrl": "https://kuronime.sbs",
  "apiUrl": "",
  "iconUrl": "icons/kuronime.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.3",
  "pkgPath": "anime/src/id/kuronime.js",
  "hasCloudflare": false,
  "notes": "Video dari mirror (mp4upload, pixeldrain, vidhide). Bila semua episode kosong, kunci player situs mungkin berubah: perbarui ekstensi. Domain bisa berpindah; atur di Pengaturan sumber."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const KURO_API = "https://animeku.org/api/v9/sources";
// From the string table of the site's player script; changes when the site
// updates it, and then every episode comes back empty.
const KURO_PASSPHRASE = "3&!Z0M,VIZ;dZW==";

const KURO_GENRES = [
  ["Action", "action"], ["Adult Cast", "adult-cast"], ["Adventure", "adventure"],
  ["Anthropomorphic", "anthropomorphic"], ["Avant Garde", "avant-garde"], ["Award Winning", "award-winning"],
  ["Boys Love", "boys-love"], ["Cars", "cars"], ["CGDCT", "cgdct"], ["Childcare", "childcare"],
  ["Combat Sports", "combat-sports"], ["Comedy", "comedy"], ["Crime", "crime"],
  ["Crossdressing", "crossdressing"], ["Cultivation", "cultivation"], ["Delinquents", "delinquents"],
  ["Dementia", "dementia"], ["Demons", "demons"], ["Detective", "detective"], ["Donghua", "donghua"],
  ["Drama", "drama"], ["Ecchi", "ecchi"], ["Educational", "educational"], ["Family", "family"],
  ["Fantasy", "fantasy"], ["Gag Humor", "gag-humor"], ["Game", "game"], ["Girls Love", "girls-love"],
  ["Gore", "gore"], ["Gourmet", "gourmet"], ["Harem", "harem"], ["High Stakes Game", "high-stakes-game"],
  ["Historical", "historical"], ["Horror", "horror"], ["Idols (Female)", "idols-female"],
  ["Idols (Male)", "idols-male"], ["Isekai", "isekai"], ["Iyashikei", "iyashikei"], ["Josei", "josei"],
  ["Kids", "kids"], ["Love Polygon", "love-polygon"], ["Magic", "magic"], ["Mahou Shoujo", "mahou-shoujo"],
  ["Martial Arts", "martial-arts"], ["Mecha", "mecha"], ["Medical", "medical"], ["Military", "military"],
  ["Music", "music"], ["Mystery", "mystery"], ["Mythology", "mythology"],
  ["Organized Crime", "organized-crime"], ["Otaku Culture", "otaku-culture"], ["Parody", "parody"],
  ["Performing Arts", "performing-arts"], ["Pets", "pets"], ["Police", "police"],
  ["Psychological", "psychological"], ["Racing", "racing"], ["Reincarnation", "reincarnation"],
  ["Reverse Harem", "reverse-harem"], ["Romance", "romance"], ["Romantic Subtext", "romantic-subtext"],
  ["Samurai", "samurai"], ["School", "school"], ["Sci-Fi", "sci-fi"], ["Seinen", "seinen"],
  ["Shoujo", "shoujo"], ["Shoujo Ai", "shoujo-ai"], ["Shounen", "shounen"], ["Shounen Ai", "shounen-ai"],
  ["Showbiz", "showbiz"], ["Slice of Life", "slice-of-life"], ["Space", "space"], ["Sports", "sports"],
  ["Strategy Game", "strategy-game"], ["Super Power", "super-power"], ["Supernatural", "supernatural"],
  ["Survival", "survival"], ["Suspense", "suspense"], ["Team Sports", "team-sports"],
  ["Thriller", "thriller"], ["Time Travel", "time-travel"], ["Tokusatsu", "tokusatsu"],
];
const KURO_STATUS = [["Semua", ""], ["Ongoing", "ongoing"], ["Completed", "completed"]];
const KURO_TYPES = [["Semua", ""], ["TV", "TV"], ["Movie", "Movie"], ["OVA", "OVA"], ["ONA", "ONA"], ["Special", "Special"]];
const KURO_ORDERS = [["Terbaru diperbarui", "update"], ["Terpopuler", "popular"], ["Terbaru ditambahkan", "latest"], ["Judul A-Z", "title"], ["Judul Z-A", "titlereverse"]];
const KURO_SERVERS = ["Mp4Upload", "Pixeldrain", "Krakenfiles", "Vidhide"];
const KURO_QUALITIES = ["v1080p", "v720p", "v480p", "v360p"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://kuronime.sbs");
  }

  get supportsLatest() {
    return true;
  }

  /** A refusal throws, so it reaches the app's error card instead of a blank. */
  async pageDoc(url) {
    const res = await this.client.get(url, this.getHeaders(url));
    const challenged = res && res.headers && res.headers["cf-mitigated"];
    if (res && (res.statusCode === 403 || res.statusCode === 503 || challenged)) {
      throw new Error("Situs menolak permintaan (HTTP " + res.statusCode +
        "). Buka WebView lalu coba lagi.");
    }
    if (!res || !res.body || res.statusCode >= 400) {
      console.log("kuronime: gagal memuat " + url);
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
    const text = cleanText(query);
    if (!text) return this.catalogue(this.selected(filters), page);
    const n = Math.max(1, parseInt(page, 10) || 1);
    const path = (n === 1 ? "/" : "/page/" + n + "/") + "?s=" + encodeQuery(text);
    return this.listing(path);
  }

  async catalogue(params, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const query = [];
    ["status", "type", "order"].forEach(function (key) {
      if (params[key]) query.push(key + "=" + encodeQuery(params[key]));
    });
    if (params.genre) query.push("genre%5B%5D=" + encodeQuery(params.genre));
    return this.listing((n === 1 ? "/anime/" : "/anime/page/" + n + "/") + "?" + query.join("&"));
  }

  async listing(path) {
    const doc = await this.pageDoc(this.resolve(path));
    if (!doc) return this.emptyPage();
    const cards = doc.select("div.listupd article.bs") || [];
    const list = [];
    for (let i = 0; i < cards.length; i++) {
      const anchor = cards[i].selectFirst("div.bsx > a[href]");
      const href = anchor ? anchor.attr("href") : "";
      if (!href) continue;
      const title = cards[i].selectFirst("h2[itemprop=headline]");
      list.push(this.item(
        title ? title.text : anchor.attr("title"),
        kuroImage(cards[i].selectFirst("img[itemprop=image]")),
        href,
      ));
    }
    const next = doc.selectFirst(".pagination a.next");
    return { list: list, hasNextPage: !!(next && next.attr("href")) };
  }

  selected(filters) {
    const out = { order: "update", status: "", type: "", genre: "" };
    (filters || []).forEach(function (filter) {
      if (!filter || !filter.values || !filter.type) return;
      const option = filter.values[parseInt(filter.state, 10) || 0];
      if (option) out[filter.type] = safeString(option.value);
    });
    if (!out.order) out.order = "update";
    return out;
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    const seriesUrl = await this.seriesUrlOf(this.resolve(url));
    const doc = seriesUrl ? await this.pageDoc(seriesUrl) : null;
    if (!doc) return empty;

    const name = cleanTitle(doc.selectFirst("h1.entry-title").text);
    if (!name) {
      console.log("kuronime: detail tidak ditemukan: " + seriesUrl);
      return empty;
    }
    const info = {};
    const rows = doc.select("div.infodetail ul li") || [];
    for (let i = 0; i < rows.length; i++) {
      const match = /^([^:]+):\s*([\s\S]*)$/.exec(cleanText(rows[i].text));
      if (match) info[match[1].trim().toLowerCase()] = match[2].trim();
    }
    const facts = ["tipe", "tayang", "season", "durasi"].filter(function (key) {
      return info[key];
    }).map(function (key) {
      return key.charAt(0).toUpperCase() + key.slice(1) + ": " + info[key];
    });
    const synopsis = cleanText(decodeEntities(doc.selectFirst("div.conx span.const").text));

    const detail = {
      name: name,
      imageUrl: kuroImage(doc.selectFirst("div.l[itemprop=image] img")),
      link: this.relativize(seriesUrl),
      description: [synopsis, facts.join(" · ")].filter(Boolean).join("\n\n"),
      author: info.studio || "",
      artist: "",
      genre: (info.genre || "").split(",").map(cleanText).filter(Boolean),
      episodes: this.episodesOf(doc),
    };
    if (/ongoing/i.test(info.status)) detail.status = 0;
    else if (/completed/i.test(info.status)) detail.status = 1;
    return detail;
  }

  /** A series URL as given; an episode URL resolved through its breadcrumb. */
  async seriesUrlOf(url) {
    if (/\/anime\/[^/]+\/?$/.test(url.split("?")[0])) return url;
    const episode = await this.pageDoc(url);
    if (!episode) return "";
    const anchors = episode.select(".breadcrumbs a[href]") || [];
    for (let i = anchors.length - 1; i >= 0; i--) {
      const href = anchors[i].attr("href");
      if (/\/anime\/[^/]+\/?$/.test(href || "")) return this.resolve(pathOf(href));
    }
    console.log("kuronime: tautan seri tidak ditemukan di " + url);
    return "";
  }

  /** The site lists episodes newest first, the order the app shows. */
  episodesOf(doc) {
    const anchors = doc.select("div.bixbox.bxcl ul li span.lchx a[href]") || [];
    const seen = {};
    const out = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href");
      if (!href) continue;
      const link = this.relativize(this.resolve(pathOf(href)));
      if (seen[link]) continue;
      seen[link] = true;
      const label = cleanText(anchors[i].text);
      out.push({ name: label || "Episode", url: link, dateUpload: "", scanlator: "" });
    }
    return out;
  }

  // --------------------------------------------------------------- videos

  /**
   * Every failure throws with the stage that failed, so the app shows it
   * instead of an empty player.
   */
  async getVideoList(url) {
    const pageUrl = this.resolve(url);
    const res = await this.client.get(pageUrl, this.getHeaders(pageUrl));
    const html = res && res.statusCode === 200 ? safeString(res.body) : "";
    const blob = /var\s+_0x[0-9a-f]+\s*=\s*"([A-Za-z0-9+/=]{40,})"/.exec(html);
    if (!blob) {
      throw new Error("Kuronime: id player tidak ditemukan di halaman episode (HTTP " +
        (res && res.statusCode) + ").");
    }
    const mirror = await this.playerMirrors(blob[1]);

    const embeds = kuroEmbeds(mirror);
    if (!embeds.length) throw new Error("Kuronime: player tidak memberi mirror untuk episode ini.");
    const self = this;
    const found = await this.mapLimit(embeds, 2, function (embed) {
      return self.resolveEmbed(embed, pageUrl);
    });
    const results = [];
    found.forEach(function (videos) {
      (videos || []).forEach(function (video) {
        results.push(video);
      });
    });
    if (!results.length) {
      throw new Error("Kuronime: " + embeds.length + " mirror dicoba (" +
        embeds.map(function (e) { return e.server + " " + e.quality; }).join(", ") +
        "), tidak ada yang menghasilkan video.");
    }
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /** POST the page's id to the player API and decrypt its `mirror` field. Throws on failure. */
  async playerMirrors(id) {
    const base = this.getBaseUrl();
    const headers = this.headersFor(base + "/");
    headers.Origin = base;
    headers["Content-Type"] = "application/json";
    headers.Accept = "application/json, text/plain, */*";
    // An object, not a JSON string: with a JSON Content-Type the app encodes
    // the body itself, and a string would arrive double-encoded (HTTP 500).
    const res = await this.client.post(KURO_API, headers, { id: id });
    let data = null;
    try {
      data = res && res.body ? JSON.parse(res.body) : null;
    } catch (_) {
      data = null;
    }
    if (!data || !data.mirror) {
      throw new Error("Kuronime: API player menolak (HTTP " + (res && res.statusCode) + ": " +
        safeString(res && res.body).slice(0, 80) + ").");
    }
    const plain = kuroDecrypt(data.mirror);
    try {
      return JSON.parse(plain);
    } catch (_) {
      throw new Error("Kuronime: dekripsi gagal (" + (plain ? "hasil bukan JSON" : "hasil kosong") +
        "); kunci player mungkin berubah, perbarui ekstensi.");
    }
  }

  async resolveEmbed(embed, pageUrl) {
    const label = function (video) {
      video.server = embed.server;
      video.quality = qualityLabel(resolutionOf(video.quality) || embed.quality, embed.server, "Hardsub ID");
      return video;
    };
    if (embed.server === "Mp4Upload") {
      const video = await this.mp4upload(embed.url);
      return video ? [label(video)] : [];
    }
    const reason = unsupportedReason(embed.url);
    if (reason) {
      console.log("kuronime: server " + embed.server + " tidak didukung (" + reason + ")");
      return [];
    }
    if (!isSupportedHost(embed.url)) {
      console.log("kuronime: server " + embed.server + " tidak didukung (belum ada ekstraktor untuk " + hostOf(embed.url) + ")");
      return [];
    }
    const found = await extractByHost(this, embed.url, pageUrl, embed.quality, "Hardsub ID");
    if (!found.videos.length) console.log("kuronime: " + embed.server + " " + embed.quality + " tidak menghasilkan stream");
    return found.videos.map(label);
  }

  /** The embed page names its file as `src: "https://aN.mp4upload.com:183/.../video.mp4"`. */
  async mp4upload(embedUrl) {
    try {
      const html = await this.fetch(embedUrl, this.headersFor(this.getBaseUrl() + "/"));
      const match = /src:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/.exec(html);
      if (!match) {
        console.log("kuronime: mp4upload tanpa file: " + embedUrl);
        return null;
      }
      return { url: match[1], originalUrl: embedUrl, quality: "", headers: this.headersFor("https://www.mp4upload.com/") };
    } catch (e) {
      console.log("kuronime: mp4upload gagal: " + e);
      return null;
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
      select("order", "Urutkan", KURO_ORDERS),
      select("status", "Status", KURO_STATUS),
      select("type", "Tipe", KURO_TYPES),
      select("genre", "Genre", [["Semua", ""]].concat(KURO_GENRES)),
      { type_name: "HeaderFilter", type: "note", name: "Filter diabaikan saat mencari dengan kata kunci." },
    ];
  }

  getSourcePreferences() {
    return this.basePreferences(KURO_SERVERS);
  }
}

/** WP Rocket puts the real image in data-lazy-src and an SVG placeholder in src. */
function kuroImage(img) {
  if (!img) return "";
  const candidates = [img.attr("data-lazy-src"), img.attr("data-src"), img.attr("src")];
  for (let i = 0; i < candidates.length; i++) {
    const src = decodeEntities(safeString(candidates[i]));
    if (src && !/^data:/i.test(src)) return src;
  }
  return "";
}

/**
 * The API ships CryptoJS JSON `base64({ct, iv, s})`. Its iv is the one
 * EVP_BytesToKey derives from the salt, so the payload is re-packed into the
 * OpenSSL `Salted__` container the app's decryptAESCryptoJS reads.
 */
function kuroDecrypt(field) {
  const payload = JSON.parse(b64Decode(field));
  let salt = "";
  for (let i = 0; i + 1 < payload.s.length; i += 2) {
    salt += String.fromCharCode(parseInt(payload.s.substr(i, 2), 16));
  }
  const container = b64Encode("Salted__" + salt + b64Decode(payload.ct));
  return decryptAESCryptoJS(container, KURO_PASSPHRASE);
}

const KURO_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 of a byte string (chars 0-255); QuickJS has no btoa. */
function b64Encode(bin) {
  let out = "";
  for (let i = 0; i < bin.length; i += 3) {
    const a = bin.charCodeAt(i) & 0xff;
    const b = i + 1 < bin.length ? bin.charCodeAt(i + 1) & 0xff : -1;
    const c = i + 2 < bin.length ? bin.charCodeAt(i + 2) & 0xff : -1;
    out += KURO_B64.charAt(a >> 2);
    out += KURO_B64.charAt(((a & 3) << 4) | (b < 0 ? 0 : b >> 4));
    out += b < 0 ? "=" : KURO_B64.charAt(((b & 15) << 2) | (c < 0 ? 0 : c >> 6));
    out += c < 0 ? "=" : KURO_B64.charAt(c & 63);
  }
  return out;
}

/** `{embed: {v1080p: {mp4upload: url, ...}, ...}}` as {url, server, quality}, best first. */
function kuroEmbeds(mirror) {
  const table = (mirror && mirror.embed) || {};
  const names = { mp4upload: "Mp4Upload", pixeldrain: "Pixeldrain", krakenfiles: "Krakenfiles", filelions: "Vidhide", doodstream: "Doodstream" };
  const seen = {};
  const out = [];
  for (let q = 0; q < KURO_QUALITIES.length; q++) {
    const hosts = table[KURO_QUALITIES[q]] || {};
    for (const host in hosts) {
      if (!Object.prototype.hasOwnProperty.call(hosts, host)) continue;
      const url = safeString(hosts[host]);
      // dsvplay/dood hosts do not resolve; the app's extractor would wait on each.
      if (!/^https?:\/\//i.test(url) || seen[url] || host === "doodstream") continue;
      seen[url] = true;
      out.push({ url: url, server: names[host] || host, quality: KURO_QUALITIES[q].slice(1) });
    }
  }
  return out;
}

// Anibatch (https://www.animebatch.id) — a Next.js App Router site.
//
// Listings are server-rendered cards. A series page carries its data in the
// React Server Components payload (`self.__next_f.push([1,"..."])`): the post
// record and every link for every episode, so an episode URL is the series
// path plus "#ep=<n>". BerkasDrive links resolve through the site's own player
// endpoint, which answers with the signed MP4 the web player loads; every other
// embed goes to the shared extractors.

const mangayomiSources = [{
  "name": "Anibatch",
  "lang": "id",
  "baseUrl": "https://www.animebatch.id",
  "apiUrl": "",
  "iconUrl": "icons/anibatch.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.2",
  "pkgPath": "anime/src/id/anibatch.js",
  "hasCloudflare": true,
  "notes": "Pencarian hanya satu halaman, sesuai situs. Domain bisa berpindah; atur di Pengaturan sumber."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const ANIBATCH_GENRES = [
  ["Action", "action"], ["Adult Cast", "adult-cast"], ["Adventure", "adventure"],
  ["Animals", "animals"], ["Anthropomorphic", "anthropomorphic"], ["Basketball", "basketball"],
  ["Boys Love", "boys-love"], ["Business", "business"], ["CGDCT", "cgdct"], ["Cars", "cars"],
  ["Childcare", "childcare"], ["Combat Sports", "combat-sports"], ["Comedy", "comedy"],
  ["Crime", "crime"], ["Crossdressing", "crossdressing"], ["Delinquents", "delinquents"],
  ["Dementia", "dementia"], ["Demons", "demons"], ["Detective", "detective"], ["Drama", "drama"],
  ["Ecchi", "ecchi"], ["Educational", "educational"], ["Family", "family"], ["Fantasy", "fantasy"],
  ["Friendship", "friendship"], ["Game", "game"], ["Girls Love", "girls-love"], ["Gore", "gore"],
  ["Gourmet", "gourmet"], ["Harem", "harem"], ["High Stakes Game", "high-stakes-game"],
  ["Historical", "historical"], ["Horror", "horror"], ["Idols (Female)", "idols-female"],
  ["Idols (Male)", "idols-male"], ["Investigation", "investigation"], ["Isekai", "isekai"],
  ["Iyashikei", "iyashikei"], ["Josei", "josei"], ["Kids", "kids"], ["Love Polygon", "love-polygon"],
  ["Magic", "magic"], ["Mahou Shoujo", "mahou-shoujo"], ["Martial Arts", "martial-arts"],
  ["Mecha", "mecha"], ["Medical", "medical"], ["Military", "military"], ["Music", "music"],
  ["Mystery", "mystery"], ["Mythology", "mythology"], ["Organized Crime", "organized-crime"],
  ["Otaku Culture", "otaku-culture"], ["Parody", "parody"], ["Performing Arts", "performing-arts"],
  ["Police", "police"], ["Political", "political"], ["Psychological", "psychological"],
  ["Reincarnation", "reincarnation"], ["Reverse Harem", "reverse-harem"], ["Romance", "romance"],
  ["Romantic Comedy", "romantic-comedy"], ["Samurai", "samurai"], ["School", "school"],
  ["Sci-Fi", "sci-fi"], ["Seinen", "seinen"], ["Shoujo", "shoujo"], ["Shoujo Ai", "shoujo-ai"],
  ["Shounen", "shounen"], ["Shounen Ai", "shounen-ai"], ["Slice of Life", "slice-of-life"],
  ["Space", "space"], ["Sports", "sports"], ["Strategy Game", "strategy-game"],
  ["Super Power", "super-power"], ["Supernatural", "supernatural"], ["Survival", "survival"],
  ["Suspense", "suspense"], ["Team Sports", "team-sports"], ["Thriller", "thriller"],
  ["Time Travel", "time-travel"], ["Tokusatsu", "tokusatsu"],
];

const ANIBATCH_VIEWS = [["Semua", "all"], ["Ongoing", "ongoing"], ["Batch", "batch"], ["Film", "movie"]];
const ANIBATCH_SORTS = [["Terbaru", "newest"], ["Terpopuler", "popular"], ["Rating tertinggi", "rating"], ["Judul A-Z", "az"]];
const ANIBATCH_STATUS = [["Semua", ""], ["Ongoing", "Ongoing"], ["Completed", "Completed"]];
// Vidhide last: its CDN answers 403 to a share of requests.
const ANIBATCH_SERVERS = ["BerkasDrive", "HiAnime", "Filedon", "Desustream", "Blogger", "Vidhide"];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://www.animebatch.id");
  }

  get supportsLatest() {
    return true;
  }

  /** A refusal throws, so it reaches the app's error card instead of a blank. */
  async pageBody(url) {
    const res = await this.client.get(url, this.getHeaders(url));
    const challenged = res && res.headers && res.headers["cf-mitigated"];
    if (res && (res.statusCode === 403 || res.statusCode === 503 || challenged)) {
      throw new Error("Situs menolak permintaan (HTTP " + res.statusCode +
        "). Buka WebView lalu coba lagi.");
    }
    if (!res || !res.body || res.statusCode >= 400) {
      console.log("anibatch: gagal memuat " + url);
      return "";
    }
    return res.body;
  }

  // ------------------------------------------------------------- listings

  async getPopular(page) {
    return this.catalogue({ view: "all", sort: "popular" }, page);
  }

  async getLatestUpdates(page) {
    return this.catalogue({ view: "all", sort: "newest" }, page);
  }

  /** Text search is one page on the site (`/page/2/?q=` is a 404). */
  async search(query, page, filters) {
    const text = cleanText(query);
    if (!text) return this.catalogue(this.selected(filters), page);
    if ((parseInt(page, 10) || 1) > 1) return this.emptyPage();
    const body = await this.pageBody(this.resolve("/?q=" + encodeQuery(text)));
    return { list: this.cards(body), hasNextPage: false };
  }

  async catalogue(params, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const query = [];
    ["view", "sort", "genre", "status"].forEach(function (key) {
      if (params[key]) query.push(key + "=" + encodeQuery(params[key]));
    });
    const path = (n === 1 ? "/" : "/page/" + n + "/") + "?" + query.join("&");
    const body = await this.pageBody(this.resolve(path));
    if (!body) return this.emptyPage();
    return { list: this.cards(body), hasNextPage: body.indexOf('href="/page/' + (n + 1) + '/') !== -1 };
  }

  cards(body) {
    if (!body) return [];
    const doc = new Document(body);
    const cards = doc.select("article.anime-card") || [];
    const list = [];
    for (let i = 0; i < cards.length; i++) {
      const anchor = cards[i].selectFirst("a.card-title");
      const href = anchor ? anchor.attr("href") : "";
      if (!href) continue;
      const img = cards[i].selectFirst("div.poster-wrap img");
      list.push(this.item(anchor.text, this.absolute(img ? img.attr("src") : ""), href));
    }
    return list;
  }

  selected(filters) {
    const out = { view: "all", sort: "newest", genre: "", status: "" };
    (filters || []).forEach(function (filter) {
      if (!filter || !filter.values || !filter.type) return;
      const option = filter.values[parseInt(filter.state, 10) || 0];
      if (option) out[filter.type] = safeString(option.value);
    });
    if (!out.view) out.view = "all";
    if (!out.sort) out.sort = "newest";
    return out;
  }

  absolute(src) {
    return src ? this.resolve(decodeEntities(src)) : "";
  }

  // --------------------------------------------------------------- detail

  /** The post record and its links, from the RSC payload of a series page. */
  async series(path) {
    const body = await this.pageBody(this.resolve(path));
    if (!body) return null;
    const rsc = anibatchRsc(body);
    const post = anibatchJsonAt(rsc, '"post":{"availableEpisodes"', 7);
    if (!post) {
      console.log("anibatch: data seri tidak ditemukan di " + path);
      return null;
    }
    return { post: post, rsc: rsc };
  }

  async getDetail(url) {
    const path = anibatchSeriesPath(url);
    const empty = { name: "", imageUrl: "", link: path, description: "", episodes: [] };
    const data = await this.series(path);
    if (!data) return empty;
    const post = data.post;

    const facts = [];
    if (post.type) facts.push("Tipe: " + post.type);
    if (post.year) facts.push("Tahun: " + post.year);
    if (post.episodes) facts.push("Episode: " + post.episodes);
    if (post.duration) facts.push("Durasi: " + post.duration);
    if (post.score) facts.push("Skor: " + post.score);
    const synopsis = Array.isArray(post.synopsis) ? post.synopsis.join("\n\n") : safeString(post.synopsis);

    const detail = {
      name: cleanTitle(post.title || post.postTitle),
      imageUrl: this.absolute(post.image),
      link: path,
      description: cleanText(synopsis) ? synopsis.trim() + (facts.length ? "\n\n" + facts.join(" · ") : "") : facts.join(" · "),
      author: safeString(post.studio),
      artist: "",
      genre: (post.genres || []).map(safeString).filter(Boolean),
      episodes: this.episodesOf(post, path, anibatchJsonAt(data.rsc, '"links":[', 8) || []),
    };
    if (/ongoing/i.test(post.status)) detail.status = 0;
    else if (/complete/i.test(post.status)) detail.status = 1;
    return detail;
  }

  /**
   * Newest first, the order the app shows. Episodes whose only files are
   * archives or download hosts are left out: they have nothing to play.
   */
  episodesOf(post, path, links) {
    const numbers = (post.availableEpisodes || []).filter(function (n) {
      return anibatchEmbeds(links, n).length > 0;
    }).sort(function (a, b) {
      return b - a;
    });
    const titles = {};
    (post.episodeInfo || []).forEach(function (info) {
      // Most titles only repeat the series name and "Episode N".
      const title = info ? cleanText(info.title) : "";
      if (title && !/episode|subtitle/i.test(title)) titles[info.number] = title;
    });
    const movie = /movie/i.test(post.type) && numbers.length === 1;
    return numbers.map(function (n) {
      return {
        name: movie ? "Film" : titles[n] ? "Episode " + n + ": " + titles[n] : "Episode " + n,
        url: path + "#ep=" + n,
        dateUpload: "",
        scanlator: "",
      };
    });
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const marker = safeString(url).indexOf("#ep=");
    if (marker === -1) return [];
    const episode = parseFloat(safeString(url).slice(marker + 4));
    const path = anibatchSeriesPath(url);
    const data = await this.series(path);
    if (!data) return [];
    const links = anibatchJsonAt(data.rsc, '"links":[', 8) || [];
    const embeds = anibatchEmbeds(links, episode);
    if (!embeds.length) console.log("anibatch: episode " + episode + " tidak punya embed yang bisa diputar");

    const self = this;
    const pageUrl = this.resolve(path);
    const found = await this.mapLimit(embeds, 2, function (embed) {
      return self.resolveEmbed(embed, path, pageUrl);
    });
    const results = [];
    found.forEach(function (videos) {
      (videos || []).forEach(function (video) {
        results.push(video);
      });
    });
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  async resolveEmbed(embed, path, pageUrl) {
    const label = function (video) {
      video.server = embed.server;
      video.quality = qualityLabel(resolutionOf(video.quality) || embed.quality, embed.server, "Hardsub ID");
      return video;
    };
    if (embed.berkas) {
      const video = await this.berkasVideo(embed, path, pageUrl);
      return video ? [label(video)] : [];
    }
    if (/hianime-play\./i.test(embed.url)) {
      return this.hianimeVideos(embed);
    }
    const reason = unsupportedReason(embed.url);
    if (reason) {
      console.log("anibatch: server " + embed.server + " tidak didukung (" + reason + ")");
      return [];
    }
    if (!isSupportedHost(embed.url)) {
      console.log("anibatch: server " + embed.server + " tidak didukung (belum ada ekstraktor untuk " + hostOf(embed.url) + ")");
      return [];
    }
    const found = await extractByHost(this, embed.url, pageUrl, embed.quality, "Hardsub ID");
    if (!found.videos.length) console.log("anibatch: " + embed.server + " " + embed.quality + " tidak menghasilkan stream");
    return found.videos.map(label);
  }

  /**
   * HiAnime (`hianime-play.halahgan.com/?anime=&episode=&quality=`) is a plain
   * JSON player: `/api/anime/<id>` lists each episode's versions, and the file
   * is served at `/media/<key>`. Softsub: the Indonesian track is a separate
   * .vtt, attached here. This is the host's own public API, not a bypass.
   */
  async hianimeVideos(embed) {
    const origin = (/^https?:\/\/[^/]+/.exec(embed.url) || [""])[0];
    const q = {};
    (embed.url.split("?")[1] || "").split("&").forEach(function (pair) {
      const kv = pair.split("=");
      q[kv[0]] = kv[1] || "";
    });
    if (!origin || !q.anime || !q.episode) return [];
    let data;
    try {
      data = JSON.parse(await this.fetch(origin + "/api/anime/" + encodeQuery(q.anime), this.headersFor(origin + "/")));
    } catch (e) {
      console.log("anibatch: HiAnime API gagal: " + e);
      return [];
    }
    const episodes = (data && data.episodes) || [];
    let episode = null;
    for (let i = 0; i < episodes.length; i++) {
      if (String(episodes[i].id) === String(q.episode)) { episode = episodes[i]; break; }
    }
    const versions = (episode && episode.versions ? episode.versions : []).filter(function (v) {
      return v && v.key && v.audio !== "dub";
    });
    if (!versions.length) {
      console.log("anibatch: HiAnime tidak punya versi untuk episode " + q.episode);
      return [];
    }
    const media = function (key) {
      return origin + "/media/" + safeString(key).split("/").map(encodeQuery).join("/");
    };
    const wanted = parseInt(q.quality, 10) || 0;
    let chosen = wanted ? versions.filter(function (v) { return v.resolution === wanted; }) : versions;
    if (!chosen.length) chosen = versions;
    const self = this;
    return chosen.map(function (v) {
      const subtitles = (v.subtitles || []).map(function (s) {
        return { file: media(s.key), label: s.language === "id" ? "Indonesia" : safeString(s.language).toUpperCase() };
      });
      subtitles.sort(function (a, b) {
        return a.label === "Indonesia" ? -1 : b.label === "Indonesia" ? 1 : 0;
      });
      return {
        url: media(v.key),
        originalUrl: embed.url,
        quality: qualityLabel(v.resolution ? v.resolution + "p" : embed.quality, "HiAnime", "Softsub ID"),
        headers: self.headersFor(origin + "/"),
        subtitles: subtitles,
      };
    });
  }

  /** The site's player endpoint answers `<main id="player" data-src="<signed mp4>">`. */
  async berkasVideo(embed, path, pageUrl) {
    const slug = path.replace(/^\/+|\/+$/g, "");
    const api = this.resolve("/api/v1/player/" + slug + "/" + encodeQuery(embed.id));
    try {
      const res = await this.client.get(api, this.headersFor(pageUrl));
      const match = res && res.statusCode === 200 ? /data-src="([^"]+)"/.exec(res.body || "") : null;
      if (!match) {
        console.log("anibatch: player BerkasDrive " + embed.quality + " belum tersedia (HTTP " + (res && res.statusCode) + ")");
        return null;
      }
      const src = decodeEntities(match[1]);
      return { url: src, originalUrl: embed.url, quality: embed.quality, headers: this.headersFor(this.getBaseUrl() + "/") };
    } catch (e) {
      console.log("anibatch: player BerkasDrive gagal: " + e);
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
      select("view", "Tipe", ANIBATCH_VIEWS),
      select("sort", "Urutkan", ANIBATCH_SORTS),
      select("status", "Status", ANIBATCH_STATUS),
      select("genre", "Genre", [["Semua", ""]].concat(ANIBATCH_GENRES)),
      { type_name: "HeaderFilter", type: "note", name: "Filter diabaikan saat mencari dengan kata kunci." },
    ];
  }

  getSourcePreferences() {
    return this.basePreferences(ANIBATCH_SERVERS);
  }
}

/** "/slug/#ep=3", "https://host/slug/" -> "/slug/". */
function anibatchSeriesPath(url) {
  const path = pathOf(safeString(url).split("#")[0]).split("?")[0];
  const slug = path.replace(/^\/+|\/+$/g, "").split("/")[0];
  return "/" + slug + "/";
}

/**
 * Concatenated string chunks of `self.__next_f.push([1,"..."])`. Scanned by
 * hand: series pages reach 7 MB and a backtracking regex over them is slow.
 */
function anibatchRsc(html) {
  const open = 'self.__next_f.push([1,"';
  let out = "";
  let from = 0;
  for (;;) {
    const start = html.indexOf(open, from);
    if (start === -1) break;
    let i = start + open.length;
    while (i < html.length && html.charAt(i) !== '"') i += html.charAt(i) === "\\" ? 2 : 1;
    try {
      out += JSON.parse('"' + html.slice(start + open.length, i) + '"');
    } catch (_) {
      // A chunk that is not a JSON string literal carries nothing we read.
    }
    from = i + 1;
  }
  return out;
}

/**
 * Parse the JSON value that starts `offset` characters into the first match of
 * `key` (e.g. the `[` of `"links":[`). Brackets inside strings are skipped.
 */
function anibatchJsonAt(text, key, offset) {
  const at = text.indexOf(key);
  if (at === -1) return null;
  const start = at + offset;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "{" || c === "[") {
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch (e) {
          console.log("anibatch: JSON rusak di " + key + ": " + e);
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Playable embeds of one episode: `episode` and `movie` links in embed mode,
 * minus archives (some "episodes" are .rar files) and repeats. A server keeps
 * one link per quality; re-uploads of the same file only add requests.
 */
function anibatchEmbeds(links, episode) {
  const seen = {};
  const out = [];
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (!link || link.mode !== "embed" || link.episode !== episode) continue;
    if (link.kind !== "episode" && link.kind !== "movie") continue;
    if (/\.(rar|zip|7z)$/i.test(safeString(link.filename))) continue;
    const url = anibatchUnwrap(safeString(link.playUrl || link.url));
    if (!url) continue;
    const berkas = /\/hal\/streaming\//.test(url) && !!link.id;
    const server = berkas ? "BerkasDrive" : anibatchServer(link, url);
    const quality = resolutionOf(link.quality);
    const key = server + "|" + (quality || url);
    if (seen[key]) continue;
    seen[key] = true;
    out.push({ id: safeString(link.id), url: url, berkas: berkas, quality: quality, server: server });
  }
  return out;
}

/** `https://<x>.workers.dev/https://desustream.net/...` proxies the inner URL. */
function anibatchUnwrap(url) {
  const match = /^https?:\/\/[^/]+\.workers\.dev\/(https?:\/\/.+)$/i.exec(url);
  return match ? match[1] : url;
}

function anibatchServer(link, url) {
  const host = hostOf(url);
  if (/desustream|odcdn|odstream/i.test(host)) return "Desustream";
  if (/vidhide/i.test(host)) return "Vidhide";
  if (/filedon/i.test(host)) return "Filedon";
  if (/blogger|blogspot/i.test(host)) return "Blogger";
  return safeString(link.provider) || host || "Server";
}

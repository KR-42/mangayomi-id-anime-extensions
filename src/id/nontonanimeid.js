// Nonton Anime ID (https://www.nontonanimeid.my.id) — a Blogger site.
//
// Listings and search come from the Blogger JSON feed, popularity from the
// site's public Firebase counters. A series is one post holding every episode,
// so an episode URL is the post path plus "#ep=<label>". Posts come in three
// layouts: <ul> or <div> episode lists under server tabs, and movie posts whose
// buttons are the servers themselves.

const mangayomiSources = [{
  "name": "Nonton Anime ID",
  "lang": "id",
  "baseUrl": "https://www.nontonanimeid.my.id",
  "apiUrl": "",
  "iconUrl": "icons/nontonanimeid.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.1.2",
  "pkgPath": "anime/src/id/nontonanimeid.js",
  "hasCloudflare": false,
  "notes": "Katalog kecil dan didominasi donghua. Domain bisa berpindah; atur di Pengaturan sumber."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const NONTON_PER_PAGE = 18;
const NONTON_GENRES = [
  "Action", "Adventure", "Comedy", "Cultivation", "Drama", "Fantasy", "Historical",
  "Martial Arts", "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Xianxia",
];

// Blogger labels that describe the post rather than the story.
const NONTON_NON_GENRE = new RegExp(
  "^(ep \\d+|sub|hot|ongoing|completed|series|anime|donghua|movie|china|cina|japan|censored|" +
    "senin|selasa|rabu|kamis|jumat|sabtu|minggu|rating .*|(spring|summer|fall|winter) \\d{4})$",
  "i",
);

const NONTON_SERVERS = ["SUB INDO"];
const NONTON_MOVIE = "film";

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://www.nontonanimeid.my.id");
  }

  get supportsLatest() {
    return true;
  }

  // ------------------------------------------------------------- listings

  async feed(path, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    const start = (n - 1) * NONTON_PER_PAGE + 1;
    const separator = path.indexOf("?") === -1 ? "?" : "&";
    const url = this.resolve(path) + separator + "alt=json&max-results=" + NONTON_PER_PAGE +
      "&start-index=" + start;
    let data;
    try {
      data = JSON.parse(await this.fetch(url));
    } catch (e) {
      console.log("nontonanimeid: feed gagal: " + e);
      return this.emptyPage();
    }
    const feed = (data && data.feed) || {};
    const total = parseInt((feed.openSearch$totalResults || {}).$t, 10) || 0;
    const entries = feed.entry || [];
    const list = [];
    for (let i = 0; i < entries.length; i++) {
      const item = this.entryItem(entries[i]);
      if (item) list.push(item);
    }
    return { list: list, hasNextPage: start - 1 + entries.length < total };
  }

  entryItem(entry) {
    const links = entry.link || [];
    let href = "";
    for (let i = 0; i < links.length; i++) {
      if (links[i].rel === "alternate") href = links[i].href;
    }
    if (!href) return null;
    const thumb = safeString((entry.media$thumbnail || {}).url)
      .replace(/\/s\d+(-c)?\//, "/w240-h336-c-rw/");
    return this.item((entry.title || {}).$t, thumb, href);
  }

  /** Today's view counters (WIB); the feed stands in when the day is empty. */
  async getPopular(page) {
    if ((parseInt(page, 10) || 1) > 1) return this.emptyPage();
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const url = "https://nontonanimeid-47b40-default-rtdb.firebaseio.com/views/" + today +
      ".json?orderBy=%22c%22&limitToLast=40";
    try {
      const views = JSON.parse(await this.fetch(url)) || {};
      const rows = Object.keys(views).map(function (key) { return views[key]; })
        .filter(function (row) { return row && row.u && row.t; })
        .sort(function (a, b) { return (b.c || 0) - (a.c || 0); });
      if (rows.length) {
        const self = this;
        return {
          list: rows.map(function (row) { return self.item(row.t, row.i || "", row.u); }),
          hasNextPage: false,
        };
      }
    } catch (e) {
      console.log("nontonanimeid: data popular gagal: " + e);
    }
    return this.getLatestUpdates(1);
  }

  async getLatestUpdates(page) {
    return this.feed("/feeds/posts/summary", page);
  }

  /** Filters are Blogger labels: several in the path mean AND. */
  async search(query, page, filters) {
    const labels = [];
    const list = filters || [];
    for (let i = 0; i < list.length; i++) {
      const filter = list[i];
      if (!filter || !filter.values) continue;
      const option = filter.values[parseInt(filter.state, 10) || 0];
      if (option && option.value) labels.push(encodeQuery(option.value));
    }
    const text = cleanText(query);
    const base = "/feeds/posts/summary" + (labels.length ? "/-/" + labels.join("/") : "");
    return this.feed(text ? base + "?q=" + encodeQuery(text) : base, page);
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    const doc = await this.fetchDoc(this.resolve(url));
    if (!doc) return empty;

    const name = cleanTitle(doc.selectFirst(".post-page-title").text);
    if (!name) {
      console.log("nontonanimeid: detail tidak ditemukan: " + this.resolve(url));
      return empty;
    }

    const labels = this.labelsOf(doc);
    const detail = {
      name: name,
      imageUrl: firstNonEmpty(
        doc.selectFirst(".ai-poster img").attr("src"),
        doc.selectFirst("#dagView .dv-img").attr("data-src"),
      ),
      link: this.relativize(this.resolve(url)),
      description: this.descriptionOf(doc),
      author: "",
      artist: "",
      genre: labels.filter(function (label) { return !NONTON_NON_GENRE.test(label); }),
      episodes: this.episodesOf(doc, this.relativize(this.resolve(url))),
    };
    if (labels.indexOf("Ongoing") !== -1) detail.status = 0;
    else if (labels.indexOf("Completed") !== -1) detail.status = 1;
    return detail;
  }

  labelsOf(doc) {
    const links = doc.select(".post-tags a[rel='tag']") || [];
    const out = [];
    for (let i = 0; i < links.length; i++) {
      const label = cleanText(links[i].text);
      if (label && out.indexOf(label) === -1) out.push(label);
    }
    return out;
  }

  /** The synopsis paragraph; the rest of the block is "Label: value" lines. */
  descriptionOf(doc) {
    const paragraphs = doc.select(".sinoposis p") || [];
    const parts = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const text = cleanText(decodeEntities(paragraphs[i].text));
      if (text && !/^(judul|judul alternatif|status|tipe|episode|genre)\s*:/i.test(text)) {
        parts.push(text);
      }
    }
    return parts.join("\n\n");
  }

  /**
   * Only lists that have a tab count. Posts cloned from another series keep the
   * old tab's list in the page, hidden, with that series' episodes in it.
   */
  serverLists(doc) {
    const lists = doc.select(".server_option .serverEpisode") || [];
    const tabs = doc.select(".tabs.servers .tablinks") || [];
    return tabs.length ? lists.slice(0, tabs.length) : lists;
  }

  /** Newest first on the page, and repeated once per server tab. */
  episodesOf(doc, postLink) {
    const lists = this.serverLists(doc);
    if (!lists.length) return this.isMoviePost(doc) ? this.movieEpisode(postLink) : [];
    const seen = {};
    const labels = [];
    for (let l = 0; l < lists.length; l++) {
      const buttons = lists[l].select(".DagPlayOpt") || [];
      for (let i = 0; i < buttons.length; i++) {
        if (!isNontonStream(buttons[i].attr("data-embed"))) continue;
        const label = nontonLabel(buttons[i].text);
        if (!label || seen[label]) continue;
        seen[label] = true;
        labels.push(label);
      }
    }
    labels.sort(function (a, b) {
      return (parseFloat(a) || 0) - (parseFloat(b) || 0);
    });
    return labels.map(function (label) {
      return {
        name: /^\d/.test(label) ? "Episode " + label : label,
        url: postLink + "#ep=" + encodeQuery(label),
        dateUpload: "",
        scanlator: "",
      };
    });
  }

  isMoviePost(doc) {
    return (doc.select(".server_option .DagPlayOpt") || []).length > 0;
  }

  movieEpisode(postLink) {
    return [{ name: "Film", url: postLink + "#ep=" + NONTON_MOVIE, dateUpload: "", scanlator: "" }];
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const marker = safeString(url).indexOf("#ep=");
    if (marker === -1) return [];
    const label = decodeURIComponent(safeString(url).slice(marker + 4));
    const pageUrl = this.resolve(safeString(url).slice(0, marker));
    const doc = await this.fetchDoc(pageUrl);
    if (!doc) return [];

    const results = [];
    const embeds = this.embedsOf(doc, label);
    for (let i = 0; i < embeds.length; i++) {
      const embed = embeds[i];
      // These wrap Dailymotion videos under protected delivery: the master
      // playlist answers 403 outside Dailymotion's own player.
      if (/urlmp41\.blogspot\.com/i.test(embed.url)) {
        console.log("nontonanimeid: server " + embed.server + " tidak didukung (Dailymotion terlindungi)");
        continue;
      }
      const reason = unsupportedReason(embed.url);
      if (reason) {
        console.log("nontonanimeid: server " + embed.server + " tidak didukung (" + reason + ")");
        continue;
      }
      if (!isSupportedHost(embed.url)) {
        console.log("nontonanimeid: server " + embed.server +
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
        console.log("nontonanimeid: " + embed.server + " tidak menghasilkan stream");
      }
    }
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /** One {url, server} per tab carrying this episode; English tabs only as a last resort. */
  embedsOf(doc, label) {
    if (label === NONTON_MOVIE) return this.movieEmbeds(doc);
    const tabs = doc.select(".tabs.servers .tablinks") || [];
    const lists = this.serverLists(doc);
    const indonesian = [];
    const other = [];
    for (let l = 0; l < lists.length; l++) {
      const server = nontonServer(tabs[l] ? tabs[l].text : "") || "Server " + (l + 1);
      const buttons = lists[l].select(".DagPlayOpt") || [];
      for (let b = 0; b < buttons.length; b++) {
        if (nontonLabel(buttons[b].text) !== label) continue;
        const src = decodeEntities(buttons[b].attr("data-embed"));
        if (!isNontonStream(src)) continue;
        (/eng/i.test(server) ? other : indonesian).push({ url: nontonUnwrap(src), server: server });
      }
    }
    return indonesian.length ? indonesian : other;
  }

  movieEmbeds(doc) {
    const buttons = doc.select(".server_option .DagPlayOpt") || [];
    const out = [];
    for (let b = 0; b < buttons.length; b++) {
      const src = decodeEntities(buttons[b].attr("data-embed"));
      if (!isNontonStream(src)) continue;
      out.push({ url: nontonUnwrap(src), server: nontonServer(buttons[b].text) || "Server " + (b + 1) });
    }
    return out;
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
      select("Tipe", [["Semua", ""], ["Donghua", "Donghua"], ["Anime", "Anime"], ["Film", "Movie"]]),
      select("Status", [["Semua", ""], ["Sedang tayang", "Ongoing"], ["Tamat", "Completed"]]),
      select("Genre", [["Semua", ""]].concat(NONTON_GENRES.map(function (genre) {
        return [genre, genre];
      }))),
    ];
  }

  getSourcePreferences() {
    return this.basePreferences(NONTON_SERVERS);
  }
}

/** "EP129" and "01" as the plain number, so tabs and sorting agree. */
function nontonLabel(text) {
  return cleanText(text).replace(/^ep(isode)?\.?\s*/i, "").replace(/^0+(?=\d)/, "");
}

/** Tab names vary ("🇮🇩 SUB INDO", "Sub Indo"), which would split the preference. */
function nontonServer(text) {
  return cleanText(text).replace(/[^\x20-\x7E]/g, "").trim().toUpperCase();
}

/** The page ships placeholder values such as "LINK-SERVER2-EP1". */
function isNontonStream(value) {
  return /^(https?:\/\/|yt:)/i.test(safeString(value));
}

/**
 * Several embeds are redirector pages with the real file in a query parameter:
 * `<x>.blogspot.com/?url=<file>`, `?combinedurl=<file>|<subs>`, `/embed2.php?url=<file>`.
 */
function nontonUnwrap(url) {
  return nontonRumble(nontonUnwrapRedirect(url));
}

/**
 * Rumble's `<id>.<rendition>.tar?r_file=chunklist.m3u8` playlists list segments
 * as `.tar?r_file=media-0.ts`, which ffmpeg (the app's player) refuses: "not in
 * allowed_extensions". The same CDN folder serves the uploaded file as
 * `<id>.aaa.mp4` (68 of 68 posts on 11 Nov 2026), same duration.
 */
function nontonRumble(url) {
  const match = /^(https:\/\/[^?#]*rumble\.cloud\/video\/[^?#]+)\.[a-z]{3}\.tar\?[^#]*r_file=chunklist\.m3u8/i.exec(url);
  return match ? match[1] + ".aaa.mp4" : url;
}

function nontonUnwrapRedirect(url) {
  if (!/\.blogspot\.com\/\?|\/embed2\.php\?/i.test(url)) return url;
  const match = /[?&](?:combinedurl|url)=([^&|]+)/i.exec(url);
  if (!match) return url;
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
}

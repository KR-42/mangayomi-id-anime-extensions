// Nekopoi (https://nekopoi.care) — sumber 18+ (NSFW).
//
// nekopoi.care diblokir lewat DNS operator Indonesia (NXDOMAIN). Diuji 24 Nov
// 2026: begitu nama domainnya di-resolve lewat DoH, koneksi TLS biasa dari IP
// Indonesia diterima — jadi DNS Pribadi (dns.adguard-dns.com) cukup, VPN tidak
// wajib. Ekstensi ini hanya membaca halaman publik: daftar, detail seri,
// halaman episode, dan halaman embed player. Tidak ada halaman login, akun,
// atau pembayaran yang disentuh.
//
// Alur penontonan:
//   beranda -> kartu episode/posting -> halaman episode
//   halaman episode -> #nk-stream-N iframe -> playmogo (DoodStream)
//                                          -> streampoi (JW Player, m3u8; lama)
//
// Catatan halaman: server 1 = 360p/480p, server 2 = 720p. Sejak Nov 2026 semua
// episode yang dicek hanya punya dua server itu (keduanya playmogo); server 3
// streampoi tinggal di posting lama. Mirror unduhan di halaman episode semuanya lewat
// ouo.io menuju Mp4Upload/Pixeldrain/KrakenFiles — itu tautan unduh, bukan
// stream, jadi sengaja tidak ditawarkan sebagai video.

const mangayomiSources = [{
  "name": "Nekopoi",
  "lang": "id",
  "baseUrl": "https://nekopoi.care",
  "apiUrl": "",
  "iconUrl": "icons/nekopoi.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": true,
  "version": "0.2.10",
  "pkgPath": "anime/src/id/nekopoi.js",
  "hasCloudflare": true,
  "notes": "Konten 18+. Situs diblokir lewat DNS operator. Cara tanpa VPN: Pengaturan Android > DNS Pribadi > dns.adguard-dns.com (membuka situs sekaligus memblokir iklan popunder). Domain bisa berpindah; atur di Pengaturan sumber. v0.2.10: tantangan Cloudflare di playmogo ternyata dipicu bentuk permintaan (klien HTTP + User-Agent yang diaku), bukan IP Indonesia — dari IP yang sama, permintaan yang mengaku Chrome desktop dari klien non-browser ditantang, sementara bentuk lain lolos. Permintaan ke playmogo kini memakai User-Agent aplikasi (cocok dengan cookie Cloudflare hasil WebView); bila tetap ditantang, diulang lewat klien HTTP kedua aplikasi lalu dengan User-Agent Android WebView, baru jatuh ke WebView; video cukup membawa Referer; WebView memblokir semua tautan intent:/market: dan iklan toko, serta mengunci halaman begitu player terdeteksi. Riwayat: Video/episode memang lambat dibuka: tunggu 1-2 menit dulu sebelum menganggapnya gagal. v0.2.5: pemutar tidak lagi menggantung lama — host mirror yang sudah mati dilewati dalam sekejap (tes HEAD dulu), jatah coba di WebView dipotong jadi 20 detik dan berhenti di stream pertama, stream DoodStream dibekali User-Agent + Referer aslinya supaya CDN mengirim video (bukan pengalihan kosong), dan posting [NEW Release] sekarang bisa dibuka kembali ke folder serinya. Server 1/2 (playmogo/plamogo) sering mati di sisi situs — pakai Server 3 (streampoi) bila ada. v0.2.6: iframe yang masih menunjuk domain mirror mati plamogo.com kini otomatis dialihkan ke playmogo.com yang hidup (id embed-nya sama), jadi Server 1/2 kembali bisa diputar tanpa menunggu Server 3. v0.2.7: jalur WebView dikebalkan terhadap iklan popunder DoodStream (intent://rm358.com) yang tadinya membajak handshake, dan pesan error mengarahkan ke solusi nyata. CATATAN PENTING: kalau player tetap gagal, penyebabnya Cloudflare menantang playmogo.com dari IP Indonesia (403 cf-mitigated) — ini TIDAK bisa ditembus kode ekstensi; aktifkan VPN atau isi FlareSolverr/Byparr di Pengaturan > Umum. v0.2.8: jalur WebView kini membiarkan Managed Challenge Cloudflare terpecah sendiri lalu membaca handshake langsung dari DOM (tahan terhadap reload pasca-challenge), dan diberi waktu lebih (35 detik). Pakai DNS AdGuard (dns.adguard-dns.com) untuk memblokir iklan popunder rm358.com sekaligus membuka blokir situs — ini membuat challenge auto-solve tanpa VPN. v0.2.9: episode bisa diunduh (tombol unduh Mangayomi). Server 3 (Streampoi) kini lolos syarat unduhan aplikasi dan mengikuti Kualitas yang diutamakan. Server 1/2 (DoodStream) memberi file .mp4 dan didahulukan aplikasi bila tersedia."
}];

// The shared helpers are inlined here, before the extension class: a class
// declaration reads its superclass when it is evaluated, so IdBaseProvider has
// to exist first. `npm run build` replaces this line.
// @@INLINE_SHARED@@

const NEKOPOI_SERVERS = ["Server 1", "Server 2", "Server 3"];

/** The DoodStream clones the site serves as Server 1 / Server 2. */
const NEKOPOI_DOOD_HOST = /playmogo\.|plamogo\.|dood[a-z0-9-]*\.|d000d\.|dsvplay\./i;

/**
 * Retired DoodStream mirror domains, each mapped to the operator's live
 * sibling. DoodStream rotates its embed domains and pulls the old ones out of
 * DNS, but the embed id is shared across siblings, so an iframe still pointing
 * at a dead mirror plays once its host is swapped for the live one.
 *
 * Verified 15 Nov 2026: plamogo.com is NXDOMAIN, yet playmogo.com serves the
 * same /e/<id> with a working /pass_md5 handshake and a real cloudatacdn.com
 * stream. (stmpoi.com -> streampoi.com was tested too and does NOT carry the
 * same player, so it is deliberately left out.)
 */
const NEKOPOI_DEAD_MIRRORS = { "plamogo.com": "playmogo.com" };

/** Swap a dead mirror host for its live sibling; other URLs pass through. */
function reviveMirror(url) {
  const s = String(url || "");
  const m = /^(https?:\/\/)([^/?#]+)/i.exec(s);
  if (!m) return s;
  const host = m[2].toLowerCase().replace(/^www\./, "");
  const live = NEKOPOI_DEAD_MIRRORS[host];
  if (!live) return s;
  return m[1] + live + s.slice(m[1].length + m[2].length);
}

/**
 * Budget for the WebView replay, in seconds.
 *
 * The handshake itself answers in well under a second; the wait exists so
 * Cloudflare's managed challenge ("Just a moment...") can auto-solve in this
 * real WebView and reload to the embed. That solve-and-reload takes a few
 * seconds on mobile, so the budget is generous — dead mirror hosts are already
 * filtered out earlier (reviveMirror + the HEAD probe), so the wait is only
 * ever spent on a live host that is genuinely clearing a challenge.
 */
const NEKOPOI_WEBVIEW_SECONDS = 35;

/** Attempts (and their spacing, ms) inside that budget. */
const NEKOPOI_WEBVIEW_TRIES = 16;
const NEKOPOI_WEBVIEW_GAP_MS = 1500;

/**
 * Whether a response is Cloudflare refusing the request instead of the page.
 * Header names reach the extension as the server spelled them, so the
 * lookup ignores case.
 */
function nekopoiChallenged(res) {
  if (!res) return false;
  if (res.statusCode === 403) return true;
  const headers = res.headers || {};
  for (const key in headers) {
    if (key.toLowerCase() === "cf-mitigated" && /challenge/i.test(safeString(headers[key]))) {
      return true;
    }
  }
  return false;
}

/**
 * Headers for playmogo (the embed, its /pass_md5 handshake, and the HEAD
 * probe). No User-Agent on purpose: when the app has cleared a Cloudflare
 * challenge (resolver WebView or FlareSolverr) it stores `cf_clearance`
 * together with the browser's User-Agent and only adds that UA to requests
 * that do not carry their own. Cloudflare binds the clearance to that UA, so
 * overriding it with our desktop string threw the solved challenge away.
 */
function nekopoiDoodHeaders(referer) {
  return {
    Accept: DEFAULT_HEADERS.Accept,
    "Accept-Language": DEFAULT_HEADERS["Accept-Language"],
    Referer: referer,
  };
}

/**
 * User-Agent of an Android WebView, for playmogo only and only after the
 * app's own UA was refused.
 *
 * Verified 24 Nov 2026 (Node's stock HTTP client, i.e. a client that does not
 * look like a browser on the wire): playmogo's Cloudflare challenged it 4/4
 * times when it claimed to be desktop Chrome — the UA this repo sends by
 * default — and also with a bare "Mozilla/5.0", but let it through 4/4 times
 * with this WebView UA, with "Dart/3.5 (dart:io)" and with "okhttp/4.12.0".
 * Those runs sent only an Accept header; with this file's fuller header set
 * (Accept-Language, Referer) the desktop-Chrome request often passed too, so
 * Cloudflare scores the request as a whole — a UA claiming a browser the
 * connection does not resemble weighs against it. That is why this is one
 * more attempt rather than the default. Mangayomi on Android is an app with a
 * WebView, so this string is the
 * closer description of the client, not a disguise as a desktop browser.
 */
const NEKOPOI_ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36";

/**
 * MVideo for a DoodStream CDN URL. Verified 24 Nov 2026 on cloudatacdn.com:
 * with the embed's origin as Referer the CDN answers 206 video/mp4 whatever
 * the User-Agent (desktop, WebView "; wv", or none); without it, a 302 away
 * from the file. So the Referer is the one header that has to travel, and the
 * player keeps its own User-Agent.
 */
function nekopoiDoodVideo(streamUrl, embedUrl) {
  const origin = /^(https?:\/\/[^/]+)/i.exec(embedUrl);
  return {
    url: streamUrl,
    originalUrl: embedUrl,
    quality: "",
    headers: { Referer: (origin ? origin[1] : "https://" + hostOf(embedUrl)) + "/" },
  };
}

/** DoodStream names the file with ten random characters before the token. */
function nekopoiRandomName() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/**
 * Month names the site writes in Indonesian, for `parseDates`.
 *
 * The app stores `dateUpload` as milliseconds-since-epoch: it feeds the value
 * straight to `int.parse()` and renders it with `DateTime.fromMillisecondsSinceEpoch`.
 * The site's "20 Februari 2023" is not a number, so handing it over unconverted
 * threw inside the episode tile and left that part of the page blank/grey.
 */
const NEKOPOI_MONTHS = {
  januari: "January", februari: "February", maret: "March", april: "April",
  mei: "May", juni: "June", juli: "July", agustus: "August",
  september: "September", oktober: "October", november: "November",
  desember: "December",
};

/** Convert the collected episode rows into MChapter objects. */
function nekopoiEpisodes(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const episode = {
      name: rows[i].name,
      url: rows[i].url,
      dateUpload: nekopoiTimestamp(rows[i].date),
      scanlator: "",
    };
    // A non-null thumbnailUrl is what makes the app draw the 50x65 preview.
    if (rows[i].thumb) episode.thumbnailUrl = rows[i].thumb;
    out.push(episode);
  }
  return out;
}

/**
 * "20 Februari 2023" -> milliseconds-since-epoch string, "" when unparsable.
 *
 * One call per row instead of one for the whole list: `parseDates` drops empty
 * inputs, which would shift every later index in a mixed list.
 */
function nekopoiTimestamp(value) {
  const text = nekopoiDate(value);
  if (!text) return "";
  try {
    const parsed = parseDates([text], "d MMMM yyyy", "en");
    return safeString(parsed && parsed[0]);
  } catch (e) {
    console.log("nekopoi: tanggal \"" + text + "\" gagal diurai: " + e);
    return "";
  }
}

/** "20 Februari 2023" -> "20 February 2023"; "" stays ""; numbers pass through. */
function nekopoiDate(value) {
  const text = cleanText(value);
  if (!text || /^\d+$/.test(text)) return text;
  return text.replace(/[A-Za-z]+/g, function (word) {
    return NEKOPOI_MONTHS[word.toLowerCase()] || word;
  });
}

/** Kategori menu utama, lalu genre dari /genre-list/. */
const NEKOPOI_CATEGORIES = [
  ["Hentai", "/category/hentai/"],
  ["2D Animation", "/category/2d-animation/"],
  ["3D Hentai", "/category/3d-hentai/"],
  ["JAV", "/category/jav/"],
  ["JAV Cosplay", "/category/jav-cosplay/"],
];

const NEKOPOI_GENRES = [
  ["Action", "action"], ["Ahegao", "ahegao"], ["Anal", "anal"], ["Armpit", "armpit"],
  ["BDSM", "bdsm"], ["Big Oppai", "big-oppai"], ["Blackmail", "blackmail"],
  ["Blonde", "blonde"], ["Blowjob", "blowjob"], ["Bondage", "bondage"],
  ["Cheating", "cheating"], ["Comedy", "comedy"], ["Creampie", "creampie"],
  ["Dark Skin", "dark-skin"], ["Dilf", "dilf"], ["Elf", "elf"],
  ["Exhibitionist", "exhibitionist"], ["Fellatio", "fellatio"],
  ["Female Monster", "female-monster"], ["Femdom", "femdom"], ["Footjob", "footjob"],
  ["Forced", "forced"], ["Furry", "furry"], ["Futanari", "futanari"],
  ["Gangbang", "gangbang"], ["Gore", "gore"], ["Gyaru", "gyaru"], ["Handjob", "handjob"],
  ["Harem", "harem"], ["Horror", "horror"], ["Housewife", "housewife"],
  ["Humiliation", "humiliation"], ["Hypnotize", "hypnotize"], ["Incest", "incest"],
  ["Intercrural", "intercrural"], ["JAV", "jav"], ["Lactation", "lactation"],
  ["Loli", "loli"], ["Maid", "maid"], ["Male Monster", "male-monster"],
  ["Masturbation", "masturbation"], ["Megane", "megane"], ["MILF", "milf"],
  ["Mind Control", "mind-control"], ["Monster", "monster"], ["Netorare", "netorare"],
  ["Nipple Fuck", "nipple-fuck"], ["Nurse", "nurse"], ["Old Man", "old-man"],
  ["Onee-san", "onee-san"], ["Oral", "oral"], ["Paihame", "paihame"],
  ["Paizuri", "paizuri"], ["Pantyhose", "pantyhose"], ["Pregnant", "pregnant"],
  ["Prostitution", "prostitution"], ["Rape", "rape"], ["Romance", "romance"],
  ["Saimin", "saimin"], ["Schoolgirl", "schoolgirl"], ["Semi Hentai", "semi-hentai"],
  ["Sex Toys", "sex-toys"], ["Shibari", "shibari"], ["Shota", "shota"],
  ["Stocking", "stocking"], ["Succubus", "succubus"], ["Supranatural", "supranatural"],
  ["Swimsuit", "swimsuit"], ["Tentacles", "tentacles"], ["Threesome", "threesome"],
  ["Tsundere", "tsundere"], ["Ugly Bastard", "ugly-bastard"], ["Uncensored", "uncensored"],
  ["Vanilla", "vanilla"], ["Virgin", "virgin"], ["Yaoi", "yaoi"], ["Yuri", "yuri"],
];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://nekopoi.care");
  }

  get supportsLatest() {
    return true;
  }

  /** A refusal throws, so it reaches the app's error card instead of a blank. */
  async pageDoc(url) {
    const res = await this.getPassingCloudflare(url, this.getHeaders(url));
    if (nekopoiChallenged(res)) {
      throw new Error("Situs menolak permintaan (HTTP " + res.statusCode +
        ", tantangan Cloudflare). Buka sumber ini sekali lewat tombol Tampilan Web " +
        "sampai halamannya tampil, lalu coba lagi. Pastikan DNS Pribadi " +
        "dns.adguard-dns.com aktif; VPN adalah cadangan terakhir.");
    }
    if (!res || !res.body || res.statusCode >= 400) {
      console.log("nekopoi: gagal memuat " + url);
      return null;
    }
    return new Document(res.body);
  }

  /**
   * The app's two HTTP stacks: its default client, then the Dart one.
   *
   * Verified 24 Nov 2026 from an Indonesian connection: Cloudflare in front of
   * playmogo.com answered the same URL from the same IP either 200 or 403
   * "cf-mitigated: challenge" depending on the HTTP client — how its request
   * looks on the wire — combined with the User-Agent it claims (see
   * NEKOPOI_ANDROID_UA). The "intermittent" challenge seen in 0.2.5-0.2.8 fits
   * that: it follows the client, not the network. `useDartHttpClient` is the
   * one documented switch an extension has to send the same request through a
   * differently shaped client, so a challenged request also tries that one.
   */
  httpClients() {
    if (!this._clients) {
      this._clients = [this.client];
      try {
        this._clients.push(new Client({ useDartHttpClient: true }));
      } catch (e) {
        console.log("nekopoi: klien Dart tidak tersedia: " + e);
      }
      this._clientForHost = {};
    }
    return this._clients;
  }

  /**
   * GET through the first (client, User-Agent) pair Cloudflare lets through.
   *
   * `headers` go out as given on the first round. With `androidUa`, a second
   * round adds NEKOPOI_ANDROID_UA: verified 24 Nov 2026, a non-browser client
   * claiming to be desktop Chrome was challenged 4/4 times while the same
   * client with an Android WebView UA passed 4/4 (see NEKOPOI_ANDROID_UA).
   *
   * The pair that passed for a host is tried first next time, so an episode
   * with two playmogo servers pays for refused attempts once, not per request.
   * Returns the last response (possibly the challenge) when none passes.
   */
  async getPassingCloudflare(url, headers, androidUa) {
    const clients = this.httpClients();
    const attempts = [];
    const rounds = androidUa ? [null, NEKOPOI_ANDROID_UA] : [null];
    for (let r = 0; r < rounds.length; r++) {
      for (let c = 0; c < clients.length; c++) attempts.push({ client: c, ua: rounds[r] });
    }
    const host = hostOf(url);
    const first = this._clientForHost[host] || 0;
    let last = null;
    for (let n = 0; n < attempts.length; n++) {
      const index = (first + n) % attempts.length;
      const attempt = attempts[index];
      const sent = Object.assign({}, headers);
      if (attempt.ua) sent["User-Agent"] = attempt.ua;
      let res = null;
      try {
        res = await clients[attempt.client].get(url, sent);
      } catch (e) {
        console.log("nekopoi: GET " + host + " (percobaan " + index + ") gagal: " + e);
        continue;
      }
      last = res;
      if (!nekopoiChallenged(res)) {
        this._clientForHost[host] = index;
        return res;
      }
      console.log("nekopoi: " + host + " menantang percobaan " + index +
        " (klien " + attempt.client + (attempt.ua ? ", UA Android" : "") +
        ", HTTP " + res.statusCode + ")");
    }
    return last;
  }

  pagedPath(base, page) {
    const n = Math.max(1, parseInt(page, 10) || 1);
    return n === 1 ? base : base + "page/" + n + "/";
  }

  // ------------------------------------------------------------- listings

  /**
   * The site's "Direkomendasikan" ticker plus the series grid under it; both
   * only ever appear on the home page, so there is no page 2 to fetch.
   */
  async getPopular(page) {
    if ((parseInt(page, 10) || 1) > 1) return this.emptyPage();
    const doc = await this.pageDoc(this.resolve("/"));
    if (!doc) return this.emptyPage();

    const list = [];
    const seen = {};
    const ticker = doc.select(".nk-recommended .nk-ticker a.nk-series-link") || [];
    for (let i = 0; i < ticker.length; i++) {
      const href = seriesHref(ticker[i]);
      if (!href || seen[href]) continue;
      seen[href] = true;
      list.push(this.item(
        ticker[i].text,
        this.absolute(tooltipImage(ticker[i].attr("original-title"))),
        href,
      ));
    }

    const grid = doc.select(".nk-hentai-grid a.nk-series-link") || [];
    for (let i = 0; i < grid.length; i++) {
      const href = seriesHref(grid[i]);
      if (!href || seen[href]) continue;
      seen[href] = true;
      list.push(this.item(
        grid[i].selectFirst(".title").text || grid[i].text,
        this.absolute(backgroundUrl(grid[i].selectFirst(".nk-hentai-thumb").attr("style"))),
        href,
      ));
    }

    // Tema lama: sidebar "Rekomendasi" berupa ticker dengan kelas .series.
    if (!list.length) {
      const legacy = doc.select(".rekomendasi .showticker a.series") || [];
      for (let i = 0; i < legacy.length; i++) {
        const href = legacy[i].attr("href") || legacy[i].getHref;
        if (!href || seen[href]) continue;
        seen[href] = true;
        list.push(this.item(legacy[i].text, this.absolute(tooltipImage(
          legacy[i].attr("original-title"))), href));
      }
    }

    return { list: list, hasNextPage: false };
  }

  /**
   * Latest = the "post" grid (each card is one episode or one standalone
   * video). The series grid is only used when the post grid is empty.
   */
  async getLatestUpdates(page) {
    const doc = await this.pageDoc(this.resolve(this.pagedPath("/", page)));
    if (!doc) return this.emptyPage();

    const list = this.parseCards(doc);
    if (!list.length) {
      const fallback = this.parseSeriesGrid(doc);
      return { list: fallback, hasNextPage: nekopoiHasNext(doc) };
    }
    return { list: list, hasNextPage: nekopoiHasNext(doc) };
  }

  /** Cards of the post grid: thumb, title, link. */
  parseCards(doc) {
    const cards = doc.select("#nk-episode-grid .nk-post-card") || [];
    const list = [];
    for (let i = 0; i < cards.length; i++) {
      const anchor = cards[i].selectFirst("h2 a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href) continue;
      list.push(this.item(
        anchor.text,
        this.absolute(backgroundUrl(cards[i].selectFirst(".nk-thumb-crop").attr("style"))),
        href,
      ));
    }
    if (list.length) return list;

    // Tema lama: .animeseries ul li a.series dengan <img> dan div.title.
    const legacy = doc.select(".animeseries ul li a.series[href]") || [];
    for (let i = 0; i < legacy.length; i++) {
      const href = legacy[i].attr("href") || legacy[i].getHref;
      if (!href) continue;
      const img = legacy[i].selectFirst("img");
      list.push(this.item(
        legacy[i].selectFirst("div.title").text || legacy[i].text,
        this.absolute(img.attr("src")),
        href,
      ));
    }
    return list;
  }

  /** Series grid under the ticker — used as the latest fallback. */
  parseSeriesGrid(doc) {
    const anchors = doc.select(".nk-hentai-grid a.nk-series-link") || [];
    const list = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = seriesHref(anchors[i]);
      if (!href) continue;
      list.push(this.item(
        anchors[i].selectFirst(".title").text || anchors[i].text,
        this.absolute(backgroundUrl(anchors[i].selectFirst(".nk-hentai-thumb").attr("style"))),
        href,
      ));
    }
    return list;
  }

  // ---------------------------------------------------------------- search

  /**
   * Two modes:
   *   - a category/genre picked in the filter, which lists series;
   *   - a text query, which lists posts (episodes and standalone videos).
   * Both render the same `.nk-search-results` block.
   */
  async search(query, page, filters) {
    const text = cleanText(query);
    const route = this.selectedRoute(filters);
    const n = Math.max(1, parseInt(page, 10) || 1);

    if (route) {
      const doc = await this.pageDoc(this.resolve(this.pagedPath(route, n)));
      if (!doc) return this.emptyPage();
      let list = this.parseResults(doc);
      if (text) {
        const needle = text.toLowerCase();
        list = list.filter(function (entry) {
          return entry.name.toLowerCase().indexOf(needle) !== -1;
        });
      }
      return { list: list, hasNextPage: nekopoiHasNext(doc) };
    }

    if (!text) return this.emptyPage();
    // The query takes a path segment, not a parameter: /search/<q>/page/N/.
    // `?s=<q>` redirects here, and `?paged=N` is ignored (page 1 again).
    const base = "/search/" + encodeQuery(text) + "/";
    const doc = await this.pageDoc(this.resolve(this.pagedPath(base, n)));
    if (!doc) return this.emptyPage();
    return { list: this.parseResults(doc), hasNextPage: nekopoiHasNext(doc) };
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

  /** The `.nk-search-results` list, shared by search, category, and genre. */
  parseResults(doc) {
    const anchors = doc.select(".nk-search-results a.nk-search-item[href]") || [];
    const seen = {};
    const list = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href") || anchors[i].getHref;
      if (!href || seen[href]) continue;
      seen[href] = true;
      list.push(this.item(
        anchors[i].selectFirst(".nk-search-info h2").text || anchors[i].text,
        this.absolute(backgroundUrl(anchors[i].selectFirst(".nk-search-thumb").attr("style"))),
        href,
      ));
    }
    if (list.length) return list;

    // Tema lama: div.result > ul > li > h2 > a (judul + thumbnail terpisah).
    const legacy = doc.select("div.result ul li") || [];
    for (let i = 0; i < legacy.length; i++) {
      const anchor = legacy[i].selectFirst("h2 a[href]");
      const href = anchor.attr("href") || anchor.getHref;
      if (!href || seen[href]) continue;
      seen[href] = true;
      const img = legacy[i].selectFirst("img");
      list.push(this.item(anchor.text, this.absolute(img.attr("src")), href));
    }
    return list;
  }

  absolute(src) {
    return src ? this.resolve(decodeEntities(src)) : "";
  }

  // --------------------------------------------------------------- detail

  async getDetail(url) {
    const empty = { name: "", imageUrl: "", link: url, description: "", episodes: [] };
    const pageUrl = this.resolve(url);
    const doc = await this.pageDoc(pageUrl);
    if (!doc) return empty;

    // A series page carries .nk-series-info; an episode/standalone post page
    // links back to its series, which is where the full episode list lives.
    let seriesDoc = doc;
    let seriesUrl = pageUrl;
    // `selectFirst` never returns null (it returns an empty element), so the
    // presence test has to count the matches.
    if (doc.select(".nk-series-info").length === 0) {
      const back = doc.selectFirst("a.nk-player-series").attr("href");
      if (back) {
        const candidate = this.resolve(decodeEntities(back));
        if (candidate !== pageUrl) {
          const seriesPage = await this.pageDoc(candidate);
          if (seriesPage) {
            seriesDoc = seriesPage;
            seriesUrl = candidate;
          }
        }
      }
    }

    const hasSeries = seriesDoc.select(".nk-series-info").length > 0;
    const name = cleanTitle(firstNonEmpty(
      metaContent(seriesDoc, "og:title"),
      hasSeries ? seriesDoc.selectFirst(".nk-series-synopsis b").text : "",
      hasSeries ? seriesDoc.selectFirst(".nk-series-info > h2").text : "",
      seriesDoc.selectFirst("h1").text,
    ));
    if (!name) {
      console.log("nekopoi: detail tidak ditemukan: " + pageUrl);
      return empty;
    }

    const poster = backgroundUrl(seriesDoc.selectFirst(".nk-series-poster").attr("style"));
    const description = cleanText(
      stripTags(firstNonEmpty(
        hasSeries ? seriesDoc.selectFirst(".nk-series-synopsis p").text : "",
        metaContent(doc, "og:description"),
      )),
    );
    const meta = metaMap(seriesDoc);

    let episodes = this.episodesOf(seriesDoc, name);
    if (!episodes.length) {
      // Standalone post (no series): the page itself is the only episode.
      episodes = [{
        name: cleanTitle(seriesDoc.selectFirst("h1").text) || name,
        url: this.relativize(pageUrl),
        dateUpload: "",
        scanlator: "",
      }];
    }

    return {
      name: name,
      imageUrl: this.absolute(firstNonEmpty(
        poster,
        metaContent(seriesDoc, "og:image"),
        metaContent(doc, "og:image"),
      )),
      link: this.relativize(seriesUrl),
      description: description,
      author: meta["produser"] || "",
      artist: "",
      genre: this.genresOf(seriesDoc),
      status: /completed|selesai/i.test(meta["status"] || "") ? 1 : 0,
      episodes: episodes,
    };
  }

  genresOf(doc) {
    const links = doc.select(".nk-series-meta-list a[href*='/genres/']") || [];
    const out = [];
    for (let i = 0; i < links.length; i++) {
      const genre = cleanText(links[i].text);
      if (genre && out.indexOf(genre) === -1) out.push(genre);
    }
    return out;
  }

  /** Episode cards on a series page, in the order the site lists them. */
  episodesOf(doc, seriesName) {
    const anchors = doc.select("a.nk-episode-card[href]") || [];
    const seen = {};
    const rows = [];
    for (let i = 0; i < anchors.length; i++) {
      const href = anchors[i].attr("href") || anchors[i].getHref;
      if (!href) continue;
      const url = this.relativize(this.resolve(decodeEntities(href)));
      if (seen[url]) continue;
      seen[url] = true;
      const badge = cleanText(anchors[i].selectFirst(".nk-episode-badge").text);
      const title = cleanText(anchors[i].selectFirst(".nk-episode-card-title").text) ||
        cleanText(anchors[i].text);
      rows.push({
        name: badge ? "Episode " + badge.replace(/^ep\s*/i, "") :
          (cleanTitle(cleanEpisodeName(title, seriesName)) || "Episode"),
        url: url,
        date: cleanText(anchors[i].selectFirst(".nk-episode-card-date").text),
        thumb: this.absolute(backgroundUrl(
          anchors[i].selectFirst(".nk-episode-card-thumb").attr("style"))),
      });
    }
    if (rows.length) return nekopoiEpisodes(rows);

    // Tema lama: .episodelist ul.leftoff li span a — tanpa tanggal & thumbnail.
    const legacy = doc.select(".episodelist .leftoff a[href]") || [];
    for (let i = 0; i < legacy.length; i++) {
      const href = legacy[i].attr("href") || legacy[i].getHref;
      if (!href) continue;
      const url = this.relativize(this.resolve(decodeEntities(href)));
      if (seen[url]) continue;
      seen[url] = true;
      rows.push({
        name: cleanTitle(cleanEpisodeName(legacy[i].text, seriesName)) || "Episode",
        url: url,
        date: "",
        thumb: "",
      });
    }
    return nekopoiEpisodes(rows);
  }

  // --------------------------------------------------------------- videos

  async getVideoList(url) {
    const pageUrl = this.resolve(url);
    const doc = await this.pageDoc(pageUrl);
    // An empty list renders as "Daftar video kosong" with no reason attached;
    // a thrown message reaches the player's error card instead.
    if (!doc) {
      throw new Error("Nekopoi: halaman episode gagal dimuat (" + hostOf(pageUrl) + "). " +
        "Sumber ini butuh VPN; buka Tampilan Web lalu coba lagi.");
    }

    const embeds = this.embedsOf(doc);
    if (!embeds.length) {
      throw new Error("Nekopoi: halaman episode ini tidak memuat player. " +
        "Buka lewat tombol Tampilan Web untuk memeriksanya.");
    }

    const results = [];
    const failed = [];
    // Mirrors that did not answer the probe, so the WebView pass below does not
    // spend a second probe (and a headless WebView budget) on the same dead host.
    const dead = [];
    for (let i = 0; i < embeds.length; i++) {
      const embed = embeds[i];
      const label = embed.server + " (" + hostOf(embed.url) + ")";
      const reason = unsupportedReason(embed.url);
      if (reason) {
        console.log("nekopoi: server " + label + " tidak didukung (" + reason + ")");
        failed.push(label + ": " + reason);
        continue;
      }
      if (!isSupportedHost(embed.url)) {
        console.log("nekopoi: server " + label +
          " tidak didukung (belum ada ekstraktor untuk " + hostOf(embed.url) + ")");
        failed.push(label + ": belum ada ekstraktor");
        continue;
      }
      // A mirror that cannot answer is skipped before its GET is attempted:
      // an unreachable host holds the socket open until the client gives up,
      // which is the "keeps loading" the player shows.
      const isDood = NEKOPOI_DOOD_HOST.test(embed.url);
      if (isDood && !(await this.embedReachable(embed.url))) {
        console.log("nekopoi: " + label + " tidak menjawab, dilewati");
        failed.push(label + ": host tidak menjawab");
        dead.push(embed.url);
        continue;
      }
      const found = isDood
        ? { videos: await this.doodStreams(embed.url) }
        : await extractByHost(this, embed.url, pageUrl, "", "Sub Indo");
      for (let v = 0; v < found.videos.length; v++) {
        const video = found.videos[v];
        video.server = embed.server;
        video.quality = qualityLabel(resolutionOf(video.quality), "Sub Indo", embed.server);
        results.push(video);
      }
      if (!found.videos.length) {
        console.log("nekopoi: " + label + " tidak menghasilkan stream");
        failed.push(label + ": tidak menghasilkan stream");
      }
    }

    // Second pass, DoodStream only: the request that failed above may have been
    // the one Cloudflare refused. The app's WebView already carries a solved
    // challenge cookie, so replay the /pass_md5 handshake from inside it.
    //
    // Two guards keep this pass from turning into a spinner: a mirror is only
    // replayed after it answers a plain HEAD (plamogo.com has been pulled from
    // DNS, and a headless WebView pointed at a dead host sits still until its
    // whole budget expires), and the loop stops at the first stream found.
    if (!results.length) {
      for (let i = 0; i < embeds.length && !results.length; i++) {
        const embed = embeds[i];
        if (!NEKOPOI_DOOD_HOST.test(embed.url)) continue;
        if (dead.indexOf(embed.url) !== -1) continue;
        const host = hostOf(embed.url);
        if (!(await this.embedReachable(embed.url))) {
          console.log("nekopoi: " + embed.server + " tidak menjawab (" + host + ")");
          failed.push(embed.server + ": host tidak menjawab (" + host + ")");
          continue;
        }
        const streams = await this.doodViaWebview(embed.url, NEKOPOI_WEBVIEW_SECONDS);
        if (!streams.length) {
          failed.push(embed.server + " (WebView): tantangan Cloudflare belum terlewati");
          continue;
        }
        for (let s = 0; s < streams.length; s++) {
          const stream = streams[s];
          stream.server = embed.server;
          stream.quality = qualityLabel(resolutionOf(stream.quality), "Sub Indo", embed.server);
          results.push(stream);
        }
      }
    }

    if (!results.length) {
      // An empty list renders as "Daftar video kosong", which hides the reason.
      throw new Error("Nekopoi: tidak ada server yang bisa diputar. " +
        failed.join("; ") +
        ". Server playmogo (DoodStream) sedang meminta verifikasi Cloudflare. " +
        "Coba berurutan: (1) pastikan DNS Pribadi dns.adguard-dns.com aktif, lalu " +
        "putar ulang; (2) buka episode ini sekali lewat Tampilan Web, tunggu " +
        "player tampil, kembali, lalu putar ulang; (3) isi URL FlareSolverr/Byparr " +
        "di Pengaturan > Umum; (4) VPN sebagai cadangan terakhir.");
    }
    results.forEach(function (video) {
      video.originalUrl = nekopoiHlsDownloadHint(video.url, video.originalUrl);
    });
    return sortVideos(results, this.preferredQualities(), this.preferredServers());
  }

  /**
   * Whether the embed host answers at all.
   *
   * DoodStream clones come and go: when one drops out of DNS every request to
   * it fails without a response, and the app can only sit there. One HEAD
   * settles it in a moment — the handshake needs the same host to be alive.
   */
  async embedReachable(embedUrl) {
    let res = null;
    try {
      res = await this.client.head(embedUrl, nekopoiDoodHeaders(this.getBaseUrl() + "/"));
    } catch (e) {
      console.log("nekopoi: HEAD " + hostOf(embedUrl) + " gagal: " + e);
      return false;
    }
    if (!res || !res.statusCode) return false;
    // 405 is a live host that dislikes HEAD; 403 is Cloudflare, which the
    // WebView may still get past. Only a dead host (5xx/404) is dropped here.
    if (res.statusCode === 404 || res.statusCode >= 500) return false;
    return true;
  }

  /**
   * Streams of one playmogo embed over plain HTTP.
   *
   * Our own handshake goes first because it is the one that can switch HTTP
   * client when Cloudflare refuses (see getPassingCloudflare) and that sends
   * no User-Agent of its own. The app's native Dood extractor is a second,
   * independent attempt for a page shape the handshake does not expect.
   */
  async doodStreams(embedUrl) {
    let videos = [];
    try {
      videos = await this.doodHandshake(embedUrl);
    } catch (e) {
      console.log("nekopoi: handshake " + hostOf(embedUrl) + " gagal: " + e);
    }
    if (videos.length) return videos;
    try {
      const native = (await doodExtractor(embedUrl, "")) || [];
      for (let i = 0; i < native.length; i++) {
        const url = safeString(native[i] && native[i].url);
        if (/^https?:\/\//i.test(url)) videos.push(nekopoiDoodVideo(url, embedUrl));
      }
    } catch (e) {
      console.log("nekopoi: doodExtractor " + hostOf(embedUrl) + " gagal: " + e);
    }
    return videos;
  }

  /**
   * `/e/<id>` names a `/pass_md5/<path>` whose body is the CDN prefix; the
   * file is that prefix, ten random characters, and the page's `token`.
   */
  async doodHandshake(embedUrl) {
    const origin = /^(https?:\/\/[^/]+)/i.exec(embedUrl);
    if (!origin) return [];
    const page = await this.getPassingCloudflare(
      embedUrl, nekopoiDoodHeaders(this.getBaseUrl() + "/"), true);
    if (!page || nekopoiChallenged(page) || page.statusCode >= 400) return [];
    const html = safeString(page.body);
    const pass = /(\/pass_md5\/[^'"\s]+)/i.exec(html);
    const token = /[?&]token=([A-Za-z0-9]+)/i.exec(html) || /token=([A-Za-z0-9]+)/i.exec(html);
    if (!pass || !token) return [];
    const res = await this.getPassingCloudflare(
      origin[1] + pass[1], nekopoiDoodHeaders(embedUrl), true);
    if (!res || nekopoiChallenged(res) || res.statusCode >= 400) return [];
    const prefix = safeString(res.body).replace(/\s+/g, "");
    if (prefix.indexOf("http") !== 0) return [];
    return [nekopoiDoodVideo(
      prefix + nekopoiRandomName() + ".mp4?token=" + token[1] + "&expiry=" + Date.now(),
      embedUrl,
    )];
  }

  /**
   * DoodStream handshake replayed inside the app's WebView.
   *
   * `/e/<id>` names a `/pass_md5/<path>` whose body is the CDN prefix; the file
   * name is random characters plus the page's `token`. In the WebView the
   * challenge cookie of the shared session is sent along, which is exactly what
   * the plain request in extractDoodJs is missing.
   */
  async doodViaWebview(embedUrl, budgetSeconds) {
    const tries = NEKOPOI_WEBVIEW_TRIES;
    const gap = NEKOPOI_WEBVIEW_GAP_MS;
    const budget = budgetSeconds || NEKOPOI_WEBVIEW_SECONDS;
    const script =
      "(function(){" +
      // DoodStream's embed page fires popunder ads (e.g. window.open to
      // intent://rm358.com/afu.php, which the WebView cannot resolve and which
      // otherwise hijacks the frame before the handshake finishes). The rules
      // follow what the official Nekopoi app's WebViewClient enforces: never
      // leave for an app scheme (intent:, market:) or a shop, and once the
      // player is on screen, never leave its origin at all. JS cannot see every
      // navigation (a plain `location.href = …` is not interceptable), so the
      // AdGuard DNS recipe still does the host-level blocking.
      "var AD=/^(intent|market|android-app):|shopee|lazada|tokopedia|rm358|afu\\.php/i;" +
      "var locked=false;" +
      "function blocked(u){u=String(u||'');if(AD.test(u))return true;if(!locked)return false;" +
      "try{var a=document.createElement('a');a.href=u;return !!a.host&&a.host!==location.host}catch(e){return true}}" +
      "try{window.open=function(){return null};}catch(e){}" +
      "try{['assign','replace'].forEach(function(m){var o=window.location[m]&&window.location[m].bind(window.location);if(o)window.location[m]=function(u){if(blocked(u))return;return o(u)};});}catch(e){}" +
      // Ad scripts open their target by creating an <a target=_blank> and
      // calling .click() on it, or by catching the first tap on the page.
      "try{var ac=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.target==='_blank'||blocked(this.href))return;return ac.apply(this,arguments)};}catch(e){}" +
      "try{document.addEventListener('click',function(e){var n=e.target;while(n&&n.tagName!=='A')n=n.parentNode;" +
      "if(n&&n.href&&(n.target==='_blank'||blocked(n.href))){e.preventDefault();e.stopImmediatePropagation()}},true);}catch(e){}" +
      "var chars=\"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\";" +
      "function done(v){try{window.flutter_inappwebview.callHandler(\"setResponse\",v)}catch(e){}}" +
      "function rnd(n){var s=\"\";for(var i=0;i<n;i++){s+=chars.charAt(Math.floor(Math.random()*chars.length))}return s}" +
      // Source of the handshake markers. Cloudflare's managed challenge auto-
      // solves in this real WebView and then reloads to the real embed, so the
      // live DOM is the most reliable place to read /pass_md5 + token from; only
      // fall back to a fetch when the DOM does not carry them yet (still on the
      // "Just a moment" page). This way a solve+reload does not lose the handshake.
      "function pageHtml(){" +
      "var h='';try{h=document.documentElement?document.documentElement.innerHTML:'';}catch(e){h='';}" +
      // The markers mean the real player page is loaded: lock navigation to it.
      "if(/\\/pass_md5\\//.test(h)&&/token=[A-Za-z0-9]+/.test(h)){locked=true;return Promise.resolve(h);}" +
      "return fetch(location.href,{credentials:\"include\"}).then(function(r){return r.text()}).catch(function(){return h});" +
      "}" +
      "var n=0;" +
      "function retry(){if(n<" + tries + "){n++;setTimeout(go," + gap + ")}else{done(\"\")}}" +
      "function go(){pageHtml().then(function(h){" +
      "var p=/\\/pass_md5\\/[A-Za-z0-9_\\/-]+/.exec(h);" +
      "var t=/token=([A-Za-z0-9]+)/.exec(h);" +
      "if(!p||!t){retry();return}" +
      "fetch(location.origin+p[0],{credentials:\"include\"})" +
      ".then(function(r){return r.text()})" +
      ".then(function(b){b=b.replace(/\\s+/g,\"\");" +
      "if(b.indexOf(\"http\")!==0){done(\"\");return}" +
      "done(b+rnd(10)+\".mp4?token=\"+t[1]+\"&expiry=\"+Date.now())})" +
      ".catch(function(){done(\"\")})" +
      "}).catch(function(){retry()})}" +
      "go();" +
      "})();";
    let stream = "";
    try {
      stream = safeString(await evaluateJavascriptViaWebview(embedUrl, {}, [script], budget));
    } catch (e) {
      console.log("nekopoi: WebView Dood gagal: " + e);
      return [];
    }
    if (!/^https?:\/\/\S+$/i.test(stream)) return [];
    return [nekopoiDoodVideo(stream, embedUrl)];
  }

  /**
   * One iframe per stream tab. The page also carries ad iframes earlier in the
   * body, so the player container is the only place to look — a bare
   * `iframe[src]` scan would hand the ad server to the extractors.
   */
  embedsOf(doc) {
    const labels = {};
    const tabs = doc.select("#nk-player-tabs a[href]") || [];
    for (let i = 0; i < tabs.length; i++) {
      const target = safeString(tabs[i].attr("href")).replace(/^#/, "");
      if (target) labels[target] = cleanText(tabs[i].text);
    }

    const out = [];
    const frames = doc.select("#nk-player .nk-player-frame") || [];
    for (let i = 0; i < frames.length; i++) {
      const id = safeString(frames[i].attr("id"));
      const src = safeString(frames[i].selectFirst("iframe").attr("src"));
      if (!src) continue;
      out.push({
        url: reviveMirror(this.resolve(decodeEntities(src))),
        server: labels[id] || ("Server " + (i + 1)),
      });
    }
    if (out.length) return out;

    // Tema lama: satu iframe player tanpa tab.
    const legacy = doc.select("#player iframe[src], .player iframe[src]") || [];
    for (let i = 0; i < legacy.length; i++) {
      const src = safeString(legacy[i].attr("src"));
      if (!src) continue;
      out.push({ url: reviveMirror(this.resolve(decodeEntities(src))), server: "Server " + (i + 1) });
    }
    return out;
  }

  // -------------------------------------------------------- configuration

  getFilterList() {
    const options = [{ type_name: "SelectOption", name: "Semua", value: "" }];
    for (let i = 0; i < NEKOPOI_CATEGORIES.length; i++) {
      options.push({
        type_name: "SelectOption",
        name: NEKOPOI_CATEGORIES[i][0],
        value: NEKOPOI_CATEGORIES[i][1],
      });
    }
    for (let i = 0; i < NEKOPOI_GENRES.length; i++) {
      options.push({
        type_name: "SelectOption",
        name: NEKOPOI_GENRES[i][0],
        value: "/genres/" + NEKOPOI_GENRES[i][1] + "/",
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
    return this.basePreferences(NEKOPOI_SERVERS);
  }
}

/** Series links are `/hentai/<slug>/`; posts are everything else. */
function seriesHref(anchor) {
  const href = safeString(anchor.attr("href") || anchor.getHref);
  if (!href) return "";
  return href.indexOf("/hentai/") !== -1 ? href : "";
}

/** `background-image: url('…')` -> "…". The theme puts every thumb inline. */
function backgroundUrl(style) {
  const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(safeString(style));
  return m ? cleanText(m[1]) : "";
}

/** The ticker anchors carry their thumbnail inside the tooltip markup. */
function tooltipImage(attribute) {
  const html = String(attribute == null ? "" : attribute)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m ? m[1] : "";
}

/** `<meta property="og:x" content="…">`, or "". */
function metaContent(doc, property) {
  const element = doc.selectFirst("meta[property='" + property + "']") ||
    doc.selectFirst("meta[name='" + property + "']");
  return element ? decodeEntities(safeString(element.attr("content"))) : "";
}

/** { "judul jepang": "…", "status": "Completed", … } from the meta list. */
function metaMap(doc) {
  const items = doc.select(".nk-series-meta-list li") || [];
  const out = {};
  for (let i = 0; i < items.length; i++) {
    const text = cleanText(items[i].text);
    const colon = text.indexOf(":");
    if (colon <= 0) continue;
    const key = cleanText(text.substring(0, colon)).toLowerCase();
    out[key] = cleanText(text.substring(colon + 1));
  }
  return out;
}

/** The theme's pagination block; "Selanjutnya" is an `a.next`. */
function nekopoiHasNext(doc) {
  return hasNextPage(doc, [
    "nav.navigation.pagination a.next",
    "a.next.page-numbers",
    "#nav-below a.next",
  ]);
}

/**
 * Mangayomi only downloads HLS when `url` or `originalUrl` ends in ".m3u8".
 * Streampoi's (streamruby) signed playlists end in `.m3u8?t=<token>&...`, so
 * Server 3 episodes, which often are the only server that plays from Indonesia,
 * could not be downloaded. The app always fetches `url`, and reads
 * `originalUrl` only for local playback, so `url` stays the signed address and
 * `originalUrl` gets the same address without its query. That address is never
 * fetched. DoodStream URLs already end in `.mp4` before their query and are
 * left alone.
 */
function nekopoiHlsDownloadHint(url, fallback) {
  const value = safeString(url);
  if (/\.m3u8?$/i.test(value)) return fallback;
  const bare = value.replace(/[?#].*$/, "");
  return /\.m3u8?$/i.test(bare) ? bare : fallback;
}

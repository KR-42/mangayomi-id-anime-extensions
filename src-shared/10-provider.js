// ---------------------------------------------------------------------------
// Base class shared by every source in this repo.
//
// Adds: a user-overridable base URL, consistent headers, a small retry-free
// fetch wrapper, and the preference-reading helpers used across sources.
//
// Inlined by scripts/build.js; edit src-shared/ instead of built files.
// ---------------------------------------------------------------------------

var DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
};

class IdBaseProvider extends MProvider {
  constructor(baseUrl) {
    super();
    this.client = new Client();
    this.prefs = new SharedPreferences();
    this.defaultBaseUrl = baseUrl || this.source.baseUrl;
    this._baseUrl = null;
  }

  /**
   * The base URL currently in use.
   *
   * The user can override the site's domain in the source settings. Stored
   * links are relative, so switching domains keeps the library intact.
   */
  getBaseUrl() {
    if (this._baseUrl) return this._baseUrl;
    var override = "";
    try {
      override = safeString(this.prefs.get("base_url"));
    } catch (_) {
      override = "";
    }
    var base = override || this.defaultBaseUrl || this.source.baseUrl;
    this._baseUrl = String(base).replace(/\/+$/, "");
    return this._baseUrl;
  }

  /** Absolute URL for a link stored relative (or already absolute). */
  resolve(path) {
    return resolveUrl(this.getBaseUrl(), path);
  }

  /** Relative link for storage, resolved against the current base URL. */
  relativize(url) {
    return toRelative(url, this.getBaseUrl());
  }

  /**
   * Browser identity sent with every request.
   *
   * Cloudflare's "Just a moment..." gate is triggered by a missing or obviously
   * scripted User-Agent for some hosts, so sources may override this. The
   * bypass itself (challenge solving, cf_clearance cookies) is done by the app,
   * not by us — see docs/MANGAYOMI_JS_API_NOTES.md §4.
   */
  userAgent() {
    return DEFAULT_HEADERS["User-Agent"];
  }

  getHeaders(url) {
    return {
      "User-Agent": this.userAgent(),
      Accept: DEFAULT_HEADERS.Accept,
      "Accept-Language": DEFAULT_HEADERS["Accept-Language"],
      Referer: this.getBaseUrl() + "/",
    };
  }

  /** Request headers with an explicit Referer (embed/CDN requests need it). */
  headersFor(referer) {
    var headers = this.getHeaders(referer);
    if (referer) headers.Referer = referer;
    return headers;
  }

  /** GET a page and return its body. Throws on non-2xx. */
  async fetch(url, headers) {
    var res = await this.client.get(url, headers || this.getHeaders(url));
    if (!res || !res.body) {
      throw new Error("Empty response from " + url);
    }
    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
      throw new Error("HTTP " + res.statusCode + " from " + url);
    }
    return res.body;
  }

  /**
   * GET a page and parse it. Returns null instead of throwing so a single
   * broken page does not take down a whole listing.
   */
  async fetchDoc(url, headers) {
    try {
      var html = await this.fetch(url, headers);
      return new Document(html);
    } catch (e) {
      console.log("fetchDoc failed for " + url + ": " + e);
      return null;
    }
  }

  /** POST a form body and return the raw response object. */
  async post(url, body, headers) {
    var h = headers || this.getHeaders(url);
    h["Content-Type"] =
      h["Content-Type"] || "application/x-www-form-urlencoded; charset=UTF-8";
    return await this.client.post(url, h, body);
  }

  /** POST a form and parse the JSON response body. */
  async postJson(url, body, headers) {
    var res = await this.post(url, body, headers);
    if (!res || !res.body) return null;
    try {
      return JSON.parse(res.body);
    } catch (e) {
      console.log("postJson: bad JSON from " + url + ": " + res.body.slice(0, 200));
      return null;
    }
  }

  // --------------------------------------------------------- preferences

  /** Text preference with a default. */
  prefText(key, fallback) {
    try {
      var value = safeString(this.prefs.get(key));
      return value || fallback;
    } catch (_) {
      return fallback;
    }
  }

  /** List preference value (entryValues), with a default. */
  prefList(key, fallback) {
    return this.prefText(key, fallback);
  }

  /** Boolean preference. */
  prefBool(key, fallback) {
    try {
      var value = this.prefs.get(key);
      if (value === undefined || value === null) return fallback;
      return value === true || value === "true";
    } catch (_) {
      return fallback;
    }
  }

  /** Multi-select preference as an array of strings. */
  prefMulti(key, fallback) {
    try {
      var value = this.prefs.get(key);
      if (value && value.length !== undefined) {
        return Array.prototype.slice.call(value).map(safeString);
      }
      return fallback;
    } catch (_) {
      return fallback;
    }
  }

  /** Preferred qualities, parsed from the multi-select, highest first. */
  preferredQualities(fallback) {
    var values = this.prefMulti("preferred_quality", fallback || ["1080p", "720p", "480p", "360p"]);
    // Keep declaration order when the user reordered; do not re-sort heroes.
    return values.length ? values : fallback || [];
  }

  /** Preferred server names, lowercase. */
  preferredServers(fallback) {
    var values = this.prefMulti("preferred_server", fallback || []);
    return values.map(function (v) {
      return safeString(v).toLowerCase();
    });
  }

  /**
   * Shared preference entries: base URL override and quality preference.
   * Sources append their own entries (e.g. server order) and return the list
   * from getSourcePreferences().
   */
  basePreferences(qualityEntries) {
    return [
      {
        key: "base_url",
        editTextPreference: {
          title: "Domain situs",
          summary:
            "Kosongkan untuk memakai domain bawaan. Ganti bila domain situs berpindah.",
          value: "",
          dialogTitle: "Domain situs",
          dialogMessage:
            "Contoh: https://situs-baru.example. Tanpa garis miring di akhir.",
        },
      },
      {
        key: "preferred_quality",
        multiSelectListPreference: {
          title: "Kualitas yang diutamakan",
          summary: "Urutan kualitas pada daftar video.",
          entries: ["1080p", "720p", "480p", "360p"],
          entryValues: ["1080p", "720p", "480p", "360p"],
          // 1080p leads the default order. A quality left out of this list is
          // sorted to the tail no matter how good it is, so omitting it here
          // buries the best mirror under the weakest one.
          values: ["1080p", "720p", "480p", "360p"],
        },
      },
      {
        key: "preferred_server",
        multiSelectListPreference: {
          title: "Server yang diutamakan",
          summary: "Server terpilih dicoba lebih dulu saat memuat video.",
          entries: qualityEntries || [],
          entryValues: qualityEntries || [],
          values: take(qualityEntries || [], 3),
        },
      },
    ];
  }

  // ------------------------------------------------------------- helpers

  /**
   * Run tasks with bounded concurrency. QuickJS has no timers, but plain
   * promise chaining is enough to avoid hammering a site.
   */
  async mapLimit(items, limit, worker) {
    var results = [];
    var index = 0;
    var self = this;
    async function next() {
      while (index < items.length) {
        var current = index++;
        try {
          results[current] = await worker(items[current], current);
        } catch (e) {
          console.log("task failed: " + e);
          results[current] = null;
        }
      }
    }
    var workers = [];
    for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(next());
    await Promise.all(workers);
    return results;
  }

  /** Standard "empty page" result. */
  emptyPage() {
    return { list: [], hasNextPage: false };
  }

  /** Standard listing item shape. */
  item(name, imageUrl, link) {
    return {
      name: cleanTitle(name),
      imageUrl: imageUrl || "",
      link: this.relativize(link),
    };
  }
}

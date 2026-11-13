/**
 * Mock of the Mangayomi JavaScript runtime, for local testing only.
 *
 * The real app embeds QuickJS and injects MProvider, Client, Document, Element,
 * SharedPreferences, console and the native extractor globals. This module
 * recreates the same surface in a single Node realm so an extension can be
 * instantiated and exercised exactly as the app does:
 *
 *     var extention = new DefaultExtension();
 *     await extention.getPopular(1);
 *
 * A single realm matters: the app runs everything inside one QuickJS context,
 * so `Array.isArray` across a boundary would lie. `new Function` keeps every
 * value in the same realm as the code under test.
 *
 * Nothing here is shipped to users.
 */
"use strict";

const { parseHTML } = require("linkedom");
const { install: installStringHelpers } = require("./string-helpers");
const nativeHelpers = require("./native-helpers");

// ---------------------------------------------------------------- Document

class Element {
  constructor(node) {
    this.node = node;
  }

  get text() {
    return this.node ? this.node.textContent.trim() : "";
  }

  get outerHtml() {
    return this.node ? this.node.outerHTML : "";
  }

  get innerHtml() {
    return this.node ? this.node.innerHTML : "";
  }

  get className() {
    return this.node ? this.node.getAttribute("class") || "" : "";
  }

  get localName() {
    return this.node ? this.node.localName : "";
  }

  get namespaceUri() {
    return this.node ? this.node.namespaceURI || "" : "";
  }

  // The app extracts these with a regex over outerHtml, so the mock does too.
  get getSrc() {
    const m = /src="([^"]+)"/.exec(this.outerHtml);
    return m ? m[1] : "";
  }

  get getImg() {
    const m = /img="([^"]+)"/.exec(this.outerHtml);
    return m ? m[1] : "";
  }

  get getHref() {
    const m = /href="([^"]+)"/.exec(this.outerHtml);
    return m ? m[1] : "";
  }

  get getDataSrc() {
    const m = /data-src="([^"]+)"/.exec(this.outerHtml);
    return m ? m[1] : "";
  }

  get children() {
    if (!this.node) return [];
    return Array.from(this.node.children).map((child) => new Element(child));
  }

  get previousElementSibling() {
    return new Element(this.node ? this.node.previousElementSibling : null);
  }

  get nextElementSibling() {
    return new Element(this.node ? this.node.nextElementSibling : null);
  }

  attr(name) {
    if (!this.node) return "";
    const value = this.node.getAttribute(name);
    return value === null ? "" : value;
  }

  hasAttr(name) {
    return !!this.node && this.node.hasAttribute(name);
  }

  select(css) {
    if (!this.node) return [];
    return Array.from(this.node.querySelectorAll(css)).map((n) => new Element(n));
  }

  selectFirst(css) {
    if (!this.node) return new Element(null);
    return new Element(this.node.querySelector(css));
  }

  getElementsByTagName(name) {
    if (!this.node) return [];
    return Array.from(this.node.getElementsByTagName(name)).map((n) => new Element(n));
  }

  getElementsByClassName(name) {
    if (!this.node) return [];
    return Array.from(this.node.getElementsByClassName(name)).map((n) => new Element(n));
  }

  xpath() {
    throw new Error("xpath() is not supported by the mock runtime");
  }

  xpathFirst() {
    throw new Error("xpathFirst() is not supported by the mock runtime");
  }
}

class Document {
  constructor(html) {
    const { document } = parseHTML(String(html || ""));
    this.doc = document;
  }

  get text() {
    return this.doc.body ? this.doc.body.textContent.trim() : "";
  }

  get outerHtml() {
    return this.doc.documentElement ? this.doc.documentElement.outerHTML : "";
  }

  get body() {
    return new Element(this.doc.body);
  }

  get documentElement() {
    return new Element(this.doc.documentElement);
  }

  get head() {
    return new Element(this.doc.head);
  }

  get children() {
    return Array.from(this.doc.children || []).map((n) => new Element(n));
  }

  select(css) {
    return Array.from(this.doc.querySelectorAll(css)).map((n) => new Element(n));
  }

  selectFirst(css) {
    // The app's pseudom selectFirst resolves to null when nothing matches and
    // wraps it in an Element; every getter then answers "". The mock matches.
    return new Element(this.doc.querySelector(css));
  }

  getElementsByTagName(name) {
    return Array.from(this.doc.getElementsByTagName(name)).map((n) => new Element(n));
  }

  getElementsByClassName(name) {
    return Array.from(this.doc.getElementsByClassName(name)).map((n) => new Element(n));
  }

  getElementById(id) {
    return new Element(this.doc.getElementById(id));
  }

  attr(name) {
    const value = this.doc.documentElement
      ? this.doc.documentElement.getAttribute(name)
      : null;
    return value === null ? "" : value;
  }

  hasAttr(name) {
    return this.attr(name) !== "";
  }

  xpath() {
    throw new Error("xpath() is not supported by the mock runtime");
  }

  xpathFirst() {
    throw new Error("xpathFirst() is not supported by the mock runtime");
  }
}

// ------------------------------------------------------------------ Client

class MockResponse {
  constructor(url, status, headers, body) {
    this.url = url;
    this.statusCode = status;
    this.headers = headers || {};
    this.body = body;
  }
}

/**
 * Client backed by a `transport(method, url, headers, body)` function, so
 * tests can serve fixtures offline and live mode can use real HTTP.
 */
class Client {
  constructor(options) {
    this.options = options || {};
  }

  async request(method, url, headers, body) {
    // The app (lib/eval/javascript/http.dart) JSON-encodes the body itself
    // whenever Content-Type contains application/json, so a string body is
    // sent double-encoded there. Do the same so tests catch it.
    const contentType = Object.keys(headers || {})
      .filter((key) => key.toLowerCase() === "content-type")
      .map((key) => String(headers[key]))[0] || "";
    if (body !== undefined && contentType.includes("application/json")) {
      body = JSON.stringify(body === undefined ? null : body);
    }
    const response = await this.options.transport(method, url, headers || {}, body, this.options);
    if (!response) {
      throw new Error("No fixture for " + method + " " + url);
    }
    return new MockResponse(
      url,
      response.status === undefined ? 200 : response.status,
      response.headers || {},
      response.body === undefined ? "" : response.body,
    );
  }

  head(url, headers) {
    return this.request("HEAD", url, headers);
  }
  get(url, headers) {
    return this.request("GET", url, headers);
  }
  post(url, headers, body) {
    return this.request("POST", url, headers, body);
  }
  put(url, headers, body) {
    return this.request("PUT", url, headers, body);
  }
  delete(url, headers, body) {
    return this.request("DELETE", url, headers, body);
  }
  patch(url, headers, body) {
    return this.request("PATCH", url, headers, body);
  }
}

// ----------------------------------------------------------- preferences

class SharedPreferences {
  constructor(values, declared) {
    this.values = values || {};
    this.declared = declared || [];
  }

  get(key) {
    if (Object.prototype.hasOwnProperty.call(this.values, key)) {
      return this.values[key];
    }
    const entry = this.declared.find((item) => item.key === key);
    if (entry) return entry.defaultValue;
    // The app throws for undeclared keys; the harness surfaces it so tests
    // catch a preference that is read but never declared.
    throw new Error(`Preference "${key}" was not found`);
  }
}

// -------------------------------------------------------------- MProvider

function makeMProvider(source) {
  return class MProvider {
    get source() {
      return source;
    }
    get supportsLatest() {
      throw new Error("supportsLatest not implemented");
    }
    getHeaders() {
      throw new Error("getHeaders not implemented");
    }
    async getPopular() {
      throw new Error("getPopular not implemented");
    }
    async getLatestUpdates() {
      throw new Error("getLatestUpdates not implemented");
    }
    async search() {
      throw new Error("search not implemented");
    }
    async getDetail() {
      throw new Error("getDetail not implemented");
    }
    async getPageList() {
      throw new Error("getPageList not implemented");
    }
    async getVideoList() {
      throw new Error("getVideoList not implemented");
    }
    async getHtmlContent() {
      throw new Error("getHtmlContent not implemented");
    }
    async cleanHtmlContent() {
      throw new Error("cleanHtmlContent not implemented");
    }
    getFilterList() {
      throw new Error("getFilterList not implemented");
    }
    getSourcePreferences() {
      throw new Error("getSourcePreferences not implemented");
    }
  };
}

const EXTRACTOR_NAMES = [
  "sibnetExtractor",
  "myTvExtractor",
  "okruExtractor",
  "voeExtractor",
  "vidBomExtractor",
  "streamlareExtractor",
  "sendVidExtractor",
  "yourUploadExtractor",
  "gogoCdnExtractor",
  "doodExtractor",
  "streamTapeExtractor",
  "mp4UploadExtractor",
  "streamWishExtractor",
  "filemoonExtractor",
  "quarkVideosExtractor",
  "ucVideosExtractor",
  "quarkFilesExtractor",
  "ucFilesExtractor",
];

// Preference defaults, derived from what getSourcePreferences() declares.
function declaredDefaults(preferencesList) {
  const out = [];
  for (const entry of preferencesList || []) {
    const key = entry && entry.key;
    if (!key) continue;
    let defaultValue;
    if (entry.editTextPreference) defaultValue = entry.editTextPreference.value || "";
    else if (entry.listPreference) {
      defaultValue = entry.listPreference.entryValues
        ? entry.listPreference.entryValues[entry.listPreference.value || 0]
        : "";
    } else if (entry.switchPreferenceCompat) defaultValue = !!entry.switchPreferenceCompat.value;
    else if (entry.checkBoxPreference) defaultValue = !!entry.checkBoxPreference.value;
    else if (entry.multiSelectListPreference) {
      defaultValue = entry.multiSelectListPreference.values || [];
    }
    out.push({ key, defaultValue });
  }
  return out;
}

/**
 * Build a fresh extension instance.
 *
 * @param {object} options
 * @param {string} options.code        built extension source (javascript/...)
 * @param {object} options.source      mangayomiSources entry for this source
 * @param {function} options.transport (method, url, headers, body) => {status, body, headers}
 * @param {object} [options.preferences] user preference values keyed by key
 * @param {object} [options.nativeExtractors] { name: fn } overrides
 * @returns {{ extension: object, logs: Array, preferencesList: Array }}
 */
function createRuntime(options) {
  const opts = options || {};
  const logs = [];

  const consoleMock = {
    log: (...args) => logs.push({ level: "log", message: args.join(" ") }),
    warn: (...args) => logs.push({ level: "warn", message: args.join(" ") }),
    error: (...args) => logs.push({ level: "error", message: args.join(" ") }),
  };

  // Native extractors: delegate to a supplied mock or return [], never hang.
  const nativeExtractors = {};
  for (const name of EXTRACTOR_NAMES) {
    nativeExtractors[name] = async (...args) => {
      const handler = opts.nativeExtractors && opts.nativeExtractors[name];
      if (handler) return handler(...args);
      logs.push({
        level: "warn",
        message: `native extractor ${name} not mocked (returned [])`,
      });
      return [];
    };
  }

  const sourceSnapshot = opts.source || {};

  // Preference lookups need the declared defaults, which only exist after the
  // extension object is built. Keep a shared reference and fill it below.
  const declared = { list: [] };

  const Prefs = class extends SharedPreferences {
    constructor() {
      super(opts.preferences || {}, declared.list);
    }
  };
  const ClientClass = class extends Client {
    constructor(options) {
      // Sources do `new Client({ followRedirects: false })` and then read
      // `res.headers.location` themselves. Merging (not replacing) keeps the
      // harness transport while letting those options reach the request.
      super(Object.assign({}, options || {}, { transport: opts.transport }));
    }
  };

  const sandbox = {
    console: consoleMock,
    MProvider: makeMProvider(sourceSnapshot),
    Client: ClientClass,
    Document,
    Element,
    SharedPreferences: Prefs,
    setTimeout: () => {
      throw new Error("setTimeout is not available in QuickJS");
    },
    ...nativeHelpers,
    ...nativeExtractors,
    // Node globals must not leak into extension code, exactly like QuickJS.
    require: undefined,
    process: undefined,
    module: undefined,
    exports: undefined,
    __dirname: undefined,
    __filename: undefined,
    Buffer: undefined,
    global: undefined,
  };

  installStringHelpers(String.prototype);

  const parameterNames = Object.keys(sandbox);
  const parameterValues = parameterNames.map((name) => sandbox[name]);
  const body = `${opts.code}\n;return new DefaultExtension();`;
  const factory = new Function(...parameterNames, body);
  const extension = factory(...parameterValues);

  // Mirror the app: getSourcePreferences() declares the defaults that
  // SharedPreferences falls back to for keys the user has not set. This must
  // mutate the array in place: the extension's SharedPreferences captured the
  // array reference in its constructor, before getSourcePreferences() ran.
  let preferencesList = [];
  try {
    preferencesList = extension.getSourcePreferences() || [];
  } catch (error) {
    logs.push({
      level: "warn",
      message: `getSourcePreferences() failed: ${error.message}`,
    });
  }
  const defaults = declaredDefaults(preferencesList);
  for (const entry of defaults) declared.list.push(entry);

  return {
    extension,
    logs,
    preferencesList,
    declaredDefaults: declared.list,
    sandbox,
  };
}

module.exports = {
  makeMProvider,
  Client,
  Document,
  Element,
  SharedPreferences,
  MockResponse,
  createRuntime,
  declaredDefaults,
};

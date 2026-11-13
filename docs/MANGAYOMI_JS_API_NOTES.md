# Mangayomi JS Extension API — Research Notes

> Phase 0 deliverable. Everything below was read from source, not guessed:
> - App: `kodjodevf/mangayomi` @ `0.9.95+128` (`lib/eval/javascript/*.dart`, `lib/eval/model/*.dart`, `lib/models/*.dart`, `lib/services/*.dart`)
> - Official repo: `kodjodevf/mangayomi-extensions` (branch `main`, JS sources under `javascript/`)
> - Community repos: `Schnitzel5/sugoi-modules`, `m2k3a/mangayomi-extensions`, `Mallyd11/mangayomi-anime-extensions`, `Swakshan/mangayomi-swak-extensions`
>
> Local clones live in `research/` (git-ignored). Quotes are trimmed to the relevant parts.

---

## 1. How the app runs an extension

The app evaluates each source's JavaScript in a QuickJS runtime (`flutter_qjs`). Before the source code runs, three things are defined:

1. A base class `MProvider` whose methods all `throw new Error("<name> not implemented")`.
2. Bridge built-ins: `Client`, `Document`, `Element`, `SharedPreferences`, `console`, the Kotlin-ish string helpers, crypto/extractor helpers.
3. `var extention = new DefaultExtension();` after the source code (so **the class name must be exactly `DefaultExtension`** and it must `extends MProvider`).

Source: `lib/eval/javascript/service.dart`

```dart
runtime.evaluate('''
class MProvider {
    get source() { return $sourceJson; }          // {name, lang, baseUrl, apiUrl, ...}
    get supportsLatest() { throw new Error("supportsLatest not implemented"); }
    getHeaders(url) { throw new Error("getHeaders not implemented"); }
    async getPopular(page) { throw new Error("getPopular not implemented"); }
    async getLatestUpdates(page) { throw new Error("getLatestUpdates not implemented"); }
    async search(query, page, filters) { throw new Error("search not implemented"); }
    async getDetail(url) { throw new Error("getDetail not implemented"); }
    async getPageList() { throw new Error("getPageList not implemented"); }
    async getVideoList(url) { throw new Error("getVideoList not implemented"); }
    async getHtmlContent(name, url) { throw new Error("getHtmlContent not implemented"); }
    async cleanHtmlContent(html) { throw new Error("cleanHtmlContent not implemented"); }
    getFilterList() { throw new Error("getFilterList not implemented"); }
    getSourcePreferences() { throw new Error("getSourcePreferences not implemented"); }
}
async function jsonStringify(fn) { return JSON.stringify(await fn()); }
''');
_throwIfError(runtime.evaluate('''${source.sourceCode}
var extention = new DefaultExtension();
'''), 'loading the source');
```

Consequences that matter for us:

- **Only "not implemented" errors are swallowed.** Any other exception propagating out of a method surfaces as an error toast. Wrap risky parsing in `try/catch` and return empty lists rather than crashing the screen.
- Return values are JSON-encoded, so **only plain data** (objects, arrays, strings, numbers, booleans) cross the bridge. No class instances, no `undefined` in required fields.
- The runtime is **QuickJS (ES2020-ish)** but has **no browser globals**: no `atob`/`btoa`, no `fetch`, no `TextDecoder`, no `URL`, no `setTimeout`/`Promise`-timeout utilities, no `crypto.subtle`. `encodeURIComponent`, `JSON`, `RegExp`, `Promise`, template literals, `??`, `?.` and `async/await` are available. Community sources implement base64 by hand for this reason (see `Mallyd11/.../allwish.js` `_b64dec`).
- Sources are **plain scripts**, not modules: no `import`/`export`. Each file must be self-contained.

---

## 2. `mangayomiSources` metadata block

The app's repo generator parses a literal array via regex `const\s+mangayomiSources\s*=\s*(\[.*?\]);` with `dotAll`. The JS extension itself never reads this block at runtime — it only exists for the index generator.

Official JS example (`sugoi-modules/javascript/anime/src/de/aniworld.js`):

```js
const mangayomiSources = [{
    "name": "AniWorld",
    "lang": "de",
    "baseUrl": "https://aniworld.to",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/de.aniworld.png",
    "typeSource": "single",
    "itemType": 1,
    "isNsfw": false,
    "version": "0.3.8",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "anime/src/de/aniworld.js"
}];
```

Index entry produced by the generator (`model/source.dart` → `Source.toJson()`):

```json
{
  "name": "...", "id": 123456789, "baseUrl": "https://...",
  "lang": "id", "typeSource": "single", "iconUrl": "https://...",
  "dateFormat": "", "dateFormatLocale": "", "isNsfw": false,
  "hasCloudflare": false, "sourceCodeUrl": "https://raw.githubusercontent.com/<user>/<repo>/main/javascript/anime/src/id/x.js",
  "apiUrl": "", "version": "0.0.1", "isManga": false, "itemType": 1,
  "isFullData": false, "appMinVerReq": "0.5.0", "additionalParams": "",
  "sourceCodeLanguage": 1, "notes": ""
}
```

Key fields:

| Field | Meaning |
|---|---|
| `itemType` | **`0` = manga, `1` = anime, `2` = novel** (`enum ItemType { manga, anime, novel }`). Anime must be `1`. |
| `isManga` | Derived as `(itemType == 0)` when absent. Set `false`. |
| `sourceCodeLanguage` | `0` dart, **`1` javascript**, `2` mihon, `3` lnreader, `4` aidoku. Generator forces `1` for JS sources. |
| `pkgPath` | Path **relative to the `javascript/` directory**, used to build `sourceCodeUrl` (`.../main/javascript/${pkgPath}`). Must be exact or install 404s. |
| `typeSource` | Free-form; official sources use `"single"`. |
| `version` | Must increase on every change for auto-update to fire (`compareVersions`). |
| `appMinVerReq` | Defaults to `"0.5.0"`; sources are hidden if the running app is older. |
| `id` | Not written by hand in JS. Generator computes `'mangayomi-"$lang"."${name}"'.hashCode` **in Dart** — see §3 (note the missing `js-`). |
| `hasCloudflare` | Purely informational; it does not enable any bypass. Actual bypass is a global app setting (WebView solve), independent of this flag. |
| `additionalParams` | Free-form string delivered to `this.source.additionalParams`. Handy for compile-time extra config. Do **not** put user-changeable domains here — use preferences. |

The repo itself needs `repo.json` (`{"name": ..., "website": ...}`) next to the index for the app to show a friendly repo name.

### How installing works

`fetchRepoSources` → `ExtensionStoreService.fetchStore(jsonUrl)` → `_parseLegacyJsonStore` → `Source.fromJson` for each entry → user taps install → `updateSource` does a plain `GET source.sourceCodeUrl`, stores the response body as `source.sourceCode`, then evaluates it to fill `headers`, `supportLatest`, `filterList`, `preferenceList`.

Notes:
- The source file is fetched **as plain text over HTTP** — the repo must be publicly reachable (raw.githubusercontent or gh-pages).
- `getHeaders()` is invoked **at install time**, so it must not depend on preferences unset yet (they fall back to declared defaults).
- `getSourcePreferences()` is also read at install (via `preferenceList`) and persisted.
- Broken CSS selectors are not detectable at install; only a runtime error fails install.

### Source identity across repos

`Source.id` is the only identity. If two repos ship the same `(lang, name)` they collide. Our names are unique per Indonesian site, so `id` is stable even when the upstream domain changes — which is exactly why the domain must be a preference and not part of the identity.

The generator uses Dart's `String.hashCode`, which **is not Java's `hashCode`**. Verified against the official `index.json`: e.g. `'mangayomi-"zh"."新新漫画"'.hashCode == 652112892`, and the Dart VM implementation is the Jenkins-style `SystemHash` over UTF-16 code units (`runtime/vm/hash.h`: `combine` then `finalize(..., 30)`).

One trap, confirmed by replaying all reference indexes:

- `Source.fromJson` computes `id` **before** `sourceCodeLanguage` is assigned, so the `sourceCodeLang == 0` branch always runs. The prefix is `mangayomi-` (no `js-`), even for JavaScript sources. Replay result: `sugoi-modules` 21/22, `m2k3a` 21/24, official `index.json` matches for every entry that does not declare its own `id`. The remaining mismatches all declare an explicit `"id"` in the source block (e.g. `NetMirror: 446414301`), which the generator honours.
- Therefore: **do not invent ids**. Either omit `id` and use the replay-tested formula, or pin an explicit integer once and never change it.

```js
// scripts/generate-index.js implements exactly this
function dartStringHashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash + str.charCodeAt(i)) & 0x1fffffff;
    hash = (hash + ((hash << 10) & 0x1fffffff)) & 0x1fffffff;
    hash ^= hash >>> 6;
  }
  hash = (hash + ((hash << 3) & 0x1fffffff)) & 0x1fffffff;
  hash ^= hash >>> 11;
  hash = (hash + ((hash << 15) & 0x1fffffff)) & 0x1fffffff;
  hash &= 0x3fffffff;
  return hash === 0 ? 0 : hash;
}
// id = dartStringHashCode(`mangayomi-"${lang}"."${name}"`)
```

---

## 3. Return contract per method

Signatures come from `lib/eval/javascript/service.dart` and the templates in `lib/modules/browse/extension/widgets/extension_templates.dart`.

### `getPopular(page)` / `getLatestUpdates(page)` / `search(query, page, filters)`

All three return the same shape (`MPages`, `lib/eval/model/m_pages.dart`):

```js
{ list: [ { name, imageUrl, link }, ... ], hasNextPage: true|false }
```

`MManga.fromJson` only reads `name`, `link`, `imageUrl` (plus optional detail fields). Missing `name`/`link` produce blank rows; missing `imageUrl` produces a broken cover.

Pagination: the app calls with `page = 1, 2, 3, …` while `hasNextPage == true` **and** `list` is non-empty. Returning `hasNextPage: true` with an empty list stops the loop safely, but returning `true` forever is an infinite scroll.

`supportsLatest` is a **getter** (`get supportsLatest()`), not a method. Default for the JS bridge when unimplemented is `true`.

`search(query, page, filters)`:
- `query` is JSON-encoded into the call, so arbitrary text is safe.
- `filters` is the filter list **with the user's state applied** (see §5). Structural differences between what `getFilterList()` returned and what arrives in `search` do happen (the app round-trips through JSON); always re-derive from `filter.type_name`.

### `getDetail(url)` → `MManga`

```js
{
  name, imageUrl, description, author, artist,
  status: 0|1|2|3|4|5,          // 0 ongoing, 1 completed, 2 on hiatus, 3 canceled, 4 publishing finished, else unknown
  genre: ["Action", ...],
  chapters: [ { name, url, dateUpload, scanlator, thumbnailUrl, description, duration, downloadSize, isFiller } ]
}
```

- For anime the app reads `chapters` **or** `episodes` (`MManga.fromJson` checks both); official anime sources emit `episodes`. Both work — we use `episodes` for anime to match upstream.
- `dateUpload` is **a string of milliseconds since epoch**. Use `parseDates([...strings], format, locale)` to convert site date text. Wrong strings silently break "latest chapter" sorting.
- Episode `url` is what the app later hands to `getVideoList(url)`. Store it **relative** (`/episode/slug/`) and resolve against the current base URL; this is the domain-change safety net.
- The `link` returned from listings is likewise the key used to open the detail page and later re-fetch it. **Relative links are the convention** in official sources (e.g. `link: "/bangumi/..."`), and they survive a domain swap.
- The app sorts the list itself (by chapter number by default), so order in HTML is not critical, but we still emit newest-first for consistency with users' expectation in the raw list.

### `getVideoList(url)` → `MVideo[]`

`lib/models/video.dart`:

```js
[{
  url,                 // direct media URL (mp4/m3u8) — required
  originalUrl,         // required, usually same as url or the embed page
  quality,             // label shown in the player — required (empty string still renders)
  headers: { "Referer": "...", "User-Agent": "..." },   // optional
  subtitles: [ { file, label } ],                       // optional
  audios:    [ { file, label } ]                        // optional
}]
```

- **Entries missing `url` or `originalUrl` are dropped silently** (`if (element['url'] != null && element['originalUrl'] != null)`).
- Results are de-duplicated on `(url, originalUrl)` and **kept in returned order** (LinkedHashSet). Order therefore matters: we return the user's preferred quality/server first.
- `headers` is the **only** place to attach a `Referer` for a CDN that refuses hotlinking; it reaches the player via `Video.headers`.
- Hardsubs are the norm on Indonesian sites. We mark the quality string, e.g. `"720p · Hardsub ID"`, so playback choice is honest.
- `createHlsProxyUrl(url, headers)` exists in the bridge (`utils.dart`) for HLS with header-locked segments; only needed if playback of the m3u8 fails from the app.

### `getFilterList()` → filter objects

`type_name` is the discriminator (`lib/eval/model/filter.dart`). Supported:

```js
{ type_name: "SelectFilter", type, name, state: 0, values: [{ type_name: "SelectOption", name, value }] }
{ type_name: "CheckBox",     type, name, value, state: false }
{ type_name: "TriState",     type, name, value, state: 0 }   // 0 ignore, 1 include, 2 exclude
{ type_name: "TextFilter",   type, name, state: "" }
{ type_name: "SortFilter",   type, name, state: { index, ascending }, values: [...] }
{ type_name: "GroupFilter",  type, name, state: [ <nested filters> ] }
{ type_name: "HeaderFilter", type, name }                    // visual label
{ type_name: "SeparatorFilter", type }
```

In `search`, `SelectFilter` arrives with `state` = index into `values`; use `filters[i].values[filters[i].state].value`. CheckBoxes keep `state: true/false`. `GroupFilter.state` is the nested array.

Guard: `if (!filters || filters.length === 0) return <plain search>;` — the app can call `search` with an empty list (noted by community source `animefenix.js`), and any index access then throws.

### `getSourcePreferences()` → preferences

One object per setting; exactly one of these payloads per object (`lib/eval/model/source_preference.dart`):

```js
{ key, listPreference: { title, summary, valueIndex, entries: [...], entryValues: [...] } }
{ key, editTextPreference: { title, summary, value, dialogTitle, dialogMessage } }
{ key, switchPreferenceCompat: { title, summary, value } }
{ key, checkBoxPreference: { title, summary, value } }
{ key, multiSelectListPreference: { title, summary, entries, entryValues, values } }
```

Read back in any method with `new SharedPreferences().get(key)` (`lib/eval/javascript/preferences.dart`), which returns:
- `listPreference` → the chosen **entryValue** (string)
- `editTextPreference` → the string
- `switch`/`checkBox` → boolean
- `multiSelect` → array of values

Crucial: `getPreferenceValue` falls back to the **declared defaults from the extension code** when nothing is stored (`getSourcePreferenceEntry` → `getSourcePreference(source: source)`), so reading a preference never throws, even during install. Missing keys (typo) *do* throw — keep the strings in sync.

---

## 4. Bridge built-ins

### `Client` (`lib/eval/javascript/http.dart`)

```js
const client = new Client();
await client.get(url, headers);            // -> { body, headers, statusCode, request, ... }
await client.post(url, headers, body);
await client.head(url, headers);
// put / delete / patch likewise
const client = new Client({ useDartHttpClient: true, followRedirects: false });
```

- Returns an object; `res.body` is the text, `res.statusCode` the number, `res.headers` a map (case-insensitive keys on the Dart side, exposed as given).
- **POST with a JSON `Content-Type`:** `_toHttpResponse` runs `json.encode(body)` itself whenever the Content-Type contains `application/json`. Pass a plain object (`{ id: x }`); a pre-stringified body arrives double-encoded (a JSON string literal). Kuronime 0.1.0–0.1.1 hit this: the API answered 500 "Cannot read properties of null". Other Content-Types send a string body as-is.
- `new Client({...})` options reach `MClient.init(reqcopyWith: ...)`; known keys: `useDartHttpClient`, `followRedirects`, `maxRedirects`, `timeout`, `connectTimeout`, `verifyCertificates`, `noProxy`. `followRedirects: false` is how a source reads a redirect `Location` (map `res.headers.location`) — used by embed resolvers.
- Cookies persist across calls **within the same source instance** (app-level `MCookieManager`), which is what makes the nonce/AJAX dance on Otakudesu-style sites work.
- Default User-Agent is whatever the app setting says. Always pass an explicit desktop UA + `Referer` for Indonesian sites; several reject the stock one.

### `Document` / `Element` (`lib/eval/javascript/dom_selector.dart`)

Parsed with `package:html` (lenient), selectors via `pseudom`, `:not` rewritten to `:inot`.

```js
const doc = new Document(html);
doc.select("div.item");        // Element[]
doc.selectFirst("h1");         // Element (may be "null element": .text === "")
doc.xpath("//a/@href");        // string[] (attrs of matched nodes)
doc.attr("lang"); doc.text; doc.outerHtml;
doc.getElementsByTagName("li"); doc.getElementsByClassName("x");
el.text; el.outerHtml; el.innerHtml; el.className;
el.attr("href"); el.hasAttr("data-x");
el.select("a"); el.selectFirst("a");
el.getElementsByTagName("span");
el.nextElementSibling; el.previousElementSibling;
el.getSrc; el.getImg; el.getHref; el.getDataSrc;
```

Gotchas verified in source:
- `selectFirst` on a miss returns a wrapper around `null`; `.text` is `""` and `.attr()` is `""` — **no exception**, so `?.`-free chains are fine but falsy checks must be on `""`, not on object identity.
- `Element.select()` internally uses `parent!.nodes.firstWhere(...)`; a detached element would throw. Elements obtained from a document are attached, so normal use is fine.
- `getSrc`/`getHref`/`getDataSrc` regex the **outer HTML**; they are handy for `srcset`/lazy-loaded images but less precise than `.attr()`.
- `:not(...)`, `:has(...)`, `:contains(...)`, `:matches(...)`, `:eq(n)` are supported; plain `:nth-child` works. Avoid exotic selectors — when in doubt, iterate and filter in JS.
- `.xpath()` only returns values when more than one node matched; single-node XPath silently returns `[]`. Prefer CSS.

### Text/date/crypto utilities (`js_common.dart`, `utils.dart`)

```js
"a/b/c".substringAfter("/");   // "b/c"   (and AfterLast, Before, BeforeLast, Between)
parseDates(["Jan 5, 2024"], "MMM d, yyyy", "en");  // ["1704412800000", ...]
unpackJs(packed);  unpackJsAndCombine(block);  deobfuscateJsPassword(x);
decryptAESCryptoJS(enc, pass);  encryptAESCryptoJS(pt, pass);
decryptAESGCM(enc, keyHex, ivHex, tagHex);
cryptoHandler(text, iv, key, encrypt);
evaluateJavascriptViaWebview(url, headers, scripts, time);
createHlsProxyUrl(url, headers);
console.log(obj);  // JSON-stringified into the app log
```

`String.prototype.replaceAll` is **not** patched in; `replace(/x/g, ...)` works.

### Built-in video extractors (`extractors.dart`)

Available as globals, each returns `MVideo[]`:

```
sibnetExtractor(url, prefix)
myTvExtractor(url)
okruExtractor(url)
voeExtractor(url, quality)
vidBomExtractor(url)
streamlareExtractor(url, prefix, suffix)
sendVidExtractor(url, headers, prefix)
yourUploadExtractor(url, headers, name, prefix)
gogoCdnExtractor(url)
doodExtractor(url, quality)
streamTapeExtractor(url, quality)
mp4UploadExtractor(url, headers, prefix, suffix)
streamWishExtractor(url, prefix)
filemoonExtractor(url, prefix, suffix)
quarkVideosExtractor(url, cookie) / ucVideosExtractor / quarkFilesExtractor / ucFilesExtractor
```

These run **native Dart** implementations, so they survive host-side JS obfuscation better than anything we could write in QuickJS. We prefer them whenever a host matches, and only fall back to our own extractor for hosts they don't cover.

Exact bridge signatures (from `extractors.dart`). Arguments after `url` may be omitted only if the wrapper supplies them; passing `undefined` breaks `JSON.stringify` in the bridge, so pass `""`.

```js
sibnetExtractor(url, prefix)
myTvExtractor(url)                         okruExtractor(url)
voeExtractor(url, quality)                 vidBomExtractor(url)
streamlareExtractor(url, prefix, suffix)   sendVidExtractor(url, headers, prefix)
yourUploadExtractor(url, headers, name, prefix)
gogoCdnExtractor(url)                      doodExtractor(url, quality)
streamTapeExtractor(url, quality)          mp4UploadExtractor(url, headers, prefix, suffix)
streamWishExtractor(url, prefix)           filemoonExtractor(url, prefix, suffix)
```

Returned objects are `Video.toJson()`: `{url, quality, originalUrl, headers, subtitles, audios}`. `originalUrl` from these wrappers is the *media* URL, not the embed page — we overwrite it in `finishVideos()` so deduplication keys on the embed.

### Other bridge helpers (`utils.dart`)

```js
cryptoHandler(text, iv, secretKeyString, encrypt)   // raw AES-CBC/UTF-8 key+iv, PKCS7
encryptAESCryptoJS(plainText, passphrase)           // CryptoJS "Salted__" format
decryptAESCryptoJS(encrypted, passphrase)           // same, reverse
decryptAESGCM(encryptedBase64, keyHex, ivHex, tagHex = "")
deobfuscateJsPassword(inputString)
unpackJs(packedJS)               // Dean Edwards p,a,c,k,e,d unpacker (dart: js_packer)
unpackJsAndCombine(scriptBlock)  // unpacks every packed block in a page
parseDates([strings], format, locale)
evaluateJavascriptViaWebview(url, headers, scripts, time = 30)
createHlsProxyUrl(url, headers = {})
parseEpub(url) / parseEpubChapter(url, name)
```

Two of these matter for this repo:

- **`unpackJs`** is the same unpacker the app's native extractors use. Vidhide-style embeds that QuickJS cannot `eval` (no `eval` of remote code, and the packer output is huge) become readable with `const code = unpackJs(scriptBlock)`.
- **`createHlsProxyUrl(url, headers)`** returns a loopback URL whose playlist is rewritten so every segment/key request carries the headers. It is the escape hatch for an m3u8 whose CDN rejects the player's own Referer. Prefer plain `headers: {Referer}` first; only proxy when playback still fails.

### Crypto limits worth knowing

- `decryptAESCryptoJS` implements CryptoJS's `Salted__` container only: base64 → bytes 8–16 are the salt, payload starts at byte 16, key/iv from MD5 `EVP_BytesToKey` (key = first 32 bytes, iv = next 16), AES-CBC/PKCS7.
- Kuronime's `{ct, iv, s}` payload (CryptoJSAesJson) is **not** that container: it ships the iv and salt separately. `cryptoHandler(ct, iv, passphrase, false)` is the closest fit — it decrypts raw AES-CBC with a *literal UTF-8* key string, which matches only if the site's passphrase is the 16-byte key. If it does not, the key derivation has to be done in JS (`00-util.js`) before calling `cryptoHandler`, or the cipher implemented locally.

### 4A. Cloudflare, ads, and what the extension actually controls

This is the part the reference repos cannot show, because none of them implement a bypass — they rely on the app. Verified in `lib/services/http/m_client.dart`, `lib/modules/webview/`, and `lib/eval/javascript/`.

**Detection.** `isCloudflare(response)` is true **only** when the response carries `cf-mitigated: challenge`. A plain `server: cloudflare` header is not treated as a challenge, because the origin can still answer a normal 403/503 through Cloudflare.

**Resolution.** `ResolveCloudFlareChallenge extends RetryPolicy` (max 2 attempts) runs on any response `isCloudflare()` accepts:

1. If `CfProxyStore.url` is set (Settings → General → FlareSolverr/Byparr URL), it POSTs
   `{"cmd":"request.get","url":<target>,"maxTimeout":60000}` to that endpoint, waits for
   `status: "ok"`, concatenates `solution.cookies` into a `Cookie` header, reads
   `solution.userAgent`, and calls `MClient.setCookie(target, ua, null, cookie)`.
2. Otherwise, if the platform is not Linux, it POSTs `{"url": <target>}` to the app's own
   loopback resolver (`http://localhost:<cfPort>/resolve_cf`). That resolver opens a headless
   WebView, polls `CookieManager` until a `cf_clearance` cookie appears (15 s cap), then
   captures `navigator.userAgent` and stores both. On Linux there is no resolver, so the
   app tells the user to configure FlareSolverr/Byparr.

**Persistence and replay.** `MClient.setCookie` writes `{host, cookie}` into the settings
repository and stores the UA app-wide. `MCookieManager.interceptRequest` then attaches those
cookies **and** the stored UA to every subsequent request from any extension, unless the
request already set `Cookie`/`User-Agent`. `_hostsMatch` accepts exact hosts and
subdomain/superdomain pairs, so cookies captured on `www.example.com` also go to
`example.com`.

**What `hasCloudflare: true` does.** Nothing at request time. It is persisted on the source and
used by `manga_home_screen.dart` when a source view errors: the error card gets a secondary
"webview" action that pushes `/mangawebview` with `{url: baseUrl, sourceId, hasCloudFlare}`.
The WebView loads the site, the user solves anything interactive, and the resulting cookies/UA
are captured back into settings. So the flag is a UI hint that manual resolution is worthwhile.

**What an extension must do.** Only:

- Send browser-like headers. `src-shared/10-provider.js` sends a desktop Chrome UA, an
  `Accept` header and `Accept-Language: id-ID,id;q=0.9,...`; sources can override
  `userAgent()` when a site gates on a specific UA string (Samehadaku: a bare `Mozilla/5.0`
  or `curl` UA gets 403 "Just a moment...", a full Chrome UA gets 200).
- Set `hasCloudflare: true` on sources known to sit behind Cloudflare, so the manual path is
  offered.
- Never attempt to solve a challenge in JS. There is no browser API in QuickJS for it, and
  the app deliberately centralises this so cookies stay consistent across extensions.

**Ads.** No ad blocking exists in the extension runtime and none is added here. Ads are
avoided by design: we never render the ad-bearing player page, we request the embed page,
extract the media URL, and hand that to the native player with the headers it needs. For
packed/obfuscated players the heavy lifting is native (`mp4UploadExtractor`,
`streamWishExtractor`, `filemoonExtractor`, `doodExtractor`, …) or `unpackJs`. Hosts whose
stream only exists inside a full browser session (abyssplayer, gdplayer, Mega) are reported as
unsupported instead of being reverse-engineered; the app's own WebView button remains as the
manual fallback.

**Repo/index fetching.** The app downloads the raw `anime_index.json`. If its first byte is
`[` it parses the legacy array and also fetches `repo.json` from the same directory for
`name`/`website` (and an optional `index_v2` redirect). `repo.json` therefore is
`{"name": "...", "website": "https://github.com/<user>/<repo>"}`; our generator keeps extra
keys (`githubUser`, `githubRepo`, `branch`) which the app ignores.

---

## 5. Conventions chosen for this repo

Compared across `kodjodevf`, `sugoi-modules`, `m2k3a`, `mallyd`, `swak`:

| Topic | Official / most common | Our choice |
|---|---|---|
| Directory | `javascript/anime/src/<lang>/<name>.js` | same, `src/id/*.js` |
| `pkgPath` | relative to `javascript/` | same |
| Class name | `DefaultExtension` | same |
| `episodes` vs `chapters` | anime uses `episodes` | `episodes` |
| `link` style | relative path | relative path, resolved against current base URL |
| Icons | `javascript/icon/<lang>.<name>.png` for community repos; official uses per-source dirs | `icons/id.<name>.png` and referenced by absolute raw URL |
| Index | one `index.json` (manga) / `novel_index.json`; anime index exists in forks | `anime_index.json` only, generated by `scripts/generate-index.js` |
| Build step | none, single file per source | small `scripts/build.js` inlining `src-shared/*` — final output stays single-file |

Note on `id` in community repos: `Mallyd11` and `Swakshan` indexers use a 32-bit `h*31+c` hash of `mangayomi-js-{lang}.{name}`, which matches neither the app's `Source.fromJson` nor the official generator — their ids only agree with each other by luck. We follow the **app's** real behaviour (replay-tested, §3), because that is what decides whether a source survives an update.

`itemType: 1`, `typeSource: "single"` for all nine sources.

### Base-URL preference is mandatory

Every site in scope rotates domains. Store **relative** links (`/anime/x/`), and read the base URL in one place:

```js
getBaseUrl() {
  const override = new SharedPreferences().get("base_url");
  return (override && override.trim() ? override.trim() : this.source.baseUrl).replace(/\/+$/, "");
}
```

`this.source.baseUrl` is the value from the index entry (the default), and the preference edit-text overrides it. This keeps existing library records pointing at slugs, not at dead hosts.

---

## 6. Limits we accept

- **No `atob`, no `URL`, no `TextDecoder`**: decode base64 by hand; build URLs with string ops.
- **No timers**: no request timeouts/retry loops beyond a few sequential attempts.
- **No `eval` of remote code** beyond the provided `unpackJs`/`deobfuscateJsPassword` helpers — irrelevant for us anyway.
- **No WebView fetch inside a method** except `evaluateJavascriptViaWebview`, which needs the app's CF/WebView plumbing; only Samehadaku's series page uses it, as a fallback after a refused request.
- **QuickJS memory is small**: avoid holding whole HTML blobs in several copies; parse once per page.
- **No streaming parser** — `new Document(html)` materialises the tree; pages > ~2 MB are slow but workable.
- **Parallelism**: `Promise.all` works, but every request goes through the app's HTTP client; keep concurrency to ≤ 4 and don't fan out over all servers at once on mobile data.

---

## 7. Verification status

| Claim | Verified how |
|---|---|
| Base class, method names, install flow | Read `lib/eval/javascript/service.dart`, `lib/services/fetch_sources_list.dart`, `lib/services/extension_store_service.dart` |
| Return shapes | Read `lib/eval/model/{m_pages,m_manga,m_chapter}.dart`, `lib/models/video.dart`, `lib/eval/model/filter.dart`, `lib/eval/model/source_preference.dart` |
| DOM API surface | Read `lib/eval/javascript/dom_selector.dart`, `lib/utils/extensions/dom_extensions.dart` |
| Client options | Read `lib/eval/javascript/http.dart`, `lib/services/http/m_client.dart` |
| Extractor helpers | Read `lib/eval/javascript/extractors.dart` |
| `id` algorithm | Reproduced against real ids in `kodjodevf/mangayomi-extensions/index.json` (114 JS entries), `sugoi-modules`, `m2k3a`, `mallyd`, `swak`; Dart VM hash source in `runtime/vm/hash.h`. Every mismatch traced to an explicit `"id"` in the source block. |
| `itemType` enum order | Read `model/source.dart` (`enum ItemType { manga, anime, novel }`) |
| No `atob` | Confirmed by absence in `dom_selector.dart`/`utils.dart` and by community sources hand-rolling base64 |

Not testable from here (needs a device): actual player behaviour, `headers` honoured by the native player on every platform, WebView-based CF bypass. These go on the manual-test list in the README.

# Menambah sumber baru

Setiap sumber adalah **satu file** di `src/id/<nama>.js`. File itu di-inline
dengan `src-shared/*.js` oleh `npm run build`; yang dipasang Mangayomi adalah
hasil build di `javascript/anime/src/id/<nama>.js`.

## Langkah

1. **Riset dulu, kode kemudian.** Simpan HTML/JSON asli ke `research/site-samples/`
   (git-ignored) dan tulis temuannya di `research/site-analysis/<nama>.md`.
   Selector tanpa bukti dari halaman asli hampir selalu salah.
2. Buat `src/id/<nama>.js` dengan struktur di bawah.
3. `npm run build && npm run generate`.
4. `npm test -- --source=<Nama>` (fixture) lalu `npm run test:live -- --source=<Nama>`.
5. Perbarui tabel di `README.md` dan `docs/SITE_NOTES.md`.
6. Commit: `feat(<nama>): <ringkasan>`.

## Kerangka file

```js
const mangayomiSources = [{
  "name": "Nama Sumber",
  "lang": "id",
  "baseUrl": "https://contoh.situs",
  "apiUrl": "",
  "iconUrl": "icons/contoh.png",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.1",
  "pkgPath": "anime/src/id/contoh.js",
  "hasCloudflare": true,
  "notes": ""
}];

class DefaultExtension extends IdBaseProvider {
  constructor() {
    super("https://contoh.situs");
  }

  get supportsLatest() { return true; }

  async getPopular(page) { ... }
  async getLatestUpdates(page) { ... }
  async search(query, page, filters) { ... }
  async getDetail(url) { ... }
  async getVideoList(url) { ... }

  getFilterList() { ... }
  getSourcePreferences() {
    return this.basePreferences(["Server A", "Server B"]);
  }
}

// @@INLINE_SHARED@@
```

Aturan yang tidak boleh dilanggar (validator menolaknya):

- `lang` harus `"id"`, `itemType` harus `1`, `pkgPath` harus sama dengan lokasi
  file di bawah `javascript/`.
- `version` naik setiap kali isi file berubah — hanya dengan begitu Mangayomi
  menawarkan pembaruan.
- Setiap preferensi yang dibaca harus dideklarasikan di `getSourcePreferences()`;
  key yang tidak dikenal membuat runtime melempar error.
- Preferensi `base_url` wajib, karena domain situs berpindah.
- Link yang disimpan harus **relatif** (`/anime/x/`), bukan absolut.
- Jangan memakai global yang tidak ada di QuickJS (`atob`, `new URL`,
  `TextDecoder`, `fetch`, `setTimeout`, `require`).

## `getVideoList` yang benar

```js
async getVideoList(url) {
  const doc = await this.fetchDoc(this.resolve(url));
  if (!doc) return [];

  const embeds = [];
  // ...kumpulkan { url, server, quality } dari iframe / data-embed...

  const results = [];
  for (const embed of embeds) {
    const reason = unsupportedReason(embed.url);
    if (reason) {
      console.log(`lewati ${embed.url}: ${reason}`);
      continue;
    }
    const resolved = await extractByHost(this, embed.url, doc.url || url, embed.quality);
    for (const v of resolved.videos) {
      if (embed.server) v.server = embed.server;
      results.push(v);
    }
  }

  return sortVideos(results, this.preferredQualities(), this.preferredServers());
}
```

`extractByHost` sudah mencoba ekstraktor native aplikasi lebih dulu (mp4upload,
streamwish, filemoon, dood, streamtape, voe, vidbom, okru, yourupload), lalu
ekstraktor lokal, dan menormalkan `originalUrl`, `headers`, serta label
kualitas. Jangan menulis ulang logika itu per sumber.

Satu server gagal tidak boleh menggagalkan episode: bungkus setiap host dan
lanjutkan.

## Fixture test

`npm test` offline membaca `scripts/test-harness/fixtures/<file>/map.json`:

```json
{
  "responses": [
    { "url": "https://contoh.situs/", "file": "home.html" },
    { "match": "^https://contoh\\.situs/page/\\d+/?$", "file": "page1.html" },
    { "method": "POST", "match": "admin-ajax\\.php$", "body": "action=nonce", "file": "ajax.json" }
  ]
}
```

`body` (opsional) adalah regex yang diuji terhadap isi POST. Pakai itu bila
beberapa perintah dikirim ke endpoint yang sama — misalnya Otaku Desu memakai
`admin-ajax.php` untuk nonce dan untuk setiap mirror, jadi URL saja tidak cukup
untuk membedakannya.

Permintaan tanpa fixture dianggap gagal — itu disengaja, supaya selector yang
rusak tidak lolos sebagai "halaman kosong".

## Ikon

Taruh di `icons/<nama>.png` (64×64–256×256) dan rujuk **relatif** dari
metadata. `generate-index` mengubahnya menjadi URL raw.

## Jangan

- Menyalin kode ekstraktor dari repo lain; gunakan bridge native atau tulis
  sendiri dengan sumber yang dipahami.
- Menambahkan bypass Cloudflare, login, atau paywall.
- Meng-host ulang konten berhak cipta.

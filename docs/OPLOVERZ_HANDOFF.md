# Oploverz — catatan serah-terima

Status: **selesai.** Kode `src/id/oploverz.js` versi `0.2.0` lulus `npm run check`,
abyssplayer (SoTrym) di-dekripsi dalam JS, dan upbolt dilewati lewat mekanisme
Cloudflare aplikasi + WebView (11 Nov 2026). Dokumen ini merangkum apa yang sudah
jalan, bagaimana dua penghambat lama diatasi, dan dari mana melanjutkan bila perlu.

---

## 1. Yang sudah berfungsi

Semua lewat API JSON publik `https://backapi.oploverz.ac/api`
(`access-control-allow-origin: *`, tanpa Cloudflare):

| Bagian | Sumber | Status |
| --- | --- | --- |
| Populer | `/series?hot=true&sortBy=createdAt-desc` | ✅ |
| Terbaru | `/episodes?sort=latest` (didedup per seri) | ✅ |
| Pencarian | `/series?q=...` | ✅ |
| Filter | `/series?genres=...&sortBy=...` | ✅ |
| Detail + episode | `/series/{slug}` + `/series/{slug}/episodes?pageSize=500` | ✅ |
| Satu episode | `/series/{slug}/episodes/{episodeNumber}` → `streamUrl[]` | ✅ |

- Poster relatif diprefiks `https://backapi.oploverz.ac/uploads/`.
- URL episode internal ekstensi: `/series/{slug}/episode/{episodeNumber}`.
- `episodeNumber` adalah **string**; `releasedAt` kadang placeholder `1970-01-01`
  (ditangani `oploDate`).

## 2. Sebaran server video (survei 200 episode terbaru)

| Host | Porsi | Status di ekstensi |
| --- | --- | --- |
| `upbolt.to` | ±55% | ✅ **dilewati** — Cloudflare aplikasi + WebView (lihat §3) |
| `player.abyssplayer.com` | ±40% | ✅ **di-dekripsi** — SoTrym dalam JS (lihat §4) |
| `www.blogger.com` | ±10% | ✅ didukung (`extractBlogger`) |
| `filedon.co` | sedikit | ✅ didukung (`extractFiledon`) |
| `geo.dailymotion.com` | 5 episode | ❌ terlindungi (`protected_delivery`) |

Akibatnya episode baru (hampir selalu upbolt + abyss) kini bisa diputar: abyss
langsung, upbolt setelah Cloudflare dilewati.

## 3. Penghambat A — upbolt terkunci Cloudflare

Alur yang sudah terbukti (fungsi `upbolt()` di `src/id/oploverz.js`):

1. `streamUrl` memberi `https://upbolt.to/e/<code>` — halaman ini hanya tombol play.
2. Tombol play mengirim `POST https://upbolt.to/dl` dengan body
   `op=embed&file_code=<code>&auto=1&referer=https://oploverz.diy/`.
3. Jawabannya halaman jwplayer berisi
   `file:"https://sNNN.upbolt.to/hls2/01/.../master.m3u8?t=..."` (360p + 480p).
   HLS ini **normal** (segmen biasa, tanpa header khusus) dan ffmpeg memutarnya.

Masalahnya langkah 2:
- Dari `curl` (sidik jari TLS browser-like) → **200**, player keluar.
- Dari Node.js `fetch` **dan dari klien HTTP aplikasi di HP** → **403 "Just a
  moment..."** (halaman tantangan Cloudflare).
- Bukti HP: aplikasi mendeteksi `cf-mitigated` sendiri, menampilkan
  "Cloudflare verification required (HTTP 403) · Resolve challenge", lalu player
  **berputar terus** karena resolver WebView aplikasi menggantung di tantangan ini.

**Cara diatasi (0.2.0):** upbolt sekarang dilewati lewat mekanisme Cloudflare
aplikasi, bukan dibiarkan menggantung:
- `hasCloudflare: true` pada sumber → aplikasi menampilkan tombol "Resolve
  challenge" dan mencoba resolver (FlareSolverr/Byparr, atau WebView headless).
- `upbolt()` mendeteksi jawaban tantangan (`cf-mitigated: challenge` atau teks
  "Just a moment") lewat `oploUpboltChallenge()`.
- Bila resolver aplikasi tidak cukup, `upboltViaWebview()` menjalankan skrip
  `evaluateJavascriptViaWebview(embedUrl, …)`: skrip itu mengulang
  `fetch("/dl", {method:"POST", credentials:"include"})` **di dalam WebView**
  (sidik jari TLS Chromium + cookie `cf_clearance`), mem-poll (max 40 detik)
  sampai master m3u8 muncul, dan mengembalikannya lewat
  `window.flutter_inappwebview.callHandler("setResponse", …)`.
- `upboltFromMaster()` menerjemahkan master (via `hlsVariants`) menjadi daftar
  video; bila semua gagal, `getVideoList` memberi error yang menyebut cara
  melewatkannya.

Ini **menembus proteksi bot pihak ketiga** (kecuali disetujui, dicatat sebagai
pengecualian seperti Samehadaku/Kuronime). Tervalidasi lewat
`research/tools/upbolt_webview_test.js` (403 → WebView → master → 2 varian).

**Catatan penting (diverifikasi 11 Nov 2026, `research/tools/upbolt_webview_live.js`):**
manifest HLS di `sNNN.upbolt.to` pun dibalik Cloudflare. `fetch` dengan
`Accept: video/*` mengembalikan `#EXTM3U` (200) **hanya** dari browser
(sidik jari TLS Chromium + cookie `cf_clearance`); klien HTTP polos (curl, Node
`fetch`, bahkan Node yang diberi `cf_clearance`) dijawab **403** nginx. Akibatnya
upbolt diputar lewat **WebView** (yang punya sidik jari + clearance), bukan lewat
klien HTTP utama aplikasi. Server **abyss** (mp4 progresif tanpa gate) tetap
diputar langsung oleh player utama, jadi episode baru (upbolt + abyss) tetap bisa
diputar lewat server abyss.

## 4. Penghambat B — abyssplayer terenkripsi + anti-ekstraksi (DIPECAHKAN)

`https://player.abyssplayer.com/<id>` memuat, di akhir `window load`:

```js
const datas = "<base64>";               // JSON { slug, md5_id, user_id,
                                         //   media:"<terenkripsi>", config,
                                         //   danmu:{videoId} }
if (window.SoTrym) return window.SoTrym(JSON.parse(atob(datas)));
loadScript("https://iamcdn.net/player-v2/lite.bundle.js")...   // isi SoTrym
```

- `media` adalah blob terenkripsi; kuncinya **tidak** ada di halaman — hanya
  dibuka di dalam `SoTrym` (bundel `lite.bundle.js` tertutup).
- Halaman juga memeriksa `setInterval/setTimeout/open/fetch` `.toString()` untuk
  **mendeteksi otomatisasi** (`isUseExtension`).
**Dipecahkan (0.2.0):** skema dekripsi `media` diurai dari `lite.bundle.js` dan
dibuat ulang dalam JS murni di `src-shared/30-abyss.js` (tanpa `Buffer`/WebCrypto —
QuickJS). Rincian yang terkonfirmasi:
- Pass media = `user_id + ':' + slug + ':' + md5_id` (**string**); `md5Hex = MD5(pass)`.
- Kunci AES-256 = 32 byte ASCII dari string hex 32-char; counter/IV = 16 hex char
  pertama (sebagai ASCII byte); **AES-256-CTR simetris**; input latin1 (charCode
  0-255), output UTF-8.
- Token per-sumber (quirk): pass-nya adalah `size` (NUMBER) dan MD5-nya memaksa
  digit desimal menjadi byte 0-9. Stream = `https://<domain>/sora/<size>/<token>`
  dengan Referer halaman player; `domain = domains.find(d => d.includes(src.sub))`.
- Ekstraksi: `extractAbyss(provider, url, referer, siteQuality)` (dipanggil dari
  extractor host di `src-shared/20-extractors.js`). Multi-kualitas: loop `sources[]`
  (skip `av1`/`status` kosong). **Tervalidasi live**: 480/720/1080p → `206 mp4`
  di subdomain berbeda (lihat `research/tools/abyss_live_purejs.js`,
  `abyss_find_multi.js`). Deteksi otomatisasi (`isUseExtension`) tidak relevan
  karena ekstensi tidak merender bundel — cukup mengambil `datas` dan mendekripsi.
- Risiko: skema SoTrym bisa berubah; bila `extractAbyss` mulai gagal, cek ulang
  `datas`/`lite.bundle.js`.

## 5. Berkas terkait

- `src/id/oploverz.js` — ekstensi (API + upbolt + Blogger/Filedon; abyss via host
  extractor; hanya Dailymotion dilewati).
- `src-shared/30-abyss.js` — dekripsi SoTrym (MD5 + S-box + AES-256-CTR murni) +
  `extractAbyss()`; di-inline ke hasil build oleh `scripts/build.js`.
- `src-shared/20-extractors.js` — `extractAbyss` terdaftar sebagai extractor host
  `abyssplayer.` (bukan lagi "embed tidak didukung").
- `javascript/anime/src/id/oploverz.js` — hasil build (`npm run build`).
- `scripts/test-harness/fixtures/oploverz/` — fixture; `upbolt_player.html` adalah
  halaman player upbolt asli yang tertangkap saat lolos, jadi uji fixture jalur
  upbolt tetap hijau walau live-nya 403.
- `research/tools/` — `abyss_live_purejs.js`, `abyss_find_multi.js`, `upbolt_probe.js`,
  `upbolt_webview_test.js` (uji end-to-end jalur fallback Cloudflare).
- Baris status di `README.md` dan bagian `## 4. Oploverz` di `docs/SITE_NOTES.md`.

## 6. Ringkas: status sekarang

Oploverz kini **siap**: abyss (±40% episode) di-dekripsi langsung dalam JS; upbolt
(±55%) dilewati lewat mekanisme Cloudflare aplikasi + WebView; Blogger/Filedon (±10%)
tetap jalan. Episode baru hampir selalu punya video. Upbolt memang butuh melewati
tantangan Cloudflare — di Linux via FlareSolverr/Byparr (*Settings → General*),
di HP via WebView tombol/resolver aplikasi. Keputusan yang sudah diambil: mengambil
pengecualian "menembus proteksi bot pihak ketiga" untuk upbolt (di atas), dicatat
sebagaimana Samehadaku/Kuronime.

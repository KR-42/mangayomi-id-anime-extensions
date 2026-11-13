# SITE_NOTES — Analisis situs sumber

Catatan ini merangkum hasil Fase 0 (riset langsung dengan `curl`, 2026-11-09) untuk **7 situs
streaming** target. Setiap klaim selector/endpoint di bawah berasal dari HTML/JSON asli yang
disimpan di `research/site-samples/`. Dokumen per-situs yang lebih panjang ada di
`research/site-analysis/<situs>.md`.

> **Di luar cakupan:** Neonime dan Doronime tidak dibangun. Neonime bukan lagi situs
> streaming (katalog TMDB tanpa satu pun link video), dan Doronime hanya menyediakan
> unduhan Google Drive tanpa player. Keduanya tidak masuk `anime_index.json`.

> Konvensi: semua link yang disimpan di library Mangayomi **relatif** terhadap `baseUrl`
> (mis. `/anime/naruto/`), agar pengguna bisa mengganti domain tanpa merusak library.
> Domain diambil dari preferensi `base_url` dengan fallback ke nilai default di bawah.

## Ringkasan status

| Situs | Default domain | Stack | Proteksi | Streaming? | Status implementasi |
|---|---|---|---|---|---|
| Otakudesu | `https://otakudesu.blog/` | WordPress + Animestream | Cloudflare tanpa challenge | Ya (desustream MP4, vidhide HLS) | ✅ selesai — pilot |
| Samehadaku | `https://v2.samehadaku.how/` | WordPress "samehada" | Cloudflare (challenge pada sebagian klien/rute, terutama `/anime/*`) | Ya (Blogger, Filedon, Wibufile, Mega, gdriveplayer) | Sudah dibuat; menunggu uji di aplikasi |
| Kuronime | `https://kuronime.sbs/` | WordPress + WP Rocket | Cloudflare tanpa challenge | Ya (mirror mp4upload, pixeldrain, vidhide) | Siap (diuji di aplikasi) |
| Oploverz | `https://oploverz.diy/` | SvelteKit + Tailwind | Cloudflare (upbolt: challenge; API `backapi.oploverz.ac`: tanpa challenge) | Ya (upbolt HLS via WebView, abyss SoTrym di-dekripsi dalam JS, Blogger, Filedon) | ✅ dibuat 0.2.0 (abyss + upbolt tervalidasi live) |
| Nonton Anime ID | `https://www.nontonanimeid.my.id` | Blogger custom theme | Tidak ada (Google Frontend) | Ya (banyak MP4 langsung + Rumble HLS) | Siap (diuji di aplikasi) |
| AnimeIndo | `https://anime-indo.lol` | PHP klasik | Cloudflare tanpa challenge | Ya (xtwap HLS **1080p**, gdplayer→mp4upload 720p, yourupload MP4) | Siap (1080p CEPAT diverifikasi ffmpeg) |
| Anibatch | `https://www.animebatch.id/` | Next.js App Router (RSC) | Cloudflare tanpa challenge | Ya (BerkasDrive & HiAnime **1080p**, desustream, filedon, vidhide) | Siap (1080p diverifikasi ffmpeg) |
| Animangahub | `https://animeindo.cloud` | Nuxt + API JSON publik | Cloudflare tanpa challenge | Ya (Filedon/Pixeldrain **1080p** via `link.desustream.com`, desustream 720p) | Siap (1080p diverifikasi ffmpeg) |
| Nekopoi 🔞 | `https://nekopoi.care` | WordPress tema `nk-*` | Blokir SNI tingkat ISP di Indonesia (bukan Cloudflare) → **VPN wajib** | Ya (streampoi HLS 360p–1080p sesuai sumber, playmogo DoodStream) | Siap (fixture hijau; uji di HP wajib karena butuh VPN) |

---

## 0. Cloudflare & iklan — bagaimana sebenarnya ditangani

Ini hasil membaca kode aplikasi (`lib/services/http/m_client.dart`, `lib/modules/webview/`,
`lib/eval/javascript/extractors.dart`), bukan dugaan. Ringkasan lengkap ada di
`docs/MANGAYOMI_JS_API_NOTES.md` §4A.

**Cloudflare diselesaikan oleh aplikasi, bukan oleh extension.**

1. Aplikasi menganggap respons kena challenge **hanya** bila header `cf-mitigated: challenge`
   ada. `server: cloudflare` biasa tidak dihitung.
2. `ResolveCloudFlareChallenge` (RetryPolicy, maks 2 percobaan) lalu memilih jalur:
   - Jika pengguna mengisi URL FlareSolverr/Byparr di *Settings → General*, aplikasi POST
     `{cmd:"request.get", url, maxTimeout:60000}` ke proxy itu, mengambil
     `solution.cookies` + `solution.userAgent`, menyimpannya, lalu mengulang request.
   - Jika tidak, aplikasi memakai resolver WebView bawaan (`POST localhost:<port>/resolve_cf`)
     yang menunggu cookie `cf_clearance` muncul, lalu menyimpan cookie + UA. Di Linux jalur
     ini tidak tersedia.
3. Setelah itu setiap request dari extension **otomatis** diberi cookie tersimpan dan UA
   browser oleh `MCookieManager`. Extension tidak perlu (dan tidak bisa) melakukan bypass.

Konsekuensi untuk kita:

- Satu-satunya kewajiban extension adalah **mengirim header yang mirip browser** dan
  menandai `hasCloudflare: true` pada sumber yang memang di belakang Cloudflare. Flag itu
  tidak mengaktifkan bypass apa pun; ia hanya menampilkan tombol "Resolve challenge"/WebView
  pada layar error, yang membuka `baseUrl` agar pengguna bisa menyelesaikan challenge manual.
- Samehadaku adalah kasus **UA-gate**, bukan challenge: 403 "Just a moment..." hanya karena
  User-Agent tidak lengkap. Provider-nya menimpa `userAgent()` dengan UA Chrome desktop.
- Bila semua resolusi gagal, aplikasi menampilkan pesan yang jelas — extension tidak boleh
  mencoba meniru challenge (itu bukan tujuan proyek ini dan mudah rusak).

**Iklan tidak "diblokir"; iklan dihindari.** Extension tidak pernah merender halaman player
berisi iklan. Yang diambil hanya URL stream di balik embed:
`iframe → halaman embed → URL mp4/m3u8`. Untuk host yang memakai player ter-obfuscate,
ekstraktor native Dart aplikasi (`mp4UploadExtractor`, `streamWishExtractor`,
`filemoonExtractor`, dst.) mem-parse-nya; untuk yang lain kita memakai `unpackJs` bawaan
aplikasi (unpacker Dean Edwards yang sama dengan yang dipakai ekstraktor native). Tidak ada
ad-blocker di dalam extension, dan tidak diperlukan.

---

## 1. Otakudesu — `https://otakudesu.blog/`

**Stack/proteksi:** WordPress 5.6.23, tema Animestream, WP Rocket. Cloudflare hadir tetapi
**tidak** mengeluarkan challenge; `curl` tanpa UA pun mendapat HTML identik.

**Listing**
- Ongoing: `/ongoing-anime/`, halaman `/ongoing-anime/page/{n}/`
- Complete: `/complete-anime/`, halaman `/complete-anime/page/{n}/`
- Item: `div.venz > ul > li > div.detpost`
  - link: `div.thumb > a[href]` → `/anime/{slug}/`
  - cover: `div.thumb .thumbz img[src]`
  - judul: `div.thumb .thumbz h2.jdlflm`
  - episode: `div.epz`, hari/skor: `div.epztipe`, tanggal: `div.newnime`
- Paginasi: `div.pagination div.pagenavix a.page-numbers` (halaman terakhir = angka tertinggi)
- Genre: `/genres/{slug}/` — markup berbeda: `div.col-anime-con > div.col-anime`
  (`.col-anime-title a`, `.col-anime-cover img`, `.col-anime-eps`, `.col-anime-studio`,
  `.col-anime-rating`, `.col-anime-genre a`, `.col-synopsis p`)

**Search:** `GET /?s={q}&post_type=anime` — hasil `ul.chivsrc > li` (img, `h2 > a`,
tiga `div.set`). **Maksimal 12 hasil, tanpa paginasi.** Tidak ada filter tambahan.
Pencarian bersifat longgar tetapi tidak pintar: `koe` menemukan `Koe no Katachi`, sedangkan
`koe no katachi` justru 0 hasil. Ini perilaku situs, bukan bug ekstraksi — jangan "perbaiki"
dengan memotong query, karena hasilnya jadi tidak terduga.

**Detail:** `/anime/{slug}/`
- judul: `div.venser div.jdlrx h1`
- cover: `div.fotoanime img.wp-post-image`
- info: `div.infozin div.infozingle p span b` — label: Judul, Japanese, Skor, Produser, Tipe,
  Status, Total Episode, Durasi, Tanggal Rilis, Studio, Genre
- sinopsis: `div.sinopc > p`
- genre: `div.infozingle a[rel="tag"]`
- blok episode: `div.episodelist` dengan heading `span.monktit`
  - episode: `ul li > span > a[href]` (urutan **terbaru → terlama**), tanggal `span.zeebr`
  - batch: blok berjudul `... Batch` → `/batch/{short}-batch-sub-indo/`

**Episode:** `/episode/{short}-episode-{n}-sub-indo/`
- player awal: `div#pembed iframe[src]`
- mirror: `div.mirrorstream > ul.m360p/.m480p/.m720p > li > a[data-content]`
  - `data-content` = base64 dari `{"id":207394,"i":0,"q":"480p"}` (pertahankan `+ / =`)

**Alur AJAX (terverifikasi):**
1. `POST /wp-admin/admin-ajax.php` body `action=aa1208d27f29ca340c92c66d1926f13f`
   → `{"data":"<nonce>"}` (tanpa cookie/Referer)
2. `POST /wp-admin/admin-ajax.php` body `id=<id>&i=<i>&q=<q>&nonce=<nonce>&action=2a3505c93b0035d3f455df82bf976b84`
   → `{"data":"<base64 HTML>"}`; decode base64 → parse `<iframe src>`
   Nonce salah/kosong → `403 {"message":"Forbidden."}`.

**Host video & ekstraksi**
- `desustream.net/dstream/odcdn/?id=...` → `const videoURL = "...mp4"` (MP4 langsung,
  `206` Range OK) → **didukung** oleh `extractDesustream`.
- `desustream.net/dstream/arcg/?id=...` → `var vs = {file:"https://archive.org/..."}` →
  **didukung** oleh `extractDesustream` (pola `file:`).
- `desustream.com/dstream/otakuwatch7|otakuwatch6/...` → halaman pembungkus berisi
  `<source src="https://rr*.googlevideo.com/videoplayback?...">` (MP4 Blogger 360p) →
  **didukung** oleh `extractDesustream` (fallback `<source src>`). Ini mirror yang dipakai
  untuk kualitas 480p/720p sejak sampel lama diambil, menggantikan `odcdn`.
- `desustream.net/dstream/lb/?id=...` → config dikirim sebagai string JSON:
  `otakudesu('{"file":"..."}')`, jadi kuncinya **berkutip**. `extractDesustream` mencocokkan
  `"file":"..."` lebih dulu. Beberapa halaman memuat
  `https://www.googleapis.com/drive/v3/files/?alt=media&key=...` **tanpa id file** — URL itu
  membalas 403, jadi sengaja dibuang (bukan ditawarkan sebagai stream mati).
- `desudrive.com/stream/...` → halaman 300-an byte yang hanya berisi iframe ke host lain
  (mis. `yourupload.com/embed/...`). `extractIframeWrapper` mengambil `src` iframe lalu
  menyerahkannya ke `extractByHost` (kedalaman maksimal 2) — jadi mirror tetap sampai ke
  ekstraktor yang tepat, bukan dianggap host tak dikenal.
- `desustream.net/dstream/updesu/v5/index.php?id=...` dan `.../updesuhd/...` → **tidak**
  membawa `file` sama sekali; halamannya hanya iframe ke
  `www.blogger.com/video.g?token=...`. Dulu mirror ini dilaporkan mati karena
  `extractDesustream` hanya mencari `file`/`<source>`. Sekarang cabang "tidak ada file"
  memanggil helper `followIframe` yang sama dengan pembungkus desudrive, sehingga URL
  Blogger diserahkan ke `extractBlogger` (itag 18, 360p). Verifikasi 10 Nov 2026: mirror
  `updesu` dan `updesuhd` menghasilkan satu video 360p.
- `files.im` / `byse.*` → frontend baru keluarga Filemoon/BYSE. Dirutekan ke
  `filemoonExtractor` native; `FilemoonExtractor` Dart menerima URL apa pun (tidak memeriksa
  host), jadi tidak perlu ekstraktor JS baru.
- `odvidhide.com/embed/...` → JW Player yang di-pack Dean Edwards → `links.hls2` m3u8 →
  **didukung** oleh `extractVidhide` (memanggil `unpackJs` milik aplikasi).
- Mirror bertanda `filedon` di Otaku Desu dilewati dengan pesan eksplisit; embed Filedon
  sendiri bisa diputar (lihat §2).
- `mega.nz` → butuh SDK Mega → **tidak didukung**.
- `nekoclouds` → seluruhnya 302 ke `https://desustream.com/maintenance/`; 0 dari 21 mirror
  menghasilkan stream pada sensus 10 Nov 2026. `upbolt` → `upbolt.to` membalas 403
  "Just a moment..." (Cloudflare). Keduanya dilewati lebih awal di `mirrorsOf` dengan pesan
  eksplisit; tidak ada stream yang hilang.

**Implementasi (Fase 2, `src/id/otakudesu.js`)**
- Popular = `/complete-anime/page/{n}/` (tidak ada rute popularitas; `/popular/` 302 keluar
  situs, parameter urutan → 403). Latest = `/ongoing-anime/page/{n}/`.
- Halaman 1 memakai URL tanpa `/page/1/` karena bentuk itu membalas 301.
- Detail membalik urutan episode (situs: terbaru→terlama) dan melewati blok `Batch` serta
  `Lengkap` — keduanya tidak punya player.
- Filter `Genre` (36 genre) mengarahkan `search` ke `/genres/{slug}/`; tanpa genre, pencarian
  memakai `/?s=`. Daftar genre di-inline karena `getFilterList()` sinkron.
- Nonce di-cache di instance dan diambil ulang sekali bila mirror gagal.
- Tanggal `"9 November,2026"` diterjemahkan ke nama bulan Inggris sebelum `parseDates`,
  karena `Oktober` tidak dikenali rantai fallback aplikasi.
- Cover diambil dari `div.fotoanime img`; sebagian entri (mis. "Replica datte, Koi wo Suru")
  memakai `div.fotoanime` kosong dan hanya menyimpan gambar di `meta[property='og:image']`,
  jadi ada fallback og. Sinopsis punya fallback serupa (`meta[property='og:description']`
  → `meta[name='description']`) untuk halaman yang `div.sinopc`-nya kosong.
- Film/BD punya satu "episode" yang menunjuk halaman yang sama dengan detailnya
  (`/episode/kimi-na-wa-sub-indo/`); `episodesOf` membalik urutan sehingga tetap terbaca
  sebagai satu entri, dan `getVideoList` jalan normal.
- Verifikasi langsung terakhir (10 Nov 2026): 8 episode dari 2 halaman listing menghasilkan
  4–7 video per episode; server yang muncul: vidhide, odcdn, odstream, ondesuhd/ondesu2hd,
  blogs; 19 host CDN berbeda.
- Sensus server (10 Nov 2026, **125 episode**: episode terakhir dari setiap seri di popular
  halaman 1–3 dan latest halaman 1–2) dipakai untuk menyusun daftar `preferred_server`.
  **0 episode tanpa video.** Hasil per label (muncul → menghasilkan stream):
  `vidhide 298→294, odstream 122→122, odstreamhd 73→73, otakuwatch6 57→57,
  otakuwatch6hd 57→57, odcdn 50→50, ondesuhd 25→25, blogs 20→20, ondesu2hd 18→18,
  otakuwatch7 14→14, otakuwatch7hd 14→14, updesu 1→1, otakustream 1→1,
  nekoclouds 21→0`. Episode lama (BD/batch/movie) menambah `playdesu`, `filelions`,
  `pdrain`, `moeplay`, `otakuwatch`, `desuwatch` — semuanya menghasilkan stream.
  `mega` dan `filedon` sengaja tidak ditawarkan karena keduanya host unduhan, bukan stream.
  `ondesuvip` juga tidak ditawarkan: setiap mirror-nya 302 ke
  `drive.google.com/uc?id=` dengan id kosong, jadi mati di sumber dan sekarang dilewati
  lebih awal di `mirrorsOf`. `nekoclouds` (302 ke `desustream.com/maintenance/`, 0/21) dan
  `upbolt` (403 Cloudflare "Just a moment...") juga dilewati lebih awal dengan pesan
  eksplisit. `filesim` tidak pernah muncul di sensus sehingga dikeluarkan dari daftar.
- Server yang masih gagal di lingkungan pengujian: `hadestream` (files.im tidak bisa
  dijangkau dari mesin ini; di aplikasi dirutekan ke `filemoonExtractor` native),
  `mp4load` (native mp4upload), `yourupload` (native yourupload), dan `GDrive`/`GDrive2`
  (`gdriveplayer.me` timeout, tidak ada ekstraktor).
- Pencarian: situs membatasi hasil ke 12 dan **tidak punya paginasi** (`/page/2/?s=` → 403,
  `&paged=2` mengembalikan halaman yang sama), jadi `hasNextPage: false` sudah benar.
  Hasil kosong untuk judul yang jelas ada (mis. "Doraemon", "Conan") adalah perilaku situs:
  `/anime-list/` (1861 judul) memang tidak memuatnya dan REST search ditutup
  (`401 rest_login_required`).

---

## 2. Samehadaku — `https://v2.samehadaku.how/`

**Proteksi:** Cloudflare. UA pendek selalu mendapat 403 "Just a moment...", jadi provider wajib
mengirim UA desktop lengkap, tetapi itu tidak selalu cukup: pada 10 Nov 2026 klien Node dengan
header lengkap tetap mendapat challenge di `/anime/*`, `?s=`, dan sebagian halaman
`/anime-terbaru/page/N/`, sementara `/daftar-anime-2/` dan halaman episode lolos. Ekstensi tidak
mencoba melewatinya: `hasCloudflare: true`, dan `pageDoc` melempar error pada 403/503 supaya
aplikasi menjalankan resolver-nya atau menampilkan tombol WebView. Karena itu `npm run test:live`
bisa gagal di langkah `getDetail` walau ekstensinya benar.

**User-Agent:** permintaan ke situs ini sengaja tanpa `User-Agent`. `cf_clearance` terikat pada UA
yang memperolehnya, dan `MCookieManager` hanya memasang UA tersimpan bila permintaan belum punya
UA (`applyDefaultUserAgent`). Versi 0.1.0 mengirim UA Chrome desktop sendiri, sehingga di HP halaman
`/anime/*` tetap 403 walau challenge sudah selesai. Permintaan ke host embed tetap memakai UA browser.

**WebView (0.1.2, eksperimen):** rekaman di HP (10 Nov 2026) menunjukkan WebView aplikasi membuka
`/anime/*` tanpa challenge, sedangkan klien HTTP aplikasi tetap 403 walau `0.1.1` sudah terpasang.
Halaman detail memakai `evaluateJavascriptViaWebview` lebih dulu (0.1.3), halaman episode hanya
setelah permintaan biasa ditolak. Halaman daftar sejak 0.1.4: halaman 2 dan seterusnya lewat WebView
lebih dulu, halaman 1 hanya setelah ditolak. Ini pengecualian yang disetujui
pemilik repo. Ekstensi tidak mengeklik atau memecahkan verifikasi: bila Cloudflare meminta tindakan
orang, tombol verifikasi aplikasi tetap diperlukan.
`samehadaku.care` hanya halaman placeholder statis, bukan mirror.

**Listing**
- Terbaru: `/anime-terbaru/`, halaman `/anime-terbaru/page/{n}/` — item per **episode**:
  `div.post-show ul li`, link `div.thumb > a[href]`, cover `div.thumb img`
- Semua anime: `/daftar-anime-2/`, halaman **path-based** `/daftar-anime-2/page/{n}/`
  (`?page=` diabaikan) — item: `article.animepost`
  - link: `article.animepost div.animposx > a[href]`
  - cover: `article.animepost img.anmsa`
  - judul: `article.animepost .data .title h2`
  - tipe: `.animposx .type`, status: `.data .type`, skor: `.score`
- Paginasi: `div.pagination span.current`, `a.inactive`, `a.arrow_pag[href]`
- **Filter (GET) di `/daftar-anime-2/`:** `title`, `status` (Currently Airing / Finished Airing),
  `type` (TV|OVA|ONA|Special|Movie), `order` (title|titlereverse|update|latest|popular),
  `genre[]=slug`
- `/genre/<slug>/` **tidak** menampilkan grid (hanya widget) → gunakan `?genre[]=`.
- `/anime-movie/` juga tanpa grid → gunakan `?type=Movie`.

**Search:** `/?s=` mencampur post episode dan batch (satu judul bisa 60 halaman), jadi ekstensi
memakai filter `title` di `/daftar-anime-2/` yang hanya mengembalikan anime.

**Detail:** `/anime/{slug}/`
- judul `h1[itemprop="headline"]`, cover gambar pertama `/wp-content/uploads/`
- sinopsis `.entry-content.entry-content-single`, genre `a[href*="/genre/"]`
- meta: `div.card` → label `span.text-gray-500...w-28`, nilai `span.text-gray-800...font-semibold`
  (Status, Studio, Released, Season, Type, Score, Duration, Total Episode)
- episode: blok `div.max-h-[520px]` setelah heading "List Episode" → baris
  `div.flex.items-center.gap-3.p-2`, link `h4 a[href]`, tanggal `span.text-[11px]`
  (urutan **terbaru → terlama**)
- batch: `/batch/<slug>/`

**Episode:** `/<series-slug>-episode-<N>/` (film/akhir: `...-episode-1-end/`)
- tombol server: `div.server_option div#server ul li` → `div#player-option-N.player-server-btn`
  - label: `button > span`; `data-post`, `data-nume`, `data-type="schtml"`
  - **`data-embed` berisi HTML `<iframe src="...">` yang sudah di-escape** — cukup
    HTML-unescape lalu ambil `iframe[src]`. Tidak perlu AJAX pada halaman yang terverifikasi.
- Fallback AJAX: nonce di `var SamehadaData = {"nonce":"..."}`;
  `POST /wp-admin/admin-ajax.php` body `action=player_ajax&nonce=<n>&post=<post>&nume=<n>&type=schtml`
  → HTML iframe. Nonce salah → `403 -1`.
- Download statis: `div.download-eps ul > li > strong` (kualitas) +
  `div.download-eps-links > span > a` (host).

**Host video**
- Blogger `www.blogger.com/video.g?token=...` → `googlevideo.com/videoplayback` itag 18 MP4
  (IP/expire-bound) → **didukung** `extractBlogger` (harus pilih itag 18; pola `videoUrl` token
  perlu diverifikasi ulang; token di halaman ini berupa parameter `token=`).
- Filedon (label `VIP STREAMING`) → `data-page` embed memuat `props.url`, URL R2 bertanda tangan
  yang juga diterima player situs; `Content-Disposition: attachment` tidak mengganggu player dan
  Range berjalan (206). Berkasnya `.mkv`, jadi tidak ditandai Hardsub → **didukung**.
- Wibufile (`Wibufile 480p/720p/1080p`) → MP4 langsung atau `api.wibufile.com/embed/<uuid>` dengan
  `sources:[{file}]` → **didukung**. Hanya terlihat di sebagian episode.
- `gdriveplayer.to/embed2.php` (`Server 2`) → konfigurasi player disandikan di dalam halaman →
  **tidak didukung**. Pada 10 Nov 2026 ini satu-satunya server di 8 dari 8 episode lama One Piece
  yang diuji (413–804), jadi episode semacam itu tidak punya video.
- Mega → **tidak didukung**.

---

## 3. Kuronime — `https://kuronime.sbs/`

**Proteksi:** Cloudflare tanpa challenge; `curl` UA default pun 200. WP Rocket:
gambar/iframe memakai `data-lazy-src`, iframe player `about:blank`.

**Listing**
- Anime: `/anime/?status=&type=&order=latest`, halaman `/anime/page/{n}/?...`
  - item: `article.bs`; link `div.bsx > a[href]`; cover `img[itemprop="image"]`;
    judul `h2[itemprop="headline"]`; tipe `.bt .type`; skor `.rating i`
- Terbaru (home): `article.bsu`; link `div.bsux > a[href]`; cover `img[itemprop="image"]`;
  episode `.bt .ep`; waktu `.bt .time`
- Film: `/movies/`; genre: `/genres/{slug}/`; studio: `/studio/{slug}/`; season: `/season/{slug}/`
  (markup `div.listupd .sebox`, **bukan** `article.bs`)
- Paginasi: `.pagination a.page-numbers[href]`, `.pagination a.next`
- **Filter (GET) di `/anime`:** `title`, `status` (ongoing|completed),
  `type` (TV|Movie|OVA|Live Action|Special|ONA|Music),
  `order` (title|titlereverse|update|latest|popular), `genre[]`
- **Tidak ada batch** (`/batch/` → 404/redirect).

**Search:** `GET /?s={q}`, halaman `/?s={q}&page={n}` — hasil `div.listupd article.bs`.

**Detail:** `/anime/{slug}/`
- judul `h1.entry-title`; cover `div.l[itemprop="image"] img`
- sinopsis `div.r div.conx h3 span.const`
- meta `div.infodetail ul li` (label `<b>`: Judul, Genre, Status, Studio, Tayang, Season, Tipe, Durasi)
- episode: `div.bixbox.bxcl ul > li`, link `span.lchx > a[href]`, nama dari teks anchor
  (urutan **terbaru → terlama**)

**Episode:** `/nonton-<series-slug>-episode-<N>/`
- HTML berisi `var _0xa100d42aa = "<base64 AES blob>";`
- Pipeline (terverifikasi):
  1. `POST https://animeku.org/api/v9/sources` JSON `{"id":"<blob>"}` (header Origin/Referer
     `https://kuronime.sbs`)
  2. Respons: `{status, token, blog, src, src_sd, mirror, ...}`; setiap field base64 dari
     JSON `{ct, iv, s}` lalu didekripsi AES (format CryptoJSAesJson) dengan passphrase
     **`3&!Z0M,VIZ;dZW==`** (diturunkan dari string table `pintar.js` — bisa berubah jika aset update)
  3. `src` → `{token, src: "<m3u8 1080p>"}`, `src_sd` → 480p, `mirror` → map embed per host
  4. HLS **wajib** header `Origin: https://player.animeku.org` (Referer malah 404)
- Mirror pihak ketiga dari `mirror.embed.v1080p`: filelions/vidhide (packed, tidak didukung),
  dood/dsvplay (DNS gagal), pixeldrain (**didukung**), mp4upload (**didukung**: embed memuat
  `src: "https://a3.mp4upload.com:183/.../video.mp4"`).

**Pengecualian aturan (disetujui pemilik repo, 11 Nov 2026):** satu-satunya jalan ke video
Kuronime adalah mendekripsi data player (AES, passphrase dari skrip player situs) dan mengirim
header `Origin` situs ke API-nya. Ini bertentangan dengan aturan "tidak mengakali proteksi akses"
(abyssplayer/gdriveplayer tetap ditolak); pemilik repo memilih membuatnya sebagai pengecualian,
sama seperti WebView Samehadaku.

**Implementasi (`src/id/kuronime.js` 0.1.0):**
- Tanpa kriptografi buatan sendiri: iv di payload `{ct, iv, s}` sama dengan iv turunan
  EVP_BytesToKey dari salt (terverifikasi 3 dari 3 field), jadi payload dibungkus ulang ke wadah
  OpenSSL `Salted__` lalu didekripsi oleh `decryptAESCryptoJS` bawaan aplikasi.
- Hanya field `mirror` yang dipakai. `src`/`src_sd` (HLS `kuroplayer.xyz`, Origin
  `player.animeku.org`) **tidak** dipakai: segmennya berekstensi `.jpg`
  (`subaru.animekizuna.shop/.../kuronime_static-1-v1-a1.jpg`) dan ffmpeg menolaknya
  ("not in allowed_extensions"), sama seperti Rumble `.tar` di Nonton Anime ID.
- Field `blog` tidak terdekripsi dengan passphrase ini (skema lain) → diabaikan.
- Mirror: mp4upload (360p–1080p, ekstraksi lokal `src: "...mp4"`, Referer mp4upload),
  pixeldrain dan filelions/vidhide (1080p, ekstraktor bersama), doodstream `dsvplay.com`
  (ekstraktor bawaan aplikasi; dari PC domainnya tidak bisa dihubungi).
- Terbaru = `/anime/?order=update` (kartu seri, bukan episode). `getDetail` tetap menerima URL
  episode lewat breadcrumb.
- Risiko: passphrase berubah → dekripsi gagal, log menyarankan perbarui ekstensi.

---

## 4. Oploverz — `https://oploverz.diy/`

**Stack:** SvelteKit (Svelte 5) + Tailwind. Cloudflare tanpa challenge.
**API terbuka:** `https://backapi.oploverz.ac` (`access-control-allow-origin: *`).

**Prioritas: pakai API JSON, bukan HTML.**

| Endpoint | Parameter | Hasil |
|---|---|---|
| `/api/series` | `page`, `pageSize`, `q`, `genres`, `sortBy` | `{meta, data:[series]}` |
| `/api/series/{slug}` | — | `{data: series}` |
| `/api/series/{slug}/episodes` | `page`, `pageSize` | `{meta, data:[episode]}` (terbaru dulu) |
| `/api/episodes` | `page`, `pageSize`, `sort=latest\|oldest` | episode terbaru situs |
| `/api/genres` | `page`, `pageSize` | 53 genre |

- `meta`: `{currentPage, firstPage, lastPage, perPage, total}`
- `sortBy`: `default`, `releaseDate-asc/desc`, `createdAt-asc/desc`, `title-asc/desc`
- `genres` = comma-separated, semantik OR
- `status`/`type` **diabaikan** oleh API → filter di klien
- `poster` bisa absolut atau relatif `posters/...` (prefiks `https://backapi.oploverz.ac/uploads/`)
- `episodeNumber` **string**

**Series object:** `id, seriesId, title, japaneseTitle, slug, description, releaseDate, status,
poster, duration, releaseType, score, genres[], censored, mature, hot, batchDownloadUrl,
createdAt, updatedAt, studio, season, totalEpisodes`

**Episode object:** `id, subbed, title, episodeNumber, downloadUrl, streamUrl, content,
releasedAt, createdAt, updatedAt, series`

**URL**
- Detail serial: `/series/{slug}`; film: `/movie/{slug}`
- Episode serial: `/series/{slug}/episode/{n}`; film: `/movie/{slug}/{episodeId}`
  (**bukan** `/movie/{slug}/episode/{id}`)
- Batch = field `series.batchDownloadUrl`, bukan halaman

**Stream:** `episode.streamUrl[]` = `{source, url}`; iframe src = `url` verbatim.
- Baru: `player.abyssplayer.com/...` → konfigurasi terenkripsi **SoTrym** —
  **di-dekripsi dalam JS** (MD5 + AES-256-CTR murni, `src-shared/30-abyss.js`),
  menghasilkan URL `/sora/` multi-kualitas. Lihat blok "Selesai" di bawah.
- Lama: `www.blogger.com/video.g?token=...` → itag-18 MP4 (**didukung** `extractBlogger`).
- Film: `{source:"okru", url:"<videoId>"}` → `https://ok.ru/videoembed/{id}` → `hlsManifestUrl`
  bertanda tangan (**ekstraktor belum ada; bisa ditambah `extractOkRu`**).

---

**Oploverz ditunda (10 Nov 2026):** survei 600 episode API menunjukkan 77 dari 100 episode terbaru
hanya punya `abyssplayer` (tidak didukung), dan sisanya kebanyakan `upbolt` (403). Blogger/Filedon
hanya dominan di katalog lama, jadi episode baru hampir tidak bisa diputar.

**Oploverz dibuat (11 Nov 2026):** survei ulang 200 episode terbaru:
`upbolt.to` ±55%, `abyssplayer` ±40%, Blogger/Filedon ±10%, Dailymotion 5 episode.
- API: `/series?hot=true` = Popular (13 seri), `/episodes?sort=latest` = Terbaru (didedup
  per seri), `/series/{slug}/episodes/{n}` = satu episode. `pageSize=500` per halaman episode.

**Uji HP awal (11 Nov 2026) — DITUNDA, motivasi untuk 0.2.0.** Katalog, detail, dan daftar
episode berjalan, tetapi **video player gagal pada episode baru**:
- Episode `upbolt` → aplikasi menampilkan "Cloudflare verification required (HTTP 403)";
  player **berputar terus** (resolver WebView menggantung di tantangan).
- Episode `upbolt + abyss` → error "tidak ada server yang bisa diputar".
- Jadi **sidik jari TLS klien non-browser** (Node.js `fetch` **dan** klien HTTP HP) kena
  403 di upbolt; `curl` dengan sidik jari browser dijawab 200. Abyss saat itu "embed-only".

**Selesai (11 Nov 2026, `src/id/oploverz.js` 0.2.0):** dua penghambat lama diatasi.
- **Abyss (SoTrym) — di-dekripsi dalam JS.** Halaman player memuat `datas="<base64>"`
  (JSON `{slug, md5_id, user_id, media:"<terenkripsi>", ...}`). Kuncinya tidak ada di
  halaman; diurai dari bundel `lite.bundle.js`: pass media = `user_id + ':' + slug + ':' +
  md5_id` (string), `md5Hex = MD5(pass)`; kunci AES-256 = 32 byte ASCII dari string hex
  32-char, counter/IV = 16 hex char pertama (sebagai ASCII byte), **AES-256-CTR simetris**,
  input latin1 (charCode 0-255), output UTF-8. Token per-sumber punya quirk: pass-nya adalah
  `size` (NUMBER) dan MD5-nya memaksa digit desimal menjadi byte 0-9. Stream =
  `https://<domain>/sora/<size>/<token>` dengan Referer halaman player. Semua di
  `src-shared/30-abyss.js` (MD5 + S-box + AES murni, tanpa `Buffer`/WebCrypto). Tervalidasi
  live: 480/720/1080p → `206 mp4` di subdomain berbeda.
- **Upbolt — dilewati lewat mekanisme Cloudflare aplikasi + WebView.** `hasCloudflare: true`
  mengaktifkan resolve otomatis aplikasi (FlareSolverr/Byparr, atau WebView). Bila `POST /dl`
  tetap dijawab tantangan (`cf-mitigated: challenge`, 403), `upboltViaWebview()` mengulang
  form `POST /dl` **di dalam** WebView (sidik jari TLS Chromium + cookie `cf_clearance`),
  mem-poll sampai master m3u8 muncul, lalu `upboltFromMaster()` menerjemahkan playlist.
  Bila masih gagal, `getVideoList` memberi error yang menyebut cara melewatkannya. Tervalidasi
  lewat `research/tools/upbolt_webview_test.js` (403 → WebView → master → 2 varian).
  Manifest HLS-nya pun dibalik Cloudflare: keluar **200 hanya di browser** (sidik jari TLS
  Chromium + `cf_clearance`); klien HTTP polos (curl/Node, bahkan dengan `cf_clearance`) 403 —
  diverifikasi `research/tools/upbolt_webview_live.js` (fetch same-origin `Accept: video/*` →
  `#EXTM3U`). Artinya upbolt diputar lewat **WebView**, sedangkan server **abyss** (mp4 progresif,
  tanpa gate) yang diputar langsung oleh player utama aplikasi.
- Dailymotion (`geo.dailymotion.com`, `protected_delivery`) tetap tidak didukung.

**Catatan uji HP lanjutan:** episode baru kini punya video — abyss langsung (tanpa WebView),
upbolt setelah Cloudflare dilewati (FlareSolverr di Linux, atau WebView di HP). Episode lama
Blogger/Filedon tetap bisa diputar.

Lihat `docs/OPLOVERZ_HANDOFF.md` untuk rincian teknis.

---

## 5. Nonton Anime ID — `https://www.nontonanimeid.my.id`

**Stack:** Blogger (Google Frontend, `Server: GSE`). Tanpa proteksi.
**Penting:** listing/search/paginasi dibangun dari Atom feed Blogger, bukan HTML.

**Feed:** `GET /feeds/posts/summary?alt=json&start-index={n}&max-results={m}`
- total: `feed.openSearch$totalResults.$t`
- entri: `feed.entry[]`
  - permalink: `entry.link.find(l => l.rel === "alternate").href` (**jangan** ambil link lain)
  - judul: `entry.title.$t`
  - thumbnail: `entry.media$thumbnail.url` → ganti `/s\d+(-c)?/` → `/w240-h336-c-rw/`
  - label: `entry.category[].term` (genre, `Ep N`, `Ongoing`, `Sub`, tipe, studio)
- `PER = 15` untuk "terbaru"; pencarian `PER = 18`

**Search:** `GET /feeds/posts/summary/-/{Label...}?alt=json&max-results=18&q={q}&start-index={n}`
- Filter genre/tipe/status = label path (AND). `year` memakai tanggal publish (tidak berguna;
  situs menulis ulang publish date).

**Popular:** Firebase `GET https://nontonanimeid-47b40-default-rtdb.firebaseio.com/views/{YYYY-MM-DD}.json?orderBy="c"&limitToLast=40`
(tanggal WIB). Fallback: feed terbaru.

**Detail** (satu halaman per serial; `YYYY/MM` adalah bulan publish asli, jangan dikonstruksi):
- judul `.post-page-title`; cover `.bixbox .poster-thumb img`
- info `.sinoposis p` (label `Judul`, `Judul Alternatif`, `Status`, `Tipe`, `Episode`, `Genre`)
- genre `.post-tags a[rel='tag']`
- metadata terstruktur `#dagView` (`data-id`, `data-url`, `.dv-img[data-src]`, `.dv-l`)

**Episode:** tidak ada URL per-episode.
- server: `.server_option .tabs.servers .tablinks` (label Sub Indo / Sub Eng)
- daftar: `ul.serverEpisode > li > .DagPlayOpt[data-embed] > span` (**terbaru → terlama**)
- `data-embed` = URL streaming langsung (MP4 / m3u8 / iframe / `yt:ID`)
- `data-id` duplikat di kedua server — abaikan

**Host video**
- `.mp4` langsung: `s3.animeverse.id`, `my.1anime.site`, `1a-1791.com`,
  `hugh.cdn.rumble.cloud` → **didukung** `extractDirect`
- Rumble `<id>.<caa|baa|gaa>.tar?r_file=chunklist.m3u8` → **tidak bisa diputar langsung**: segmennya
  beralamat `.tar?r_file=media-0.ts`, dan ffmpeg (pemutar Mangayomi) menolaknya ("not in
  allowed_extensions"). Folder CDN yang sama menyajikan file unggahan aslinya sebagai `<id>.aaa.mp4`
  (68 dari 68 post pada 11 Nov 2026, durasi sama) → `nontonRumble` memakai mp4 itu.
- `*.blogspot.com/?combinedurl=<url>[|sub...]` → cukup ambil parameter `combinedurl`
  (**belum didukung; tambah extractor**)
- `urlmp41.blogspot.com/p/embedz.html?data=<base64>` → JSON `{video}` → Dailymotion. Metadatanya
  aktif, tetapi videonya `protected_delivery` dan master HLS menjawab 403 di luar player Dailymotion
  → **tidak didukung**. Pada 10 Nov 2026, 9 dari 116 episode uji tidak punya video karena ini,
  kebanyakan episode paling awal.
- Tata letak post ada tiga: `ul.serverEpisode`, `div.serverEpisode`, dan post film yang tombolnya
  langsung server. Post hasil salinan menyimpan daftar tab lama (mis. episode 207 milik seri lain)
  tanpa tab; hanya daftar yang punya tab yang dipakai.
- Katalog feed hanya 59 judul (39 donghua).
- YouTube `yt:ID` / watch / youtu.be / shorts → normalisasi ke
  `https://www.youtube-nocookie.com/embed/<id>` (**tambah helper**)

---

## 6. AnimeIndo — `https://anime-indo.lol`

**Stack:** PHP klasik + jQuery + LazyLoad. Cloudflare tanpa challenge. `Content-Encoding: zstd`
(Client Mangayomi menangani decompression).

**Listing**
- Terbaru: `/`, halaman `/page/{n}/`
  - item `.ngiri .menu a > .list-anime`
  - link = **episode terbaru** (bukan serial) — strip `-episode-N` atau pakai link `Semua Episode`
  - cover `img.lazy[data-original]` (**bukan** `src` = `/loading.gif`)
  - judul `p`, episode `span.eps`
- Semua: `/anime-list/` (4.643 entri, satu halaman), genre index `/list-genre/`
- Genre: `/genres/{slug}/`, halaman `/genres/{slug}/page/{n}/` — baris `table.otable`
- Film: `/movie/`, halaman `/movie/page/{n}/`
- Baris listing: `td.vithumb a[href]`, `td.vithumb img[src]`, `td.videsc a`,
  `td.videsc span.label` (tipe/durasi/tahun), `td.videsc p.des`

**Search:** form `/search.php?q=` → 302 → `/search/{terms}/`
- **Quirk:** hasil di-cap ~50; `/page/2/` mengembalikan subset berbeda, `/page/3/` identik
  dengan `/page/2/`. **Jangan loop halaman**; ambil halaman 1 (dan opsional 2, dedupe).
- Tidak ada filter tambahan.

**Detail:** `/anime/{slug}/`
- judul `h1.title`; cover `.detail img`; genre `.detail li a[rel='tag']`; sinopsis `.detail p`
- episode: `.ep a[href]` (urutan **naik** 01→N), nama = angka ber-padding
- Tidak ada status/studio/tahun/batch di halaman detail.

**Episode:** `/<slug>-episode-N/` (padding opsional)
- player `#tontonin[src]`
- server `.servers a.server[data-video]`, label = teks anchor (B-TUBE, CEPAT, GDRIVE, MP4, YUP)
- `data-video` otoritatif (bisa relatif, resolve ke base)
- nav `.nav .navi a` (Prev, Semua Episode, Next), download `a[target='_blank']`

**Host video**
- `play.xtwap.top/cepat2.php?url=` dan `hls.php?link=` → JW Player page berisi
  `"file":"https://hls.xtwap.top/.../index.m3u8"` (480/720/1080p). m3u8 **wajib**
  Referer `https://play.xtwap.top/`; CORS dikunci ke origin itu (native player aman).
  → **butuh extractor khusus `xtwap`** (tambah ke registry).
- `play.xtwap.top/btube3.php?url=` → `<source src="googlevideo...">` MP4 IP-bound
  (**embed-only / kemungkinan gagal di perangkat lain**)
- `gdplayer.to/embed/?token` → **DIDUKUNG sejak `40-gdplayer.js`** (`src/id/animeindo.js` 0.1.1):
  embed dikirim dengan satu GET polos, memuat blob AAEncode → dibaca tanpa `eval` (`apx`, `__ts`,
  `__nc`, `__sg`, `kaken`) → `POST base64(apx)` (endpoint `https://gdplayer.to/api/`, sufiks
  `-config` dibuang) dengan `X-Ts`/`X-Nc`/`X-Sg` dan body `kaken` → payload tersegel 1240 char
  base64 → didekripsi AES-256-CBC (PBKDF2-SHA256, 10000 iterasi, salt 16 byte pertama, password
  `SEED+ts+nc`) → `query.host: mp4upload` → `www.mp4upload.com/embed-<id>.html` → MP4 di
  `a4.mp4upload.com:183`. **Label GDRIVE = 720p, bukan 1080p** (judul payload
  `[NontonAnimeID]-TsKd-S2-7-720p--.mp4`). Gateway `gdplayer.to/stream-vid/...` hanya menjawab
  403 ke klien non-browser dan ffmpeg 404, jadi kini **jalan terakhir** — hanya dipakai kalau
  tidak ada sumber lain, supaya tidak muncul baris mati di samping server yang hidup.
- Kartu "terbaru" menaut ke episode dan slug-nya tidak selalu sama dengan slug seri
  (`/chii-fuyo-episode-6/` bukan `/anime/chii-fuyo/`). Situs menjawab 503 "Waktu habis" untuk seri
  yang tidak ada, jadi `getDetail` mengikuti tautan "Semua Episode" di halaman episode.
- Label `GDRIVE` tidak selalu berarti gdplayer: pada sebagian seri lama (Boruto, film) URL-nya xtwap.
- `mp4upload` → file dihapus → **mati**
- `/yup.php?url=` → yourupload embed → `file: 'https://vidcache.net:8161/.../video.mp4'`
  → 302 ke edge MP4 → **bisa ditambah extractor `yourupload`**

**Verifikasi ffmpeg (12 Nov 2026, `animeindo.js` 0.1.1):** satu-satunya server 1080p di
AnimeIndo adalah **CEPAT/xtwap** — One Piece ep1180 `hls.xtwap.top` memutar `1920×1080`,
durasi 00:23:35, seek ke 707 dtk lolos. **GDRIVE/gdplayer adalah 720p** dan tetap 720p;
Boruto ep1/147/293 hanya memberi satu server. Situs ini membalas **503 kosong** kalau
diminta terlalu cepat — ulangi dengan UA browser + Referer sebelum menyimpulkan "tanpa
sumber".

---

## 7. Anibatch — `https://www.animebatch.id/`

**Stack:** Next.js App Router (RSC). Cloudflare tanpa challenge.

**Katalog:** `/?view=all|batch|ongoing|movie&sort=newest|rating|popular|az&genre={slug}&status=Ongoing&q={q}`
- 24 kartu/halaman; paginasi `/page/{n}/?{query sama}`
- kartu `div.anime-grid article.anime-card`
  - link `a.card-title[href]` → `/{slug}/`
  - cover `div.poster-wrap img[src]`
  - judul `a.card-title`; episode terbaru `span.card-update strong`
  - meta `p.card-meta`; status `span.status-badge`

**Search:** `/?q={q}` saja; **tidak** bisa dipaginasi (`&page=2` → 404).

**Detail:** `/{slug}/` — sumber data otoritatif = payload RSC `self.__next_f.push([1,"..."])`
- render: `section.detail-hero h1`, `p.detail-subtitle`, `div.detail-poster img`
- RSC `post`: genres, studio, synopsis, hasBatch, availableEpisodes
- RSC `links[]`: `{id, kind, mode, host, quality, playUrl, url, r2ItemId, provider, filename}`
- episode list (render): `div.episode-grid button[data-episode="episode:<n>"]` (naik)
- batch = `links[]` dengan `kind:"batch"` (tidak ada di HTML render)

**Player:** untuk `mode:"embed"` dengan host `vsys-srv.berkasdrive.com` /
`vsys-meledak.dlgan.my.id` dan path `/hal/streaming/{uuid}`:
1. `GET /api/v1/player/{slug}/{link.id}` → HTML berisi `<main id="player" data-src="...">`
2. `data-src` = `https://direct-download.berkasdrive.com/download/<signed>` → MP4 langsung,
   `Accept-Ranges`, tanpa cookie, kedaluwarsa ~6 jam.
Embed lain: `video.sumantritelnologi.workers.dev/https://desustream.net/...` (desustream),
mp4upload, desudrive, hianime.

**Ekstraksi:** butuh helper untuk mem-parsing RSC (`self.__next_f.push` → unescape `\"` →
JSON), lalu ekstraktor `berkasdrive` (API player → `data-src`). Belum ada → tambahkan.


**Implementasi (11 Nov 2026, `src/id/anibatch.js` 0.1.0):**
- Episode = `/{slug}/#ep=<n>`. `getDetail` dan `getVideoList` membaca payload RSC yang sama
  (`anibatchRsc` memindai string secara manual, karena halaman One Piece mencapai 7 MB).
- Jenis tautan: `episode`, `movie` (episode dari post bertipe MOVIE), `batch` (diabaikan, arsip).
  Sebagian embed `movie` berupa `.rar`; episode yang hanya punya arsip/unduhan tidak ditampilkan.
- Embed lain lewat ekstraktor bersama: `video.sumantritelnologi.workers.dev/<url>` dibuka jadi
  `<url>` (desustream), `odvidhide.com` (vidhide), `filedon.co/embed`, `www.blogger.com`.
- **HiAnime (0.1.1):** `hianime-play.halahgan.com/?anime=&episode=&quality=` adalah API publik,
  bukan proteksi. `hianimeVideos()`: `GET /api/anime/<id>` → cari episode → `versions[]` (per
  resolusi, termasuk **1080p**) → file di `/media/<key>` (MP4 langsung, range OK). Softsub:
  track `.vtt` Indonesia/EN dilampirkan sebagai `subtitles`. Terverifikasi ffmpeg (1080p & 720p).
  Jadi 1080p Anibatch kini dari **dua** server: BerkasDrive (hardsub) dan HiAnime (softsub ID).
- `/api/v1/player/{slug}/{id}` menjawab 404 "Player belum tersedia" untuk link non-BerkasDrive.
- Vidhide sesekali 403 dari CDN-nya → diletakkan terakhir di urutan server bawaan.
  (12 Nov 2026: pada Kuronime, m3u8 Vidhide untuk ep lama bisa menjawab **504** dari CDN-nya
  sendiri; mengekstrak ulang URL segar tidak menolong — itu sisi server, bukan ekstensi.)
- **`gdriveplayer` bukan jalur 1080p yang bisa dipulihkan.** Sensus 21 episode Anibatch
  menemukan **0 hit** `gdriveplayer`; 345 string `gdriveplayer` di RSC One Piece semuanya
  `gdriveplayer.me/embed2.php?link=<drive.google.com>` berlabel `Komikcast (GDrive)` di
  360p/480p, dan `gdriveplayer.me` **tidak pernah menyelesaikan TLS** dari mesin build ini
  (apex `91.209.70.230` membuka TCP/443, handshake timeout 20–60 dtk). Jadi entri itu
  ditutup sebagai tidak bisa dipulihkan, bukan di-bypass. 1080p Anibatch tetap dari
  BerkasDrive (hardsub) + HiAnime (softsub); **5/5 baris HiAnime 1080p diputar** dengan
  resolusi `1920×1080` dan seek tengah video lolos.
- Pencarian `/?q=` satu halaman; filter Tipe/Urutkan/Status/Genre hanya berlaku tanpa kata kunci.
- **Masalah terbuka (11 Nov 2026):** di HP, gulir Populer/Terbaru macet di loading saat memuat
  halaman 2. Dari PC, `/page/2..25/?view=all&sort=...` selalu 200 (<1 dtk, tanpa rate limit,
  tanpa penanda Cloudflare) dan `getPopular(2)` memberi 24 item + `hasNextPage: true`. Belum ada
  log dari aplikasi; dugaan (belum terbukti): resolver Cloudflare aplikasi (`hasCloudflare: true`)
  menggantung. Detail, episode, dan pemutar sudah dikonfirmasi berjalan.
---

## 8. Anoboy — `https://anoboy.at` (`src/id/anoboy.js` 0.1.1)

**Pemilihan domain (11 Nov 2026).** Anoboy punya banyak domain, tetapi **build-nya berbeda**, bukan
mirror: `anoboy.at` (ezyreader, URL `/YYYY/MM/<slug>/`, bisa di-scrape, cepat ±0,3 dtk),
`anoboy.by` (animestream, rapi tapi **lambat 20–27 dtk** → ditolak), `anoboy.ws` (render JS/AJAX →
sulit), `anoboy.be` (mati). Satu parser tak bisa menangani ketiganya. **Dibangun untuk `anoboy.at`.**
Pengaturan menyediakan dropdown "Domain cepat" (hanya domain build ezyreader) + "Domain manual"
untuk domain `.at`-family baru. `getBaseUrl` override: manual > dropdown > default.

**Streaming maksimal 720p** (Blogger + YourUpload); 1080p hanya ada sebagai unduhan (mirrored.to).

**Struktur.** WordPress ezyreader, `hasCloudflare: true` (browsing lolos dari klien biasa; penanda
`cf-mitigated` → error + WebView).
- Kartu `amv` di semua halaman (`<a href rel="bookmark"><div class="amv"><img><h3 class="ibox1">`),
  menautkan ke **episode**. `page/{n}/` untuk paginasi; `a.nextpostslink` = ada halaman berikutnya.
- Terbaru = `/`, "Populer" = `/anime/ongoing/`, Pencarian = `/?s=`, Genre = `/category/<slug>/`,
  Status = `/anime/ongoing|completed/`.
- **Dua format halaman seri:** *series-post* bertanggal `/YYYY/MM/<slug>/` (daftar episode di
  `ul.lcp_catlist`, ada tabel info `td#genre` dll.) dan *term page* `/<slug>/` (episode = kartu
  `amv`). Link dari tab "ongoing/genre" = series-post; dari "terbaru/pencarian" = episode.
- `getDetail`: URL episode (mengandung `episode`) → diresolusi ke term page lewat link feed kategori
  `<base>/<slug>/feed/` di head episode; URL series-post/term dipakai langsung. `episodesOf` memakai
  `ul.lcp_catlist` bila ada, selain itu kartu `amv`. Film = post bertanggal tanpa daftar episode
  tetapi punya `[data-video]` → satu episode "Film".
- Poster = gambar `/img/upload/...`; status Completed dari label episode ("Selesai/END").

**Server (`data-video` proxy lokal).**
- `adsbatch*.php?url=<AD6v5…token>` → bungkus **Blogger**; token dipakai langsung sebagai
  `blogger.com/video.g?token=…` (itag-18 ~720p, **diputar** via `extractBlogger`, terverifikasi ffmpeg).
- `yup/data.php?data=A&data2=B&data3=C&data4=D` → **YourUpload** `yourupload.com/embed/<code>`
  (240/360/480/720, ekstraktor native aplikasi).
- `stream/embed.php?data=…` (film) dan proxy `.php` lain → di-fetch sekali, iframe/host di dalamnya
  diekstrak. `zipy/zip.php` = zippyshare (mati), dilewati.
- Fixture: YourUpload native → di-stub harness, jadi hanya Blogger yang menghasilkan video saat
  `npm run test`; live-nya kedua server jalan.

---

## 9. Animangahub — `https://animeindo.cloud` (`src/id/animangahub.js` 0.1.2)

Situs **berbeda** dari AnimeIndo (anime-indo.lol): nama sama, operator lain. Nuxt + Cloudflare,
semua konten dari API JSON publik `/api/anime-indo/...` (tanpa gerbang).

**API.**
- `/home` → `data.{ongoing,completed,recent_episodes,genre_list,...}` (satu halaman).
- `/ongoing?page=N` → `data.items[]` + `data.pagination.{page,total}` (Populer, berhalaman).
- `/genre/<slug>` → `data.items[]` (satu halaman, ~638 judul).
- `/search?q=&page=N` → `data[]` + `total_page`. Situs ini **tak punya Naruto** (search sah
  mengembalikan 0); harness `search()` kini fallback ke query lain sebelum menilai gagal.
- `/detail/<slug>` → `data.anime` (+ genre[], status, studio, dll.) & `data.episodes[]` (terbaru dulu).
- `/sources/<ep-slug>` → `sources[]` (pemutar utama) + `resolutions[]` (tier mirror).
- Item memakai slug; URL internal `/anime/<slug>`, episode `/episode/<ep-slug>`. Thumb hotlink otakudesu.

**Video.**
- `sources[]`: tipe `iframe_embed` (Blogger langsung), `external_player`/`edge_resolve`
  (desustream.net odcdn, kadang dibungkus `/desustream-proxy?url=` atau worker
  `embed-resolver…workers.dev/?url=`). `amhUnwrap` membuka pembungkus `?url=`, lalu
  `extractBlogger`/`extractDesustream`. **Terverifikasi ffmpeg: Desustream = 1280×720 (720p)**,
  ada di tiap episode.
- `resolutions[]`: hingga **Mp4/MKV 1080p**, mirror Filedon/Pixeldrain/Krakenfiles (didukung) +
  Acefile/GoFile/Mega/VikingFile (unduhan). Mirror di balik `link.desustream.com` — redirector itu
  **tidak perlu diikuti sebagai halaman**: klien memakai `new Client({followRedirects:false})`,
  membaca `headers.location` dari balasan 30x, lalu meneruskan URL aslinya ke ekstraktor host.
  **Sejak 0.1.1 gerbang itu selesai** dan 1080p ikut tampil. Terverifikasi ffmpeg (One Piece
  ep1180): **Filedon 1920×1080** dan **Pixeldrain 1920×1080**, keduanya lolos seek ke tengah
  video; Desustream tetap 1280×720 dan tetap ada di setiap episode.
- **Arsip `[BATCH]` tidak berguna:** `/api/anime-indo/sources/wpoiec-batch-sub-indo` membalas
  `{"resolutions":[],"sources":[]}` (HTTP 200, 32 byte) untuk semua judul yang diuji. 1080p hanya
  ada di episode reguler — jangan buang waktu menyisir batch.

---

## 10. Nekopoi — `https://nekopoi.care` (`src/id/nekopoi.js` 0.1.0, **18+/NSFW**)

Sumber dewasa. `isNsfw: true` di `anime_index.json` — aplikasi menandainya NSFW dan
menyembunyikannya sampai mode NSFW diaktifkan. Semua analisis di bawah berasal dari HTML
asli yang diambil 2026-11-13 (beranda, `/page/2/`, seri, episode, standalone post, pencarian,
genre, kategori, `/genre-list/`, `/hentai-list/`, dan dua halaman embed player).

**Blokir jaringan — VPN wajib, DNS tidak menolong.** Diukur dari jaringan Jakarta
(AS17450 PT Bank Central Asia):

- DNS **sudah** Cloudflare di semua resolver (`104.21.14.33` / `172.67.157.174`). Mengganti
  DNS ke `1.1.1.1` tidak mengubah apa pun.
- Yang diblokir adalah **string SNI di TLS**: `openssl s_client -servername nekopoi.care`
  mendapat 0 byte lalu `write:errno:104` (RST), sedangkan IP yang sama dengan
  `-servername example.com` lolos verifikasi. Port 80 dengan `Host: nekopoi.care`
  menjawab **HTTP 503 "Web Page Blocked"** (halaman proxy, bukan halaman situs).
- `*.streamruby.net` (CDN videonya) diblokir dengan cara yang identik.
- Kesimpulan: **tidak ada trik DNS yang bisa membuka ini.** Satu-satunya jalan adalah
  VPN/proxy. Ekstensi tidak mencoba menembus blokir itu — ia hanya mengurai halaman yang
  berhasil dimuat.

**Struktur halaman (tema `nk-*`).**

- Beranda `/` — `.nk-recommended .nk-ticker a.nk-series-link` (10 seri, thumbnail di dalam
  atribut `original-title` sebagai `<img src>`), `.nk-hentai-grid a.nk-series-link`
  (thumbnail di `background-image` inline), dan `#nk-episode-grid .nk-post-card`
  (10 posting: `h2 a` + `.nk-thumb-crop`). Populer = ticker + grid (satu halaman);
  Terbaru = grid posting, ambil nama/gambar/link dari kartu.
- Pagination **hanya** bentuk path: `/page/N/`, `/search/<q>/page/N/`, `/genres/<slug>/page/N/`,
  `/category/<c>/page/N/`. `?paged=N` diabaikan (mengembalikan halaman 1).
- Seri `/hentai/<slug>/` — `og:title` (judul bersih), `.nk-series-synopsis b` + `p`
  (sinopsis), `.nk-series-poster` (background-image), `.nk-series-meta-list li`
  (`Status`, `Produser`, `Episode`, `Genre`, `Durasi`, `Skor`), `.nk-episode-grid a.nk-episode-card`
  dengan `.nk-episode-badge` (`Ep 1`) dan `.nk-episode-card-title`.
- Pencarian `/search/<q>/` mengalihkan dari `?s=<q>&post_type=anime`. Hasil, genre, dan
  kategori memakai blok yang sama: `.nk-search-results a.nk-search-item` (`.nk-search-info h2`,
  `.nk-search-thumb` inline bg). Satu parser untuk ketiganya.
- Genre: 78 slug terverifikasi dari `/genre-list/`, dipakai sebagai `getFilterList()`.

**Player.** Episode page menyimpan satu iframe per tab di `#nk-player .nk-player-frame`
(`nk-stream-1..3`). Halaman episode juga memuat iframe iklan dan widget Discord, jadi
**jangan** memindai `iframe[src]` begitu saja — hanya di dalam `#nk-player`.

- **Server 1 & 2** → `playmogo.com/e/<id>` (kloning DoodStream; domain "plamogo.com" yang
  beredar di halaman **NXDOMAIN**, `playmogo.com` menjawab 503 + tantangan JSD Cloudflare).
  Ditangani `doodExtractor` native; ada juga fallback JS `extractDoodJs`.
- **Server 3** → `streampoi.com/embed-<id>.html`: JW8 dengan satu
  `sources: [{file:"https://<x>.streamruby.net/hls2/…/master.m3u8?…"}]` dan peta
  `qualityLabels':{"1699":"1080p (1700 kbps)",…}`. Ditangani `extractStreampoi` (JS murni):
  master playlist dipecah lewat `hlsVariants()` menjadi 1080p/720p/480p/360p, dengan
  try/catch kalau CDN menolak (playlist tetap dipakai, label dari `qualityLabels`).
  Inilah jalur yang diuji fixture.
- **Mirror unduhan** (`Mp4Upload`, `Pixel`, `Kraken`, `Mirror [ouo]`) semuanya lewat
  `ouo.io` dan hanya file 360p/480p/720p/1080p untuk diunduh. Sengaja **tidak** ditawarkan
  sebagai stream.

---

## Matriks dukungan ekstraktor

Dua lapis: **native** (global bridge aplikasi, dijalankan Dart — selalu dicoba lebih dulu) dan
**lokal** (`src-shared/20-extractors.js`). Semua hasil dinormalisasi oleh `finishVideos()`:
`originalUrl` = URL embed, `headers` = UA browser + Referer, `quality` = `"720p · Hardsub ID · Host"`.

| Host | Ekstraktor | Lapis | Status |
|---|---|---|---|
| Mp4upload | `mp4UploadExtractor(url, headers, "", "")` | native | Ada |
| Yourupload / vidcache / `/yup.php` | `yourUploadExtractor(url, headers, "", "")` | native | Ada |
| ok.ru (Oploverz film) | `okruExtractor(url)` | native | Ada |
| StreamWish / filelions / hgcloud | `streamWishExtractor(url, "")` | native | Ada |
| Filemoon / files.im / byse.* | `filemoonExtractor(url, "", "")` | native | Ada |
| desudrive `/stream/`, `/iframe` (pembungkus iframe) | `extractIframeWrapper` → `extractByHost` | lokal | Ada (kedalaman maks. 2) |
| DoodStream / dsvplay / playmogo / plamogo | `doodExtractor(url, "")`, fallback `extractDoodJs` | native + lokal | Ada |
| streampoi (JW8 `sources[].file`) | `extractStreampoi` | lokal | Ada (master dipecah via `hlsVariants`, label dari `qualityLabels`) |
| StreamTape | `streamTapeExtractor(url, "")` | native | Ada |
| Voe | `voeExtractor(url, "")` | native | Ada |
| VidBom / vidshare | `vidBomExtractor(url)` | native | Ada |
| desustream / odcdn / odstream | `extractDesustream` | lokal | Ada (`const videoURL`, `file:`, `<source>`; shell iframe → `followIframe`) |
| Blogger `video.g?token=` | `extractBlogger` | lokal | Ada (ambil `googlevideo` itag 18) |
| Vidhide (packed JW) | `extractVidhide` | lokal | Ada — memakai `unpackJs()` bawaan aplikasi |
| xtwap `cepat2.php` / `hls.php` | `extractXtwap` | lokal | Ada (`"file":"...m3u8"`, Referer xtwap) |
| Pixeldrain | `extractPixeldrain` | lokal | Ada (`/api/file/{id}`) |
| Krakenfiles | `extractKrakenfiles` | lokal | Ada (POST JSON `{url}`) |
| Direct mp4/m3u8/webm + Rumble `r_file=chunklist.m3u8` | `extractDirect` | lokal | Ada |
| `*.blogspot.com/?combinedurl=` | `unwrapBloggerWrapper` | lokal | Ada (helper) |
| YouTube `yt:ID` / watch / shorts | `youtubeEmbed` | lokal | Ada (helper → `youtube-nocookie`) |
| BerkasDrive (Anibatch) | — | — | **Belum** — API player → `data-src`, ditambahkan saat Fase Anibatch |
| abyssplayer | — | — | **Tidak didukung** (konfigurasi terenkripsi) — dipakai hanya lewat native |
| gdplayer.to / gdriveplayer.* | `extractGdplayer` | lokal | Ada (AAEncode → POST `kaken` → payload tersegel AES → mp4upload) |
| Mega | — | — | **Tidak didukung** (SDK Mega) |
| Dailymotion (urlmp41) | — | — | **Tidak didukung** (file dihapus), deteksi `DM005` |

`unsupportedReason(url)` mengembalikan label alasan untuk host di tabel bawah, sehingga
`getVideoList` bisa menuliskan "embed tidak didukung" ke log alih-alih gagal diam-diam.

## Keputusan desain yang diturunkan dari riset

1. **Semua link disimpan relatif.** Base URL dari preferensi; perubahan domain tidak merusak
   library. Untuk situs dengan link absolut (AnimeIndo home), konversi ke relatif saat
   disimpan.
2. **Urutan episode selalu naik (terlama → terbaru)** di MChapter. Situs yang menyajikan
   terbaru-dulu (Samehadaku, Kuronime, Otakudesu, Oploverz, NontonAnimeID) harus dibalik agar
   konsisten di library.
3. **Nama episode dibersihkan** dari "Sub Indo"/"Subtitle Indonesia"/"Nonton"/"Streaming",
   tetapi nomor episode dipertahankan. Format: `Episode 6`.
4. **Kualitas & server** mengikuti preferensi pengguna (`preferred_quality`, `preferred_server`),
   lalu diurutkan. Label kualitas: `720p · Hardsub ID · Filedon`. Setiap video juga membawa
   field `server` (nama host) supaya preferensi server bisa dicocokkan tanpa mengandalkan
   label. Nama server dicocokkan **persis** lebih dulu, baru substring sebagai cadangan
   berperingkat lemah: tanpa itu `odstream` (terpilih) menyerobot `odstreamhd` (tidak
   terpilih) hanya karena namanya adalah awalan. **Urutan bawaan = `1080p, 720p, 480p, 360p`**
   (`10-provider.js`): kualitas yang tidak ada di daftar itu selalu dibuang ke ekor, sebaik
   apa pun adanya, jadi menghilangkan 1080p dari daftar berarti mengubur mirror terbaik di
   bawah yang terlemah. Dulu 1080p tidak ada di daftar dan ini yang membuat HD tidak pernah
   muncul di puncak daftar.
5. **Satu server gagal tidak menggagalkan episode.** Setiap host di-`try/catch`, hasil kosong
   diabaikan; jika semua gagal, `getVideoList` mengembalikan daftar kosong dan log alasan.
6. **Host tak didukung ditandai**, bukan dipaksa: dicatat di log dengan `unsupportedReason`,
   dan player tetap punya tombol WebView bawaan aplikasi untuk diperiksa manual.
7. **Selector yang tidak cocok tetap mengembalikan objek.** `selectFirst` yang meleset
   mengembalikan *null-element wrapper* yang truthy, dengan `className`, `text`, dan
   `attr("href")` semuanya `""`. Itu adalah sinyal "tidak ada" yang resmi, jadi
   `hasNextPage` melewati elemen dengan trio kosong tersebut. Tanpa itu, halaman di luar
   jangkauan (mis. `getPopular(999)`) melaporkan `hasNextPage: true` selamanya dan aplikasi
   terus memuat halaman kosong.

## Batasan yang harus diingat saat implementasi

- QuickJS: tidak ada `atob`/`btoa`, `URL`, `TextDecoder`, `fetch`, `setTimeout`, `require`,
  `String.prototype.replaceAll`. Base64 dan UTF-8 harus diimplementasi manual (`00-util.js`).
- `String.prototype.substringAfter/AfterLast/Before/BeforeLast/Between` tersedia.
- Helper native yang tersedia sebagai global: `unpackJs`, `unpackJsAndCombine`,
  `cryptoHandler`, `decryptAESCryptoJS`, `encryptAESCryptoJS`, `decryptAESGCM`,
  `deobfuscateJsPassword`, `createHlsProxyUrl`, `evaluateJavascriptViaWebview`, `parseDates`,
  dan seluruh ekstraktor native di tabel atas.
- `MProvider.getVideoList` membuang elemen dengan `url`/`originalUrl` null → selalu isi ketiganya.
- Cloudflare Samehadaku membutuhkan UA Chrome penuh; provider menimpanya lewat `userAgent()`.
- Rate limit: tidak ada pengujian beban; ekstensi harus berurutan atau `mapLimit` kecil
  (2–3) untuk permintaan per-episode.
- Domain dapat berubah kapan saja; preferensi `base_url` adalah jalur pemulihan utama.

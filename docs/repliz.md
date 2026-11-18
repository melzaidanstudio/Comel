# Repliz — Referensi untuk Comel

> Repliz dipakai sebagai **jembatan koneksi** Comel ke Threads (dan platform lain).
> Dokumen ini adalah rangkuman yang ditulis ulang dari dokumentasi resmi, bukan salinannya.
> Selalu cek sumber aslinya bila ragu: **https://docs.repliz.com/** dan **https://docs.repliz.com/api/introduction.html**.
>
> Dipelajari: **18 November 2026** (changelog terakhir di dokumen: 18 Nov 2026).
> API Repliz berubah cepat (Keyword Watch API baru rilis 18 Nov 2026). Cek
> https://docs.repliz.com/api/changelog.html sebelum mengubah integrasi.

## Daftar isi

1. [Apa itu Repliz](#1-apa-itu-repliz)
2. [Dasar API: base URL, autentikasi, error, paginasi](#2-dasar-api)
3. [Paket & tier akses API](#3-paket--tier-akses-api)
4. [Konsep inti & bentuk objek](#4-konsep-inti--bentuk-objek)
5. [Endpoint penting untuk Comel (detail)](#5-endpoint-penting-untuk-comel)
6. [Webhook](#6-webhook)
7. [Batasan & anti-spam](#7-batasan--anti-spam)
8. [Catatan khusus Threads](#8-catatan-khusus-threads)
9. [Pemetaan ke fitur Comel](#9-pemetaan-ke-fitur-comel)
10. [Indeks semua endpoint](#10-indeks-semua-endpoint)
11. [Inkonsistensi & hal yang belum terdokumentasi](#11-inkonsistensi--hal-yang-belum-terdokumentasi)

---

## 1. Apa itu Repliz

Platform manajemen media sosial (harga dalam Rupiah) untuk mengelola komentar, DM, konten, dan jadwal posting dari banyak platform dalam satu workspace, plus otomasi (balas/hapus/like komentar, DM, AI reply).

| Platform | Komentar | Chat/DM | Jadwal | Konten |
|---|---|---|---|---|
| Facebook, Instagram | ✅ | ✅ | ✅ | ✅ |
| **Threads** | ✅ | — | ✅ | ✅ |
| TikTok, YouTube, LinkedIn, X (Twitter) | ✅ | — | ✅ | ✅ |
| Telegram | — | ✅ | ✅ | ✅ |
| Shopee, WhatsApp, Pinterest | — | — | ✅ | ✅ |

Akun Threads dihubungkan lewat **OAuth resmi Threads** (aplikasi Meta milik Repliz). Jadi Comel **tidak perlu** membuat aplikasi Meta sendiri, tidak perlu menyimpan password Threads, dan semua aksi berjalan lewat Threads API resmi.

Kanal lain: **MCP server** `https://mcp.repliz.com/mcp` (Basic Auth / sign-in), **node n8n**, dan **AI Assistant** di dashboard (Gold).

---

## 2. Dasar API

| | |
|---|---|
| Base URL | `https://api.repliz.com` (semua endpoint di bawah `/public/...`) |
| Format | JSON (`Content-Type: application/json` untuk body) |
| Kunci API | Dashboard → **Settings → Public API** → *Access Key* + *Secret Key* |

### Autentikasi (pilih satu)

| Kredensial | Header | Untuk |
|---|---|---|
| Access Key + Secret Key | `Authorization: Basic base64(AccessKey:SecretKey)` | Akun Repliz sendiri, akses penuh sesuai paket. **Ini yang dipakai Comel.** |
| Access token "Login with Repliz" (OAuth 2.0 + PKCE) | `Authorization: Bearer <access_token>` | Aplikasi yang dipakai pengguna Repliz lain; dibatasi scope. |

- Kunci harus disimpan di server (jangan di browser/repo). Secret Key bisa di-*refresh* di halaman Public API; kunci lama langsung mati.
- Akun **operator** (anggota tim) punya kunci sendiri; `GET /public/me` mengembalikan `type: "operator"`.

### Kode status & error

Body error berbentuk `{ "code": <status>, "message": "<pesan>" }`.

| Status | Arti |
|---|---|
| `400` | Validasi gagal / input salah (pesan menjelaskan field). |
| `401` | Kunci salah / token kedaluwarsa (`token expired`) / dicabut (`unauthorize`). |
| `402` | **Paket tidak mencakup API ini** (`upgrade plan to access this api`), atau batas akun paket tercapai. |
| `403` | Scope Bearer kurang, atau batas jumlah fitur paket (mis. jumlah keyword watch) terlampaui. |
| `404` | Data tidak ada (mis. postingan Threads tidak bisa dibaca). |
| `409` | Konflik status (mis. postingan sudah punya automation/comment sync, match sudah `replied`). |
| `429` | Batas balasan/antrean tercapai; body memuat `retryAt` (contoh: Send Keyword Watch Reply). |

### Paginasi (dua gaya)

1. **Halaman** (data tersimpan di Repliz: account, comment, watcher, report, …): query `page` (mulai 1) dan `limit` (1–100) **wajib**. Respons:
   `{ docs, totalDocs, limit, totalPages, page, pagingCounter, hasPrevPage, hasNextPage, prevPage, nextPage }`.
2. **Kursor** (data langsung dari platform: content, research, content comment): `nextToken` dari respons sebelumnya; `nextToken: ""` = tidak ada halaman lagi.

### Parameter array

Kirim sebagai `accountIds[]=ID1&accountIds[]=ID2` (gaya Axios), juga `types[]=threads`, `tags[]=Brand%20A`.

### ID yang perlu dibedakan

| ID | Asal | Dipakai sebagai |
|---|---|---|
| `_id` akun | Get Account | `accountId` di hampir semua endpoint |
| `generatedId` akun | ID akun di platform | jarang dipakai |
| `_id` komentar | Get Comment (antrean Repliz) | `commentId` untuk Reply/Update Status/Delete Comment |
| `comment.id` | ID komentar di platform | `commentId` di Content API (balas komentar tertentu, like, hapus) |
| `id` konten | ID postingan di platform (Threads: ID Graph API, mis. `18082157540400777`) | `contentId` di Content API |

---

## 3. Paket & tier akses API

| Tier | API yang tersedia |
|---|---|
| Semua paket (termasuk Free) | Me, OAuth token/revoke, Storage (perlu addon storage) |
| **Standard+** | Me (addon), Account, Comment, Contact, Knowledge |
| **Premium+** | + Addon, Schedule |
| **Gold+** | + **Chat, Content, Research, Report, Automation, Template, Comment Sync, Keyword Watch**, koneksi akun via OAuth API |

> ⚠️ Fitur yang dibutuhkan Comel (cari postingan Threads, komentar ke postingan orang lain, Keyword Watch) ada di **Content / Research / Keyword Watch API → wajib Gold**. Di dashboard fitur Research & Keyword Watch tersedia di semua paket, tapi **lewat API hanya Gold**. Paket di bawahnya mendapat `402`.

| Paket | Akun | Operator | Keyword watch | Comment sync | API | Harga (sekali bayar) |
|---|---|---|---|---|---|---|
| Free | 1 | – | 1 | 1 | – (hanya Get Me) | gratis |
| Standard | 20 | 1 | 5 | 5 | terbatas | Rp18.000/bln |
| Premium | 75 | 10 | 20 | 20 | terbatas | Rp29.000/bln |
| **Gold** | 200 | 30 | 50 | 50 | **penuh** | **Rp49.000/bln** (Rp420.000/thn) |

- Pembayaran sekali bayar per 1/3/6/12 bulan, tanpa perpanjangan otomatis.
- **AI**: Setting → AI pakai API key sendiri (Gemini, OpenAI, DeepSeek, Anthropic, OpenRouter, Z.ai, Sumopod, **9router**; OpenAI & 9router menerima *Endpoint* kustom), atau beli **token Repliz** (Rp5.000 per 100.000 token, berjalan di Gemini). AI reply/filter (termasuk `criteria` Keyword Watch) memakai setting ini.
- Webhook tersedia mulai Standard.

---

## 4. Konsep inti & bentuk objek

- **Workspace**: unit utama; kredensial API terikat ke workspace.
- **Account**: profil/halaman yang terhubung. Objek: `_id`, `generatedId`, `name`, `username`, `picture`, `isConnected`, `type` (`threads`, …), `tags`, `additional`, `createdAt`.
  Akun yang putus (`isConnected: false`) harus di-*reconnect* di dashboard (Account Integration → Reconnect) atau lewat OAuth API.
- **Comment (antrean)**: komentar masuk ke akun yang terhubung, status `pending` → `resolved` / `ignored`. Komentar yang ditarik oleh Comment Sync punya `source: "sync"`.
- **Content**: postingan di platform (dibaca langsung dari platform).
- **Contact**: CRM ringan orang yang berkomentar/DM (funnel `new/contacted/interested/won/lost`, tag, catatan, follow-up).
- **Knowledge**: basis pengetahuan untuk AI reply (sumber `text`, `faq`, `url`, `file`), dipakai lewat `knowledgeIds` (maks 5).
- **Report**: log setiap aksi otomasi (`type`: delete/reply/like/message/chat/story/mention, `status` success/error), bisa di-retry.

> **Diverifikasi dengan API asli (18 Nov 2026):** `GET /public/research/threads/content/search` → `{ docs, nextToken }`, ±11 postingan per halaman.
> Field yang muncul: `id, title, description, topic, type (text|album|video), owner{id,name,picture}, medias, url, createdAt`.
> `url` berbentuk `https://www.threads.com/@user/post/CODE`; `owner.id` kosong, `owner.name` = username; `topic` = nama topic tag (bisa kosong);
> tidak ada field `reply` dan tidak ada metrik engagement. `GET /public/me/addon` → `{ account, operator, twitter, storage }`.

### Objek konten (dipakai Research, Content, Keyword Watch, webhook)

```jsonc
{
  "id": "18082157540400777",          // ID Graph API Threads → contentId
  "title": "",
  "description": "teks postingan",
  "topic": "",                         // topic tag (bila ada)
  "type": "text",                      // text | image | video | album | ...
  "owner": { "id": "", "name": "username_penulis", "picture": "https://...", "isVerified": false },
  "medias": [{ "type": "video", "thumbnail": "https://...", "url": "https://..." }],
  "url": "https://www.threads.com/@user/post/SHORTCODE",
  "createdAt": "2026-11-18T07:58:00.000Z",
  "textAttachment": { "text": "...", "link": "" }   // hanya Threads dengan lampiran teks
}
```

> ⚠️ Objek ini **tidak memuat metrik engagement** (like/balasan/repost/share). Statistik per postingan (`GET /public/content/{id}/statistic`) hanya untuk **postingan milik akun sendiri**.

### Objek komentar (antrean)

```jsonc
{
  "_id": "69afe793cb043c8192dcc3c7",   // ID di Repliz → commentId untuk Reply Comment
  "status": "pending",
  "source": "sync",                    // hanya bila dari Comment Sync
  "content": { /* objek konten + statistic.comment */ },
  "comment": {
    "id": "…",                         // ID di platform
    "type": "text", "text": "isi komentar",
    "owner": { "id": "…", "name": "…", "picture": "…" },
    "medias": [], "createdAt": "…", "replies": []
  },
  "accountId": "…", "account": { /* objek akun */ },
  "createdAt": "…", "updatedAt": "…"
}
```

---

## 5. Endpoint penting untuk Comel

### 5.1 Identitas & akun

- `GET /public/me` → `{ id, type: owner|operator, name, email, isEmailVerified, picture, plan: free|standard|premium|gold, expiredAt }`. Semua paket. **Pakai untuk "Tes koneksi" dan cek paket = gold.**
- `GET /public/account?page=1&limit=100&types[]=threads&status=connected` → daftar akun Threads (`_id` = `accountId`).
- `GET /public/account/{accountId}` → detail satu akun. `GET /public/account/count` → jumlah per platform + `limit` paket.
- `GET /public/account/{accountId}/statistic` → statistik akun (Threads: followers + 30 hari: views, likes, replies, reposts, quotes, klik link; demografi bila ≥100 followers).
- Hubungkan Threads via API (Gold, opsional; biasanya cukup lewat dashboard):
  1. `GET /public/account/threads/authorize?redirect=<URL kita>` → `{ url }`, arahkan pengguna ke sana.
  2. Threads redirect ke URL kita dengan `?code=...` → `POST /public/account/threads/connect` body `{ code }` → `{ accountId }` (kode sekali pakai, cepat kedaluwarsa).
  3. Reconnect: `POST /public/account/threads/connect/{accountId}` body `{ code }` (harus akun Threads yang sama).

### 5.2 Research — mencari postingan Threads (Gold, scope `research:read`)

Semua pencarian berjalan **memakai token salah satu akun Threads yang terhubung** (`accountId` wajib) dan dihitung ke kuota **1.500 pencarian/hari per akun** (dibagi dengan Keyword Watch).

**`GET /public/research/threads/content/search`**

| Param | Wajib | Keterangan |
|---|---|---|
| `accountId` | ✅ | Akun Threads yang melakukan pencarian |
| `search` | ✅ | Kata kunci / frasa |
| `sort` | | `TOP` (default) atau `RECENT` |
| `mode` | | `KEYWORD` (default, teks) atau `TAG` (topic tag) |
| `type` | | `TEXT`, `IMAGE`, `VIDEO` |
| `since`, `until` | | Unix detik; **harus berpasangan** |
| `username` | | Hanya postingan dari username ini |
| `nextToken` | | Kursor halaman berikutnya |

Respons: `{ docs: [objek konten], nextToken }`.

**`GET /public/research/threads/content?accountId=…&url=<link postingan>`**: ubah link Threads menjadi objek konten (dapat `id` untuk dibalas).
Hanya **postingan utama** dari **profil publik dengan ≥100 followers**, dalam 1.000 postingan terakhir profil itu. Balasan, akun privat atau kecil, dan postingan lama mengembalikan `404`. Link pendek `/t/{shortcode}` mengembalikan `400`. Mekanismenya: membaca postingan terbaru milik username di link, lalu mencocokkan shortcode.

**`GET /public/research/threads/user?accountId=…&username=…`** → profil: `name, username, picture, isVerified, statistic { follower, like, quotes, replies, repost, views }`.

**`GET /public/research/threads/content/user?accountId=…&username=…[&nextToken=]`** → postingan terbaru seorang user.

### 5.3 Content — berkomentar ke postingan mana pun (Gold, scope `content:*`)

**`POST /public/content/{contentId}/comment`** ← **inti "kirim komentar" Comel**

```json
{ "accountId": "<_id akun Threads>", "text": "isi komentar", "commentId": "<opsional: id komentar di platform untuk membalas komentar tertentu>", "image": { "url": "https://…", "mimetype": "image/png" } }
```

- `contentId` untuk postingan Threads publik = `id` dari Research (search / by URL).
- Respons: `{ "commentId": "<id komentar baru di platform>" }`.
- Gambar didukung di Threads (URL publik langsung ke file).

Lainnya:
- `GET /public/content?accountId=…[&nextToken=]`: daftar postingan akun sendiri.
- `GET /public/content/{contentId}?accountId=…`: detail postingan.
- `GET /public/content/{contentId}/statistic?accountId=…` → `{ like, comment, share, insight }` (postingan sendiri).
- `GET /public/content/{contentId}/comment?accountId=…[&commentId=…][&nextToken=]`: komentar sebuah postingan; dengan `commentId`, yang dikembalikan balasan untuk komentar itu. Item: `{ id, type, text, owner, medias, createdAt, hasReplies }`.
- `DELETE /public/content/{contentId}/comment/{commentId}?accountId=…`: hapus komentar (di Threads komentar orang lain **disembunyikan**, bukan dihapus).
- `DELETE /public/content/{contentId}?accountId=…`: hapus postingan sendiri (Threads didukung).
- Like komentar hanya untuk Facebook/TikTok/LinkedIn. DM ke komentator hanya untuk Facebook/Instagram. **Keduanya tidak tersedia di Threads.**

### 5.4 Comment — antrean komentar masuk di postingan sendiri (Standard+)

- `GET /public/comment?page=1&limit=20[&status=pending|resolved|ignored][&accountIds[]=…][&search=…]`: terbaru dulu.
- `GET /public/comment/{_id}`: satu komentar.
- `POST /public/comment/{_id}` body `{ "text": "...", "image": {…}? }` → balas; status otomatis jadi `resolved`. Respons `{ commentId }`.
- `PUT /public/comment/{_id}/status` body `{ "status": "resolved|ignored|pending" }`: hanya mengubah status di Repliz.
- `DELETE /public/comment/{_id}`: hapus di platform (Threads: disembunyikan) dan dari Repliz.
- Komentar baru datang via webhook `comment` (Threads didukung). Komentar oleh akun sendiri tidak memicu event.

### 5.5 Keyword Watch — pemantau kata kunci Threads di sisi server (Gold, scope `watcher:*`)

Repliz sendiri yang mencari postingan baru orang lain yang mengandung kata kunci, menyaringnya (kata terlarang + kriteria AI), lalu membalas otomatis atau menyimpannya sebagai draft.

**`POST /public/watcher`** → `{ watcherId }`

| Field | Wajib | Keterangan |
|---|---|---|
| `keyword` | ✅ | Satu kata/frasa (≤100 karakter). Mode `KEYWORD`: postingan harus memuat **semua kata** (di teks, deskripsi gambar, artikel, atau topic tag). |
| `filter.mode` | | `KEYWORD` (default) / `TAG` (topic tag) |
| `filter.type` | | `TEXT` / `IMAGE` / `VIDEO` / `""` |
| `filter.username` | | Hanya dari username ini |
| `filter.isIncludeReplies` | | `true` = ikutkan balasan di utas orang lain (default `false`) |
| `excludes` | | ≤20 kata (≤50 karakter); postingan yang memuatnya dilewati tanpa AI |
| `criteria` | | Deskripsi postingan yang mau diambil (≤1.000 karakter), dinilai AI dari Setting AI. Kosong = semua postingan berkata kunci diambil (dan `approval: auto` **tidak boleh**). |
| `accountId` | ✅ | Akun **Threads** yang mencari & membalas (platform lain → `400`) |
| `reply.type` | ✅ | `none` (kumpulkan saja + webhook), `text`, `ai` |
| `reply.text` | jika `text` | ≤500 karakter; `{name}` = username penulis, spintax `{Hai\|Halo}` |
| `reply.prompt` | jika `ai` | ≤2.000 karakter; AI menjawab dalam bahasa postingan |
| `reply.knowledgeIds` | | ≤5 knowledge untuk `ai` |
| `reply.approval` | kecuali `none` | `review` (simpan draft) atau `auto` (kirim sendiri, **wajib ada `criteria`**). Tidak ada default. |

Alur: pencarian tiap **5–60 menit** (adaptif; hanya postingan yang terbit setelah watch dipasang; postingan sendiri dilewati) → `excludes` → AI `criteria` (hasilnya `reason`) → webhook `keyword_match` → balasan (draft atau antre otomatis).

Endpoint lain:
- `GET /public/watcher?page&limit[&accountIds[]][&search]` dan `GET /public/watcher/{id}`. Field: `keyword, filter, excludes, criteria, token (token AI terpakai), status (active|paused), draftCount, accountId, account, reply, checkedAt, nextAt, interval, since, addedAt, totalMatched, totalReplied, errorMessage, heldUntil, heldReason (search_limit|match_limit|judge_limit|rate_limit)`.
- `PUT /public/watcher/{id}`: **ganti semua field** (field yang tidak dikirim dikosongkan). Mengganti `accountId` menghapus hasil sebelumnya dan memulai dari awal.
- `PUT /public/watcher/{id}/status` `{ status: paused|active }`. Saat di-pause, balasan otomatis yang menunggu jadi `skipped` (`paused`).
- `DELETE /public/watcher/{id}`: hapus watch beserta hasil dan draft (balasan yang sudah terkirim tetap ada).
- `GET /public/watcher/{id}/match?page&limit[&status]`: postingan yang ditemukan. Status: `found | draft | queued | replied | failed | skipped`.
  Item: `_id` (= matchId), `postId`, `content` (objek konten + `owner.isVerified`, `link`, `textAttachment`, `reply`, `quotedPost`), `reason`, `reply { type, text, id, isManual, sendAt, sentAt }`, `errorMessage`, `skipReason` (`manual | author_recent | already_replied | reply_limit | reply_busy | rate_limit | paused`).
- `PUT /public/watcher/{id}/match/{matchId}` `{ text }`: ubah draft (status found/draft/failed/skipped).
- `POST /public/watcher/{id}/match/{matchId}/send` `{ text? }`: kirim (masuk antrean balasan akun; `409` jika sudah queued/replied; `429` + `retryAt` jika kena batas).
- `POST /public/watcher/{id}/match/{matchId}/skip`: lewati (skipReason `manual`).
- Retensi: draft 90 hari; queued/failed/skipped otomatis 90 hari; found/replied/skipped manual 60 hari.

### 5.6 Lainnya (ringkas)

- **Comment Sync** `POST /public/listener` `{ contentId, accountId }`: jalankan otomasi ke komentar lama/terlewat di satu postingan sendiri (hanya komentar level atas, umur ≥5 menit). Status, pause, dan remove tersedia.
- **Automation per postingan** `POST/GET/PUT/DELETE /public/automation`, dan **otomasi akun** `PUT /public/account/{id}/automation`: modul `delete`, `reply` (text/keyword/ai, delay, limit per orang, exception/condition, knowledgeIds), `like`, `message`, `chat`, `story`. **Threads hanya menjalankan Reply dan Hide (delete)**.
- **Template** `/public/template`: konfigurasi otomasi yang bisa dipakai ulang.
- **Knowledge** `/public/knowledge` (+ `/source`): basis pengetahuan AI.
- **Report** `/public/report` (+ `/retry`): log aksi otomasi.
- **Schedule** `/public/schedule` (Premium+): posting Threads `text|image|video|album`, `topic`, rantai `replies` (dengan `delay`), `additionalInfo.textAttachment`, `isAiGenerated`, `quotePost`. Caption ≤500 karakter.
- **Storage** `/public/storage/file/init` → upload → `/complete`: hosting media (butuh addon storage).
- **Login with Repliz (OAuth)**: authorize `https://repliz.com/oauth/authorize` (PKCE S256), token `POST /public/oauth/token`, revoke `POST /public/oauth/revoke`. Access token 1 jam, refresh token 30 hari (dirotasi setiap refresh). Tidak diperlukan Comel selama memakai kunci sendiri.

---

## 6. Webhook

- Setup di dashboard: **Settings → Webhook** (Standard+). Maksimal 10 URL, masing-masing dengan **token** pilihan sendiri.
- Saat disimpan, Repliz mengirim event tes `{ "platform":"testing","type":"testing","accountId":"testing","data":{} }`. Semua URL **wajib** menjawab `2xx`, kalau tidak, penyimpanan gagal.
- Setiap request membawa header **`x-token`** berisi token URL tersebut. **Wajib dicek**, tolak jika tidak cocok.
- Jawab `2xx` secepatnya, kerjakan proses berat setelahnya.
- **Tidak ada retry otomatis** (retry manual di *Delivery history*). Urutan event bisa acak. Deduplikasi pakai ID (`data._id`, `data.content.id`, `data.message.messageId`).
- Semua URL menerima event dari **semua akun** workspace. Bedakan dengan `accountId`.

Payload umum: `{ platform, type, accountId, data, raw }` (`raw` = payload asli platform; tidak ada untuk `schedule`).

| `type` | Kapan | Relevan untuk Comel |
|---|---|---|
| `comment` | Komentar baru di postingan akun terhubung (FB, IG, **Threads**, TikTok, YouTube, LinkedIn). `data` = objek komentar antrean | ✅ balas komentar di postingan sendiri (`data._id` → Reply Comment) |
| `keyword_match` | Keyword Watch menemukan postingan Threads yang cocok. `data = { watcherId, content }` | ✅ pengganti/pelengkap trigger |
| `schedule` | Postingan terjadwal terbit/gagal: `data = { id, status, errorMessage?, replies? }` | opsional |
| `chat`, `edit`, `read`, `delivered`, `postback`, `referral` | DM (FB/IG/TikTok/Telegram) | ✗ (Threads tanpa DM) |

---

## 7. Batasan & anti-spam

**Keyword Watch (per akun Threads, gabungan semua watch):**

| Batas | Nilai |
|---|---|
| Balasan | **10/jam, 50/hari**, jeda **3–10 menit** |
| Orang yang sama | Tidak dibalas lagi oleh akun yang sama selama **7 hari** (balasan otomatis) |
| Pencarian | **1.500/hari** (dibagi dengan Search Content Threads) |
| Postingan ditemukan | 100/hari per watch |
| Postingan dinilai AI | 2.000/hari per akun |

- Reset harian tengah malam **UTC** (07.00 WIB).
- Rate limit / peringatan spam dari Threads → akun menunggu 15 menit, berlipat hingga 6 jam.
- Balasan otomatis yang tidak dapat slot dalam 1 jam → `skipped` dengan `skipReason`.
- Banyak watch pada satu akun → tiap watch dicari lebih jarang (≈1,1 menit × jumlah watch).

**Comment Sync / otomasi (Instagram, Facebook, Threads):** jeda 1–3 menit, **30 aksi/jam, 200/hari per akun**, baca 120 komentar/jam.

**Rate limit API umum** (request per menit ke `api.repliz.com`) **tidak dicantumkan** di dokumentasi.

---

## 8. Catatan khusus Threads

- Batas teks: caption/komentar **500 karakter**. Emoji dihitung per byte UTF-8, jadi satu emoji bisa memakan lebih dari 1 karakter.
- Threads tidak mengizinkan aplikasi menghapus komentar orang lain → **"Hide comments"**.
- Tidak ada DM/Conversation untuk Threads. Like komentar dan DM ke komentator juga tidak tersedia.
- Pencarian Research hanya bisa memakai akun Threads yang terhubung. Fitur Mention & Trending masih beta, sehingga akun yang terhubung sebelum fitur mention ada perlu di-reconnect.
- Get Content by URL hanya untuk profil publik ≥100 followers dan postingan utama.
- Statistik akun memuat demografi hanya bila akun ≥100 followers.

---

## 9. Pemetaan ke fitur Comel

> **Status (18 Nov 2026): MVP sudah diimplementasikan** — koneksi via kunci Repliz (Pengaturan), akun dari `GET /public/account`, trigger lewat Research + filter + metrik Lightpanda (hybrid) + Create Comment, balas komentar dari antrean `GET /public/comment?status=pending` + Reply Comment, webhook `POST /api/webhooks/repliz` (x-token) yang memicu balas komentar. Kode: `src/lib/repliz.ts`, `src/lib/engine.ts`. Belum: Keyword Watch, balas komentar pada komentar kita di postingan orang lain.

| Fitur Comel sekarang | Implementasi sekarang | Dengan Repliz | Catatan |
|---|---|---|---|
| Login akun Threads | API token Meta sendiri / cookie / password (Lightpanda) | Akun Threads dihubungkan sekali di dashboard Repliz (OAuth resmi). Comel cukup menyimpan `REPLIZ_ACCESS_KEY` + `REPLIZ_SECRET_KEY` dan memilih `accountId` dari `GET /public/account?types[]=threads` | Menghapus kebutuhan password/cookie/2FA & risiko checkpoint |
| Cari postingan (kata kunci) | Lightpanda scrape `threads.com/search` (tanpa login, ±20 hasil, hanya "Top") | `GET /public/research/threads/content/search` dengan `sort=RECENT/TOP`, paginasi `nextToken`, `since/until` | Resmi & bisa "Terbaru", tapi **tanpa like/balasan/share** |
| Trigger by topic tag | Lightpanda `serp_type=tags` (tag campuran, disaring ulang) | `mode=TAG` di search / Keyword Watch | Lebih tepat |
| Filter waktu | Disaring lokal dari `taken_at` | `since`/`until` di server + `createdAt` | — |
| **Filter viralitas** (like/komentar/share) | Metrik dari JSON scrape | **Tidak tersedia** di Research untuk postingan orang lain | Opsi: (a) tetap ambil metrik via Lightpanda dari URL postingan, (b) hybrid: Repliz untuk cari & kirim, Lightpanda hanya untuk metrik, (c) ganti viralitas dengan `criteria` AI |
| Kirim komentar ke postingan orang | Threads Graph API (`reply_to_id` = fbid, belum teruji) / browser Playwright | `POST /public/content/{id}/comment` dengan `id` dari Research | Resmi, ID pasti benar; perlu Gold |
| Trigger otomatis terjadwal + AI | Scheduler Comel + LLM sendiri (soul/memory) | (a) tetap scheduler Comel + Research + Create Comment, atau (b) **Keyword Watch** (Repliz yang mencari, menyaring dengan AI `criteria`, membalas auto/draft) | (b) membawa batas & anti-spam bawaan (10/jam, 50/hari, 7 hari per orang). AI-nya memakai Setting AI Repliz (bisa 9router), bukan soul.md Comel, kecuali `reply.type: none` lalu Comel yang membuat & mengirim balasan |
| Balas komentar di postingan sendiri | Polling API/scrape profil | Webhook `comment` → `POST /public/comment/{_id}` atau polling `GET /public/comment?status=pending&accountIds[]=…` | Butuh endpoint webhook publik (HTTPS) di Comel |
| Balas komentar pada komentar kita | Scrape tab Replies | `GET /public/content/{postId}/comment?commentId=<id komentar kita>` lalu Create Comment dengan `commentId` | — |
| Tes koneksi | Verify token/cookie | `GET /public/me` (+ cek `plan === "gold"`) dan `GET /public/account/{id}` (`isConnected`) | — |
| Jam aktif, batas harian, jeda per penulis, dry-run, pause | Di Comel | Tetap di Comel (Repliz Keyword Watch punya batas sendiri) | — |

**Variabel lingkungan yang diusulkan:** `REPLIZ_ACCESS_KEY`, `REPLIZ_SECRET_KEY`, `REPLIZ_WEBHOOK_TOKEN`, opsional `REPLIZ_API_BASE=https://api.repliz.com`.

**Pola pemanggilan (TypeScript):**

```ts
const auth = 'Basic ' + Buffer.from(`${process.env.REPLIZ_ACCESS_KEY}:${process.env.REPLIZ_SECRET_KEY}`).toString('base64');
const res = await fetch(`https://api.repliz.com/public/research/threads/content/search?${new URLSearchParams({ accountId, search: 'kuliner bogor', sort: 'RECENT' })}`, { headers: { Authorization: auth } });
if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Repliz ${res.status}: ${e.message ?? res.statusText}`); }
const { docs, nextToken } = await res.json();
```

---

## 10. Indeks semua endpoint

Total **159 endpoint** (dihitung 18 Nov 2026). Tier & scope seperti tertulis di tiap halaman referensi.

### Me

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `GET` | `/public/me/addon` | Get Addon | Standard+ | `profile` |
| `GET` | `/public/me` | Get Me | Every plan, Free included | `profile` |

### OAuth (Login with Repliz)

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/oauth/revoke` | Revoke | Every plan | — |
| `POST` | `/public/oauth/token` | Token | Every plan | — |

### Account

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `GET` | `/public/account/threads/authorize` | Authorize Threads | Gold+ | `account:write` |
| `POST` | `/public/account/threads/connect` | Connect Threads | Gold+ | `account:write` |
| `POST` | `/public/account/threads/connect/{accountId}` | Reconnect Threads | Gold+ | `account:write` |
| `GET` | `/public/account/count` | Count Account | Standard+ | `account:read` |
| `GET` | `/public/account` | Get Account | Standard+ | `account:read` |
| `GET` | `/public/account/{accountId}` | Get One Account | Standard+ | `account:read` |
| `GET` | `/public/account/{accountId}/statistic` | Get Statistic | Standard+ | `account:read` |
| `GET` | `/public/account/tag` | Get Tag Account | Standard+ | `account:read` |
| `DELETE` | `/public/account/{accountId}` | Remove Account | Standard+ | `account:write` |
| `DELETE` | `/public/account/tag` | Remove Tag Account | Standard+ | `account:write` |
| `PUT` | `/public/account/tag` | Rename Tag Account | Standard+ | `account:write` |
| `PUT` | `/public/account/{accountId}/automation` | Update Automation Account | Standard+ | `account:write` |
| `PUT` | `/public/account/{accountId}/tag` | Update Tag Account | Standard+ | `account:write` |

### Comment (antrean komentar)

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `DELETE` | `/public/comment/{commentId}` | Delete Comment | Standard+ | `comment:write` |
| `GET` | `/public/comment` | Get Comment | Standard+ | `comment:read` |
| `GET` | `/public/comment/{commentId}` | Get One Comment | Standard+ | `comment:read` |
| `POST` | `/public/comment/{commentId}` | Reply Comment | Standard+ | `comment:write` |
| `PUT` | `/public/comment/{commentId}/status` | Update Status Comment | Standard+ | `comment:write` |

### Content

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/content/{contentId}/comment` | Create Comment | Gold+ | `content:write` |
| `GET` | `/public/content/{contentId}/comment` | Get Comment | Gold+ | `content:read` |
| `GET` | `/public/content` | Get Content | Gold+ | `content:read` |
| `GET` | `/public/content/{contentId}` | Get One Content | Gold+ | `content:read` |
| `GET` | `/public/content/{contentId}/statistic` | Get Statistic | Gold+ | `content:read` |
| `POST` | `/public/content/{contentId}/like/{commentId}` | Like Comment | Gold+ | `content:write` |
| `POST` | `/public/content/{contentId}/message` | Message Comment | Gold+ | `content:write` |
| `DELETE` | `/public/content/{contentId}/comment/{commentId}` | Remove Comment | Gold+ | `content:write` |
| `DELETE` | `/public/content/{contentId}` | Remove Content | Gold+ | `content:write` |

### Research

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `GET` | `/public/research/threads/content` | Get Content Threads by URL | Gold+ | `research:read` |
| `GET` | `/public/research/tiktok/comment/reply` | List Comment Reply TikTok | Gold+ | `research:read` |
| `GET` | `/public/research/tiktok/comment` | List Comment TikTok | Gold+ | `research:read` |
| `GET` | `/public/research/tiktok/content/photo` | Search Content Photo TikTok | Gold+ | `research:read` |
| `GET` | `/public/research/threads/content/search` | Search Content Threads | Gold+ | `research:read` |
| `GET` | `/public/research/threads/content/user` | Search Content User Threads | Gold+ | `research:read` |
| `GET` | `/public/research/tiktok/content/user` | Search Content User TikTok | Gold+ | `research:read` |
| `GET` | `/public/research/tiktok/content/video` | Search Content Video TikTok | Gold+ | `research:read` |
| `GET` | `/public/research/tiktok/hashtag/search` | Search Hashtag TikTok | Gold+ | `research:read` |
| `GET` | `/public/research/threads/user` | Search User Threads | Gold+ | `research:read` |

### Keyword Watch

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/watcher` | Create Keyword Watch | Gold+ | `watcher:write` |
| `GET` | `/public/watcher/{watcherId}/match` | Get Keyword Watch Post | Gold+ | `watcher:read` |
| `GET` | `/public/watcher` | Get Keyword Watch | Gold+ | `watcher:read` |
| `GET` | `/public/watcher/{watcherId}` | Get One Keyword Watch | Gold+ | `watcher:read` |
| `DELETE` | `/public/watcher/{watcherId}` | Remove Keyword Watch | Gold+ | `watcher:write` |
| `POST` | `/public/watcher/{watcherId}/match/{matchId}/send` | Send Keyword Watch Reply | Gold+ | `watcher:write` |
| `POST` | `/public/watcher/{watcherId}/match/{matchId}/skip` | Skip Keyword Watch Post | Gold+ | `watcher:write` |
| `PUT` | `/public/watcher/{watcherId}/match/{matchId}` | Update Keyword Watch Draft | Gold+ | `watcher:write` |
| `PUT` | `/public/watcher/{watcherId}` | Update Keyword Watch | Gold+ | `watcher:write` |
| `PUT` | `/public/watcher/{watcherId}/status` | Update Status Keyword Watch | Gold+ | `watcher:write` |

### Comment Sync

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/listener` | Create Comment Sync | Gold+ | `listener:write` |
| `GET` | `/public/listener` | Get Comment Sync | Gold+ | `listener:read` |
| `DELETE` | `/public/listener/{listenerId}` | Remove Comment Sync | Gold+ | `listener:write` |
| `PUT` | `/public/listener/{listenerId}/status` | Update Status Comment Sync | Gold+ | `listener:write` |

### Automation (per postingan)

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/automation` | Create Automation | Gold+ | `automation:write` |
| `GET` | `/public/automation` | Get Automation | Gold+ | `automation:read` |
| `GET` | `/public/automation/{automationId}` | Get One Automation | Gold+ | `automation:read` |
| `DELETE` | `/public/automation/{automationId}` | Remove Automation | Gold+ | `automation:write` |
| `PUT` | `/public/automation/{automationId}` | Update Automation | Gold+ | `automation:write` |

### Template

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/template` | Create Template | Gold+ | `template:write` |
| `GET` | `/public/template/{templateId}` | Get One Template | Gold+ | `template:read` |
| `GET` | `/public/template` | Get Template | Gold+ | `template:read` |
| `DELETE` | `/public/template/{templateId}` | Remove Template | Gold+ | `template:write` |
| `PUT` | `/public/template/{templateId}` | Update Template | Gold+ | `template:write` |

### Knowledge

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/knowledge/{knowledgeId}/source` | Create Knowledge Source | Standard+ | `knowledge:write` |
| `POST` | `/public/knowledge` | Create Knowledge | Standard+ | `knowledge:write` |
| `GET` | `/public/knowledge` | Get Knowledge | Standard+ | `knowledge:read` |
| `GET` | `/public/knowledge/{knowledgeId}/source/{sourceId}` | Get One Knowledge Source | Standard+ | `knowledge:read` |
| `GET` | `/public/knowledge/{knowledgeId}` | Get One Knowledge | Standard+ | `knowledge:read` |
| `POST` | `/public/knowledge/{knowledgeId}/source/{sourceId}/refresh` | Refresh Knowledge Source | Standard+ | `knowledge:write` |
| `DELETE` | `/public/knowledge/{knowledgeId}/source/{sourceId}` | Remove Knowledge Source | Standard+ | `knowledge:write` |
| `DELETE` | `/public/knowledge/{knowledgeId}` | Remove Knowledge | Standard+ | `knowledge:write` |
| `PUT` | `/public/knowledge/{knowledgeId}/source/{sourceId}` | Update Knowledge Source | Standard+ | `knowledge:write` |
| `PUT` | `/public/knowledge/{knowledgeId}` | Update Knowledge | Standard+ | `knowledge:write` |

### Report

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `GET` | `/public/report/{reportId}` | Get One Report | Gold+ | `report:read` |
| `GET` | `/public/report` | Get Report | Gold+ | `report:read` |
| `PUT` | `/public/report/{reportId}/retry` | Retry Report | Gold+ | `report:write` |

### Schedule

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/schedule` | Create Schedule | Premium+ | `schedule:write` |
| `GET` | `/public/schedule/{scheduleId}` | Get One Schedule | Premium+ | `schedule:read` |
| `GET` | `/public/schedule` | Get Schedule | Premium+ | `schedule:read` |
| `DELETE` | `/public/schedule/{scheduleId}` | Remove Schedule | Premium+ | `schedule:write` |
| `DELETE` | `/public/schedule/mass` | Remove Schedules | Premium+ | `schedule:write` |
| `PUT` | `/public/schedule/{scheduleId}/retry` | Retry Schedule | Premium+ | `schedule:write` |
| `PUT` | `/public/schedule/{scheduleId}` | Update Schedule | Premium+ | `schedule:write` |

### Contact

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `GET` | `/public/contact/count` | Count Contact | Standard+ | `contact:read` |
| `PUT` | `/public/contact/chat/{chatId}` | Get Contact By Chat | Standard+ | `contact:write` |
| `PUT` | `/public/contact/comment/{commentId}` | Get Contact By Comment | Standard+ | `contact:write` |
| `GET` | `/public/contact/tag` | Get Contact Tag | Standard+ | `contact:read` |
| `GET` | `/public/contact` | Get Contact | Standard+ | `contact:read` |
| `GET` | `/public/contact/{contactId}` | Get One Contact | Standard+ | `contact:read` |
| `DELETE` | `/public/contact/{contactId}` | Remove Contact | Standard+ | `contact:write` |
| `DELETE` | `/public/contact/{contactId}/follow-up` | Remove Follow-up Contact | Standard+ | `contact:write` |
| `PUT` | `/public/contact/{contactId}/follow-up` | Set Follow-up Contact | Standard+ | `contact:write` |
| `PUT` | `/public/contact/{contactId}` | Update Contact | Standard+ | `contact:write` |

### Chat (DM)

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `GET` | `/public/chat` | Get Chat | Gold+ | `chat:read` |
| `GET` | `/public/chat/{chatId}/message` | Get Message | Gold+ | `chat:read` |
| `GET` | `/public/chat/{chatId}` | Get One Chat | Gold+ | `chat:read` |
| `POST` | `/public/chat/{chatId}/pause` | Pause Chat | Gold+ | `chat:write` |
| `POST` | `/public/chat/{chatId}/read` | Read Chat | Gold+ | `chat:write` |
| `POST` | `/public/chat/{chatId}/resume` | Resume Chat | Gold+ | `chat:write` |
| `POST` | `/public/chat/{chatId}/message` | Send Message | Gold+ | `chat:write` |
| `POST` | `/public/chat/{chatId}/action` | Sender Action | Gold+ | `chat:write` |

### Addon

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/addon/pinterest/board` | Create Pinterest Board | Premium+ | `addon:write` |
| `GET` | `/public/addon/instagram/profile` | Get Instagram Profile | Premium+ | `addon:read` |
| `GET` | `/public/addon/link/metadata` | Get Link Metadata | Premium+ | `addon:read` |
| `GET` | `/public/addon/pinterest/board` | Get Pinterest Board | Premium+ | `addon:read` |
| `GET` | `/public/addon/shopee/product` | Get Shopee Product | Premium+ | `addon:read` |
| `GET` | `/public/addon/telegram/channel` | Get Telegram Channel | Premium+ | `addon:read` |
| `GET` | `/public/addon/tiktok/music` | Get TikTok Music | Premium+ | `addon:read` |
| `GET` | `/public/addon/whatsapp/channel` | Get WhatsApp Channel | Premium+ | `addon:read` |
| `DELETE` | `/public/addon/pinterest/board/{boardId}` | Remove Pinterest Board | Premium+ | `addon:write` |
| `PUT` | `/public/addon/pinterest/board/{boardId}` | Update Pinterest Board | Premium+ | `addon:write` |

### Storage

| Metode | Path | Nama | Tier | Scope (Bearer) |
|---|---|---|---|---|
| `POST` | `/public/storage/file/{fileId}/complete` | Complete File Storage | Addon Storage | `storage:write` |
| `GET` | `/public/storage/file` | Get File Storage | Addon Storage | `storage:read` |
| `GET` | `/public/storage/file/{fileId}` | Get One File Storage | Addon Storage | `storage:read` |
| `GET` | `/public/storage/statistic` | Get Statistic Storage | Addon Storage | `storage:read` |
| `POST` | `/public/storage/file/init` | Init File Storage | Addon Storage | `storage:write` |
| `DELETE` | `/public/storage/file/{fileId}` | Remove File Storage | Addon Storage | `storage:write` |
| `DELETE` | `/public/storage/file/mass` | Remove Files (Mass) | Addon Storage | `storage:write` |

Platform lain (facebook, instagram, linkedin, pinterest, shopee, telegram, tiktok, twitter, whatsapp, youtube) punya endpoint koneksi OAuth serupa di `/public/account/<platform>/...` (authorize / exchange / connect / reconnect; Telegram & WhatsApp memakai `session`). Semuanya Gold+ dengan scope `account:write`.

---

## 11. Inkonsistensi & hal yang belum terdokumentasi

- Panduan *Key Features* mencontohkan balas komentar dengan body `{"message": "..."}`, sedangkan referensi **Reply Comment** memakai **`{"text": "..."}`**. Ikuti referensi endpoint (`text`).
- Rate limit umum API (request/menit) dan bentuk error untuk Basic Auth tidak dijelaskan secara eksplisit. Bentuk `{ code, message }` tertulis di panduan OAuth dan tampaknya berlaku umum, tapi perlu diverifikasi saat integrasi.
- Ukuran halaman hasil Research (jumlah item per `nextToken`) tidak dicantumkan.
- Belum jelas apakah hasil Research menyertakan balasan (*replies*) atau hanya postingan utama. Keyword Watch punya `filter.isIncludeReplies`, Research search tidak punya parameter itu.
- Fitur Mention & Trending (dashboard) masih **beta** dan belum punya endpoint API.

## Sumber

- Dokumentasi: https://docs.repliz.com/ · API: https://docs.repliz.com/api/introduction.html
- Changelog: https://docs.repliz.com/api/changelog.html
- Webhook: https://docs.repliz.com/tutorial/webhook.html
- Threads: https://docs.repliz.com/tutorial/platform/threads.html
- Research Threads: https://docs.repliz.com/api/research/search-content-threads.html
- Keyword Watch: https://docs.repliz.com/api/keyword-watch/create-keyword-watch.html
- Create Comment: https://docs.repliz.com/api/content/create-comment.html
- Paket: https://docs.repliz.com/tutorial/plans.html

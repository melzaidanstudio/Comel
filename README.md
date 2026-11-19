# 🐼 Comel — Threads Auto Comment & Reply

Aplikasi pribadi untuk:

1. Terhubung ke Threads lewat **[Repliz](https://repliz.com)** sebagai jembatan koneksi (login resmi Threads, tanpa password/cookie)
2. Mengatur **trigger kata kunci** atau **topic tag**, dengan **filter viralitas** (suka, balasan, repost, share, quote), **filter tag**, **filter waktu**, dan **filter bahasa** (mis. hanya bahasa Indonesia)
3. **Mencari** postingan Threads lewat Repliz (Terbaru/Teratas, rentang tanggal); angka viral diambil **[Lightpanda](https://github.com/lightpanda-io/browser)**
4. Membuat **komentar** otomatis dengan AI di utas yang lolos filter, dikirim lewat Repliz
5. **Membalas komentar** orang di postingan kamu (antrean komentar Repliz + webhook real-time)
6. Kepribadian & pengetahuan AI lewat **`soul.md`** dan **`memory.md`**
7. AI provider bebas: **9router**, OpenRouter, OpenAI, Claude, Gemini, Groq, DeepSeek, Ollama, atau endpoint OpenAI-compatible lain
8. **Jam aktif** (default 06:00–22:00), batas harian, jeda per penulis, dry-run, dan tombol **Pause semua**

## Tech stack

| Bagian | Teknologi |
|---|---|
| Web & API | **Next.js 16** (App Router, Route Handlers di `src/app/api`) |
| UI | **Tailwind CSS v4** + **shadcn/ui** (Radix) |
| Database | **PostgreSQL 16** + **Drizzle ORM** (migrasi di `drizzle/`) |
| Auth dashboard | **better-auth** (email + password, akun admin tunggal) |
| Penjadwal | Proses **worker** terpisah (`src/worker`), kunci per akun via Postgres advisory lock |
| Koneksi Threads | **Repliz Public API** (paket Gold) — referensi: [`docs/repliz.md`](docs/repliz.md) |
| Metrik viral | Lightpanda (`lightpanda fetch` halaman postingan publik) |

---

## Cara kerja

```
 ┌───────────┐ tiap N menit ┌──────────────────┐  postingan  ┌──────────────────────┐
 │  worker   │ ───────────▶ │ Repliz Research  │ ──────────▶ │ filter: kata kunci,  │
 │(scheduler)│              │ (kata kunci/tag) │             │ tag, waktu, penulis  │
 └───────────┘              └──────────────────┘             └──────────┬───────────┘
                                                                        ▼ (bila ada syarat viral)
 ┌────────────────────────┐  teks komentar  ┌──────────────────┐  ┌───────────────────────┐
 │ kirim lewat Repliz     │ ◀────────────── │ AI (soul.md +    │◀─│ Lightpanda: like,     │
 │ POST /content/{id}/    │                 │ memory.md + ins- │  │ balasan, share dari   │
 │ comment                │                 │ truksi) / SKIP   │  │ halaman postingan     │
 └────────────────────────┘                 └──────────────────┘  └───────────────────────┘

 Komentar masuk di postingan sendiri: webhook Repliz `comment` → worker → AI → balas lewat Repliz
```

- Akun Threads dihubungkan **di dashboard Repliz** (login resmi Threads). Comel hanya menyimpan Access Key & Secret Key Repliz (terenkripsi).
- Hasil pencarian Repliz **tidak memuat angka like/balasan/share**; bila trigger punya syarat viral, angka diambil Lightpanda untuk sejumlah kandidat teratas (default 12 per putaran).
- Postingan yang sudah diproses tidak dikomentari lagi. Batas aman default mengikuti pacing Repliz: **10/jam, 50/hari per akun, jeda 3–10 menit, orang yang sama tidak dikomentari lagi selama 7 hari**.
- **Jam aktif** default **06:00–22:00** (diubah di Pengaturan); tiap trigger/akun bisa *Ikuti default*, *Atur sendiri*, atau *24 jam*.

---

## Instalasi di VPS (Docker) — mis. Hostinger VPS

Butuh VPS Linux (x86_64/arm64), RAM ≥ 2 GB, Docker. Semua langkah bisa dari HP lewat **Browser terminal** di hPanel Hostinger (VPS → Kelola → Browser terminal) atau aplikasi SSH (Termius/JuiceSSH).

```bash
git clone https://github.com/melzaidanstudio/comel.git /opt/comel
bash /opt/comel/deploy/install-vps.sh
```

Skrip `deploy/install-vps.sh` (aman dijalankan ulang) akan:
1. memasang Docker bila belum ada;
2. membuat `.env` dengan rahasia acak dan domain gratis `comel.<ip-dengan-minus>.sslip.io`, lalu menanyakan email admin;
3. memilih port lokal yang kosong (`WEB_PORT`, mulai 3100) agar tidak bentrok dengan aplikasi lain di VPS;
4. build & menjalankan `db`, `migrate`, `web`, `worker` (build pertama ±5–10 menit);
5. memasang HTTPS: bila **nginx** sudah memakai port 80/443 → menambah situs nginx + sertifikat Let's Encrypt (certbot), situs lain tidak diubah; bila port 80/443 kosong → memakai Caddy bawaan (profil `https`).

Lalu buka `https://comel.<ip-dengan-minus>.sslip.io` di browser HP → **buat akun admin** dengan email yang sama (hanya `ADMIN_EMAIL` yang diizinkan; setelah admin dibuat, pendaftaran ditutup).

> Repo private: saat `git clone` diminta, isi username GitHub dan **token** (GitHub → Settings → Developer settings → Fine-grained token, akses *Contents: Read-only* ke repo ini) sebagai password.
> Hostinger: bila firewall di hPanel (VPS → Security → Firewall) aktif, pastikan port 80 & 443 diizinkan.
> Simpan `.env` baik-baik — `SECRET_KEY` mengenkripsi Secret Key Repliz yang disimpan dari dashboard; bila berubah, kunci harus diisi ulang di Pengaturan.

| Service | Fungsi |
|---|---|
| `db` | PostgreSQL 16 (volume `pgdata`) |
| `migrate` | Menjalankan migrasi Drizzle sekali saat start |
| `web` | Dashboard + API (Next.js) di `127.0.0.1:${WEB_PORT}` (default 3000) |
| `worker` | Penjadwal trigger & balas komentar |
| `caddy` | HTTPS otomatis (profil `https`) |

Update: `cd /opt/comel && git pull && bash deploy/install-vps.sh`

Pindah ke domain/subdomain sendiri: buat **A record** (mis. `comel` → IP VPS) di DNS domain Anda, lalu
`cd /opt/comel && git pull && COMEL_DOMAIN=comel.domainanda.com bash deploy/install-vps.sh`.
Skrip menunggu DNS aktif, memperbarui nginx + sertifikat HTTPS, dan memulai ulang Comel. Setelahnya, ganti URL webhook di dashboard Repliz.

Backup: `docker compose -p comel exec db pg_dump -U comel comel > backup.sql` dan folder `./data`.

---

## Pengembangan lokal

```bash
cp .env.example .env.local
# isi: DATABASE_URL=postgres://user:pass@localhost:5432/comel dan BETTER_AUTH_URL=http://localhost:3000
npm install
npx playwright-core install chromium   # untuk metode browser
npm run db:migrate
npm run dev        # dashboard http://localhost:3000
npm run worker     # penjadwal (terminal lain)
```

| Perintah | Fungsi |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run worker` | Penjadwal |
| `npm run db:generate` | Buat migrasi setelah mengubah `src/lib/db/schema.ts` |
| `npm run db:migrate` | Terapkan migrasi |
| `npm run db:studio` | Drizzle Studio |
| `npm test` / `npm run typecheck` / `npm run lint` | Tes & cek |

---

## Langkah setelah instalasi

1. **Pengaturan → Koneksi Repliz**: tempel **Access Key** & **Secret Key** (dashboard Repliz → Settings → Public API) → **Tes koneksi** (harus paket **Gold**).
2. Di **dashboard Repliz**: Account Integration → Connect account → **Threads** (login & izinkan).
3. **Akun Threads** → **Tambah dari Repliz** → pilih akun → atur batas & balas komentar.
4. **AI Provider** → *Provider baru* → pilih preset (mis. 9router) → isi API key & model → **Tes**.
5. **Soul & Memory** → tulis kepribadian (`soul.md`) dan fakta (`memory.md`).
6. **Trigger** → buat trigger (Dry run ✓) → **Preview** → **Jalankan** → matikan Dry run → aktifkan.
7. (Disarankan) **Webhook**: salin URL & token dari Pengaturan ke dashboard Repliz → Settings → Webhook, agar komentar baru langsung dibalas.

---

## Contoh use case

> Komentar di tiap utas yang minimal like 100, komentar 50, share 50, yang berhubungan dengan Kuliner dan/atau Kota Bogor. 3 kali tiap 15 menit.

| Field | Isi |
|---|---|
| Kata pencarian | `kuliner bogor`, `makanan bogor`, `jajanan bogor` (satu per baris) |
| Ekspresi kata kunci | `kuliner OR bogor` (dan/atau) — atau `kuliner AND bogor` |
| Topic tag (opsional) | `Kuliner Bogor` |
| Minimal suka / balasan / share | `100` / `50` / `50`, logika **AND** |
| Jam aktif | Ikuti default (06:00–22:00) |
| Jumlah per putaran / setiap | `3` / `15` menit |

> ⚠️ 3 komentar tiap 15 menit = sampai 288/hari; **batas harian akun** (default 50) menahan ini. Komentar AI massal mudah dianggap spam oleh Meta — mulai pelan dan naikkan bertahap.

### Sintaks ekspresi kata kunci

| Contoh | Arti |
|---|---|
| `kuliner bogor` | keduanya harus ada (spasi = AND) |
| `kuliner OR bogor` / `kuliner ATAU bogor` | salah satu |
| `kuliner AND (bogor OR "kota hujan")` | kurung & frasa |
| `kuliner -promo` / `NOT promo` / `BUKAN promo` | kecualikan |

Tidak peka huruf besar/kecil; nama topic tag ikut dicocokkan.

### Bahasa postingan

- **Semua bahasa** (default), **Bahasa Indonesia**, **Bahasa Inggris**, atau **Indonesia & Inggris**.
- Threads dan Repliz tidak memberi data bahasa atau negara postingan, jadi Comel menebak bahasa dari teksnya
  (kata khas Indonesia seperti *yang, banget, dong, gimana, wkwk* + detektor [`tinyld`](https://github.com/komodojp/tinyld)).
- Penyaringannya longgar: postingan hanya dilewati bila bahasanya jelas lain. Teks yang terlalu pendek (mis. "mantap 🔥"),
  hanya berisi link, atau meragukan tetap lolos. Bahasa Melayu ikut lolos karena hampir sama dengan bahasa Indonesia.
- Filter **negara** tidak tersedia karena datanya tidak ada.

### Topic tag

- **Topic tag (opsional)** — mis. `Kuliner Bogor, Food Threads`. Bila diisi, postingan wajib punya salah satu tag ini; kosong = tanpa filter tag.
- **Cara mencocokkan** — *Sama persis* (`Kuliner Bogor` = `kulinerbogor`) atau *Mengandung kata* (`bogor` cocok dengan *Kuliner Bogor*, *Loker Bogor*).
- **Tag yang dihindari** — mis. `Loker Bogor, Politik`.
- **Cari berdasarkan topic tag** (*trigger by tag*, Repliz `mode=TAG`) — kata pencarian boleh kosong.
- Tag yang pernah terlihat muncul sebagai saran (★ = tag komunitas).

> Comel tetap menyaring ulang tag tiap postingan (sama persis / mengandung kata) setelah hasil pencarian datang.

---

## Koneksi Repliz

Repliz adalah jembatan Comel ke Threads: akun Threads dihubungkan lewat login resmi Threads di dashboard Repliz, lalu Comel memakai **Repliz Public API**. Referensi lengkap API: [`docs/repliz.md`](docs/repliz.md).

- **Paket**: pencarian (Research), komentar ke postingan orang lain (Content), dan Keyword Watch lewat API butuh **Gold**. Paket lain mendapat error `402`.
- **Kunci**: isi di *Pengaturan → Koneksi Repliz* (Secret Key disimpan terenkripsi dengan `SECRET_KEY`), atau lewat `.env`:
  `REPLIZ_ACCESS_KEY`, `REPLIZ_SECRET_KEY` (bila diisi, dashboard tidak bisa mengubahnya).
- **Akun**: *Akun Threads → Tambah dari Repliz*. Worker menyinkronkan username, foto, dan status koneksi tiap jam (atau klik *Sinkron dari Repliz*); akun yang terputus dilewati sampai di-reconnect. Akun yang terputus harus di-*Reconnect* di dashboard Repliz.
- **Webhook**: URL `https://<domain-anda>/api/webhooks/repliz` + token dari Pengaturan (atau `REPLIZ_WEBHOOK_TOKEN`). Repliz mengirim token di header `x-token`. Event `comment` membuat worker langsung membalas komentar di akun itu; tanpa webhook, komentar dicek sesuai interval akun.

> Mengomentari orang asing dalam jumlah besar tetap bisa dianggap spam oleh Threads. Mulai dengan Dry run dan batas kecil.

## AI Provider — 9router

[9router](https://github.com/decolua/9router): `npm install -g 9router && 9router` → dashboard `http://localhost:20128/dashboard`.
Di Comel: preset **9router**, Base URL `http://localhost:20128/v1` (dari Docker: `http://host.docker.internal:20128/v1`), API key & model dari dashboard 9router.

## soul.md & memory.md

- **soul.md** — kepribadian, gaya bahasa, batasan (system prompt).
- **memory.md** — fakta: info diri/bisnis, produk, lokasi, harga, FAQ.

Disimpan di database (tabel `personas`), bisa di-override per akun. AI menerima komentar terakhirnya agar tidak mengulang, dan boleh menjawab `SKIP`.

## Inbox & balas komentar

**Inbox komentar** (menu samping) menampilkan komentar orang di postingan akun Anda dari Repliz (tab Pending / Selesai / Diabaikan). Untuk tiap komentar: **Saran AI** (pakai soul.md, memory.md, dan instruksi akun), edit, **Kirim**, atau **Abaikan**. Balasan manual tercatat di Riwayat dan dihitung ke batas akun.

**Balas otomatis** — 
Per akun: komentar orang di **postingan akun itu** diambil dari antrean komentar Repliz (`status=pending`) dan dibalas lewat Repliz. Atur interval, maks per putaran, umur komentar maksimal, jam aktif, instruksi, dan dry-run. Dengan webhook, komentar baru langsung diproses.

---

## Token akses API (untuk Claude / otomasi)

Pengaturan → **Token akses API** → **Buat token**. Token (`comel_…`) hanya tampil sekali; yang disimpan hanya hash-nya.
Token punya akses yang sama dengan admin, kecuali membuat/mencabut token. Cabut kapan saja dari halaman yang sama.

```bash
curl -H "Authorization: Bearer $COMEL_API_TOKEN" https://domain-comel-anda/api/triggers
```

Untuk sesi Claude Code di cloud: simpan token di pengaturan environment (menu environment → Edit) sebagai
environment variable `COMEL_API_TOKEN` (dan `COMEL_URL`, mis. `https://comel.domainanda.com`), lalu buka sesi baru.
Jangan menempel token di chat.

Endpoint yang berguna: `GET/PUT /api/triggers[/id]`, `POST /api/triggers/{id}/preview`, `POST /api/triggers/{id}/run`,
`POST /api/triggers/{id}/recommend`, `GET /api/logs?limit=50`, `GET /api/actions`, `GET/PUT /api/settings`,
`GET/PUT /api/accounts[/id]`, `GET /api/inbox`.

## Struktur proyek

```
src/
  app/
    (dashboard)/      # dasbor, triggers, accounts, providers, persona, history, settings
    login/            # login & setup admin
    api/              # route handlers (integrasi): auth, triggers, accounts, providers, ...
  components/
    ui/               # shadcn/ui
    app/              # komponen aplikasi (shell, form, dialog)
  lib/
    db/               # schema Drizzle, koneksi, migrasi
    auth.ts           # better-auth
    engine.ts         # cari (Repliz) → filter → metrik (Lightpanda) → AI → kirim (Repliz)
    repliz.ts         # klien Repliz Public API
    scheduler.ts      # penjadwal (dipakai worker)
    scraper.ts        # Lightpanda (metrik viral dari halaman postingan)
    filters.ts        # ekspresi kata kunci, viral, tag, waktu
    llm.ts            # klien AI + preset
  worker/index.ts     # proses penjadwal
  proxy.ts            # cek sesi cepat (Next.js 16 proxy)
drizzle/              # file migrasi SQL
docs/repliz.md        # referensi Repliz API
```

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Tidak bisa masuk dashboard | `BETTER_AUTH_URL` harus sama persis dengan alamat yang dibuka (https://…) |
| `Lightpanda tidak ditemukan` | Image Docker sudah menyertakan; lokal: install lalu set `LIGHTPANDA_BIN` |
| `Repliz belum terhubung` | Isi Access Key & Secret Key di Pengaturan → Koneksi Repliz |
| `Kunci Repliz ditolak (401)` | Kunci salah atau Secret Key di-refresh di Repliz; isi ulang |
| `Paket Repliz … (402)` | API itu butuh paket Gold |
| `Batas Repliz tercapai (429)` | Tunggu; kurangi jumlah per jam |
| Akun "terputus di Repliz" | Dashboard Repliz → Account Integration → Reconnect, lalu *Sinkron dari Repliz* |
| Preview 0 postingan | Coba kata/tag lain atau longgarkan filter; lihat Log di Dasbor |
| "metrik belum dicek" | Naikkan *Maks postingan dicek metrik viral* di Pengaturan |
| Webhook gagal disimpan di Repliz | URL harus HTTPS publik (profil `https`/Caddy) dan token sama persis |
| Lupa password admin | `docker compose exec db psql -U comel -c 'delete from "user";'` lalu buat admin baru di /login |

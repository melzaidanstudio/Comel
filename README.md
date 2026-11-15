# 🐼 Comel — Threads Auto Comment & Reply

Aplikasi pribadi untuk:

1. Mengatur **akun Threads**: **API resmi**, atau **browser** dengan **username + password tersimpan** / cookie
2. Mengatur **trigger kata kunci** atau **topic tag**, dengan **filter viralitas** (suka, balasan, repost, share, quote), **filter tag**, dan **filter waktu**
3. **Scrape** Threads memakai **[Lightpanda](https://github.com/lightpanda-io/browser)** (tanpa login)
4. Membuat **komentar** otomatis dengan AI di utas yang lolos filter
5. **Membalas komentar** orang di postingan kamu / di komentar kamu
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
| Scraping | Lightpanda (`lightpanda fetch`) |
| Kirim komentar | Threads Graph API, atau Playwright (Chromium / Lightpanda CDP) |

---

## Cara kerja

```
 ┌───────────┐ tiap N menit ┌────────────┐ HTML+JSON ┌──────────────────────┐
 │  worker   │ ───────────▶ │ Lightpanda │ ────────▶ │ filter: kata kunci,  │
 │(scheduler)│              │ search/tag │           │ tag, viral, waktu    │
 └───────────┘              └────────────┘           └──────────┬───────────┘
                                                                ▼
 ┌────────────────────┐   teks komentar   ┌──────────────────────────────────┐
 │ kirim:             │ ◀──────────────── │ AI (soul.md + memory.md +        │
 │ • Threads API      │                   │ instruksi trigger + postingan)   │
 │ • browser + sesi   │                   │ → boleh jawab SKIP bila tak cocok│
 └────────────────────┘                   └──────────────────────────────────┘
```

- Scraping **tanpa login** (pencarian, halaman tag, profil, dan balasan tampil publik), jadi akun tidak dipakai untuk scrape.
- Postingan yang sudah diproses tidak dikomentari lagi; ada **jeda per penulis** (default 24 jam) dan **batas harian per akun** (default 50).
- **Jam aktif** default **06:00–22:00** (diubah di Pengaturan); tiap trigger/akun bisa *Ikuti default*, *Atur sendiri*, atau *24 jam*.

---

## Instalasi di VPS (Docker) — mis. Hostinger VPS

Butuh VPS Linux (x86_64/arm64), RAM ≥ 2 GB, Docker. Semua langkah bisa dari HP lewat **Browser terminal** di hPanel Hostinger (VPS → Kelola → Browser terminal) atau aplikasi SSH (Termius/JuiceSSH).

```bash
# 1. Docker (lewati bila OS "Ubuntu with Docker")
curl -fsSL https://get.docker.com | sh

# 2. Ambil kode
git clone https://github.com/melzaidanstudio/comel.git
cd comel
cp .env.example .env

# 3. Isi rahasia & domain otomatis (domain gratis sslip.io dari IP VPS)
EMAIL=email-anda@contoh.com          # ← ganti dengan email Anda (jadi akun admin)
IP=$(curl -s4 ifconfig.me | tr . -)
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/; \
s/^BETTER_AUTH_SECRET=.*/BETTER_AUTH_SECRET=$(openssl rand -hex 32)/; \
s/^SECRET_KEY=.*/SECRET_KEY=$(openssl rand -hex 32)/; \
s/^ADMIN_EMAIL=.*/ADMIN_EMAIL=$EMAIL/; \
s/^DOMAIN=.*/DOMAIN=comel.$IP.sslip.io/; \
s#^BETTER_AUTH_URL=.*#BETTER_AUTH_URL=https://comel.$IP.sslip.io#" .env
cat .env

# 4. Buka port & jalankan (build pertama ±5 menit)
sudo ufw allow 80,443/tcp
docker compose --profile https up -d --build
docker compose logs -f web worker
```

Lalu buka `https://comel.<ip-dengan-minus>.sslip.io` di browser HP → **buat akun admin** dengan email yang sama (hanya `ADMIN_EMAIL` yang diizinkan; setelah admin dibuat, pendaftaran ditutup).

> Hostinger: bila firewall di hPanel (VPS → Security → Firewall) aktif, tambahkan izin port 80 & 443.
> Simpan `.env` baik-baik — `SECRET_KEY` mengenkripsi password akun Threads; bila berubah, password tersimpan harus diisi ulang.

| Service | Fungsi |
|---|---|
| `db` | PostgreSQL 16 (volume `pgdata`) |
| `migrate` | Menjalankan migrasi Drizzle sekali saat start |
| `web` | Dashboard + API (Next.js) di `127.0.0.1:3000` |
| `worker` | Penjadwal trigger & balas komentar |
| `caddy` | HTTPS otomatis (profil `https`) |

Update: `git pull && docker compose --profile https up -d --build`

Backup: `docker compose exec db pg_dump -U comel comel > backup.sql` dan folder `./data`.

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

1. **AI Provider** → *Provider baru* → pilih preset (mis. 9router) → isi API key & model → **Tes**.
2. **Soul & Memory** → tulis kepribadian (`soul.md`) dan fakta (`memory.md`).
3. **Akun Threads** → tambah akun → **Login sekarang** / **Tes koneksi**.
4. **Trigger** → buat trigger (Dry run ✓) → **Preview** → **Jalankan** → matikan Dry run → aktifkan.
5. (Opsional) Di akun, aktifkan **Balas komentar otomatis**.

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

### Topic tag

- **Topic tag (wajib salah satu)** — mis. `Kuliner Bogor, Food Threads`.
- **Cara mencocokkan** — *Sama persis* (`Kuliner Bogor` = `kulinerbogor`) atau *Mengandung kata* (`bogor` cocok dengan *Kuliner Bogor*, *Loker Bogor*).
- **Tag yang dihindari** — mis. `Loker Bogor, Politik`.
- **Cari lewat halaman topic tag** (*trigger by tag*) — kata pencarian boleh kosong.
- Tag yang pernah terlihat muncul sebagai saran (★ = tag komunitas).

> Tanpa login, halaman tag Threads berisi pencarian nama tag (tag campuran), jadi Comel selalu menyaring ulang per tag.

---

## Login akun Threads

### A. API resmi (stabil, risiko rendah)

1. <https://developers.facebook.com/apps> → **Create app** → use case **Access the Threads API**.
2. Izin: `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_read_replies`, dan **`threads_keyword_search`** atau `threads_manage_mentions` (wajib untuk membalas postingan **orang lain**).
3. **App roles → Roles → Threads Tester** → terima undangan di Threads (*Pengaturan → Akun → Izin situs web*).
4. Buat token (User Token Generator) lalu tukar ke long-lived (60 hari):
   ```bash
   curl "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=APP_SECRET&access_token=SHORT_TOKEN"
   ```
5. Tempel di akun (metode **API resmi**) → **Tes koneksi**. Token diperbarui otomatis tiap minggu.

> Untuk postingan hasil scrape, `fbid` dipakai sebagai `reply_to_id` (fallback `pk`). Belum teruji end-to-end; bila gagal, cek pesan error di **Riwayat**.

### B. Browser — username + password tersimpan

1. Akun → metode **Browser** → isi **username/email/no HP** dan **password** (terenkripsi AES-256-GCM dengan `SECRET_KEY`).
2. (Opsional) **Kunci 2FA authenticator** → kode 2FA dibuat otomatis. 2FA SMS: kode diminta di dashboard (berlaku 5 menit).
3. **Login sekarang** → Lightpanda membuka threads.com/login dan menyimpan sesi.
4. Sesi habis → login ulang otomatis (maks 1×/30 menit). Password salah / checkpoint → login otomatis **dijeda** supaya akun tidak terkunci; setujui "Ini saya" di HP lalu *Login sekarang*.

Alternatif: tempel **cookie** (ekstensi Cookie-Editor → Export JSON).

⚠️ Metode browser melanggar Ketentuan Meta tentang akses otomatis dan lebih rawan checkpoint/banned. Bila tombol tidak ditemukan, screenshot disimpan dan bisa dibuka dari **Riwayat**.

---

## AI Provider — 9router

[9router](https://github.com/decolua/9router): `npm install -g 9router && 9router` → dashboard `http://localhost:20128/dashboard`.
Di Comel: preset **9router**, Base URL `http://localhost:20128/v1` (dari Docker: `http://host.docker.internal:20128/v1`), API key & model dari dashboard 9router.

## soul.md & memory.md

- **soul.md** — kepribadian, gaya bahasa, batasan (system prompt).
- **memory.md** — fakta: info diri/bisnis, produk, lokasi, harga, FAQ.

Disimpan di database (tabel `personas`), bisa di-override per akun. AI menerima komentar terakhirnya agar tidak mengulang, dan boleh menjawab `SKIP`.

## Balas komentar otomatis

Per akun: *Postingan saya*, *Komentar saya*, atau keduanya; interval, maks per putaran, umur komentar, jam aktif, instruksi, dry-run.

---

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
    engine.ts         # scrape → filter → AI → kirim
    scheduler.ts      # penjadwal (dipakai worker)
    scraper.ts        # Lightpanda
    filters.ts        # ekspresi kata kunci, viral, tag, waktu
    llm.ts            # klien AI + preset
    posters/          # Threads API & browser (Playwright)
  worker/index.ts     # proses penjadwal
  proxy.ts            # cek sesi cepat (Next.js 16 proxy)
drizzle/              # file migrasi SQL
```

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Tidak bisa masuk dashboard | `BETTER_AUTH_URL` harus sama persis dengan alamat yang dibuka (https://…) |
| `Lightpanda tidak ditemukan` | Image Docker sudah menyertakan; lokal: install lalu set `LIGHTPANDA_BIN` |
| Preview 0 postingan | Coba kata/tag lain; lihat Log di Dasbor |
| `Threads API … reply_to_id` | App butuh `threads_keyword_search`/`threads_manage_mentions` |
| `Login gagal: password salah` / checkpoint | Perbaiki password / setujui di HP → *Login sekarang* |
| `Tombol balas/Post tidak ditemukan` | Tampilan Threads berubah; lihat screenshot di Riwayat |
| Lupa password admin | `docker compose exec db psql -U comel -c 'delete from "user";'` lalu buat admin baru di /login |

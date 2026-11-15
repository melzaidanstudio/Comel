# 🐼 Comel — Threads Auto Comment & Reply

Aplikasi pribadi untuk:

1. Mengatur **akun Threads** (via **API resmi** atau **browser + cookie login**)
2. Mengatur **trigger kata kunci** dengan **filter viralitas** (suka, balasan, repost, share, quote) dan **filter waktu**
3. **Scrape** Threads memakai **[Lightpanda](https://github.com/lightpanda-io/browser)** (tanpa login)
4. Membuat **komentar** otomatis dengan AI di utas yang lolos filter
5. **Membalas komentar** orang di postingan kamu / di komentar kamu
6. Kepribadian & pengetahuan AI lewat **`soul.md`** dan **`memory.md`**
7. AI provider bebas: **9router**, OpenRouter, OpenAI, Claude, Gemini, Groq, DeepSeek, Ollama, atau endpoint OpenAI-compatible lain

Semua diatur dari dashboard web berbahasa Indonesia yang dilindungi password.

---

## Cara kerja

```
 ┌────────────┐  tiap N menit   ┌──────────────┐  HTML + JSON   ┌──────────────┐
 │ Penjadwal  │ ──────────────▶ │  Lightpanda  │ ─────────────▶ │ Filter:      │
 │ (trigger)  │                 │  /search?q=  │                │ kata kunci,  │
 └────────────┘                 └──────────────┘                │ viral, waktu │
                                                                └──────┬───────┘
                                                                       ▼
 ┌────────────────────┐   teks komentar   ┌──────────────────────────────────┐
 │ Kirim:             │ ◀──────────────── │ AI (soul.md + memory.md +        │
 │ • Threads API      │                   │ instruksi trigger + isi postingan)│
 │ • Browser + cookie │                   │ → boleh jawab SKIP bila tak cocok │
 └────────────────────┘                   └──────────────────────────────────┘
```

- Scraping dilakukan **tanpa login** (Threads menampilkan hasil pencarian, profil, dan balasan secara publik), jadi akun kamu tidak dipakai untuk scrape.
- Postingan yang sudah pernah dikomentari tidak akan dikomentari lagi. Ada juga **jeda per penulis** (default 24 jam) dan **batas harian per akun**.
- Tombol **Pause semua** di sidebar menghentikan semua aksi otomatis seketika.

---

## Contoh use case

> Komentar di tiap utas yang minimal like 100, komentar 50, share 50, yang berhubungan dengan Kuliner dan/atau Kota Bogor. Lakukan 3 kali tiap 15 menit.

Buat trigger dengan isian:

| Field | Isi |
|---|---|
| Kata pencarian | `kuliner bogor`<br>`makanan bogor`<br>`jajanan bogor` |
| Ekspresi kata kunci | `kuliner OR bogor` (dan/atau) — atau `kuliner AND bogor` (harus keduanya) |
| Minimal suka / balasan / share | `100` / `50` / `50` |
| Logika syarat viralitas | Semua syarat harus terpenuhi (AND) |
| Umur postingan maksimal | misal `72` jam (0 = bebas) |
| Jumlah komentar per putaran | `3` |
| Setiap (menit) | `15` |
| Instruksi | "Komentari makanannya secara spesifik dan antusias. Jangan promosi." |

Klik **Preview** untuk melihat postingan mana yang lolos filter (tanpa mengirim apa pun) dan **Tes komentar** untuk melihat contoh komentar AI. Centang **Dry run** dulu untuk uji coba, lalu matikan bila sudah yakin.

> ⚠️ 3 komentar tiap 15 menit = sampai **288 komentar/hari**. Batas harian akun (default **50**) akan menahan ini. Komentar AI dalam jumlah besar mudah dianggap spam oleh Meta dan berisiko akun dibatasi/diblokir. Mulailah pelan (mis. 1–2 per 30 menit, jam aktif 07:00–22:00) dan naikkan bertahap.

### Sintaks ekspresi kata kunci

| Contoh | Arti |
|---|---|
| `kuliner bogor` | keduanya harus ada (spasi = AND) |
| `kuliner OR bogor` / `kuliner ATAU bogor` | salah satu |
| `kuliner AND (bogor OR "kota hujan")` | kurung & frasa |
| `kuliner -promo` / `kuliner NOT promo` / `kuliner BUKAN promo` | kecualikan kata |

Pencocokan tidak peka huruf besar/kecil. Kalau *Kata pencarian* dikosongkan, kata positif dari ekspresi dipakai sebagai kata pencarian.

---

## Instalasi di VPS (Docker — disarankan)

Butuh VPS Linux (x86_64 atau arm64), RAM ≥ 1 GB, Docker + Docker Compose.

```bash
git clone https://github.com/melzaidanstudio/comel.git
cd comel
cp .env.example .env
nano .env                       # ganti ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f          # cek log
```

Dashboard berjalan di port 3000 dan **sengaja hanya bisa diakses dari VPS itu sendiri**. Buka dari laptop dengan SSH tunnel:

```bash
ssh -L 3000:localhost:3000 user@ip-vps
# lalu buka http://localhost:3000
```

Atau pasang reverse proxy HTTPS (Caddy/Nginx) ke `127.0.0.1:3000`. Contoh Caddy:

```
comel.domainkamu.com {
    reverse_proxy 127.0.0.1:3000
}
```

Data (database, soul.md, memory.md, cookie) tersimpan di folder `./data` — **backup folder ini**.

Update aplikasi:

```bash
git pull && docker compose up -d --build
```

## Instalasi tanpa Docker

```bash
# Node.js 22.13+ wajib (memakai node:sqlite bawaan)
curl -fsSL -o /usr/local/bin/lightpanda https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux
chmod +x /usr/local/bin/lightpanda

npm ci
npx playwright-core install --with-deps chromium   # hanya perlu untuk metode "browser + cookie"
ADMIN_PASSWORD=passwordkamu npm start
```

Agar jalan terus, pakai systemd (`/etc/systemd/system/comel.service`):

```ini
[Unit]
Description=Comel
After=network.target

[Service]
WorkingDirectory=/opt/comel
Environment=ADMIN_PASSWORD=passwordkamu
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now comel
```

---

## Langkah setelah instalasi

1. **AI Provider** → *+ Provider baru* → pilih preset (mis. 9router) → isi API key & model → **Tes**.
2. **Soul & Memory** → tulis kepribadian di `soul.md` dan fakta di `memory.md`.
3. **Akun Threads** → tambah akun (lihat dua metode di bawah) → **Tes koneksi**.
4. **Trigger** → buat trigger → **Preview** → **Jalankan** (dengan Dry run) → matikan Dry run → aktifkan.
5. (Opsional) Di akun, aktifkan **Balas komentar otomatis**.

---

## Login akun: dua metode

### A. API resmi Threads (disarankan)

Lebih stabil dan risiko banned lebih rendah. Setup sekali:

1. Buka <https://developers.facebook.com/apps> → **Create app** → pilih use case **"Access the Threads API"**.
2. Di pengaturan use case Threads, tambahkan izin:
   - `threads_basic`, `threads_content_publish`, `threads_manage_replies`, `threads_read_replies`
   - **`threads_keyword_search`** (atau `threads_manage_mentions`) — **wajib** agar bisa membalas postingan **orang lain**. Tanpa ini, API hanya mengizinkan membalas di utas milik sendiri.
3. **App roles → Roles → Add people → Threads Tester** → masukkan username Threads kamu. Terima undangan di aplikasi Threads: *Pengaturan → Akun → Izin situs web → Undangan*.
4. Buat token: di halaman use case Threads, gunakan **User Token Generator** (atau Graph API Explorer) untuk akun tester kamu → dapat *short-lived token*.
5. Tukar ke **long-lived token** (berlaku 60 hari):
   ```bash
   curl "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=APP_SECRET&access_token=SHORT_TOKEN"
   ```
6. Tempel `access_token` hasilnya di form akun (metode **API resmi**) → **Tes koneksi**. Username & user ID terisi otomatis. Comel memperbarui token otomatis tiap minggu.

Batas API dari Meta: ±250 postingan & ±1000 balasan per 24 jam per akun.

> Catatan teknis: untuk postingan hasil scrape, Comel memakai field `fbid` dari halaman Threads sebagai `reply_to_id` (dengan fallback ke `pk`). Ini belum bisa diuji dari lingkungan pengembangan; bila balasan via API gagal dengan pesan ID tidak valid, laporkan pesan error-nya dari menu **Riwayat**.

### B. Browser + cookie login

Meniru pengguna sungguhan di threads.com memakai cookie sesi.

1. Login ke <https://www.threads.com> di Chrome/Firefox.
2. Pasang ekstensi **Cookie-Editor** → buka threads.com → **Export → JSON**.
3. Tempel di form akun (metode **Browser + cookie**). Bisa juga format header: `sessionid=...; csrftoken=...; ds_user_id=...`
4. Isi **username** (tanpa @) → **Tes koneksi**.

Engine:
- **Chromium** — paling andal untuk mengetik & klik di threads.com (default).
- **Lightpanda** — ringan, tapi dukungan form kompleks masih eksperimental.

⚠️ Metode ini **melanggar Ketentuan Meta** tentang akses otomatis dan lebih rawan checkpoint/banned. Selector tombol bisa berubah sewaktu-waktu jika Meta mengubah tampilan; bila gagal, screenshot disimpan di `data/screenshots/` dan bisa dibuka dari menu **Riwayat**. Cookie diperbarui otomatis setelah tiap sesi; bila kedaluwarsa, ekspor ulang.

---

## AI Provider

Semua provider berformat OpenAI `/chat/completions`, kecuali Anthropic (Messages API native).

### 9router

[9router](https://github.com/decolua/9router) adalah router AI lokal yang menyediakan endpoint OpenAI-compatible.

```bash
npm install -g 9router
9router            # dashboard: http://localhost:20128/dashboard
```

Di Comel: preset **9router** → Base URL `http://localhost:20128/v1` → API key & nama model dari dashboard 9router.
Jika Comel berjalan di **Docker** dan 9router di VPS yang sama, gunakan `http://host.docker.internal:20128/v1`.

---

## soul.md & memory.md

- **soul.md** — "siapa kamu": kepribadian, gaya bahasa, panjang komentar, hal yang tidak boleh dilakukan. Dipakai sebagai system prompt.
- **memory.md** — fakta yang boleh dipakai AI: info diri/bisnis, produk, lokasi, harga, FAQ.

Keduanya bisa di-override **per akun** (tombol *Persona* di kartu akun). File tersimpan di `data/persona/`.

AI juga menerima beberapa komentar terakhirnya supaya tidak mengulang kalimat, dan boleh menjawab `SKIP` untuk postingan yang tidak relevan atau sensitif (duka, SARA, politik — bisa dimatikan di Pengaturan).

---

## Balas komentar otomatis

Di form akun → **Balas komentar otomatis**:

- **Postingan saya** — membalas komentar orang di utas milik akun.
- **Komentar saya** — membalas orang yang menanggapi komentar yang dibuat Comel/akun kamu.
- Interval cek, maksimal balasan per putaran, umur komentar maksimal, instruksi khusus, dan dry run.

Metode API memakai endpoint resmi `/{media-id}/replies`; metode browser men-scrape profil publik kamu dengan Lightpanda.

---

## Struktur proyek

```
src/
  server.js        # Express: dashboard + REST API + auth
  scheduler.js     # penjadwal trigger & balas komentar, refresh token
  engine.js        # alur: scrape → filter → AI → kirim
  scraper.js       # Lightpanda fetch + parsing JSON Threads
  filters.js       # ekspresi kata kunci & filter viral/waktu
  llm.js           # klien AI (OpenAI-compatible + Anthropic), preset provider
  persona.js       # soul.md & memory.md
  posters/api.js   # Threads API resmi
  posters/browser.js # Playwright (Chromium / Lightpanda CDP) + cookie
  db.js            # SQLite (node:sqlite)
public/            # dashboard (HTML/CSS/JS tanpa build)
data/              # database, persona, cookie, screenshot (jangan di-commit)
```

Tes: `npm test`

## Troubleshooting

| Masalah | Solusi |
|---|---|
| `Lightpanda tidak ditemukan` | Install Lightpanda atau set `LIGHTPANDA_BIN` |
| Preview 0 postingan | Coba kata pencarian lain; Lightpanda nightly kadang gagal — cek menu Log/Dasbor |
| `Threads API 400 … reply_to_id` | Pastikan app punya izin `threads_keyword_search`/`threads_manage_mentions` |
| `Cookie tidak valid / kedaluwarsa` | Login ulang di browser, ekspor cookie lagi |
| `Tombol balas/Post tidak ditemukan` | Tampilan Threads berubah; lihat screenshot di Riwayat |
| Lupa password dashboard | Lihat `data/.admin_password`, atau set `ADMIN_PASSWORD` di `.env` |

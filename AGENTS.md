<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repliz — jembatan koneksi ke Threads

Proyek ini memakai **Repliz** (https://repliz.com) sebagai jembatan koneksi ke Threads. Referensi lengkap ada di
**[`docs/repliz.md`](docs/repliz.md)**; baca sebelum menulis kode integrasi Repliz. Fakta kunci:

- Base URL `https://api.repliz.com/public/...`, autentikasi `Authorization: Basic base64(AccessKey:SecretKey)`
  (kunci dari dashboard Repliz → Settings → Public API; simpan di env server, mis. `REPLIZ_ACCESS_KEY` / `REPLIZ_SECRET_KEY`).
- Error `{ code, message }`. `402` berarti paket tidak mencakup API itu. Research, Content, dan Keyword Watch API wajib **paket Gold**.
- Akun Threads dihubungkan di dashboard Repliz (OAuth resmi); di API dirujuk dengan `_id` dari `GET /public/account?types[]=threads`.
- Cari postingan Threads: `GET /public/research/threads/content/search` (`accountId`, `search`, `sort` TOP|RECENT, `mode` KEYWORD|TAG,
  `since`/`until`, `nextToken`). Hasilnya **tidak memuat metrik like/balasan/share**.
- Komentar ke postingan mana pun: `POST /public/content/{contentId}/comment` body `{ accountId, text, commentId? }` (`contentId` = `id` dari Research).
- Balas komentar masuk di postingan sendiri: webhook `comment` atau `GET /public/comment?status=pending`, lalu `POST /public/comment/{_id}` body `{ text }`.
- Keyword Watch (`/public/watcher`): Repliz yang memantau kata kunci Threads, menyaring dengan AI `criteria`, dan membalas `auto`/`review`.
  Batas per akun: 10 balasan/jam, 50/hari, jeda 3–10 menit, orang yang sama 7 hari; 1.500 pencarian/hari.
- Webhook memverifikasi header `x-token` dan tidak punya retry otomatis; event bisa datang tidak berurutan, jadi deduplikasi dengan ID.
- API Repliz berubah cepat. Cek https://docs.repliz.com/api/changelog.html bila ada yang tidak cocok.

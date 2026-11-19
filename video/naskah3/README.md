# Video Naskah 3 — "Orang di kotamu lagi nanya"

Motion ads / explainer Comel, tema tropis segar, 9:16 (1080×1920), 90 detik, VO ElevenLabs "Cahaya".

**Status:** storyboard menunggu persetujuan. TTS dan render belum dibuat.

| File | Isi |
|---|---|
| `storyboard.html` | Storyboard lengkap (sumber Artifact): adegan, teks layar, VO, musik/SFX, palet, aset |
| `vo.txt` | Teks VO untuk TTS (angka dieja, handle dibaca "jadi kaya aa", promo usulan sudah masuk) |
| `frames/*.html` | Style frame 1080×1920 (HTML/CSS), dasar animasi saat render; tema lewat `?t=tropis` (dipakai), `pop`, `neon` |
| `frames/*.png` | Hasil render style frame |
| `tools/shoot-frames.mjs` | Render ulang PNG: `NODE_PATH=$(npm root -g) node video/naskah3/tools/shoot-frames.mjs [--theme=tropis] [--out=dir] [--safe]` (`--safe` menandai area aman) |

Batasan: tanpa nama Repliz, tanpa username/foto asli Threads, UI tiruan generik, tanpa klaim di luar naskah.

# Video Naskah 3 — "Orang di kotamu lagi nanya"

Motion ads / explainer Comel, tema tropis segar, 9:16 (1080×1920), 90 detik, VO ElevenLabs "Cahaya".

**Status:** storyboard disetujui (promo tetap, tanpa subtitle). Animasi & pipeline render siap; VO menunggu `ELEVENLABS_API_KEY`.

| File | Isi |
|---|---|
| `storyboard.html` | Storyboard lengkap (sumber Artifact): adegan, teks layar, VO, musik/SFX, palet, aset |
| `vo.txt` | Teks VO untuk TTS (angka dieja, handle dibaca "jadi kaya aa", promo usulan sudah masuk) |
| `frames/*.html` | Style frame 1080×1920 (HTML/CSS), dasar animasi saat render; tema lewat `?t=tropis` (dipakai), `pop`, `neon` |
| `frames/*.png` | Hasil render style frame |
| `anim/` | Animasi 17 adegan (HTML/CSS/JS deterministik, `renderAt(t)`) |
| `tools/tts.mjs` | VO ElevenLabs "Cahaya" + stempel waktu → `build/vo.mp3`, `build/alignment.json` |
| `tools/render.mjs` | Render MP4 1080×1920 @30 fps; timeline dikunci ke VO, jeda antarbabak, ducking musik opsional, −14 LUFS |
| `tools/shoot-frames.mjs` | Render ulang PNG: `NODE_PATH=$(npm root -g) node video/naskah3/tools/shoot-frames.mjs [--theme=tropis] [--out=dir] [--safe]` (`--safe` menandai area aman) |

Batasan: tanpa nama Repliz, tanpa username/foto asli Threads, UI tiruan generik, tanpa klaim di luar naskah.

## Render

```bash
NODE_PATH=$(npm root -g) node video/naskah3/tools/tts.mjs
NODE_PATH=$(npm root -g) node video/naskah3/tools/render.mjs            # + --music=file.mp3 bila ada musik berlisensi
NODE_PATH=$(npm root -g) node video/naskah3/tools/render.mjs --preview  # tanpa suara, timeline perkiraan
```

Hasil di `video/naskah3/build/` (tidak di-commit).

# Video Naskah 3 — "Orang di kotamu lagi nanya"

Motion ads / explainer Comel, tema tropis segar, 9:16 (1080×1920), 90 detik, VO Speko (Gemini TTS) suara "Autonoe", gaya ceria.

**Status:** storyboard disetujui; VO Speko "Autonoe" dibuat dan video 90 detik dirender.

| File | Isi |
|---|---|
| `storyboard.html` | Storyboard lengkap (sumber Artifact): adegan, teks layar, VO, musik/SFX, palet, aset |
| `vo.txt` | Teks VO untuk TTS (angka dieja, handle dibaca "jadi kaya aa", promo usulan sudah masuk) |
| `frames/*.html` | Style frame 1080×1920 (HTML/CSS), dasar animasi saat render; tema lewat `?t=tropis` (dipakai), `pop`, `neon` |
| `frames/*.png` | Hasil render style frame |
| `anim/` | Animasi 17 adegan (HTML/CSS/JS deterministik, `renderAt(t)`) |
| `vo-speko.json` | Parameter VO final (Speko, Autonoe, instruksi gaya ceria) |
| `tools/tts.mjs` | (alternatif) VO ElevenLabs + stempel waktu |
| `tools/render.mjs` | Render MP4 1080×1920 @30 fps; timeline dikunci ke VO, jeda antarbabak, ducking musik opsional, −14 LUFS |
| `tools/shoot-frames.mjs` | Render ulang PNG: `NODE_PATH=$(npm root -g) node video/naskah3/tools/shoot-frames.mjs [--theme=tropis] [--out=dir] [--safe]` (`--safe` menandai area aman) |

Batasan: tanpa nama Repliz, tanpa username/foto asli Threads, UI tiruan generik, tanpa klaim di luar naskah.

## Render

VO final dibuat lewat Speko (MCP `audio.synthesize`, parameter di `vo-speko.json`) → simpan sebagai `build/vo.wav`;
waktu tiap adegan dari `audio.transcribe` dengan `word_timestamps` → `build/cues.json` (`{voEnd, cues: {S01..S17, FOLLOW: {at, prevEnd}}}`).
Alternatif ElevenLabs: `tools/tts.mjs` (menulis `build/vo.mp3` + `build/alignment.json`).

```bash
NODE_PATH=$(npm root -g) node video/naskah3/tools/render.mjs            # + --music=file.mp3 bila ada musik berlisensi
NODE_PATH=$(npm root -g) node video/naskah3/tools/render.mjs --preview  # tanpa suara, timeline perkiraan
```

Hasil di `video/naskah3/build/` (tidak di-commit).

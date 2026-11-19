// Render video Naskah 3 → build/naskah3.mp4 (1080×1920, 30 fps).
// Pakai:
//   NODE_PATH=$(npm root -g) node video/naskah3/tools/render.mjs --preview        # tanpa suara, timeline perkiraan
//   NODE_PATH=$(npm root -g) node video/naskah3/tools/render.mjs [--music=file]   # butuh build/vo.mp3 + alignment.json dari tts.mjs
// Opsi: --fps=30 --from=0 --to=90 (render sebagian) --out=nama.mp4
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = process.env.N3_BUILD || join(root, 'build'); mkdirSync(build, { recursive: true });
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const preview = process.argv.includes('--preview');
const fps = Number(arg('fps') || 30);
const TARGET = 90, HOLD = 2.0, LEAD = 0.35;

// Kata pembuka tiap adegan (huruf kecil, dicari berurutan di teks VO)
const CUES = [
  ['S01', 'orang di kotamu'], ['S02', 'yang jawab'], ['S03', 'ini nyata'], ['S04', 'satu pertanyaan'],
  ['S05', 'satu lagi'], ['S06', 'penanyanya'], ['S07', 'tapi kamu'], ['S08', 'comel yang mantengin'],
  ['S09', 'atur syaratnya'], ['S10', 'kata yang kamu hindari'], ['S11', 'comel menulis'], ['S12', 'bawaannya'],
  ['S13', 'contoh nyata:'], ['S14', 'belum yakin'], ['S15', 'telat lima jam'],
  ['S16', 'uji dulu, kirim'], ['S17', 'pertanyaan berikutnya'],
];
// Jeda tambahan hanya di pergantian babak
const GAP_AT = ['S03', 'S07', 'S13', 'S16', 'S17'];

function timelineFromVO() {
  const { alignment: al } = JSON.parse(readFileSync(join(build, 'alignment.json'), 'utf8'));
  const text = al.characters.join('').toLowerCase();
  const st = al.character_start_times_seconds, en = al.character_end_times_seconds;
  const voEnd = en.at(-1);
  let from = 0;
  const raw = {};
  for (const [id, phrase] of CUES) {
    const i = text.indexOf(phrase, from);
    if (i < 0) throw new Error(`Penanda "${phrase}" (${id}) tidak ditemukan di alignment`);
    raw[id] = { at: st[i], prevEnd: i > 0 ? en[i - 1] : 0 };
    from = i + phrase.length;
  }
  return finishTimeline(raw, voEnd);
}

// Alternatif: build/cues.json (waktu kata dari transkripsi, mis. VO Speko yang tidak memberi alignment)
function timelineFromCues() {
  const c = JSON.parse(readFileSync(join(build, 'cues.json'), 'utf8'));
  return finishTimeline(c.cues, c.voEnd);
}

function finishTimeline(raw, voEnd) {
  const spare = Math.max(0, TARGET - LEAD - voEnd - HOLD);
  const gap = Math.min(1.5, spare / GAP_AT.length);
  // Potong audio di tengah jeda sebelum tiap babak, sisipkan hening
  const cuts = GAP_AT.map((id) => ({ id, t: (raw[id].prevEnd + raw[id].at) / 2 }));
  const anchors = {};
  for (const id of Object.keys(raw)) {
    const shift = LEAD + gap * cuts.filter((c) => c.t <= raw[id].at).length;
    anchors[id] = id === 'S01' ? 0 : Math.max(0, raw[id].at + shift - 0.12);
  }
  const end = LEAD + voEnd + gap * cuts.length + HOLD;
  return { anchors, end: Math.round(end * fps) / fps, cuts: cuts.map((c) => c.t), gap, voEnd };
}

function buildAudio(tl) {
  // vo.mp3 → potong per babak, sisipkan hening, normalisasi; opsional musik dengan ducking
  const segs = [0, ...tl.cuts, null];
  const parts = [];
  let f = `[0:a]aresample=48000,asplit=${segs.length - 1}${segs.slice(0, -1).map((_, i) => `[s${i}]`).join('')};`;
  segs.slice(0, -1).forEach((a, i) => {
    const b = segs[i + 1];
    f += `[s${i}]atrim=start=${a}${b != null ? `:end=${b}` : ''},asetpts=PTS-STARTPTS,adelay=${Math.round((i === 0 ? LEAD : tl.gap) * 1000)}:all=1[p${i}];`;
    parts.push(`[p${i}]`);
  });
  f += `${parts.join('')}concat=n=${parts.length}:v=0:a=1,apad=whole_dur=${tl.end}[vo];`;
  const music = arg('music');
  const voFile = existsSync(join(build, 'vo.wav')) ? join(build, 'vo.wav') : join(build, 'vo.mp3');
  const inputs = ['-i', voFile];
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', music);
    f += `[vo]asplit[vo1][sc];[1:a]aresample=48000,volume=0.35,atrim=0:${tl.end},afade=t=out:st=${tl.end - 2}:d=2[m];[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[md];[vo1][md]amix=inputs=2:normalize=0[mix];[mix]loudnorm=I=-14:TP=-1.5:LRA=11[out]`;
  } else f += `[vo]loudnorm=I=-14:TP=-1.5:LRA=11[out]`;
  const out = join(build, 'audio.wav');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', f, '-map', '[out]', '-t', String(tl.end), '-ar', '48000', out], { stdio: 'inherit' });
  return out;
}

let tl, audio = null;
if (preview) tl = { anchors: null, end: TARGET };
else {
  const hasCues = existsSync(join(build, 'cues.json'));
  if (!hasCues && !existsSync(join(build, 'alignment.json'))) throw new Error('build/alignment.json atau build/cues.json belum ada. Jalankan tools/tts.mjs dulu, atau pakai --preview.');
  tl = hasCues ? timelineFromCues() : timelineFromVO();
  writeFileSync(join(build, 'timeline.json'), JSON.stringify(tl, null, 1));
  console.log(`VO ${tl.voEnd.toFixed(1)} dtk, jeda babak ${tl.gap.toFixed(2)} dtk, total ${tl.end.toFixed(2)} dtk`);
  audio = buildAudio(tl);
}

const t0 = Number(arg('from') || 0), t1 = Math.min(Number(arg('to') || tl.end), tl.end);
const out = join(build, arg('out') || (preview ? 'naskah3-preview.mp4' : 'naskah3.mp4'));
const ff = spawn('ffmpeg', [
  '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
  ...(audio ? ['-ss', String(t0), '-i', audio] : []),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps),
  ...(audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
  '-movflags', '+faststart', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + join(root, 'anim', 'index.html'));
await page.evaluate(async (t) => { if (t.anchors) window.TIMELINE = { anchors: t.anchors, end: t.end }; else window.TIMELINE.end = t.end; await window.animReady; }, tl);
const n = Math.round((t1 - t0) * fps);
const started = Date.now();
for (let i = 0; i < n; i++) {
  const t = t0 + i / fps;
  await page.evaluate((x) => window.renderAt(x), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % (fps * 5) === 0) console.log(`frame ${i}/${n} (${t.toFixed(1)} dtk) ${((Date.now() - started) / 1000).toFixed(0)} dtk`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log('OK:', out);

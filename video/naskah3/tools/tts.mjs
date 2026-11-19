// VO ElevenLabs "Cahaya" + stempel waktu per karakter → build/vo.mp3, build/alignment.json
// Pakai: node video/naskah3/tools/tts.mjs [--voice-id=ID] [--model=eleven_multilingual_v2]
// Kunci: env ELEVENLABS_API_KEY (atau Network secret yang disuntik proxy untuk api.elevenlabs.io).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = process.env.N3_BUILD || join(root, 'build'); mkdirSync(build, { recursive: true });
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const API = 'https://api.elevenlabs.io';
const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
if (process.env.ELEVENLABS_API_KEY) headers['xi-api-key'] = process.env.ELEVENLABS_API_KEY;

async function api(path, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} → ${r.status}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : {};
}

async function findVoice(name) {
  const mine = await api(`/v2/voices?search=${encodeURIComponent(name)}&page_size=50`);
  const hit = (mine.voices || []).find((v) => v.name.toLowerCase().includes(name.toLowerCase()));
  if (hit) return { id: hit.voice_id, name: hit.name, source: 'library' };
  const shared = await api(`/v1/shared-voices?search=${encodeURIComponent(name)}&page_size=30`);
  const list = (shared.voices || []).filter((v) => v.name.toLowerCase().includes(name.toLowerCase()));
  list.sort((a, b) => (b.language === 'id') - (a.language === 'id') || (b.cloned_by_count || 0) - (a.cloned_by_count || 0));
  if (!list.length) throw new Error(`Suara "${name}" tidak ditemukan di library maupun voice library.`);
  const v = list[0];
  console.log('Kandidat voice library:', list.slice(0, 5).map((x) => `${x.name} [${x.language || '?'}] ${x.voice_id}`).join(' | '));
  const added = await api(`/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, { method: 'POST', body: JSON.stringify({ new_name: v.name }) });
  return { id: added.voice_id || v.voice_id, name: v.name, source: 'shared (ditambahkan ke library)' };
}

const voice = arg('voice-id') ? { id: arg('voice-id'), name: '(manual)', source: 'arg' } : await findVoice('Cahaya');
console.log('Suara:', voice);
const text = readFileSync(join(root, 'vo.txt'), 'utf8').trim();
const res = await api(`/v1/text-to-speech/${voice.id}/with-timestamps?output_format=mp3_44100_192`, {
  method: 'POST',
  body: JSON.stringify({
    text,
    model_id: arg('model') || 'eleven_multilingual_v2',
    language_code: 'id',
    voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 1.0 },
  }),
});
writeFileSync(join(build, 'vo.mp3'), Buffer.from(res.audio_base64, 'base64'));
writeFileSync(join(build, 'alignment.json'), JSON.stringify({ voice, alignment: res.alignment || res.normalized_alignment }, null, 1));
const a = res.alignment;
console.log(`OK: build/vo.mp3 (${a.character_end_times_seconds.at(-1).toFixed(1)} dtk)`);

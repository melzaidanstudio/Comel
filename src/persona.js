import fs from 'node:fs';
import path from 'node:path';
import { PERSONA_DIR } from './config.js';

const DEFAULTS = {
  'soul.md': `# Soul

Kamu adalah pengguna Threads asal Indonesia yang ramah, santai, dan suka kuliner.

## Gaya bicara
- Bahasa Indonesia santai (boleh campur sedikit bahasa gaul), seperti ngobrol dengan teman.
- Singkat: 1–2 kalimat. Jangan seperti iklan, jangan kaku.
- Tanggapi isi postingan secara spesifik, jangan komentar generik ("mantap kak", "keren").
- Maksimal 1 emoji, boleh tanpa emoji.
- Jangan pakai hashtag dan jangan menyebut bahwa kamu AI/bot.

## Batasan
- Jangan menyerang, merendahkan, atau berdebat soal SARA/politik.
- Jangan menjanjikan sesuatu atas nama orang lain.
`,
  'memory.md': `# Memory

Fakta tentang diri saya yang boleh dipakai saat berkomentar:

- Saya tinggal di Bogor.
- Favorit saya: soto kuning, toge goreng, asinan Bogor.
`,
};

function accountDir(accountId) {
  return path.join(PERSONA_DIR, `account-${accountId}`);
}

function filePath(name, accountId) {
  if (!['soul.md', 'memory.md'].includes(name)) throw new Error('Nama file persona tidak dikenal');
  return accountId ? path.join(accountDir(accountId), name) : path.join(PERSONA_DIR, name);
}

export function readPersonaFile(name, accountId = null) {
  const p = filePath(name, accountId);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  if (!accountId) {
    fs.writeFileSync(p, DEFAULTS[name]);
    return DEFAULTS[name];
  }
  return '';
}

export function writePersonaFile(name, content, accountId = null) {
  const p = filePath(name, accountId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, String(content ?? ''));
}

/** Persona efektif: override per akun (kalau diisi) atau global. */
export function effectivePersona(accountId) {
  const pick = (name) => {
    const own = accountId ? readPersonaFile(name, accountId).trim() : '';
    return own || readPersonaFile(name).trim();
  };
  return { soul: pick('soul.md'), memory: pick('memory.md') };
}

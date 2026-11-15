import { eq } from 'drizzle-orm';
import { db } from './db';
import { personas } from './db/schema';

export const DEFAULT_SOUL = `# Soul

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
`;

export const DEFAULT_MEMORY = `# Memory

Fakta tentang diri saya yang boleh dipakai saat berkomentar:

- Saya tinggal di Bogor.
- Favorit saya: soto kuning, toge goreng, asinan Bogor.
`;

const scopeOf = (accountId?: number | null) => (accountId ? `account:${accountId}` : 'global');

export async function readPersona(accountId?: number | null): Promise<{ soul: string; memory: string }> {
  const [row] = await db.select().from(personas).where(eq(personas.scope, scopeOf(accountId)));
  if (row) return { soul: row.soul, memory: row.memory };
  return accountId ? { soul: '', memory: '' } : { soul: DEFAULT_SOUL, memory: DEFAULT_MEMORY };
}

export async function writePersona(data: { soul?: string; memory?: string }, accountId?: number | null) {
  const current = await readPersona(accountId);
  const next = { soul: data.soul ?? current.soul, memory: data.memory ?? current.memory };
  await db.insert(personas).values({ scope: scopeOf(accountId), ...next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: personas.scope, set: { ...next, updatedAt: new Date() } });
}

/** Persona efektif: override per akun (kalau diisi) atau global. */
export async function effectivePersona(accountId: number) {
  const [own, global] = await Promise.all([readPersona(accountId), readPersona(null)]);
  return {
    soul: own.soul.trim() || global.soul.trim(),
    memory: own.memory.trim() || global.memory.trim(),
  };
}

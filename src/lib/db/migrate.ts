import path from 'node:path';
import { and, eq, ne, not, like } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { encrypt } from '../secrets';
import { db, pool } from './index';
import { providers } from './schema';

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  await encryptLegacyProviderKeys();
}

/** API key provider dari versi lama tersimpan polos → enkripsi sekali. */
async function encryptLegacyProviderKeys() {
  const rows = await db.select({ id: providers.id, apiKey: providers.apiKey }).from(providers)
    .where(and(ne(providers.apiKey, ''), not(like(providers.apiKey, 'v1:%'))));
  for (const r of rows) await db.update(providers).set({ apiKey: encrypt(r.apiKey) }).where(eq(providers.id, r.id));
  if (rows.length) console.log(`${rows.length} API key provider dienkripsi`);
}

// dijalankan langsung: `npm run db:migrate`
if (process.argv[1] && /migrate\.(ts|js|mjs)$/.test(process.argv[1])) {
  runMigrations()
    .then(() => { console.log('Migrasi database selesai'); return pool.end(); })
    .catch((e) => { console.error('Migrasi gagal:', e); process.exit(1); });
}

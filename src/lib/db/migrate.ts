import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index';

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
}

// dijalankan langsung: `npm run db:migrate`
if (process.argv[1] && /migrate\.(ts|js|mjs)$/.test(process.argv[1])) {
  runMigrations()
    .then(() => { console.log('Migrasi database selesai'); return pool.end(); })
    .catch((e) => { console.error('Migrasi gagal:', e); process.exit(1); });
}

/**
 * Proses latar belakang: penjadwal trigger & balas komentar.
 * Jalankan terpisah dari web: `npm run worker`
 */
import { runMigrations } from '@/lib/db/migrate';
import { log } from '@/lib/logger';
import { startScheduler } from '@/lib/scheduler';

process.on('unhandledRejection', (e) => { void log('error', 'worker', `Unhandled: ${(e as Error)?.stack || e}`.slice(0, 1000)); });
process.on('uncaughtException', (e) => { void log('error', 'worker', `Uncaught: ${e?.stack || e}`.slice(0, 1000)); });

async function main() {
  if (process.env.RUN_MIGRATIONS !== 'false') await runMigrations();
  startScheduler();
}

main().catch((e) => {
  console.error('Worker gagal start:', e);
  process.exit(1);
});

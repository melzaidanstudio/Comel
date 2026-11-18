import { lockPool } from './db';

/**
 * Kunci per akun lintas proses (web & worker) memakai Postgres advisory lock.
 * Jika akun sedang dipakai pekerjaan lain, fn tidak dijalankan dan return { busy: true }.
 */
export async function withAccountLock<T>(accountId: number, fn: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
  const client = await lockPool.connect();
  const key = 7_000_000 + accountId; // ruang kunci khusus akun
  try {
    const r = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [key]);
    if (!r.rows[0]?.ok) return { busy: true };
    try {
      return { busy: false, value: await fn() };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

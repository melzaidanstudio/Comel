import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const g = globalThis as unknown as { __comelPool?: Pool; __comelLockPool?: Pool };
const connectionString = process.env.DATABASE_URL || 'postgres://comel:comel@localhost:5432/comel';

export const pool = g.__comelPool ?? new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 10),
  connectionTimeoutMillis: 30_000, // lebih baik error daripada menunggu selamanya
});
g.__comelPool = pool; // hindari banyak pool saat hot-reload

/**
 * Pool khusus advisory lock per akun. Koneksi lock ditahan selama pekerjaan berjalan (bisa beberapa menit),
 * jadi dipisah dari pool query agar banyak akun yang jalan bersamaan tidak menghabiskan koneksi query.
 */
export const lockPool = g.__comelLockPool ?? new Pool({
  connectionString,
  max: Number(process.env.DB_LOCK_POOL_MAX || 20),
  connectionTimeoutMillis: 30_000,
});
g.__comelLockPool = lockPool;

export const db = drizzle({ client: pool, schema, casing: 'snake_case' });

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const g = globalThis as unknown as { __comelPool?: Pool };

export const pool = g.__comelPool ?? new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://comel:comel@localhost:5432/comel',
  max: Number(process.env.DB_POOL_MAX || 10),
});
g.__comelPool = pool; // hindari banyak pool saat hot-reload

export const db = drizzle({ client: pool, schema, casing: 'snake_case' });

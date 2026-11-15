import { lt, sql } from 'drizzle-orm';
import { db } from './db';
import { logs } from './db/schema';

type Level = 'info' | 'warn' | 'error';

export async function log(level: Level, source: string, message: unknown) {
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${source}: ${msg}`;
  if (level === 'error') console.error(line); else console.log(line);
  try {
    await db.insert(logs).values({ level, source, message: msg.slice(0, 4000) });
    if (Math.random() < 0.02) await db.delete(logs).where(lt(logs.ts, sql`now() - interval '14 days'`));
  } catch (e) {
    console.error('Gagal menulis log ke database:', (e as Error).message);
  }
}

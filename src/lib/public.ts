import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from './db';
import { actions, type Provider, type ThreadsAccount } from './db/schema';

const mask = (s: string) => (s ? `••••${s.slice(-4)}` : '');

/** Provider tanpa API key mentah. */
export function publicProvider(p: Provider) {
  const { apiKey, ...rest } = p;
  return { ...rest, apiKeyMasked: mask(apiKey), hasKey: Boolean(apiKey) };
}
export type PublicProvider = ReturnType<typeof publicProvider>;

/** Akun + jumlah kiriman 24 jam & 1 jam terakhir. */
export async function publicAccount(a: ThreadsAccount) {
  const sent = (interval: string) => db.select({ n: count() }).from(actions).where(and(
    eq(actions.accountId, a.id), eq(actions.status, 'sent'), gte(actions.createdAt, sql.raw(`now() - interval '${interval}'`)),
  )).then((r) => r[0].n);
  const [sent24h, sent1h] = await Promise.all([sent('24 hours'), sent('1 hour')]);
  return { ...a, sent24h, sent1h };
}
export type PublicAccount = Awaited<ReturnType<typeof publicAccount>>;

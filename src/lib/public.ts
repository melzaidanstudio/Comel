import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from './db';
import { actions, type Provider, type ThreadsAccount } from './db/schema';
import { cookieSummary } from './posters/browser';

const mask = (s: string) => (s ? `••••${s.slice(-4)}` : '');

/** Provider tanpa API key mentah. */
export function publicProvider(p: Provider) {
  const { apiKey, ...rest } = p;
  return { ...rest, apiKeyMasked: mask(apiKey), hasKey: Boolean(apiKey) };
}
export type PublicProvider = ReturnType<typeof publicProvider>;

/** Akun tanpa token/cookie/password mentah. */
export async function publicAccount(a: ThreadsAccount) {
  const { accessToken, cookies, loginPasswordEnc, totpSecretEnc, ...rest } = a;
  const [{ n }] = await db.select({ n: count() }).from(actions).where(and(
    eq(actions.accountId, a.id), eq(actions.status, 'sent'), gte(actions.createdAt, sql`now() - interval '24 hours'`),
  ));
  return {
    ...rest,
    tokenMasked: mask(accessToken),
    hasToken: Boolean(accessToken),
    cookieInfo: cookieSummary(cookies),
    hasLoginPassword: Boolean(loginPasswordEnc),
    hasTotp: Boolean(totpSecretEnc),
    sent24h: n,
  };
}
export type PublicAccount = Awaited<ReturnType<typeof publicAccount>>;

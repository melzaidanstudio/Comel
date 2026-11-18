import { and, count, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from './db';
import { actions } from './db/schema';

export type NewAction = typeof actions.$inferInsert;

export async function recordAction(a: NewAction) {
  const [row] = await db.insert(actions).values(a).returning();
  return row;
}

export async function hasActedOn(accountId: number, code: string) {
  const [row] = await db.select({ id: actions.id }).from(actions).where(and(
    eq(actions.accountId, accountId), eq(actions.targetCode, code),
    inArray(actions.status, ['sent', 'skipped', 'dry_run']),
  )).limit(1);
  return Boolean(row);
}

export async function failedAttempts(accountId: number, code: string) {
  const [{ n }] = await db.select({ n: count() }).from(actions).where(and(
    eq(actions.accountId, accountId), eq(actions.targetCode, code), eq(actions.status, 'failed'),
  ));
  return n;
}

export async function recentlyCommentedAuthor(accountId: number, username: string, hours: number) {
  if (!hours) return false;
  const [row] = await db.select({ id: actions.id }).from(actions).where(and(
    eq(actions.accountId, accountId), eq(actions.targetUser, username), eq(actions.status, 'sent'),
    eq(actions.kind, 'comment'), gte(actions.createdAt, new Date(Date.now() - hours * 3600_000)),
  )).limit(1);
  return Boolean(row);
}

export async function sentLast24h(accountId: number) {
  const [{ n }] = await db.select({ n: count() }).from(actions).where(and(
    eq(actions.accountId, accountId), eq(actions.status, 'sent'),
    gte(actions.createdAt, sql`now() - interval '24 hours'`),
  ));
  return n;
}

export async function sentLastHour(accountId: number) {
  const [{ n }] = await db.select({ n: count() }).from(actions).where(and(
    eq(actions.accountId, accountId), eq(actions.status, 'sent'),
    gte(actions.createdAt, sql`now() - interval '1 hour'`),
  ));
  return n;
}

export async function recentReplyTexts(accountId: number, limit = 8) {
  const rows = await db.select({ t: actions.replyText }).from(actions).where(and(
    eq(actions.accountId, accountId), inArray(actions.status, ['sent', 'dry_run']), isNotNull(actions.replyText),
  )).orderBy(desc(actions.id)).limit(limit);
  return rows.map((r) => r.t!).filter(Boolean);
}

import { and, desc, eq, type SQL } from 'drizzle-orm';
import { route } from '@/lib/api';
import { db } from '@/lib/db';
import { actions, threadsAccounts, triggers } from '@/lib/db/schema';

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const where: SQL[] = [];
  if (q.get('status')) where.push(eq(actions.status, q.get('status')!));
  if (q.get('kind')) where.push(eq(actions.kind, q.get('kind')!));
  if (q.get('accountId')) where.push(eq(actions.accountId, Number(q.get('accountId'))));
  const limit = Math.min(500, Number(q.get('limit')) || 100);
  return db.select({ action: actions, accountName: threadsAccounts.name, triggerName: triggers.name })
    .from(actions)
    .leftJoin(threadsAccounts, eq(threadsAccounts.id, actions.accountId))
    .leftJoin(triggers, eq(triggers.id, actions.triggerId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(actions.id)).limit(limit)
    .then((rows) => rows.map((r) => ({ ...r.action, accountName: r.accountName, triggerName: r.triggerName })));
});

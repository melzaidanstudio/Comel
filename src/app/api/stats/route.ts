import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import { route } from '@/lib/api';
import { db } from '@/lib/db';
import { actions, threadsAccounts, triggers } from '@/lib/db/schema';
import { getSettings } from '@/lib/settings';

export const GET = route(async () => {
  const since = sql`now() - interval '24 hours'`;
  const c = async (status: string[]) => (await db.select({ n: count() }).from(actions)
    .where(and(inArray(actions.status, status), gte(actions.createdAt, since))))[0].n;
  const [acc] = await db.select({ n: count() }).from(threadsAccounts).where(eq(threadsAccounts.enabled, true));
  const [trg] = await db.select({ n: count() }).from(triggers).where(eq(triggers.enabled, true));
  return {
    sent24: await c(['sent']),
    failed24: await c(['failed']),
    skipped24: await c(['skipped', 'dry_run']),
    accounts: acc.n,
    triggers: trg.n,
    paused: (await getSettings()).paused,
  };
});

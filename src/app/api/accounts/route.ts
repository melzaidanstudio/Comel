import { asc } from 'drizzle-orm';
import { body, route } from '@/lib/api';
import { accountPatch } from '@/lib/account-input';
import { db } from '@/lib/db';
import { threadsAccounts } from '@/lib/db/schema';
import { publicAccount } from '@/lib/public';

export const GET = route(async () => {
  const rows = await db.select().from(threadsAccounts).orderBy(asc(threadsAccounts.id));
  return Promise.all(rows.map(publicAccount));
});

export const POST = route(async (req) => {
  const patch = accountPatch(await body(req), { partial: false });
  if (!patch.username && patch.loginUsername && !patch.loginUsername.includes('@')) patch.username = patch.loginUsername;
  const [a] = await db.insert(threadsAccounts).values(patch as typeof threadsAccounts.$inferInsert).returning();
  return publicAccount(a);
});

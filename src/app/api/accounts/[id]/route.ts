import { eq } from 'drizzle-orm';
import { body, idOf, notFound, route } from '@/lib/api';
import { accountPatch } from '@/lib/account-input';
import { getAccount } from '@/lib/accounts';
import { db } from '@/lib/db';
import { threadsAccounts } from '@/lib/db/schema';
import { publicAccount } from '@/lib/public';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const current = await getAccount(await idOf(ctx));
  if (!current) throw notFound('Akun');
  const patch = accountPatch(await body(req), { partial: true, current });
  const [a] = await db.update(threadsAccounts).set(patch).where(eq(threadsAccounts.id, current.id)).returning();
  return publicAccount(a);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await db.delete(threadsAccounts).where(eq(threadsAccounts.id, await idOf(ctx)));
});

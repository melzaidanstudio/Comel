import { eq } from 'drizzle-orm';
import { body, idOf, notFound, route } from '@/lib/api';
import { db } from '@/lib/db';
import { threadsAccounts } from '@/lib/db/schema';
import { publicAccount } from '@/lib/public';
import { accountSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const v = accountSchema.omit({ replizAccountId: true }).partial().parse(await body(req));
  const [a] = await db.update(threadsAccounts).set(v).where(eq(threadsAccounts.id, await idOf(ctx))).returning();
  if (!a) throw notFound('Akun');
  return publicAccount(a);
});

/** Hanya menghapus dari Comel; akun di Repliz tidak disentuh. */
export const DELETE = route(async (_req, ctx: Ctx) => {
  await db.delete(threadsAccounts).where(eq(threadsAccounts.id, await idOf(ctx)));
});

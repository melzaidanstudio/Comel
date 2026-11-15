import { eq } from 'drizzle-orm';
import { body, idOf, notFound, route } from '@/lib/api';
import { db } from '@/lib/db';
import { triggers } from '@/lib/db/schema';
import { triggerSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const v = triggerSchema.partial().parse(await body(req));
  const [t] = await db.update(triggers).set(v).where(eq(triggers.id, await idOf(ctx))).returning();
  if (!t) throw notFound('Trigger');
  return t;
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await db.delete(triggers).where(eq(triggers.id, await idOf(ctx)));
});

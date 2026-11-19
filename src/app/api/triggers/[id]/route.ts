import { eq } from 'drizzle-orm';
import { body, HttpError, idOf, notFound, route } from '@/lib/api';
import { db } from '@/lib/db';
import { triggers } from '@/lib/db/schema';
import { hasSearchSource, NO_SOURCE_MESSAGE } from '@/lib/filters';
import { triggerSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const id = await idOf(ctx);
  const v = triggerSchema.partial().parse(await body(req));
  const [cur] = await db.select().from(triggers).where(eq(triggers.id, id));
  if (!cur) throw notFound('Trigger');
  if (!hasSearchSource({ ...cur, ...v })) throw new HttpError(400, NO_SOURCE_MESSAGE);
  const [t] = await db.update(triggers).set(v).where(eq(triggers.id, id)).returning();
  return t;
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await db.delete(triggers).where(eq(triggers.id, await idOf(ctx)));
});

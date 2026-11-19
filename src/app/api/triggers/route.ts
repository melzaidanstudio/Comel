import { asc } from 'drizzle-orm';
import { body, HttpError, route } from '@/lib/api';
import { db } from '@/lib/db';
import { triggers } from '@/lib/db/schema';
import { hasSearchSource, NO_SOURCE_MESSAGE } from '@/lib/filters';
import { triggerSchema } from '@/lib/validators';

export const GET = route(() => db.select().from(triggers).orderBy(asc(triggers.id)));

export const POST = route(async (req) => {
  const v = triggerSchema.parse(await body(req));
  if (!hasSearchSource(v)) throw new HttpError(400, NO_SOURCE_MESSAGE);
  const [t] = await db.insert(triggers).values({ ...v, nextRunAt: null }).returning();
  return t;
});

import { asc } from 'drizzle-orm';
import { body, route } from '@/lib/api';
import { db } from '@/lib/db';
import { triggers } from '@/lib/db/schema';
import { triggerSchema } from '@/lib/validators';

export const GET = route(() => db.select().from(triggers).orderBy(asc(triggers.id)));

export const POST = route(async (req) => {
  const v = triggerSchema.parse(await body(req));
  const [t] = await db.insert(triggers).values({ ...v, nextRunAt: null }).returning();
  return t;
});

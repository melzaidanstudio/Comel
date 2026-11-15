import { asc, count, ne } from 'drizzle-orm';
import { body, route } from '@/lib/api';
import { db } from '@/lib/db';
import { providers } from '@/lib/db/schema';
import { publicProvider } from '@/lib/public';
import { providerSchema } from '@/lib/validators';

export const GET = route(async () => (await db.select().from(providers).orderBy(asc(providers.id))).map(publicProvider));

export const POST = route(async (req) => {
  const { clearApiKey: _c, ...v } = providerSchema.parse(await body(req)); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [{ n }] = await db.select({ n: count() }).from(providers);
  const [p] = await db.insert(providers).values({ ...v, apiKey: v.apiKey || '', isDefault: v.isDefault || n === 0 }).returning();
  if (p.isDefault) await db.update(providers).set({ isDefault: false }).where(ne(providers.id, p.id));
  return publicProvider(p);
});


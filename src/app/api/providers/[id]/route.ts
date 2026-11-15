import { eq, ne } from 'drizzle-orm';
import { body, idOf, notFound, route } from '@/lib/api';
import { db } from '@/lib/db';
import { providers } from '@/lib/db/schema';
import { publicProvider } from '@/lib/public';
import { providerSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const id = await idOf(ctx);
  const { apiKey, clearApiKey, ...v } = providerSchema.partial().parse(await body(req));
  const patch: Partial<typeof providers.$inferInsert> = { ...v };
  if (clearApiKey) patch.apiKey = '';
  else if (apiKey) patch.apiKey = apiKey; // kosong = tidak diganti
  const [p] = await db.update(providers).set(patch).where(eq(providers.id, id)).returning();
  if (!p) throw notFound('Provider');
  if (v.isDefault) await db.update(providers).set({ isDefault: false }).where(ne(providers.id, id));
  return publicProvider(p);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await db.delete(providers).where(eq(providers.id, await idOf(ctx)));
});

import { eq, ne } from 'drizzle-orm';
import { body, idOf, notFound, route } from '@/lib/api';
import { db } from '@/lib/db';
import { providers } from '@/lib/db/schema';
import { publicProvider } from '@/lib/public';
import { encrypt } from '@/lib/secrets';
import { providerSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route(async (req, ctx: Ctx) => {
  const id = await idOf(ctx);
  const { apiKey, clearApiKey, ...v } = providerSchema.partial().parse(await body(req));
  const patch: Partial<typeof providers.$inferInsert> = { ...v };
  const [cur] = await db.select().from(providers).where(eq(providers.id, id));
  if (!cur) throw notFound('Provider');
  // API key tidak ikut terkirim ke host lain: ganti host base URL tanpa key baru = key dihapus
  const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };
  const hostChanged = v.baseUrl !== undefined && hostOf(v.baseUrl) !== hostOf(cur.baseUrl);
  if (apiKey) patch.apiKey = encrypt(apiKey); // kosong = tidak diganti
  else if (clearApiKey || hostChanged) patch.apiKey = '';
  const [p] = await db.update(providers).set(patch).where(eq(providers.id, id)).returning();
  if (!p) throw notFound('Provider');
  if (v.isDefault) await db.update(providers).set({ isDefault: false }).where(ne(providers.id, id));
  return publicProvider(p);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  await db.delete(providers).where(eq(providers.id, await idOf(ctx)));
});

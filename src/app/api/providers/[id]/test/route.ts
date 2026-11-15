import { eq } from 'drizzle-orm';
import { idOf, notFound, route } from '@/lib/api';
import { db } from '@/lib/db';
import { providers } from '@/lib/db/schema';
import { chat } from '@/lib/llm';

export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const [p] = await db.select().from(providers).where(eq(providers.id, await idOf(ctx)));
  if (!p) throw notFound('Provider');
  const t0 = Date.now();
  const reply = await chat(p, [
    { role: 'system', content: 'Jawab singkat.' },
    { role: 'user', content: 'Balas dengan satu kalimat: "Halo, koneksi berhasil!"' },
  ], { maxTokens: 60 });
  return { ok: true, reply, ms: Date.now() - t0 };
});

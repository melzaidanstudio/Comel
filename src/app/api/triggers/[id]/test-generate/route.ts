import { body, HttpError, idOf, route } from '@/lib/api';
import { generateReply, resolveProvider } from '@/lib/llm';
import { effectivePersona } from '@/lib/persona';
import { loadTriggerWithAccount } from '@/lib/trigger-helpers';
import type { Post } from '@/lib/types';

/** Contoh komentar AI untuk satu postingan (tanpa mengirim). */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { t, a } = await loadTriggerWithAccount(await idOf(ctx));
  const { post } = await body<{ post?: Partial<Post> }>(req);
  if (!post?.text && !post?.code) throw new HttpError(400, 'Data postingan kosong');
  const text = await generateReply({
    provider: await resolveProvider(t.providerId, a.providerId),
    persona: await effectivePersona(a.id),
    kind: 'comment',
    post: { username: 'seseorang', text: '', takenAt: 0, likes: 0, replies: 0, reposts: 0, shares: 0, ...post },
    instruction: t.instruction,
  });
  return { text };
});

import { body, route } from '@/lib/api';
import { draftCommentReply } from '@/lib/engine';
import { loadInboxComment } from '@/lib/inbox';

/** Saran balasan AI (soul.md + memory.md + instruksi akun). Tidak mengirim apa pun. */
export const POST = route(async (req, ctx: { params: Promise<{ commentId: string }> }) => {
  const { accountId } = await body<{ accountId?: number }>(req);
  const { a, c } = await loadInboxComment(Number(accountId), (await ctx.params).commentId);
  const text = await draftCommentReply(a, c);
  return { text: text === 'SKIP' ? '' : text, skip: text === 'SKIP' };
});

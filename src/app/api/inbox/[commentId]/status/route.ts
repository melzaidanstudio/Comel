import { z } from 'zod';
import { body, route } from '@/lib/api';
import { loadInboxComment } from '@/lib/inbox';
import { setCommentStatus } from '@/lib/repliz';

const schema = z.object({ accountId: z.number().int().positive(), status: z.enum(['pending', 'resolved', 'ignored']) });

/** Abaikan / tandai selesai / kembalikan ke pending (hanya di Repliz, tidak dikirim ke Threads). */
export const POST = route(async (req, ctx: { params: Promise<{ commentId: string }> }) => {
  const v = schema.parse(await body(req));
  const { c } = await loadInboxComment(v.accountId, (await ctx.params).commentId);
  await setCommentStatus(c._id, v.status);
});

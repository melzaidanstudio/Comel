import { z } from 'zod';
import { body, HttpError, route } from '@/lib/api';
import { hasActedOn, recordAction } from '@/lib/actions';
import { loadInboxComment } from '@/lib/inbox';
import { log } from '@/lib/logger';
import { ReplizError, replyComment } from '@/lib/repliz';

const schema = z.object({ accountId: z.number().int().positive(), text: z.string().trim().min(1, 'balasan kosong').max(500) });

/** Kirim balasan manual dari Inbox lewat Repliz (dicatat di Riwayat & dihitung ke batas akun). */
export const POST = route(async (req, ctx: { params: Promise<{ commentId: string }> }) => {
  const v = schema.parse(await body(req));
  const { a, c } = await loadInboxComment(v.accountId, (await ctx.params).commentId);
  const base = {
    accountId: a.id, triggerId: null, kind: 'reply', targetCode: c._id, targetId: c.comment.id,
    targetUser: c.comment.owner?.name || 'seseorang', targetText: (c.comment.text || '').slice(0, 1000),
    targetUrl: c.content?.url || '', replyText: v.text,
  };
  if (await hasActedOn(a.id, c._id)) throw new HttpError(409, 'Komentar ini sudah dibalas/diproses (lihat Riwayat).');
  try {
    const r = await replyComment(c._id, v.text);
    await recordAction({ ...base, status: 'sent', resultId: r.commentId || null });
    await log('info', `inbox:${a.name}`, `Balasan manual ke @${base.targetUser}: ${v.text}`);
    return { ok: true, commentId: r.commentId };
  } catch (e) {
    const uncertain = e instanceof ReplizError && e.status === 0;
    await recordAction({ ...base, status: uncertain ? 'uncertain' : 'failed', error: (e as Error).message });
    throw e;
  }
});

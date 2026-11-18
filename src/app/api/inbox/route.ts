import { z } from 'zod';
import { HttpError, notFound, route } from '@/lib/api';
import { getAccount } from '@/lib/accounts';
import { hasActedOn } from '@/lib/actions';
import { listComments } from '@/lib/repliz';

const query = z.object({
  accountId: z.coerce.number().int().positive(),
  status: z.enum(['pending', 'resolved', 'ignored']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
});

/** Komentar di postingan akun (antrean Repliz), ditandai yang sudah diproses Comel. */
export const GET = route(async (req) => {
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const a = await getAccount(q.accountId);
  if (!a) throw notFound('Akun');
  if (!a.replizAccountId) throw new HttpError(400, 'Akun belum terhubung ke Repliz');
  const r = await listComments({ accountIds: [a.replizAccountId], status: q.status, page: q.page, limit: 30 });
  const items = await Promise.all((r.docs || []).map(async (c) => ({
    id: c._id,
    status: c.status,
    author: c.comment.owner?.name || 'seseorang',
    picture: c.comment.owner?.picture || '',
    text: c.comment.text || '',
    createdAt: c.comment.createdAt || c.createdAt || null,
    post: { text: c.content?.description || '', url: c.content?.url || '' },
    handledByComel: await hasActedOn(a.id, c._id),
  })));
  return { items, page: r.page || q.page, totalPages: r.totalPages || 1, total: r.totalDocs ?? items.length };
});

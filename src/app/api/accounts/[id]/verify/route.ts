import { idOf, notFound, route } from '@/lib/api';
import { getAccount, updateAccount } from '@/lib/accounts';
import { verifyAccount } from '@/lib/posters';

export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const a = await getAccount(await idOf(ctx));
  if (!a) throw notFound('Akun');
  try {
    return await verifyAccount(a);
  } catch (e) {
    await updateAccount(a.id, { statusNote: `ERROR: ${(e as Error).message.slice(0, 200)}` });
    throw e;
  }
});

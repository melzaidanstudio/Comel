import { idOf, notFound, route } from '@/lib/api';
import { getAccount, replizFields, updateAccount } from '@/lib/accounts';
import { getAccount as getReplizAccount } from '@/lib/repliz';

/** Tes koneksi: cek status akun di Repliz dan samakan datanya. */
export const POST = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const a = await getAccount(await idOf(ctx));
  if (!a) throw notFound('Akun');
  try {
    const r = await getReplizAccount(a.replizAccountId);
    const statusNote = r.isConnected ? 'Terhubung di Repliz' : 'Terputus di Repliz — buka dashboard Repliz → Account Integration → Reconnect';
    await updateAccount(a.id, { ...replizFields(r), statusNote });
    return { ok: r.isConnected, username: r.username, isConnected: r.isConnected, message: statusNote };
  } catch (e) {
    await updateAccount(a.id, { statusNote: `ERROR: ${(e as Error).message.slice(0, 200)}` });
    throw e;
  }
});

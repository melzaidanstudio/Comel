import { route } from '@/lib/api';
import { replizFields, updateAccount } from '@/lib/accounts';
import { db } from '@/lib/db';
import { threadsAccounts } from '@/lib/db/schema';
import { listThreadsAccounts } from '@/lib/repliz';

/** Samakan semua akun lokal dengan daftar akun Threads di Repliz. */
export const POST = route(async () => {
  const [remote, local] = await Promise.all([listThreadsAccounts(), db.select().from(threadsAccounts)]);
  const byId = new Map(remote.map((r) => [r._id, r]));
  let updated = 0; let missing = 0;
  for (const a of local) {
    const r = byId.get(a.replizAccountId);
    if (!r) {
      missing++;
      await updateAccount(a.id, { isConnected: false, statusNote: 'Tidak ditemukan di Repliz (dihapus dari workspace?)' });
      continue;
    }
    updated++;
    await updateAccount(a.id, { ...replizFields(r), statusNote: r.isConnected ? 'Terhubung di Repliz' : 'Terputus di Repliz — reconnect di dashboard Repliz' });
  }
  return { updated, missing };
});

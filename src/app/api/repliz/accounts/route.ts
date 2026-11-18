import { route } from '@/lib/api';
import { db } from '@/lib/db';
import { threadsAccounts } from '@/lib/db/schema';
import { listThreadsAccounts } from '@/lib/repliz';

/** Akun Threads di Repliz, ditandai yang sudah ditambahkan ke Comel. */
export const GET = route(async () => {
  const [remote, local] = await Promise.all([
    listThreadsAccounts(),
    db.select({ replizAccountId: threadsAccounts.replizAccountId }).from(threadsAccounts),
  ]);
  const added = new Set(local.map((l) => l.replizAccountId));
  return remote.map((r) => ({
    id: r._id, name: r.name, username: r.username, picture: r.picture || '', isConnected: r.isConnected, added: added.has(r._id),
  }));
});

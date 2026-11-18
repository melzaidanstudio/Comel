import { eq } from 'drizzle-orm';
import { db } from './db';
import { threadsAccounts, type ThreadsAccount } from './db/schema';
import { listThreadsAccounts, type ReplizAccount } from './repliz';

export async function getAccount(id: number): Promise<ThreadsAccount | null> {
  const [a] = await db.select().from(threadsAccounts).where(eq(threadsAccounts.id, id));
  return a || null;
}

/** Samakan nama, username, foto, dan status koneksi akun lokal dengan data di Repliz. */
export function replizFields(r: ReplizAccount) {
  return { username: r.username || '', picture: r.picture || '', isConnected: Boolean(r.isConnected), syncedAt: new Date() };
}

/** Samakan semua akun lokal dengan daftar akun Threads di Repliz. */
export async function syncAllAccounts() {
  const [remote, local] = await Promise.all([listThreadsAccounts(), db.select().from(threadsAccounts)]);
  const byId = new Map(remote.map((r) => [r._id, r]));
  let updated = 0; let missing = 0;
  for (const a of local) {
    if (!a.replizAccountId) continue;
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
}

export async function updateAccount(id: number, patch: Partial<typeof threadsAccounts.$inferInsert>) {
  const [a] = await db.update(threadsAccounts).set(patch).where(eq(threadsAccounts.id, id)).returning();
  return a;
}

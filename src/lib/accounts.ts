import { eq } from 'drizzle-orm';
import { db } from './db';
import { threadsAccounts, type ThreadsAccount } from './db/schema';
import type { ReplizAccount } from './repliz';

export async function getAccount(id: number): Promise<ThreadsAccount | null> {
  const [a] = await db.select().from(threadsAccounts).where(eq(threadsAccounts.id, id));
  return a || null;
}

/** Samakan nama, username, foto, dan status koneksi akun lokal dengan data di Repliz. */
export function replizFields(r: ReplizAccount) {
  return { username: r.username || '', picture: r.picture || '', isConnected: Boolean(r.isConnected), syncedAt: new Date() };
}

export async function updateAccount(id: number, patch: Partial<typeof threadsAccounts.$inferInsert>) {
  const [a] = await db.update(threadsAccounts).set(patch).where(eq(threadsAccounts.id, id)).returning();
  return a;
}

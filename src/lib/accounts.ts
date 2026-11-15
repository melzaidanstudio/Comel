import { eq } from 'drizzle-orm';
import { db } from './db';
import { threadsAccounts, type ThreadsAccount } from './db/schema';

export async function getAccount(id: number): Promise<ThreadsAccount | null> {
  const [a] = await db.select().from(threadsAccounts).where(eq(threadsAccounts.id, id));
  return a || null;
}

export async function updateAccount(id: number, patch: Partial<typeof threadsAccounts.$inferInsert>) {
  const [a] = await db.update(threadsAccounts).set(patch).where(eq(threadsAccounts.id, id)).returning();
  return a;
}

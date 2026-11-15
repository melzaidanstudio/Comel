import { eq } from 'drizzle-orm';
import { notFound } from './api';
import { getAccount } from './accounts';
import { db } from './db';
import { triggers } from './db/schema';

export async function loadTriggerWithAccount(id: number) {
  const [t] = await db.select().from(triggers).where(eq(triggers.id, id));
  if (!t) throw notFound('Trigger');
  const a = await getAccount(t.accountId);
  if (!a) throw notFound('Akun trigger');
  return { t, a };
}

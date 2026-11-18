import { asc, eq } from 'drizzle-orm';
import { body, HttpError, route } from '@/lib/api';
import { replizFields } from '@/lib/accounts';
import { db } from '@/lib/db';
import { threadsAccounts } from '@/lib/db/schema';
import { publicAccount } from '@/lib/public';
import { getAccount as getReplizAccount } from '@/lib/repliz';
import { accountSchema } from '@/lib/validators';

export const GET = route(async () => {
  const rows = await db.select().from(threadsAccounts).orderBy(asc(threadsAccounts.id));
  return Promise.all(rows.map(publicAccount));
});

/** Tambah akun: pilih akun Threads yang sudah terhubung di Repliz. */
export const POST = route(async (req) => {
  const v = accountSchema.parse(await body(req));
  const [dup] = await db.select({ id: threadsAccounts.id }).from(threadsAccounts).where(eq(threadsAccounts.replizAccountId, v.replizAccountId));
  if (dup) throw new HttpError(409, 'Akun Repliz ini sudah ditambahkan');
  const remote = await getReplizAccount(v.replizAccountId);
  if (remote.type !== 'threads') throw new HttpError(400, 'Akun Repliz ini bukan akun Threads');
  const [a] = await db.insert(threadsAccounts).values({
    ...v, ...replizFields(remote), name: v.name || remote.name, statusNote: remote.isConnected ? 'Terhubung di Repliz' : 'Terputus di Repliz — reconnect di dashboard Repliz',
  }).returning();
  return publicAccount(a);
});

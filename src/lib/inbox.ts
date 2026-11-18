import { HttpError, notFound } from './api';
import { getAccount } from './accounts';
import { getComment } from './repliz';

/** Ambil akun lokal + komentar Repliz, dan pastikan komentarnya memang milik akun itu. */
export async function loadInboxComment(accountId: number, commentId: string) {
  const a = await getAccount(accountId);
  if (!a) throw notFound('Akun');
  if (!a.replizAccountId) throw new HttpError(400, 'Akun belum terhubung ke Repliz');
  const c = await getComment(commentId);
  if (c.accountId !== a.replizAccountId) throw new HttpError(403, 'Komentar ini bukan milik akun yang dipilih');
  return { a, c };
}

import { body, HttpError, idOf, notFound, route } from '@/lib/api';
import { getAccount } from '@/lib/accounts';
import { browser } from '@/lib/posters';

/** Login sekarang dengan username + password tersimpan (opsional kode 2FA). */
export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const a = await getAccount(await idOf(ctx));
  if (!a) throw notFound('Akun');
  if (a.method !== 'browser') throw new HttpError(400, 'Login dengan password hanya untuk metode "Browser"');
  const { code } = await body<{ code?: string }>(req);
  return browser.loginWithPassword(a, { code });
});

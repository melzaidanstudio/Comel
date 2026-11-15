import { body, HttpError, idOf, notFound, route } from '@/lib/api';
import { getAccount } from '@/lib/accounts';
import { browser } from '@/lib/posters';

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const a = await getAccount(await idOf(ctx));
  if (!a) throw notFound('Akun');
  const { code } = await body<{ code?: string }>(req);
  if (!code) throw new HttpError(400, 'Kode 2FA kosong');
  return browser.submitPending2fa(a, code);
});

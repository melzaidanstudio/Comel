import type { z } from 'zod';
import type { threadsAccounts } from './db/schema';
import { parseCookies } from './posters/browser';
import { encrypt, totp } from './secrets';
import { accountSchema } from './validators';

type Input = Partial<z.infer<typeof accountSchema>>;

/**
 * Ubah input form menjadi patch DB: rahasia hanya diganti bila diisi,
 * password & kunci 2FA dienkripsi, cookie divalidasi.
 */
export function accountPatch(
  raw: unknown,
  { partial, current }: { partial: boolean; current?: { loginUsername: string } },
) {
  const v: Input = (partial ? accountSchema.partial() : accountSchema).parse(raw);
  const { accessToken, clearAccessToken, cookies, clearCookies, loginPassword, totpSecret, clearLoginSecrets, ...rest } = v;
  const patch: Partial<typeof threadsAccounts.$inferInsert> = { ...rest };

  if (clearAccessToken) patch.accessToken = '';
  else if (accessToken) { patch.accessToken = accessToken.trim(); patch.tokenRefreshedAt = null; }

  if (clearCookies) patch.cookies = '';
  else if (cookies) { parseCookies(cookies); patch.cookies = cookies; }

  if (clearLoginSecrets) { patch.loginPasswordEnc = ''; patch.totpSecretEnc = ''; }
  if (loginPassword) patch.loginPasswordEnc = encrypt(loginPassword);
  if (totpSecret) {
    const s = totpSecret.replace(/\s/g, '');
    totp(s); // validasi base32
    patch.totpSecretEnc = encrypt(s);
  }
  // Jeda login otomatis (setelah password salah/checkpoint) hanya dicabut bila data login benar-benar diganti,
  // bukan setiap kali form akun disimpan.
  const usernameChanged = v.loginUsername !== undefined && v.loginUsername !== (current?.loginUsername ?? '');
  if (loginPassword || totpSecret || usernameChanged) patch.loginPaused = false;
  return patch;
}

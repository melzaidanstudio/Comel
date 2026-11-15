import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountPatch } from '../src/lib/account-input';
import { decrypt } from '../src/lib/secrets';

const current = { loginUsername: 'akunku' };

test('menyimpan akun tanpa mengganti data login TIDAK mencabut jeda login otomatis', () => {
  const p = accountPatch({ name: 'A', loginUsername: 'akunku', dailyLimit: 30, loginPassword: '' }, { partial: true, current });
  assert.equal(p.loginPaused, undefined);
  assert.equal(p.loginPasswordEnc, undefined); // password kosong = tidak diganti
});

test('ganti password / kunci 2FA / username mencabut jeda', () => {
  const a = accountPatch({ loginPassword: 'baru123' }, { partial: true, current });
  assert.equal(a.loginPaused, false);
  assert.equal(decrypt(a.loginPasswordEnc!), 'baru123');
  assert.equal(accountPatch({ totpSecret: 'JBSWY3DPEHPK3PXP' }, { partial: true, current }).loginPaused, false);
  assert.equal(accountPatch({ loginUsername: '@akunlain' }, { partial: true, current }).loginPaused, false);
});

test('validasi input akun', () => {
  assert.throws(() => accountPatch({ totpSecret: 'bukan base32!' }, { partial: true, current }), /2FA/);
  assert.throws(() => accountPatch({ cookies: '[{"name":' }, { partial: true, current }));
  assert.equal(accountPatch({ accessToken: '  tok  ' }, { partial: true, current }).accessToken, 'tok');
  assert.equal(accountPatch({ clearLoginSecrets: true }, { partial: true, current }).loginPasswordEnc, '');
});

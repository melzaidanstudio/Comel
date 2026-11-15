import { test } from 'node:test';
import assert from 'node:assert/strict';
// DATA_DIR diarahkan ke folder sementara oleh script `npm test`
import { resolveActiveHours, withinActiveHours } from '../src/lib/hours';
import { encrypt, decrypt, totp } from '../src/lib/secrets';
import { cleanReply } from '../src/lib/llm';

const m = (hhmm: string) => { const [h, mm] = hhmm.split(':').map(Number); return h * 60 + mm; };
const S = { activeStart: '06:00', activeEnd: '22:00' };

test('jam aktif default 06:00-22:00', () => {
  const spec = resolveActiveHours('', S);
  assert.equal(spec, '06:00-22:00');
  assert.equal(withinActiveHours(spec, 'UTC', m('05:59')), false);
  assert.equal(withinActiveHours(spec, 'UTC', m('06:00')), true);
  assert.equal(withinActiveHours(spec, 'UTC', m('22:00')), false);
});

test('jam aktif 24 jam, kustom, lewat tengah malam', () => {
  assert.equal(resolveActiveHours('24h', S), '');
  assert.equal(resolveActiveHours('', { activeStart: '06:00', activeEnd: '06:00' }), '');
  const night = resolveActiveHours('20:00-02:00', S);
  assert.equal(withinActiveHours(night, 'UTC', m('23:30')), true);
  assert.equal(withinActiveHours(night, 'UTC', m('12:00')), false);
  assert.equal(withinActiveHours('07:00-09:00, 18:00-20:00', 'UTC', m('19:00')), true);
});

test('enkripsi password', () => {
  const enc = encrypt('rahasia 123 😀');
  assert.match(enc, /^v1:/);
  assert.notEqual(enc, encrypt('rahasia 123 😀'));
  assert.equal(decrypt(enc), 'rahasia 123 😀');
  assert.throws(() => decrypt(enc.slice(0, -4) + 'AAAA'));
});

test('TOTP sesuai RFC 6238', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totp(secret, { time: 59_000, digits: 8 }), '94287082');
  assert.equal(totp(secret, { time: 1111111109_000, digits: 8 }), '07081804');
  assert.throws(() => totp('bukan-base32!'), /2FA/);
});

test('cleanReply', () => {
  assert.equal(cleanReply('<think>hmm</think>"Balasan: enak banget"', 280), 'enak banget');
  assert.equal(cleanReply('SKIP - tidak relevan', 280), 'SKIP');
  assert.ok(cleanReply('a '.repeat(300), 50).length <= 50);
});

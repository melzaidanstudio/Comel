import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'comel-test-'));
const { resolveActiveHours, withinActiveHours } = await import('../src/scheduler.js');
const { encrypt, decrypt, totp } = await import('../src/secrets.js');

const m = (hhmm) => { const [h, mm] = hhmm.split(':').map(Number); return h * 60 + mm; };
const S = { active_start: '06:00', active_end: '22:00' };

test('jam aktif: default 06:00-22:00', () => {
  const spec = resolveActiveHours('', S);
  assert.equal(spec, '06:00-22:00');
  assert.equal(withinActiveHours(spec, 'Asia/Jakarta', m('05:59')), false);
  assert.equal(withinActiveHours(spec, 'Asia/Jakarta', m('06:00')), true);
  assert.equal(withinActiveHours(spec, 'Asia/Jakarta', m('21:59')), true);
  assert.equal(withinActiveHours(spec, 'Asia/Jakarta', m('22:00')), false);
});

test('jam aktif: 24 jam, kustom, lewat tengah malam', () => {
  assert.equal(resolveActiveHours('24h', S), '');
  assert.equal(withinActiveHours(resolveActiveHours('24h', S), 'UTC', m('03:00')), true);
  assert.equal(resolveActiveHours('', { active_start: '06:00', active_end: '06:00' }), '');
  const night = resolveActiveHours('20:00-02:00', S);
  assert.equal(withinActiveHours(night, 'UTC', m('23:30')), true);
  assert.equal(withinActiveHours(night, 'UTC', m('01:59')), true);
  assert.equal(withinActiveHours(night, 'UTC', m('12:00')), false);
  assert.equal(withinActiveHours('07:00-09:00, 18:00-20:00', 'UTC', m('19:00')), true);
});

test('enkripsi password', () => {
  const enc = encrypt('rahasia 123 😀');
  assert.match(enc, /^v1:/);
  assert.notEqual(enc, encrypt('rahasia 123 😀')); // IV acak
  assert.equal(decrypt(enc), 'rahasia 123 😀');
  assert.equal(encrypt(''), '');
  assert.throws(() => decrypt(enc.slice(0, -4) + 'AAAA'));
});

test('TOTP sesuai RFC 6238', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
  assert.equal(totp(secret, { time: 59_000, digits: 8 }), '94287082');
  assert.equal(totp(secret, { time: 1111111109_000, digits: 8 }), '07081804');
  assert.equal(totp(secret, { time: 59_000 }), '287082');
  assert.throws(() => totp('bukan-base32!'), /2FA/);
});

/**
 * Enkripsi data login (password, kunci 2FA) memakai AES-256-GCM.
 * Kunci dari env SECRET_KEY, atau dibuat sekali di DATA_DIR/.secret_key.
 */
import crypto from 'node:crypto';
import { persistentSecret } from './config';

let KEY: Buffer | null = null;
function key(): Buffer {
  if (!KEY) {
    KEY = process.env.SECRET_KEY
      ? crypto.createHash('sha256').update(process.env.SECRET_KEY).digest()
      : Buffer.from(persistentSecret('.secret_key'), 'hex');
  }
  return KEY;
}

export function encrypt(plain: string | null | undefined): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(blob: string | null | undefined): string {
  if (!blob) return '';
  const [v, iv, tag, data] = String(blob).split(':');
  if (v !== 'v1') throw new Error('Format data terenkripsi tidak dikenal');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    throw new Error('Gagal membuka password tersimpan (SECRET_KEY / .secret_key berubah?). Isi ulang password akun.');
  }
}

// ---------- TOTP (RFC 6238) ----------
function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(s).toUpperCase().replace(/[\s=-]/g, '');
  let bits = '';
  for (const ch of clean) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error('Kunci 2FA tidak valid (harus base32, contoh: JBSWY3DPEHPK3PXP)');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totp(secret: string, { step = 30, digits = 6, time = Date.now() } = {}): string {
  const k = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));
  const h = crypto.createHmac('sha1', k).update(counter).digest();
  const off = h[h.length - 1] & 0x0f;
  return ((h.readUInt32BE(off) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
}

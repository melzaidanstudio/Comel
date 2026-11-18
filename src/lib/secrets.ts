/**
 * Enkripsi rahasia (mis. Secret Key Repliz) memakai AES-256-GCM.
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
    throw new Error('Gagal membuka data terenkripsi (SECRET_KEY / .secret_key berubah?). Isi ulang kunci di Pengaturan.');
  }
}

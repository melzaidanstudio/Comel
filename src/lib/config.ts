import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Folder data runtime (bukan kode sumber) → dikecualikan dari file tracing Turbopack.
const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

export const LIGHTPANDA_BIN = process.env.LIGHTPANDA_BIN || 'lightpanda';

/** Rahasia yang dibuat sekali lalu disimpan di DATA_DIR (dipakai bersama oleh web & worker). */
export function persistentSecret(file: string, bytes = 32): string {
  const p = path.join(/*turbopackIgnore: true*/ DATA_DIR, file);
  if (fs.existsSync(/*turbopackIgnore: true*/ p)) return fs.readFileSync(/*turbopackIgnore: true*/ p, 'utf8').trim();
  const s = crypto.randomBytes(bytes).toString('hex');
  fs.writeFileSync(p, s, { mode: 0o600 });
  return s;
}

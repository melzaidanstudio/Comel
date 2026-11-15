import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const COOKIE_DIR = path.join(DATA_DIR, 'cookies');
export const SCREENSHOT_DIR = path.join(DATA_DIR, 'screenshots');
for (const d of [DATA_DIR, COOKIE_DIR, SCREENSHOT_DIR]) fs.mkdirSync(d, { recursive: true });

export const LIGHTPANDA_BIN = process.env.LIGHTPANDA_BIN || 'lightpanda';
export const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '';
export const THREADS_GRAPH_BASE = process.env.THREADS_GRAPH_BASE || 'https://graph.threads.net/v1.0';

/** Rahasia yang dibuat sekali lalu disimpan di DATA_DIR (dipakai bersama oleh web & worker). */
export function persistentSecret(file: string, bytes = 32): string {
  const p = path.join(DATA_DIR, file);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  const s = crypto.randomBytes(bytes).toString('hex');
  fs.writeFileSync(p, s, { mode: 0o600 });
  return s;
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const PERSONA_DIR = path.join(DATA_DIR, 'persona');
export const COOKIE_DIR = path.join(DATA_DIR, 'cookies');
export const SCREENSHOT_DIR = path.join(DATA_DIR, 'screenshots');

for (const d of [DATA_DIR, PERSONA_DIR, COOKIE_DIR, SCREENSHOT_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';
export const LIGHTPANDA_BIN = process.env.LIGHTPANDA_BIN || 'lightpanda';
export const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '';
export const THREADS_GRAPH_BASE = process.env.THREADS_GRAPH_BASE || 'https://graph.threads.net/v1.0';

function persistentSecret(file, bytes = 32) {
  const p = path.join(DATA_DIR, file);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  const s = crypto.randomBytes(bytes).toString('hex');
  fs.writeFileSync(p, s, { mode: 0o600 });
  return s;
}

export const SESSION_SECRET = process.env.SESSION_SECRET || persistentSecret('.session_secret');

// Kalau ADMIN_PASSWORD tidak diset, buat password acak sekali lalu simpan di data/.admin_password
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || persistentSecret('.admin_password', 9);
export const ADMIN_PASSWORD_FROM_ENV = Boolean(process.env.ADMIN_PASSWORD);

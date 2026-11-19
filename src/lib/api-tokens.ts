/**
 * Token akses API untuk alat otomatis (mis. sesi Claude): header `Authorization: Bearer comel_…`.
 * Token hanya ditampilkan sekali saat dibuat; database menyimpan hash SHA-256-nya saja.
 * Token memberi akses yang sama dengan admin di dashboard, kecuali mengelola token itu sendiri.
 */
import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from './db';
import { apiTokens } from './db/schema';

const PREFIX = 'comel_';
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export async function createApiToken(name: string) {
  const token = PREFIX + crypto.randomBytes(32).toString('base64url');
  const [row] = await db.insert(apiTokens)
    .values({ name, tokenHash: hash(token), prefix: token.slice(0, PREFIX.length + 4) })
    .returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt });
  return { token, row };
}

export function listApiTokens() {
  return db.select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens).orderBy(desc(apiTokens.id));
}

export async function deleteApiToken(id: number) {
  const rows = await db.delete(apiTokens).where(eq(apiTokens.id, id)).returning({ id: apiTokens.id });
  return rows.length > 0;
}

/** Ambil token dari header Authorization; null bila tidak ada / bukan token Comel. */
export function bearerFrom(headers: Headers): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(headers.get('authorization') || '');
  return m && m[1].startsWith(PREFIX) ? m[1] : null;
}

/** Cocokkan token dengan database; perbarui "terakhir dipakai" paling sering tiap 5 menit. */
export async function verifyApiToken(token: string) {
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hash(token))).limit(1);
  if (!row) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
  }
  return row;
}

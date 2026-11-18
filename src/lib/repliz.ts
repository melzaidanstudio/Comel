/**
 * Klien Repliz Public API — jembatan koneksi Comel ke Threads.
 * Referensi: docs/repliz.md (rangkuman https://docs.repliz.com/api/introduction.html).
 *
 * Kunci API: env REPLIZ_ACCESS_KEY + REPLIZ_SECRET_KEY, atau disimpan dari dashboard
 * (Secret Key terenkripsi di tabel settings). Env selalu didahulukan.
 */
import crypto from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { db } from './db';
import { settings } from './db/schema';
import { decrypt, encrypt } from './secrets';
import type { Post } from './types';

const API_BASE = (process.env.REPLIZ_API_BASE || 'https://api.repliz.com').replace(/\/+$/, '');
const TIMEOUT_MS = 30_000;

// ---------- konfigurasi koneksi ----------
const KEY = { access: 'replizAccessKey', secret: 'replizSecretKeyEnc', webhook: 'replizWebhookToken' } as const;

type ReplizConnection = {
  accessKey: string;
  secretKey: string;
  webhookToken: string;
  source: 'env' | 'dashboard' | 'none';
};

/**
 * Nilai di kolom jsonb `settings.value`. Disimpan sebagai { v: "..." } karena drizzle mem-parse
 * string jsonb dengan JSON.parse — Access Key berupa angka (mis. "8723985588") akan kembali
 * sebagai number. Format lama (string/number polos) tetap dibaca.
 */
export function fromStored(value: unknown): string {
  if (value && typeof value === 'object' && typeof (value as { v?: unknown }).v === 'string') return (value as { v: string }).v;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '';
}

async function readStored(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings).where(inArray(settings.key, Object.values(KEY)));
  return Object.fromEntries(rows.map((r) => [r.key, fromStored(r.value)]));
}

async function store(key: string, v: string) {
  const value = { v };
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function getReplizConnection(): Promise<ReplizConnection> {
  const stored = await readStored();
  const webhookToken = process.env.REPLIZ_WEBHOOK_TOKEN || stored[KEY.webhook] || '';
  if (process.env.REPLIZ_ACCESS_KEY && process.env.REPLIZ_SECRET_KEY) {
    return { accessKey: process.env.REPLIZ_ACCESS_KEY, secretKey: process.env.REPLIZ_SECRET_KEY, webhookToken, source: 'env' };
  }
  const accessKey = stored[KEY.access] || '';
  const secretKey = stored[KEY.secret] ? decrypt(stored[KEY.secret]) : '';
  return { accessKey, secretKey, webhookToken, source: accessKey && secretKey ? 'dashboard' : 'none' };
}

/** Rapikan input kunci; format "AccessKey:SecretKey" (seperti contoh curl -u) di satu kolom ikut dipecah. */
export function normalizeKeys(access?: string, secret?: string) {
  let accessKey = (access || '').trim();
  let secretKey = (secret || '').trim();
  const pair = !secretKey ? accessKey : !accessKey ? secretKey : '';
  if (pair.includes(':')) {
    const i = pair.indexOf(':');
    accessKey = pair.slice(0, i).trim();
    secretKey = pair.slice(i + 1).trim();
  }
  return { accessKey, secretKey };
}

export async function saveReplizKeys(input: { accessKey?: string; secretKey?: string; clear?: boolean }) {
  if (input.clear) {
    await store(KEY.access, '');
    await store(KEY.secret, '');
    return;
  }
  const { accessKey, secretKey } = normalizeKeys(input.accessKey, input.secretKey);
  if (accessKey) await store(KEY.access, accessKey);
  if (secretKey) await store(KEY.secret, encrypt(secretKey));
}

/** Pesan bila kunci belum lengkap (menyebut kunci mana yang kosong). */
export function missingKeysMessage(c: Pick<ReplizConnection, 'accessKey' | 'secretKey'>) {
  const missing = [!c.accessKey && 'Access Key', !c.secretKey && 'Secret Key'].filter(Boolean).join(' & ');
  return missing ? `Repliz belum terhubung: ${missing} belum tersimpan. Isi di menu Pengaturan → Koneksi Repliz lalu klik Simpan kunci.` : '';
}

/** Token webhook (header x-token). Dibuat otomatis bila belum ada. */
export async function ensureWebhookToken(regenerate = false): Promise<string> {
  if (process.env.REPLIZ_WEBHOOK_TOKEN) return process.env.REPLIZ_WEBHOOK_TOKEN;
  const current = (await readStored())[KEY.webhook];
  if (current && !regenerate) return current;
  const token = crypto.randomBytes(24).toString('base64url');
  await store(KEY.webhook, token);
  return token;
}

// ---------- HTTP ----------
export class ReplizError extends Error {
  constructor(public status: number, message: string, public retryAt?: string) { super(message); }
}

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) for (const item of v) url.searchParams.append(`${k}[]`, item); // gaya accountIds[]=ID
    else url.searchParams.set(k, String(v));
  }
  return url;
}

function friendly(status: number, message: string) {
  switch (status) {
    case 401: return `Kunci Repliz ditolak (401): ${message}. Cek Access Key & Secret Key di Pengaturan.`;
    case 402: return `Paket Repliz Anda tidak mencakup API ini (402): ${message}. Fitur ini butuh paket Gold.`;
    case 403: return `Repliz menolak (403): ${message}`;
    case 404: return `Repliz: data tidak ditemukan (404): ${message}`;
    case 429: return `Batas Repliz tercapai (429): ${message}`;
    default: return `Repliz ${status}: ${message}`;
  }
}

async function call<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
  const conn = await getReplizConnection();
  if (conn.source === 'none') {
    throw new ReplizError(0, missingKeysMessage(conn));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${conn.accessKey}:${conn.secretKey}`).toString('base64')}`,
        accept: 'application/json',
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ReplizError(0, (e as Error).name === 'AbortError' ? 'Repliz tidak menjawab (timeout)' : `Gagal menghubungi Repliz: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json: unknown = undefined;
  if (text) { try { json = JSON.parse(text); } catch { json = undefined; } }
  if (!res.ok) {
    const j = (json || {}) as { message?: string | string[]; retryAt?: string };
    const msg = Array.isArray(j.message) ? j.message.join(', ') : j.message || text.slice(0, 200) || res.statusText;
    throw new ReplizError(res.status, friendly(res.status, msg), j.retryAt);
  }
  return json as T;
}

// ---------- tipe data ----------
type ReplizMe = { id: string; type: 'owner' | 'operator'; name: string; email: string; plan: 'free' | 'standard' | 'premium' | 'gold'; expiredAt: string | null };

export type ReplizAccount = {
  _id: string; name: string; username: string; picture?: string; isConnected: boolean; type: string; tags?: string[];
};

export type ReplizContent = {
  id: string;
  title?: string;
  description?: string;
  topic?: string;
  type?: string;
  owner?: { id?: string; name?: string; picture?: string; isVerified?: boolean };
  medias?: Array<{ type?: string; url?: string; thumbnail?: string }>;
  url?: string;
  createdAt?: string;
  textAttachment?: { text?: string; link?: string };
  reply?: unknown; // ada bila postingan itu sendiri sebuah balasan
};

export type ReplizQueueComment = {
  _id: string;
  status: 'pending' | 'resolved' | 'ignored';
  source?: string;
  content?: ReplizContent;
  comment: { id: string; type?: string; text?: string; owner?: { id?: string; name?: string; picture?: string }; createdAt?: string };
  accountId: string;
  createdAt?: string;
};

type Paged<T> = { docs: T[]; totalDocs: number; page: number; totalPages: number; hasNextPage?: boolean };

// ---------- endpoint ----------
export const getMe = () => call<ReplizMe>('GET', '/public/me');

/** Semua akun Threads di workspace Repliz. */
export async function listThreadsAccounts(): Promise<ReplizAccount[]> {
  const out: ReplizAccount[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await call<Paged<ReplizAccount>>('GET', '/public/account', { query: { page, limit: 100, types: ['threads'] } });
    out.push(...(r.docs || []));
    if (!r.hasNextPage && page >= (r.totalPages || 1)) break;
  }
  return out.filter((a) => a.type === 'threads');
}

export const getAccount = (accountId: string) => call<ReplizAccount>('GET', `/public/account/${encodeURIComponent(accountId)}`);

type SearchParams = {
  accountId: string;
  search: string;
  sort?: 'TOP' | 'RECENT';
  mode?: 'KEYWORD' | 'TAG';
  since?: number; // unix detik, wajib berpasangan dengan until
  until?: number;
  nextToken?: string;
};

export function searchThreads(p: SearchParams) {
  const { since, until, ...rest } = p;
  const range = since && until ? { since, until } : {};
  return call<{ docs: ReplizContent[]; nextToken?: string }>('GET', '/public/research/threads/content/search', { query: { ...rest, ...range } });
}

/** Komentar ke postingan mana pun (contentId = id dari Research). */
export function createComment(contentId: string, body: { accountId: string; text: string; commentId?: string }) {
  return call<{ commentId: string }>('POST', `/public/content/${encodeURIComponent(contentId)}/comment`, { body });
}

export function listComments(q: { accountIds: string[]; status?: 'pending' | 'resolved' | 'ignored'; page?: number; limit?: number }) {
  return call<Paged<ReplizQueueComment>>('GET', '/public/comment', {
    query: { page: q.page || 1, limit: q.limit || 50, status: q.status, accountIds: q.accountIds },
  });
}

/** Balas komentar di antrean Repliz (_id); status otomatis jadi resolved. */
export function replyComment(commentId: string, text: string) {
  return call<{ commentId: string }>('POST', `/public/comment/${encodeURIComponent(commentId)}`, { body: { text } });
}

export const getComment = (commentId: string) => call<ReplizQueueComment>('GET', `/public/comment/${encodeURIComponent(commentId)}`);

/** Ubah status di Repliz saja (tidak mengirim apa pun ke Threads). */
export function setCommentStatus(commentId: string, status: 'pending' | 'resolved' | 'ignored') {
  return call<void>('PUT', `/public/comment/${encodeURIComponent(commentId)}/status`, { body: { status } });
}

// ---------- konversi ----------
/** Objek konten Repliz → Post Comel. Metrik engagement tidak tersedia dari Repliz (0 sampai dicek). */
export function contentToPost(c: ReplizContent): Post {
  const m = String(c.url || '').match(/threads\.(?:com|net)\/@([^/?#]+)\/post\/([^/?#]+)/);
  const username = m?.[1] || c.owner?.name || '';
  const topic = (c.topic || '').trim();
  return {
    code: m?.[2] || c.id,
    pk: '',
    fbid: c.id,
    mediaId: c.id,
    contentId: c.id,
    username,
    userId: c.owner?.id || '',
    text: [c.description, c.textAttachment?.text].filter(Boolean).join('\n\n'),
    likes: 0,
    replies: 0,
    reposts: 0,
    quotes: 0,
    shares: 0,
    takenAt: c.createdAt ? Math.floor(new Date(c.createdAt).getTime() / 1000) : 0,
    isReply: Boolean(c.reply),
    replyToUser: null,
    url: c.url || '',
    tag: topic ? { id: '', name: topic, display: topic, community: false } : null,
  };
}

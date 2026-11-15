/**
 * Kirim balasan lewat Threads API resmi.
 * Izin: threads_basic, threads_content_publish, threads_manage_replies, threads_read_replies,
 * dan untuk membalas postingan orang lain: threads_keyword_search atau threads_manage_mentions.
 */
import { THREADS_GRAPH_BASE } from '../config';
import { updateAccount } from '../accounts';
import { log } from '../logger';
import type { ThreadsAccount } from '../db/schema';
import type { ReplyResult, ReplyTarget } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graph(method: 'GET' | 'POST', path: string, token: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${THREADS_GRAPH_BASE}${path}`);
  const init: RequestInit = { method };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set('access_token', token);
  } else {
    init.body = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: token });
    init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`Threads API ${res.status}: ${e.message || text.slice(0, 200)}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''}`);
  }
  return json;
}

export async function verify(a: ThreadsAccount) {
  if (!a.accessToken) throw new Error('Access token kosong');
  const me = await graph('GET', '/me', a.accessToken, { fields: 'id,username,name' });
  await updateAccount(a.id, { threadsUserId: me.id, username: me.username, statusNote: `API OK (@${me.username})` });
  return { ok: true, username: me.username as string };
}

/** Token long-lived berlaku 60 hari; refresh bila > 7 hari sejak refresh terakhir. */
export async function maybeRefreshToken(a: ThreadsAccount) {
  const last = a.tokenRefreshedAt?.getTime() ?? 0;
  if (!a.accessToken || Date.now() - last < 7 * 86400_000) return;
  try {
    const j = await graph('GET', '/refresh_access_token', a.accessToken, { grant_type: 'th_refresh_token' });
    if (j.access_token) {
      await updateAccount(a.id, { accessToken: j.access_token, tokenRefreshedAt: new Date() });
      await log('info', `akun:${a.name}`, 'Access token diperbarui (berlaku ±60 hari)');
    }
  } catch (e) {
    await updateAccount(a.id, { tokenRefreshedAt: new Date(Date.now() - 6 * 86400_000) }); // coba lagi besok
    await log('warn', `akun:${a.name}`, `Gagal refresh token: ${(e as Error).message}`);
  }
}

async function waitContainer(token: string, id: string) {
  for (let i = 0; i < 12; i++) {
    await sleep(i === 0 ? 2000 : 3000);
    try {
      const s = await graph('GET', `/${id}`, token, { fields: 'status,error_message' });
      if (s.status === 'FINISHED' || s.status === 'PUBLISHED') return;
      if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new Error(`Container ${s.status}: ${s.error_message || ''}`);
    } catch (e) {
      if (/Container/.test((e as Error).message)) throw e;
      await sleep(5000); // sebagian token tidak bisa membaca status
      return;
    }
  }
}

async function publishReply(a: ThreadsAccount, replyToId: string, text: string): Promise<string> {
  const container = await graph('POST', '/me/threads', a.accessToken, { media_type: 'TEXT', text, reply_to_id: replyToId });
  await waitContainer(a.accessToken, container.id);
  const pub = await graph('POST', `/${a.threadsUserId || 'me'}/threads_publish`, a.accessToken, { creation_id: container.id });
  return pub.id;
}

/** Postingan hasil scrape: coba fbid lalu pk sebagai reply_to_id. */
export async function reply(a: ThreadsAccount, target: ReplyTarget, text: string): Promise<ReplyResult> {
  const candidates = [...new Set([target.apiId, target.fbid, target.pk].filter(Boolean) as string[])];
  if (!candidates.length) throw new Error('ID postingan tujuan tidak diketahui');
  let lastErr: unknown;
  for (const id of candidates) {
    try {
      return { resultId: await publishReply(a, id, text) };
    } catch (e) {
      lastErr = e;
      if (!/(does not exist|Invalid parameter|Unsupported|reply_to_id|cannot be loaded|missing permissions)/i.test((e as Error).message)) break;
    }
  }
  throw lastErr;
}

export type ApiPost = { id: string; text?: string; timestamp?: string; permalink?: string; username?: string; is_reply?: boolean; is_reply_owned_by_me?: boolean; hide_status?: string };

export async function listOwnPosts(a: ThreadsAccount, limit = 10): Promise<ApiPost[]> {
  const j = await graph('GET', '/me/threads', a.accessToken, { fields: 'id,text,timestamp,permalink,username,is_reply', limit });
  return ((j.data || []) as ApiPost[]).filter((p) => !p.is_reply);
}

export async function listReplies(a: ThreadsAccount, mediaId: string): Promise<ApiPost[]> {
  const j = await graph('GET', `/${mediaId}/replies`, a.accessToken, {
    fields: 'id,text,username,timestamp,permalink,is_reply_owned_by_me,hide_status', reverse: 'false',
  });
  return j.data || [];
}

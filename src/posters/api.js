/**
 * Kirim balasan lewat Threads API resmi (graph.threads.net).
 * Butuh access token dengan izin: threads_basic, threads_content_publish, threads_manage_replies,
 * threads_read_replies, dan untuk membalas postingan orang lain: threads_keyword_search atau threads_manage_mentions.
 */
import { THREADS_GRAPH_BASE } from '../config.js';
import { update, log } from '../db.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function graph(method, path, token, params = {}) {
  const url = new URL(`${THREADS_GRAPH_BASE}${path}`);
  const init = { method };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set('access_token', token);
  } else {
    const body = new URLSearchParams({ ...params, access_token: token });
    init.body = body;
    init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json.error) {
    const e = json.error || {};
    const err = new Error(`Threads API ${res.status}: ${e.message || text.slice(0, 200)}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''}`);
    err.code = e.code;
    err.subcode = e.error_subcode;
    throw err;
  }
  return json;
}

export async function verify(account) {
  if (!account.access_token) throw new Error('Access token kosong');
  const me = await graph('GET', '/me', account.access_token, { fields: 'id,username,name' });
  update('accounts', account.id, { threads_user_id: me.id, username: me.username, status_note: `API OK (@${me.username})` });
  return { ok: true, username: me.username, id: me.id };
}

/** Token long-lived berlaku 60 hari. Refresh kalau sudah > 7 hari sejak refresh terakhir. */
export async function maybeRefreshToken(account) {
  const now = Math.floor(Date.now() / 1000);
  if (!account.access_token || now - (account.token_refreshed_at || 0) < 7 * 86400) return;
  try {
    const j = await graph('GET', '/refresh_access_token', account.access_token, { grant_type: 'th_refresh_token' });
    if (j.access_token) {
      update('accounts', account.id, { access_token: j.access_token, token_refreshed_at: now });
      log('info', `akun:${account.name}`, 'Access token diperbarui (berlaku ±60 hari)');
    }
  } catch (e) {
    // token short-lived tidak bisa di-refresh; catat saja dan coba lagi besok
    update('accounts', account.id, { token_refreshed_at: now - 6 * 86400 });
    log('warn', `akun:${account.name}`, `Gagal refresh token: ${e.message}`);
  }
}

async function waitContainer(token, id) {
  for (let i = 0; i < 12; i++) {
    await sleep(i === 0 ? 2000 : 3000);
    try {
      const s = await graph('GET', `/${id}`, token, { fields: 'status,error_message' });
      if (s.status === 'FINISHED' || s.status === 'PUBLISHED') return;
      if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new Error(`Container ${s.status}: ${s.error_message || ''}`);
    } catch (e) {
      if (/Container/.test(e.message)) throw e;
      // sebagian token tidak bisa membaca status; lanjut publish setelah jeda
      await sleep(5000);
      return;
    }
  }
}

async function publishReply(account, replyToId, text) {
  const token = account.access_token;
  const container = await graph('POST', '/me/threads', token, { media_type: 'TEXT', text, reply_to_id: replyToId });
  await waitContainer(token, container.id);
  const uid = account.threads_user_id || 'me';
  const pub = await graph('POST', `/${uid}/threads_publish`, token, { creation_id: container.id });
  return pub.id;
}

/**
 * target: { fbid, pk, apiId } — apiId dipakai bila diketahui (dari API);
 * untuk postingan hasil scrape dicoba fbid lalu pk.
 */
export async function reply(account, target, text) {
  const candidates = [target.apiId, target.fbid, target.pk].filter(Boolean);
  if (!candidates.length) throw new Error('ID postingan tujuan tidak diketahui');
  let lastErr;
  for (const id of [...new Set(candidates)]) {
    try {
      const resultId = await publishReply(account, id, text);
      return { resultId };
    } catch (e) {
      lastErr = e;
      // hanya coba ID berikutnya bila error-nya tentang ID/objek tidak valid
      if (!/(does not exist|Invalid parameter|Unsupported|reply_to_id|cannot be loaded|missing permissions)/i.test(e.message)) break;
    }
  }
  throw lastErr;
}

export async function listOwnPosts(account, limit = 10) {
  const j = await graph('GET', '/me/threads', account.access_token, { fields: 'id,text,timestamp,permalink,username,is_reply', limit });
  return (j.data || []).filter((p) => !p.is_reply);
}

export async function listReplies(account, mediaId) {
  const j = await graph('GET', `/${mediaId}/replies`, account.access_token, {
    fields: 'id,text,username,timestamp,permalink,is_reply_owned_by_me,hide_status',
    reverse: 'false',
  });
  return j.data || [];
}

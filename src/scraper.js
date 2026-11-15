import { spawn } from 'node:child_process';
import { LIGHTPANDA_BIN } from './config.js';

const THREADS = 'https://www.threads.com';
const MAX_CONCURRENT = Number(process.env.SCRAPE_CONCURRENCY || 2);

// ---------- antrian sederhana supaya tidak menjalankan terlalu banyak Lightpanda sekaligus ----------
let running = 0;
const waiters = [];
async function withSlot(fn) {
  if (running >= MAX_CONCURRENT) await new Promise((r) => waiters.push(r));
  running++;
  try { return await fn(); } finally {
    running--;
    waiters.shift()?.();
  }
}

function runLightpanda(url, { cookieFile, timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['fetch', '--dump', 'html', '--log-level', 'error'];
    if (cookieFile) args.push('--cookie', cookieFile);
    args.push(url);
    const child = spawn(LIGHTPANDA_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Lightpanda timeout: ${url}`)); }, timeoutMs);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT'
        ? new Error(`Lightpanda tidak ditemukan ("${LIGHTPANDA_BIN}"). Install dulu atau set LIGHTPANDA_BIN.`)
        : e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const html = Buffer.concat(out).toString('utf8');
      if (code !== 0 && html.length < 1000) {
        reject(new Error(`Lightpanda exit ${code}: ${err.trim().split('\n').slice(-3).join(' | ') || 'tanpa pesan'}`));
      } else {
        resolve(html);
      }
    });
  });
}

/** Ambil HTML halaman lewat Lightpanda, retry sekali kalau hasilnya kosong. */
export async function fetchHtml(url, opts = {}) {
  return withSlot(async () => {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const html = await runLightpanda(url, opts);
        if (html.length > 5000) return html;
        lastErr = new Error(`Halaman kosong/terlalu kecil (${html.length} byte): ${url}`);
      } catch (e) {
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw lastErr;
  });
}

// ---------- parsing ----------
function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function isPostNode(o) {
  return o && typeof o === 'object'
    && typeof o.code === 'string' && 'like_count' in o && 'caption' in o
    && o.text_post_app_info && typeof o.text_post_app_info === 'object'
    && o.user && typeof o.user === 'object';
}

function postText(o) {
  if (o.caption?.text) return o.caption.text;
  const frags = o.text_post_app_info?.text_fragments?.fragments || [];
  return frags.map((f) => f.plaintext || f.mention_fragment?.mentioned_user?.username || f.link_fragment?.display_text || '').join('');
}

export function normalizePost(o) {
  const t = o.text_post_app_info || {};
  const username = o.user?.username || '';
  return {
    code: o.code,
    pk: String(o.pk ?? '').trim(),
    fbid: String(o.fbid ?? '').trim(),
    mediaId: String(o.id ?? ''),
    username,
    userId: String(o.user?.pk ?? o.user?.id ?? ''),
    text: postText(o),
    likes: Number(o.like_count) || 0,
    replies: Number(t.direct_reply_count) || 0,
    reposts: Number(t.repost_count) || 0,
    quotes: Number(t.quote_count) || 0,
    shares: Number(t.reshare_count) || 0,
    takenAt: Number(o.taken_at) || 0,
    isReply: Boolean(t.is_reply),
    replyToUser: t.reply_to_author?.username || null,
    url: `${THREADS}/@${username}/post/${o.code}`,
    mediaType: o.media_type,
  };
}

/** Ambil semua postingan dari JSON yang ter-embed di HTML Threads. Urutan sesuai kemunculan. */
export function parsePosts(html) {
  const blobs = [];
  const re = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) blobs.push(m[1]);
  const posts = new Map();
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 80) return;
    if (Array.isArray(o)) { for (const v of o) walk(v, depth + 1); return; }
    if (isPostNode(o) && !posts.has(o.code)) posts.set(o.code, normalizePost(o));
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  for (const b of blobs) {
    let json;
    try { json = JSON.parse(b); } catch {
      try { json = JSON.parse(decodeEntities(b)); } catch { continue; }
    }
    walk(json);
  }
  return [...posts.values()];
}

// ---------- API scraper ----------
export async function searchPosts(query, opts = {}) {
  const url = `${THREADS}/search?q=${encodeURIComponent(query)}&serp_type=default${opts.recent ? '&filter=recent' : ''}`;
  const html = await fetchHtml(url, opts);
  return parsePosts(html);
}

/** Postingan + balasan-balasannya (balasan tampil tanpa login). */
export async function fetchPostPage(username, code, opts = {}) {
  const html = await fetchHtml(`${THREADS}/@${username}/post/${code}`, opts);
  const posts = parsePosts(html);
  const root = posts.find((p) => p.code === code) || null;
  return { root, posts };
}

/** Postingan publik di profil (tab Threads). */
export async function fetchProfilePosts(username, opts = {}) {
  const html = await fetchHtml(`${THREADS}/@${username}`, opts);
  return parsePosts(html).filter((p) => p.username.toLowerCase() === username.toLowerCase());
}

/** Komentar/balasan yang dibuat user (tab Replies di profil). */
export async function fetchProfileReplies(username, opts = {}) {
  const html = await fetchHtml(`${THREADS}/@${username}/replies`, opts);
  return parsePosts(html).filter((p) => p.username.toLowerCase() === username.toLowerCase() && p.isReply);
}

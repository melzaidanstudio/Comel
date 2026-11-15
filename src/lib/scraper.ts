import { spawn } from 'node:child_process';
import { LIGHTPANDA_BIN } from './config';
import type { Post, PostTag } from './types';

const THREADS = 'https://www.threads.com';
const MAX_CONCURRENT = Number(process.env.SCRAPE_CONCURRENCY || 2);

export type ScrapeOpts = { cookieFile?: string; timeoutMs?: number };

// ---------- antrian: batasi jumlah proses Lightpanda bersamaan ----------
let running = 0;
const waiters: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r));
  running++;
  try { return await fn(); } finally {
    running--;
    waiters.shift()?.();
  }
}

function runLightpanda(url: string, { cookieFile, timeoutMs = 90_000 }: ScrapeOpts = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['fetch', '--dump', 'html', '--log-level', 'error'];
    if (cookieFile) args.push('--cookie', cookieFile);
    args.push(url);
    const child = spawn(LIGHTPANDA_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Lightpanda timeout: ${url}`)); }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => out.push(d));
    child.stderr.on('data', (d: Buffer) => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    child.on('error', (e: NodeJS.ErrnoException) => {
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
      } else resolve(html);
    });
  });
}

/** Ambil HTML lewat Lightpanda, retry sekali kalau kosong. */
export async function fetchHtml(url: string, opts: ScrapeOpts = {}): Promise<string> {
  return withSlot(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const html = await runLightpanda(url, opts);
        if (html.length > 5000) return html;
        lastErr = new Error(`Halaman kosong/terlalu kecil (${html.length} byte): ${url}`);
      } catch (e) { lastErr = e; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw lastErr;
  });
}

// ---------- parsing JSON yang ter-embed di HTML Threads ----------
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function decodeEntities(s: string) {
  return s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function isPostNode(o: Raw): boolean {
  return Boolean(o && typeof o === 'object'
    && typeof o.code === 'string' && 'like_count' in o && 'caption' in o
    && o.text_post_app_info && typeof o.text_post_app_info === 'object'
    && o.user && typeof o.user === 'object');
}

function postText(o: Raw): string {
  if (o.caption?.text) return o.caption.text;
  const frags: Raw[] = o.text_post_app_info?.text_fragments?.fragments || [];
  return frags.map((f) => f.plaintext || f.mention_fragment?.mentioned_user?.username || f.link_fragment?.display_text || '').join('');
}

function postTag(t: Raw): PostTag | null {
  const h = t.tag_header;
  if (!h || typeof h !== 'object') return null;
  const name = h.tag_cluster_name || h.display_name || '';
  if (!name) return null;
  return { id: String(h.id || ''), name, display: h.display_name || name, community: Boolean(h.is_community || h.community_favicon_url) };
}

export function normalizePost(o: Raw): Post {
  const t: Raw = o.text_post_app_info || {};
  const username: string = o.user?.username || '';
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
    tag: postTag(t),
  };
}

export function parsePosts(html: string): Post[] {
  const re = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  const posts = new Map<string, Post>();
  const walk = (o: unknown, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 80) return;
    if (Array.isArray(o)) { for (const v of o) walk(v, depth + 1); return; }
    const r = o as Raw;
    if (isPostNode(r) && !posts.has(r.code)) posts.set(r.code, normalizePost(r));
    for (const v of Object.values(r)) walk(v, depth + 1);
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let json: unknown;
    try { json = JSON.parse(m[1]); } catch {
      try { json = JSON.parse(decodeEntities(m[1])); } catch { continue; }
    }
    walk(json);
  }
  return [...posts.values()];
}

// ---------- sumber data ----------
export async function searchPosts(query: string, opts: ScrapeOpts = {}): Promise<Post[]> {
  const html = await fetchHtml(`${THREADS}/search?q=${encodeURIComponent(query)}&serp_type=default`, opts);
  return parsePosts(html);
}

/** Halaman topic tag. Tanpa login isinya ≈ pencarian nama tag (tag campuran) → tetap disaring per tag. */
export async function searchTag(tagName: string, opts: ScrapeOpts & { tagId?: string } = {}): Promise<Post[]> {
  const params = new URLSearchParams({ q: tagName, serp_type: 'tags' });
  if (opts.tagId) params.set('tag_id', opts.tagId);
  return parsePosts(await fetchHtml(`${THREADS}/search?${params}`, opts));
}

export async function fetchPostPage(username: string, code: string, opts: ScrapeOpts = {}) {
  const posts = parsePosts(await fetchHtml(`${THREADS}/@${username}/post/${code}`, opts));
  return { root: posts.find((p) => p.code === code) || null, posts };
}

export async function fetchProfilePosts(username: string, opts: ScrapeOpts = {}): Promise<Post[]> {
  const posts = parsePosts(await fetchHtml(`${THREADS}/@${username}`, opts));
  return posts.filter((p) => p.username.toLowerCase() === username.toLowerCase());
}

export async function fetchProfileReplies(username: string, opts: ScrapeOpts = {}): Promise<Post[]> {
  const posts = parsePosts(await fetchHtml(`${THREADS}/@${username}/replies`, opts));
  return posts.filter((p) => p.username.toLowerCase() === username.toLowerCase() && p.isReply);
}

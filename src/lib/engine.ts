import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { actions, triggers, type ThreadsAccount, type Trigger } from './db/schema';
import { getAccount, updateAccount } from './accounts';
import {
  failedAttempts, hasActedOn, recentReplyTexts, recentlyCommentedAuthor, recordAction, sentLast24h, type NewAction,
} from './actions';
import { checkPost, engagementScore, parseExpr, parseTagList, positiveTerms, type Ast } from './filters';
import { generateReply, resolveProvider } from './llm';
import { withAccountLock } from './locks';
import { log } from './logger';
import { effectivePersona } from './persona';
import { api as apiPoster, browser as browserPoster, posterFor } from './posters';
import {
  fetchPostPage, fetchProfilePosts, fetchProfileReplies, searchPosts, searchTag, type ScrapeOpts,
} from './scraper';
import { getSettings } from './settings';
import { findTag, recordTags } from './tags';
import type { AppSettings, EvaluatedPost, Post } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

function randomDelayMs(s: AppSettings) {
  const a = Math.max(0, Number(s.delayMinSeconds) || 0);
  const b = Math.max(a, Number(s.delayMaxSeconds) || a);
  return (a + Math.random() * (b - a)) * 1000;
}

function buildQueries(queries: string[], ast: Ast | null): string[] {
  const q = queries.map((s) => String(s).trim()).filter(Boolean);
  if (!q.length && ast) {
    const terms = [...new Set(positiveTerms(ast))];
    if (terms.length > 1) q.push(terms.join(' '));
    q.push(...terms);
  }
  return [...new Set(q)].slice(0, 8);
}

function scrapeOpts(a: ThreadsAccount): ScrapeOpts {
  if (a.method === 'browser' && a.scrapeWithCookies && a.cookies) {
    const cookieFile = browserPoster.writeCookieFile(a);
    if (cookieFile) return { cookieFile };
  }
  return {};
}

const isAuthError = (m: string) => /Cookie|token|OAuth|session|sesi|Login gagal|190/i.test(m);

/** Kumpulkan & saring kandidat postingan untuk sebuah trigger. */
export async function collectCandidates(t: Trigger, a: ThreadsAccount) {
  const ast = parseExpr(t.matchExpr);
  const tagList = parseTagList(t.topicTags);
  const tagSources = t.tagAsSource ? tagList.slice(0, 6) : [];
  // dengan sumber tag, query otomatis dari ekspresi tidak dipakai (hanya query manual)
  const queries = buildQueries(t.queries || [], tagSources.length ? null : ast);
  if (!queries.length && !tagSources.length) {
    throw new Error('Trigger belum punya kata pencarian, ekspresi kata kunci, atau topic tag (dengan opsi "cari lewat halaman tag")');
  }

  const opts = scrapeOpts(a);
  const sources = [
    ...tagSources.map((tag) => ({ label: `#${tag}`, run: async () => searchTag(tag, { ...opts, tagId: (await findTag(tag))?.tagId || undefined }) })),
    ...queries.map((q) => ({ label: q, run: () => searchPosts(q, opts) })),
  ];
  const seen = new Map<string, Post & { query: string }>();
  const errors: string[] = [];
  for (const src of sources) {
    try {
      const posts = await src.run();
      await recordTags(posts);
      for (const p of posts) if (!seen.has(p.code)) seen.set(p.code, { ...p, query: src.label });
    } catch (e) {
      errors.push(`"${src.label}": ${(e as Error).message}`);
    }
  }
  if (!seen.size && errors.length) throw new Error(`Scrape gagal — ${errors.join(' | ')}`);

  const now = nowSec();
  const evaluated: EvaluatedPost[] = [];
  for (const p of seen.values()) {
    let v = checkPost(p, t, { ast, now, ownUsername: a.username });
    if (v.ok && await hasActedOn(a.id, p.code)) v = { ok: false, reason: 'sudah pernah diproses' };
    if (v.ok && await failedAttempts(a.id, p.code) >= 2) v = { ok: false, reason: 'gagal 2x sebelumnya' };
    if (v.ok && await recentlyCommentedAuthor(a.id, p.username, t.authorCooldownHours)) {
      v = { ok: false, reason: `sudah komentar ke @${p.username} < ${t.authorCooldownHours} jam` };
    }
    evaluated.push({ ...p, ok: v.ok, reason: v.reason || '' });
  }
  const sorter = t.sortBy === 'newest'
    ? (x: Post, y: Post) => y.takenAt - x.takenAt
    : (x: Post, y: Post) => engagementScore(y) - engagementScore(x);
  evaluated.sort((x, y) => (Number(y.ok) - Number(x.ok)) || sorter(x, y));
  return { queries: sources.map((s) => s.label), posts: evaluated, errors };
}

const metricsOf = (p: Post) => ({
  likes: p.likes, replies: p.replies, reposts: p.reposts, shares: p.shares, quotes: p.quotes, takenAt: p.takenAt, tag: p.tag?.name || null,
});

async function finishTrigger(id: number, status: string) {
  await db.update(triggers).set({ lastRunAt: new Date(), lastStatus: status }).where(eq(triggers.id, id));
  return { status };
}

/** Scrape → saring → komentar AI → kirim. */
export async function runTrigger(triggerId: number, opts: { manual?: boolean } = {}): Promise<{ status: string }> {
  const [t] = await db.select().from(triggers).where(eq(triggers.id, triggerId));
  if (!t) throw new Error('Trigger tidak ditemukan');
  const a = await getAccount(t.accountId);
  if (!a) throw new Error('Akun trigger tidak ditemukan');
  const src = `trigger:${t.name}`;

  const r = await withAccountLock(a.id, async () => {
    const settings = await getSettings();
    if (settings.paused && !opts.manual) return finishTrigger(t.id, 'dilewati: aplikasi sedang di-pause');
    if (!a.enabled) return finishTrigger(t.id, 'dilewati: akun nonaktif');
    const used = await sentLast24h(a.id);
    if (used >= a.dailyLimit) return finishTrigger(t.id, `dilewati: batas harian akun tercapai (${used}/${a.dailyLimit})`);
    const quota = Math.min(t.actionsPerRun, a.dailyLimit - used);

    const { posts, errors } = await collectCandidates(t, a);
    for (const e of errors) await log('warn', src, `Scrape: ${e}`);
    const candidates = posts.filter((p) => p.ok);
    await log('info', src, `${posts.length} postingan ditemukan, ${candidates.length} lolos filter, target ${quota} komentar`);
    if (!candidates.length) return finishTrigger(t.id, `0 kandidat dari ${posts.length} postingan`);

    const provider = await resolveProvider(t.providerId, a.providerId);
    const persona = await effectivePersona(a.id);
    const poster = posterFor(a);
    let sent = 0; let skipped = 0; let failed = 0; let dry = 0;

    for (const post of candidates) {
      if (sent + dry >= quota) break;
      if (sent + dry + skipped + failed >= quota * 4) break; // batas percobaan per putaran
      if ((await getSettings()).paused && !opts.manual) break;

      const base: Omit<NewAction, 'status'> = {
        accountId: a.id, triggerId: t.id, kind: 'comment', targetCode: post.code, targetId: post.fbid || post.pk,
        targetUser: post.username, targetText: post.text.slice(0, 1000), targetUrl: post.url, metrics: metricsOf(post),
      };
      let text: string;
      try {
        text = await generateReply({ provider, persona, kind: 'comment', post, instruction: t.instruction, recentTexts: await recentReplyTexts(a.id) });
      } catch (e) {
        failed++;
        await log('error', src, `AI gagal: ${(e as Error).message}`);
        if (/AI provider|Belum ada AI/.test((e as Error).message)) break; // provider bermasalah, jangan buang kandidat
        continue;
      }
      if (!text || text === 'SKIP') {
        skipped++;
        await recordAction({ ...base, status: 'skipped', error: 'AI memutuskan SKIP (tidak relevan/sensitif)' });
        continue;
      }
      if (t.dryRun) {
        dry++;
        await recordAction({ ...base, replyText: text, status: 'dry_run' });
        await log('info', src, `[DRY RUN] @${post.username}: ${text}`);
        continue;
      }
      if (sent > 0) await sleep(randomDelayMs(settings));
      try {
        const res = await poster.reply(a, { fbid: post.fbid, pk: post.pk, url: post.url, code: post.code }, text);
        sent++;
        await recordAction({ ...base, replyText: text, status: 'sent', resultId: res.resultId });
        await log('info', src, `Komentar terkirim ke @${post.username} (${post.url}): ${text}`);
      } catch (e) {
        failed++;
        const m = (e as Error).message;
        await recordAction({ ...base, replyText: text, status: 'failed', error: m });
        await log('error', src, `Gagal kirim ke ${post.url}: ${m}`);
        if (isAuthError(m)) { await updateAccount(a.id, { statusNote: `ERROR: ${m.slice(0, 200)}` }); break; }
      }
    }
    return finishTrigger(t.id, `terkirim ${sent}${dry ? `, dry-run ${dry}` : ''}, skip ${skipped}, gagal ${failed}`);
  });
  return r.busy ? { status: 'akun sedang menjalankan pekerjaan lain, coba lagi nanti' } : r.value;
}

// ---------- balas komentar ----------
type Incoming = Pick<Post, 'username' | 'text' | 'takenAt'> & Partial<Post> & {
  code: string; apiId?: string; url: string; context: { label: string; parentText?: string };
};

async function collectIncomingApi(a: ThreadsAccount): Promise<Incoming[]> {
  const me = a.username.toLowerCase();
  const maxAge = a.replyMaxAgeHours * 3600;
  const items: Incoming[] = [];
  const push = (r: apiPoster.ApiPost, label: string, parentText?: string) => {
    const ts = r.timestamp ? Math.floor(new Date(r.timestamp).getTime() / 1000) : nowSec();
    if (nowSec() - ts > maxAge) return;
    if (r.is_reply_owned_by_me || (r.username || '').toLowerCase() === me) return;
    if (r.hide_status && r.hide_status !== 'NOT_HUSHED') return;
    items.push({ code: r.id, apiId: r.id, username: r.username || 'seseorang', text: r.text || '', takenAt: ts, url: r.permalink || '', context: { label, parentText } });
  };
  if (a.replyScope !== 'my_comments') {
    for (const p of await apiPoster.listOwnPosts(a, 8)) {
      for (const r of await apiPoster.listReplies(a, p.id)) push(r, 'balasan orang di postingan kamu', p.text);
    }
  }
  if (a.replyScope !== 'own_posts') {
    const mine = await db.select({ resultId: actions.resultId, replyText: actions.replyText }).from(actions).where(and(
      eq(actions.accountId, a.id), eq(actions.status, 'sent'), isNotNull(actions.resultId),
      gte(actions.createdAt, new Date(Date.now() - 7 * 86400_000)),
    )).orderBy(desc(actions.id)).limit(30);
    for (const m of mine) {
      try {
        for (const r of await apiPoster.listReplies(a, m.resultId!)) push(r, 'balasan orang untuk komentar kamu', m.replyText || '');
      } catch { /* komentar mungkin sudah dihapus */ }
    }
  }
  return items;
}

async function collectIncomingBrowser(a: ThreadsAccount): Promise<Incoming[]> {
  const me = a.username.toLowerCase();
  if (!me) throw new Error('Isi username akun (tanpa @) agar bisa mencari komentar masuk');
  const opts = scrapeOpts(a);
  const maxAge = a.replyMaxAgeHours * 3600;
  const roots: Array<{ p: Post; label: string }> = [];
  if (a.replyScope !== 'my_comments') {
    for (const p of (await fetchProfilePosts(me, opts)).filter((x) => !x.isReply).slice(0, 5)) roots.push({ p, label: 'balasan orang di postingan kamu' });
  }
  if (a.replyScope !== 'own_posts') {
    for (const p of (await fetchProfileReplies(me, opts)).slice(0, 8)) roots.push({ p, label: 'balasan orang untuk komentar kamu' });
  }
  const items: Incoming[] = [];
  for (const { p, label } of roots) {
    if (p.replies === 0) continue;
    try {
      const page = await fetchPostPage(me, p.code, opts);
      for (const r of page.posts) {
        if (!r.isReply || (r.replyToUser || '').toLowerCase() !== me || r.username.toLowerCase() === me) continue;
        if (nowSec() - r.takenAt > maxAge) continue;
        items.push({ ...r, context: { label, parentText: p.text } });
      }
    } catch (e) {
      await log('warn', `akun:${a.name}`, `Gagal membuka ${p.url}: ${(e as Error).message}`);
    }
  }
  return items;
}

export async function runReplyJob(accountId: number, opts: { manual?: boolean } = {}): Promise<{ status: string }> {
  const a = await getAccount(accountId);
  if (!a) throw new Error('Akun tidak ditemukan');
  const src = `balas:${a.name}`;
  const finish = async (status: string) => { await updateAccount(a.id, { lastReplyStatus: status }); return { status }; };

  const r = await withAccountLock(a.id, async () => {
    const settings = await getSettings();
    if (settings.paused && !opts.manual) return finish('dilewati: aplikasi di-pause');
    if (!a.enabled) return finish('dilewati: akun nonaktif');
    const used = await sentLast24h(a.id);
    if (used >= a.dailyLimit) return finish(`dilewati: batas harian tercapai (${used}/${a.dailyLimit})`);
    const quota = Math.min(a.replyPerRun, a.dailyLimit - used);

    const incoming = a.method === 'browser' ? await collectIncomingBrowser(a) : await collectIncomingApi(a);
    const fresh: Incoming[] = [];
    for (const it of incoming) {
      if (!(await hasActedOn(a.id, it.code)) && (await failedAttempts(a.id, it.code)) < 2) fresh.push(it);
    }
    fresh.sort((x, y) => x.takenAt - y.takenAt);
    await log('info', src, `${incoming.length} komentar masuk, ${fresh.length} belum dibalas`);
    if (!fresh.length) return finish(`tidak ada komentar baru (${incoming.length} dicek)`);

    const provider = await resolveProvider(a.providerId);
    const persona = await effectivePersona(a.id);
    const poster = posterFor(a);
    let sent = 0; let skipped = 0; let failed = 0; let dry = 0;
    for (const it of fresh) {
      if (sent + dry >= quota) break;
      const base: Omit<NewAction, 'status'> = {
        accountId: a.id, triggerId: null, kind: 'reply', targetCode: it.code, targetId: it.apiId || it.fbid || it.pk,
        targetUser: it.username, targetText: (it.text || '').slice(0, 1000), targetUrl: it.url,
      };
      let text: string;
      try {
        text = await generateReply({
          provider, persona, kind: 'reply', context: it.context,
          post: { likes: 0, replies: 0, reposts: 0, shares: 0, ...it },
          instruction: a.replyInstruction || 'Balas komentar ini dengan ramah dan nyambung dengan isi komentarnya.',
          recentTexts: await recentReplyTexts(a.id),
        });
      } catch (e) {
        failed++; await log('error', src, `AI gagal: ${(e as Error).message}`); break;
      }
      if (!text || text === 'SKIP') { skipped++; await recordAction({ ...base, status: 'skipped', error: 'AI memutuskan SKIP' }); continue; }
      if (a.replyDryRun) {
        dry++;
        await recordAction({ ...base, replyText: text, status: 'dry_run' });
        await log('info', src, `[DRY RUN] balas @${it.username}: ${text}`);
        continue;
      }
      if (sent > 0) await sleep(randomDelayMs(settings));
      try {
        const res = await poster.reply(a, { apiId: it.apiId, fbid: it.fbid, pk: it.pk, url: it.url, code: it.code }, text);
        sent++;
        await recordAction({ ...base, replyText: text, status: 'sent', resultId: res.resultId });
        await log('info', src, `Balasan terkirim ke @${it.username}: ${text}`);
      } catch (e) {
        failed++;
        const m = (e as Error).message;
        await recordAction({ ...base, replyText: text, status: 'failed', error: m });
        await log('error', src, `Gagal balas @${it.username}: ${m}`);
        if (isAuthError(m)) break;
      }
    }
    return finish(`terkirim ${sent}${dry ? `, dry-run ${dry}` : ''}, skip ${skipped}, gagal ${failed}`);
  });
  return r.busy ? { status: 'akun sedang menjalankan pekerjaan lain, coba lagi nanti' } : r.value;
}

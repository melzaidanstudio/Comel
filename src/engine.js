import {
  getById, getSettings, update, log, recordAction, hasActedOn, failedAttempts,
  recentlyCommentedAuthor, sentLast24h, recentReplyTexts, db,
} from './db.js';
import { searchPosts, fetchPostPage, fetchProfilePosts, fetchProfileReplies } from './scraper.js';
import { parseExpr, checkPost, engagementScore, positiveTerms } from './filters.js';
import { generateReply, resolveProvider } from './llm.js';
import { effectivePersona } from './persona.js';
import { posterFor, api as apiPoster, browser as browserPoster } from './posters/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

// ---------- kunci per akun: satu akun hanya menjalankan satu pekerjaan dalam satu waktu ----------
const accountLocks = new Map();
export const runningJobs = new Set();

async function withAccountLock(accountId, fn) {
  const prev = accountLocks.get(accountId) || Promise.resolve();
  let release;
  const mine = new Promise((r) => { release = r; });
  accountLocks.set(accountId, prev.then(() => mine));
  await prev;
  try { return await fn(); } finally {
    release();
    if (accountLocks.get(accountId) === mine) accountLocks.delete(accountId);
  }
}

function randomDelayMs(settings) {
  const a = Math.max(0, Number(settings.delay_min_seconds) || 0);
  const b = Math.max(a, Number(settings.delay_max_seconds) || a);
  return (a + Math.random() * (b - a)) * 1000;
}

function parseQueries(trigger, ast) {
  let q = [];
  try { q = JSON.parse(trigger.queries || '[]'); } catch { q = String(trigger.queries || '').split('\n'); }
  q = q.map((s) => String(s).trim()).filter(Boolean);
  if (!q.length && ast) {
    const terms = [...new Set(positiveTerms(ast))];
    if (terms.length > 1) q.push(terms.join(' '));
    q.push(...terms);
  }
  return [...new Set(q)].slice(0, 8);
}

function scrapeOpts(account) {
  if (account.method === 'browser' && account.scrape_with_cookies && account.cookies) {
    const cookieFile = browserPoster.writeCookieFile(account);
    return cookieFile ? { cookieFile } : {};
  }
  return {};
}

/** Kumpulkan & saring kandidat postingan untuk sebuah trigger. */
export async function collectCandidates(trigger, account) {
  const ast = parseExpr(trigger.match_expr);
  const queries = parseQueries(trigger, ast);
  if (!queries.length) throw new Error('Trigger belum punya kata pencarian atau ekspresi kata kunci');

  const opts = scrapeOpts(account);
  const seen = new Map();
  const errors = [];
  for (const q of queries) {
    try {
      const posts = await searchPosts(q, opts);
      for (const p of posts) if (!seen.has(p.code)) seen.set(p.code, { ...p, query: q });
    } catch (e) {
      errors.push(`"${q}": ${e.message}`);
    }
  }
  if (!seen.size && errors.length) throw new Error(`Scrape gagal — ${errors.join(' | ')}`);

  const now = nowSec();
  const evaluated = [];
  for (const p of seen.values()) {
    let verdict = checkPost(p, trigger, { ast, now, ownUsername: account.username });
    if (verdict.ok && hasActedOn(account.id, p.code)) verdict = { ok: false, reason: 'sudah pernah diproses' };
    if (verdict.ok && failedAttempts(account.id, p.code) >= 2) verdict = { ok: false, reason: 'gagal 2x sebelumnya' };
    if (verdict.ok && recentlyCommentedAuthor(account.id, p.username, trigger.author_cooldown_hours)) {
      verdict = { ok: false, reason: `sudah komentar ke @${p.username} < ${trigger.author_cooldown_hours} jam` };
    }
    evaluated.push({ ...p, ok: verdict.ok, reason: verdict.reason || '' });
  }
  const sorter = trigger.sort_by === 'newest'
    ? (a, b) => b.takenAt - a.takenAt
    : (a, b) => engagementScore(b) - engagementScore(a);
  evaluated.sort((a, b) => (b.ok - a.ok) || sorter(a, b));
  return { queries, posts: evaluated, errors };
}

function metricsJson(p) {
  return JSON.stringify({ likes: p.likes, replies: p.replies, reposts: p.reposts, shares: p.shares, quotes: p.quotes, takenAt: p.takenAt });
}

/**
 * Jalankan satu trigger: scrape → saring → buat komentar AI → kirim.
 * opts.preview = true → hanya kembalikan kandidat tanpa membuat/mengirim apa pun.
 */
export async function runTrigger(triggerId, opts = {}) {
  const trigger = getById('triggers', triggerId);
  if (!trigger) throw new Error('Trigger tidak ditemukan');
  const account = getById('accounts', trigger.account_id);
  if (!account) throw new Error('Akun trigger tidak ditemukan');
  const src = `trigger:${trigger.name}`;

  if (opts.preview) return collectCandidates(trigger, account);

  const jobKey = `t${trigger.id}`;
  if (runningJobs.has(jobKey)) return { status: 'sedang berjalan' };
  runningJobs.add(jobKey);
  try {
    return await withAccountLock(account.id, async () => {
      const settings = getSettings();
      const finish = (status) => {
        update('triggers', trigger.id, { last_run_at: nowSec(), last_status: status });
        return { status };
      };
      if (settings.paused && !opts.manual) return finish('dilewati: aplikasi sedang di-pause');
      if (!account.enabled) return finish('dilewati: akun nonaktif');

      const used = sentLast24h(account.id);
      if (used >= account.daily_limit) return finish(`dilewati: batas harian akun tercapai (${used}/${account.daily_limit})`);
      const quota = Math.min(trigger.actions_per_run, account.daily_limit - used);

      const { posts, errors } = await collectCandidates(trigger, account);
      for (const e of errors) log('warn', src, `Scrape: ${e}`);
      const candidates = posts.filter((p) => p.ok);
      log('info', src, `${posts.length} postingan ditemukan, ${candidates.length} lolos filter, target ${quota} komentar`);
      if (!candidates.length) return finish(`0 kandidat dari ${posts.length} postingan`);

      const provider = resolveProvider(trigger.provider_id, account.provider_id);
      const persona = effectivePersona(account.id);
      const poster = posterFor(account);
      let sent = 0; let skipped = 0; let failed = 0; let dry = 0;

      for (const post of candidates) {
        if (sent + dry >= quota) break;
        if (sent + dry + skipped + failed >= quota * 4) break; // batas percobaan per putaran
        if (getSettings().paused && !opts.manual) break;

        const base = {
          account_id: account.id, trigger_id: trigger.id, kind: 'comment',
          target_code: post.code, target_id: post.fbid || post.pk, target_user: post.username,
          target_text: post.text.slice(0, 1000), target_url: post.url, metrics: metricsJson(post),
        };
        let text;
        try {
          text = await generateReply({
            provider, persona, kind: 'comment', post,
            instruction: trigger.instruction, recentTexts: recentReplyTexts(account.id),
          });
        } catch (e) {
          failed++;
          log('error', src, `AI gagal: ${e.message}`);
          if (/AI provider|Belum ada AI/.test(e.message)) break; // provider bermasalah, jangan buang kandidat
          continue;
        }
        if (!text || text === 'SKIP') {
          skipped++;
          recordAction({ ...base, status: 'skipped', error: 'AI memutuskan SKIP (tidak relevan/sensitif)' });
          continue;
        }
        if (trigger.dry_run) {
          dry++;
          recordAction({ ...base, reply_text: text, status: 'dry_run' });
          log('info', src, `[DRY RUN] @${post.username}: ${text}`);
          continue;
        }
        if (sent > 0) await sleep(randomDelayMs(settings));
        try {
          const r = await poster.reply(account, { fbid: post.fbid, pk: post.pk, url: post.url, code: post.code }, text);
          sent++;
          recordAction({ ...base, reply_text: text, status: 'sent', result_id: r.resultId || null });
          log('info', src, `Komentar terkirim ke @${post.username} (${post.url}): ${text}`);
        } catch (e) {
          failed++;
          recordAction({ ...base, reply_text: text, status: 'failed', error: e.message });
          log('error', src, `Gagal kirim ke ${post.url}: ${e.message}`);
          if (/Cookie|token|OAuth|session|190/i.test(e.message)) {
            update('accounts', account.id, { status_note: `ERROR: ${e.message.slice(0, 200)}` });
            break;
          }
        }
      }
      return finish(`terkirim ${sent}${dry ? `, dry-run ${dry}` : ''}, skip ${skipped}, gagal ${failed}`);
    });
  } finally {
    runningJobs.delete(jobKey);
  }
}

// ---------- balas komentar ----------
async function collectIncomingApi(account) {
  const me = (account.username || '').toLowerCase();
  const maxAge = (account.reply_max_age_hours || 48) * 3600;
  const items = [];
  const push = (r, label, parentText) => {
    const ts = r.timestamp ? Math.floor(new Date(r.timestamp).getTime() / 1000) : nowSec();
    if (nowSec() - ts > maxAge) return;
    if (r.is_reply_owned_by_me || (r.username || '').toLowerCase() === me) return;
    if (r.hide_status && r.hide_status !== 'NOT_HUSHED') return;
    items.push({
      code: r.id, apiId: r.id, username: r.username || 'seseorang', text: r.text || '', takenAt: ts,
      url: r.permalink || '', context: { label, parentText },
    });
  };
  if (account.reply_scope !== 'my_comments') {
    for (const p of await apiPoster.listOwnPosts(account, 8)) {
      for (const r of await apiPoster.listReplies(account, p.id)) push(r, 'balasan orang di postingan kamu', p.text);
    }
  }
  if (account.reply_scope !== 'own_posts') {
    const mine = db.prepare(
      "SELECT result_id, reply_text FROM actions WHERE account_id = ? AND status = 'sent' AND result_id IS NOT NULL AND created_at >= ? ORDER BY id DESC LIMIT 30",
    ).all(account.id, nowSec() - 7 * 86400);
    for (const a of mine) {
      try {
        for (const r of await apiPoster.listReplies(account, a.result_id)) push(r, 'balasan orang untuk komentar kamu', a.reply_text);
      } catch (e) { /* komentar mungkin sudah dihapus */ }
    }
  }
  return items;
}

async function collectIncomingBrowser(account) {
  const me = (account.username || '').toLowerCase();
  if (!me) throw new Error('Isi username akun (tanpa @) agar bisa mencari komentar masuk');
  const opts = scrapeOpts(account);
  const maxAge = (account.reply_max_age_hours || 48) * 3600;
  const roots = [];
  if (account.reply_scope !== 'my_comments') {
    for (const p of (await fetchProfilePosts(me, opts)).filter((x) => !x.isReply).slice(0, 5)) {
      roots.push({ p, label: 'balasan orang di postingan kamu' });
    }
  }
  if (account.reply_scope !== 'own_posts') {
    for (const p of (await fetchProfileReplies(me, opts)).slice(0, 8)) roots.push({ p, label: 'balasan orang untuk komentar kamu' });
  }
  const items = [];
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
      log('warn', `akun:${account.name}`, `Gagal membuka ${p.url}: ${e.message}`);
    }
  }
  return items;
}

export async function runReplyJob(accountId, opts = {}) {
  const account = getById('accounts', accountId);
  if (!account) throw new Error('Akun tidak ditemukan');
  const src = `balas:${account.name}`;
  const jobKey = `r${account.id}`;
  if (runningJobs.has(jobKey)) return { status: 'sedang berjalan' };
  runningJobs.add(jobKey);
  try {
    return await withAccountLock(account.id, async () => {
      const settings = getSettings();
      const finish = (status) => { update('accounts', account.id, { last_reply_status: status }); return { status }; };
      if (settings.paused && !opts.manual) return finish('dilewati: aplikasi di-pause');
      if (!account.enabled) return finish('dilewati: akun nonaktif');
      const used = sentLast24h(account.id);
      if (used >= account.daily_limit) return finish(`dilewati: batas harian tercapai (${used}/${account.daily_limit})`);
      const quota = Math.min(account.reply_per_run, account.daily_limit - used);

      const incoming = account.method === 'browser' ? await collectIncomingBrowser(account) : await collectIncomingApi(account);
      const fresh = incoming.filter((r) => !hasActedOn(account.id, r.code) && failedAttempts(account.id, r.code) < 2)
        .sort((a, b) => a.takenAt - b.takenAt);
      log('info', src, `${incoming.length} komentar masuk, ${fresh.length} belum dibalas`);
      if (!fresh.length) return finish(`tidak ada komentar baru (${incoming.length} dicek)`);

      const provider = resolveProvider(account.provider_id);
      const persona = effectivePersona(account.id);
      const poster = posterFor(account);
      let sent = 0; let skipped = 0; let failed = 0; let dry = 0;
      for (const r of fresh) {
        if (sent + dry >= quota) break;
        const base = {
          account_id: account.id, trigger_id: null, kind: 'reply', target_code: r.code,
          target_id: r.apiId || r.fbid || r.pk, target_user: r.username, target_text: (r.text || '').slice(0, 1000), target_url: r.url,
        };
        let text;
        try {
          text = await generateReply({
            provider, persona, kind: 'reply', post: r, context: r.context,
            instruction: account.reply_instruction || 'Balas komentar ini dengan ramah dan nyambung dengan isi komentarnya.',
            recentTexts: recentReplyTexts(account.id),
          });
        } catch (e) {
          failed++; log('error', src, `AI gagal: ${e.message}`); break;
        }
        if (!text || text === 'SKIP') { skipped++; recordAction({ ...base, status: 'skipped', error: 'AI memutuskan SKIP' }); continue; }
        if (account.reply_dry_run) { dry++; recordAction({ ...base, reply_text: text, status: 'dry_run' }); log('info', src, `[DRY RUN] balas @${r.username}: ${text}`); continue; }
        if (sent > 0) await sleep(randomDelayMs(settings));
        try {
          const res = await poster.reply(account, { apiId: r.apiId, fbid: r.fbid, pk: r.pk, url: r.url, code: r.code }, text);
          sent++;
          recordAction({ ...base, reply_text: text, status: 'sent', result_id: res.resultId || null });
          log('info', src, `Balasan terkirim ke @${r.username}: ${text}`);
        } catch (e) {
          failed++;
          recordAction({ ...base, reply_text: text, status: 'failed', error: e.message });
          log('error', src, `Gagal balas @${r.username}: ${e.message}`);
          if (/Cookie|token|OAuth|session/i.test(e.message)) break;
        }
      }
      return finish(`terkirim ${sent}${dry ? `, dry-run ${dry}` : ''}, skip ${skipped}, gagal ${failed}`);
    });
  } finally {
    runningJobs.delete(jobKey);
  }
}

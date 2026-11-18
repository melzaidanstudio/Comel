/**
 * Alur utama Comel di atas Repliz:
 *  trigger → cari postingan Threads (Repliz Research) → saring → metrik viral (Lightpanda, bila perlu)
 *          → AI menulis komentar → kirim lewat Repliz (Create Comment)
 *  balas komentar → antrean komentar Repliz (pending) → AI → Reply Comment
 */
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { threadsAccounts, triggers, type ThreadsAccount, type Trigger } from './db/schema';
import { getAccount, updateAccount } from './accounts';
import {
  failedAttempts, hasActedOn, lastSentAt, recentReplyTexts, recentlyCommentedAuthor, recordAction, sentLast24h, sentLastHour,
  type NewAction,
} from './actions';
import {
  checkPost, engagementScore, hasMetricFilter, parseExpr, parseTagList, positiveTerms, type Ast,
} from './filters';
import { generateReply, outputProblem, resolveProvider } from './llm';
import { withAccountLock } from './locks';
import { log } from './logger';
import { effectivePersona } from './persona';
import {
  contentToPost, createComment, listComments, replyComment, ReplizError, searchThreads, type ReplizQueueComment,
} from './repliz';
import type { Provider } from './db/schema';
import { fetchPostPage } from './scraper';
import { getSettings } from './settings';
import { recordTags } from './tags';
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

/** Error yang membuat percobaan berikutnya pasti gagal juga → hentikan putaran. */
const isFatal = (e: unknown) => e instanceof ReplizError && [0, 401, 402, 403, 429].includes(e.status);
/** Error tingkat akun/paket — bukan kesalahan postingan, jadi tidak dicatat sebagai gagal untuk postingan itu. */
const isAccountLevel = (e: unknown) => e instanceof ReplizError && [401, 402, 403, 429].includes(e.status);
/** Repliz tidak menjawab saat mengirim: kiriman mungkin sudah masuk. */
const isUncertain = (e: unknown) => e instanceof ReplizError && e.status === 0;

/** Jaga jeda acak (Pengaturan → jeda) sejak kiriman terakhir akun, termasuk dari putaran/pekerjaan lain. */
async function waitForGap(accountId: number, s: AppSettings) {
  const last = await lastSentAt(accountId);
  if (!last) return;
  const wait = last.getTime() + randomDelayMs(s) - Date.now();
  if (wait > 0) await sleep(Math.min(wait, 15 * 60_000));
}

/** Catat hasil kirim yang gagal sesuai jenis errornya. Return true bila putaran harus berhenti. */
async function recordSendError(e: unknown, base: Omit<NewAction, 'status'>, text: string, src: string, accountId: number) {
  const m = (e as Error).message;
  if (isUncertain(e)) {
    await recordAction({ ...base, replyText: text, status: 'uncertain', error: m });
    await log('warn', src, `Repliz tidak menjawab saat mengirim ke ${base.targetUrl || base.targetUser} — mungkin sudah terkirim, tidak dicoba ulang: ${m}`);
  } else if (isAccountLevel(e)) {
    await log('error', src, `Kirim dihentikan: ${m}`);
  } else {
    await recordAction({ ...base, replyText: text, status: 'failed', error: m });
    await log('error', src, `Gagal kirim ke ${base.targetUrl || base.targetUser}: ${m}`);
  }
  if (isFatal(e)) { await updateAccount(accountId, { statusNote: `ERROR: ${m.slice(0, 200)}` }); return true; }
  return false;
}

/** Sisa kuota kirim akun: min(batas per jam, batas harian). */
async function remainingQuota(a: ThreadsAccount) {
  const [day, hour] = await Promise.all([sentLast24h(a.id), sentLastHour(a.id)]);
  return {
    left: Math.max(0, Math.min(a.dailyLimit - day, a.hourlyLimit - hour)),
    note: day >= a.dailyLimit ? `batas harian tercapai (${day}/${a.dailyLimit})` : hour >= a.hourlyLimit ? `batas per jam tercapai (${hour}/${a.hourlyLimit})` : '',
  };
}

/** Isi like/balasan/repost/share/quote dari halaman publik postingan (Lightpanda). */
async function withMetrics(p: EvaluatedPost): Promise<EvaluatedPost> {
  if (!p.username || !p.code || p.code === p.contentId) return { ...p, ok: false, reason: 'tidak bisa cek metrik (URL postingan tidak dikenal)' };
  try {
    const { root } = await fetchPostPage(p.username, p.code);
    if (!root) return { ...p, ok: false, reason: 'tidak bisa cek metrik (postingan tidak terbaca)' };
    return {
      ...p, likes: root.likes, replies: root.replies, reposts: root.reposts, shares: root.shares, quotes: root.quotes,
      isReply: p.isReply || root.isReply, tag: p.tag || root.tag, metricsChecked: true,
    };
  } catch (e) {
    // Lightpanda tidak terpasang → semua postingan akan gagal; hentikan putaran dengan error yang jelas
    if ((e as { code?: string }).code === 'LIGHTPANDA_MISSING') throw e;
    return { ...p, ok: false, reason: `gagal cek metrik: ${(e as Error).message.slice(0, 80)}` };
  }
}

/** Kumpulkan & saring kandidat postingan untuk sebuah trigger. */
export async function collectCandidates(t: Trigger, a: ThreadsAccount) {
  if (!a.replizAccountId) throw new Error('Akun ini belum terhubung ke Repliz. Tambahkan ulang akun dari daftar akun Repliz.');
  const settings = await getSettings();
  const ast = parseExpr(t.matchExpr);
  const tagSources = t.tagAsSource ? parseTagList(t.topicTags).slice(0, 6) : [];
  // dengan sumber tag, query otomatis dari ekspresi tidak dipakai (hanya query manual)
  const queries = buildQueries(t.queries || [], tagSources.length ? null : ast);
  if (!queries.length && !tagSources.length) {
    throw new Error('Trigger belum punya kata pencarian, ekspresi kata kunci, atau topic tag (dengan opsi "cari lewat topic tag")');
  }

  const now = nowSec();
  const range = t.maxAgeHours > 0 ? { since: now - t.maxAgeHours * 3600, until: now } : {};
  const sort = t.sortBy === 'newest' ? 'RECENT' as const : 'TOP' as const;
  const sources = [
    ...tagSources.map((tag) => ({ label: `#${tag}`, search: tag, mode: 'TAG' as const })),
    ...queries.map((q) => ({ label: q, search: q, mode: 'KEYWORD' as const })),
  ];

  const seen = new Map<string, Post & { query: string }>();
  const errors: string[] = [];
  for (const src of sources) {
    try {
      const r = await searchThreads({ accountId: a.replizAccountId, search: src.search, mode: src.mode, sort, ...range });
      const posts = (r.docs || []).map(contentToPost);
      await recordTags(posts);
      for (const p of posts) if (!seen.has(p.code)) seen.set(p.code, { ...p, query: src.label });
    } catch (e) {
      if (isFatal(e)) throw e; // kunci salah / paket / limit → semua sumber akan gagal
      errors.push(`"${src.label}": ${(e as Error).message}`);
    }
  }
  if (!seen.size && errors.length) throw new Error(`Pencarian Repliz gagal — ${errors.join(' | ')}`);

  // Tahap 1: semua filter kecuali metrik viral (hasil Repliz tidak memuat metrik)
  const evaluated: EvaluatedPost[] = [];
  for (const p of seen.values()) {
    let v = checkPost(p, t, { ast, now, ownUsername: a.username, skipMetrics: true });
    if (v.ok && await hasActedOn(a.id, p.code)) v = { ok: false, reason: 'sudah pernah diproses' };
    if (v.ok && await failedAttempts(a.id, p.code) >= 2) v = { ok: false, reason: 'gagal 2x sebelumnya' };
    if (v.ok && await recentlyCommentedAuthor(a.id, p.username, t.authorCooldownHours)) {
      v = { ok: false, reason: `sudah komentar ke @${p.username} < ${t.authorCooldownHours} jam` };
    }
    evaluated.push({ ...p, ok: v.ok, reason: v.reason || '' });
  }
  if (t.sortBy === 'newest') evaluated.sort((x, y) => y.takenAt - x.takenAt);

  // Tahap 2: metrik viral via Lightpanda, hanya untuk kandidat teratas yang lolos tahap 1
  if (hasMetricFilter(t)) {
    const max = Math.max(0, Number(settings.metricLookupMax) || 0);
    const passing = evaluated.filter((p) => p.ok);
    const toCheck = passing.slice(0, max);
    const checked = new Map((await Promise.all(toCheck.map(withMetrics))).map((p) => [p.code, p]));
    for (let i = 0; i < evaluated.length; i++) {
      const p = evaluated[i];
      if (!p.ok) continue;
      const m = checked.get(p.code);
      if (!m) { evaluated[i] = { ...p, ok: false, reason: `metrik belum dicek (maks ${max} postingan per putaran)` }; continue; }
      if (!m.ok) { evaluated[i] = m; continue; }
      const v = checkPost(m, t, { ast, now, ownUsername: a.username });
      evaluated[i] = { ...m, ok: v.ok, reason: v.reason || '' };
    }
  }

  evaluated.sort((x, y) => (Number(y.ok) - Number(x.ok))
    || (t.sortBy === 'newest' ? y.takenAt - x.takenAt : engagementScore(y) - engagementScore(x)));
  return { queries: sources.map((s) => s.label), posts: evaluated, errors };
}

const metricsOf = (p: Post) => ({
  likes: p.likes, replies: p.replies, reposts: p.reposts, shares: p.shares, quotes: p.quotes, takenAt: p.takenAt, tag: p.tag?.name || null,
});

async function finishTrigger(id: number, status: string) {
  await db.update(triggers).set({ lastRunAt: new Date(), lastStatus: status }).where(eq(triggers.id, id));
  return { status };
}

/** Scrape → saring → komentar AI → kirim lewat Repliz. */
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
    if (!a.replizAccountId) return finishTrigger(t.id, 'dilewati: akun belum terhubung ke Repliz');
    if (!a.isConnected) return finishTrigger(t.id, 'dilewati: akun terputus di Repliz — reconnect di dashboard Repliz');
    const q = await remainingQuota(a);
    if (!q.left) return finishTrigger(t.id, `dilewati: ${q.note}`);
    const quota = Math.min(t.actionsPerRun, q.left);

    const { posts, errors } = await collectCandidates(t, a);
    for (const e of errors) await log('warn', src, `Pencarian: ${e}`);
    const candidates = posts.filter((p) => p.ok);
    await log('info', src, `${posts.length} postingan ditemukan, ${candidates.length} lolos filter, target ${quota} komentar`);
    if (!candidates.length) return finishTrigger(t.id, `0 kandidat dari ${posts.length} postingan`);

    const provider = await resolveProvider(t.providerId, a.providerId);
    const persona = await effectivePersona(a.id);
    let sent = 0; let skipped = 0; let failed = 0; let dry = 0;
    const authors = new Set<string>(); // satu komentar per penulis per putaran

    for (const post of candidates) {
      if (sent + dry >= quota) break;
      if (sent + dry + skipped + failed >= quota * 4) break; // batas percobaan per putaran
      if ((await getSettings()).paused && !opts.manual) break;
      const author = post.username.toLowerCase();
      if (author && authors.has(author)) continue;

      const base: Omit<NewAction, 'status'> = {
        accountId: a.id, triggerId: t.id, kind: 'comment', targetCode: post.code, targetId: post.contentId,
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
      const problem = outputProblem(text, post.username);
      if (problem) {
        skipped++;
        await recordAction({ ...base, replyText: text, status: 'skipped', error: `teks AI ditolak: ${problem}` });
        await log('warn', src, `Komentar AI untuk ${post.url} tidak dikirim (${problem}): ${text}`);
        continue;
      }
      if (t.dryRun) {
        dry++;
        authors.add(author);
        await recordAction({ ...base, replyText: text, status: 'dry_run' });
        await log('info', src, `[DRY RUN] @${post.username}: ${text}`);
        continue;
      }
      await waitForGap(a.id, settings);
      // dicek ulang tepat sebelum kirim (bisa berubah selama menunggu jeda)
      if (await hasActedOn(a.id, post.code) || await recentlyCommentedAuthor(a.id, post.username, t.authorCooldownHours)) continue;
      if ((await getSettings()).paused && !opts.manual) break;
      try {
        const res = await createComment(post.contentId!, { accountId: a.replizAccountId, text });
        sent++;
        authors.add(author);
        await recordAction({ ...base, replyText: text, status: 'sent', resultId: res.commentId || null });
        await log('info', src, `Komentar terkirim ke @${post.username} (${post.url}): ${text}`);
      } catch (e) {
        failed++;
        if (isUncertain(e)) authors.add(author);
        if (await recordSendError(e, base, text, src, a.id)) break;
      }
    }
    return finishTrigger(t.id, `terkirim ${sent}${dry ? `, dry-run ${dry}` : ''}, skip ${skipped}, gagal ${failed}`);
  });
  if (!r.busy) return r.value;
  const status = 'ditunda: akun sedang menjalankan pekerjaan lain';
  // jangan buang jadwal: coba lagi 2 menit lagi
  if (!opts.manual) await db.update(triggers).set({ nextRunAt: new Date(Date.now() + 120_000), lastStatus: status }).where(eq(triggers.id, t.id));
  return { status: opts.manual ? 'akun sedang menjalankan pekerjaan lain, coba lagi nanti' : status };
}

// ---------- balas komentar di postingan sendiri (antrean Repliz) ----------
/** Draf balasan AI untuk satu komentar di antrean Repliz (dipakai worker & halaman Inbox). */
export async function draftCommentReply(
  a: ThreadsAccount, c: ReplizQueueComment,
  pre: { provider?: Provider; persona?: { soul: string; memory: string } } = {},
) {
  return generateReply({
    provider: pre.provider || await resolveProvider(a.providerId),
    persona: pre.persona || await effectivePersona(a.id),
    kind: 'reply',
    context: { label: 'komentar orang di postingan kamu', parentText: c.content?.description || '' },
    post: {
      username: c.comment.owner?.name || 'seseorang', text: c.comment.text || '', likes: 0, replies: 0, reposts: 0, shares: 0,
      takenAt: c.comment.createdAt ? Math.floor(new Date(c.comment.createdAt).getTime() / 1000) : 0,
    },
    instruction: a.replyInstruction || 'Balas komentar ini dengan ramah dan nyambung dengan isi komentarnya.',
    recentTexts: await recentReplyTexts(a.id),
  });
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
    if (!a.replizAccountId) return finish('dilewati: akun belum terhubung ke Repliz');
    if (!a.isConnected) return finish('dilewati: akun terputus di Repliz — reconnect di dashboard Repliz');
    const q = await remainingQuota(a);
    if (!q.left) return finish(`dilewati: ${q.note}`);
    const quota = Math.min(a.replyPerRun, q.left);

    const res = await listComments({ accountIds: [a.replizAccountId], status: 'pending', limit: 50 });
    const me = a.username.toLowerCase();
    const maxAge = a.replyMaxAgeHours * 3600;
    const fresh: ReplizQueueComment[] = [];
    for (const c of res.docs || []) {
      const ts = c.comment.createdAt ? Math.floor(new Date(c.comment.createdAt).getTime() / 1000) : nowSec();
      if (nowSec() - ts > maxAge) continue;
      if (me && (c.comment.owner?.name || '').toLowerCase() === me) continue;
      if (await hasActedOn(a.id, c._id) || await failedAttempts(a.id, c._id) >= 2) continue;
      fresh.push(c);
    }
    fresh.sort((x, y) => String(x.comment.createdAt).localeCompare(String(y.comment.createdAt)));
    await log('info', src, `${res.docs?.length || 0} komentar pending, ${fresh.length} akan diproses`);
    if (!fresh.length) return finish(`tidak ada komentar baru (${res.docs?.length || 0} pending dicek)`);

    const provider = await resolveProvider(a.providerId);
    const persona = await effectivePersona(a.id);
    let sent = 0; let skipped = 0; let failed = 0; let dry = 0;
    for (const c of fresh) {
      if (sent + dry >= quota) break;
      const author = c.comment.owner?.name || 'seseorang';
      const base: Omit<NewAction, 'status'> = {
        accountId: a.id, triggerId: null, kind: 'reply', targetCode: c._id, targetId: c.comment.id,
        targetUser: author, targetText: (c.comment.text || '').slice(0, 1000), targetUrl: c.content?.url || '',
      };
      let text: string;
      try {
        text = await draftCommentReply(a, c, { provider, persona });
      } catch (e) {
        failed++; await log('error', src, `AI gagal: ${(e as Error).message}`); break;
      }
      if (!text || text === 'SKIP') { skipped++; await recordAction({ ...base, status: 'skipped', error: 'AI memutuskan SKIP' }); continue; }
      const problem = outputProblem(text, author);
      if (problem) {
        skipped++;
        await recordAction({ ...base, replyText: text, status: 'skipped', error: `teks AI ditolak: ${problem}` });
        await log('warn', src, `Balasan AI untuk @${author} tidak dikirim (${problem}): ${text}`);
        continue;
      }
      if (a.replyDryRun) {
        dry++;
        await recordAction({ ...base, replyText: text, status: 'dry_run' });
        await log('info', src, `[DRY RUN] balas @${author}: ${text}`);
        continue;
      }
      await waitForGap(a.id, settings);
      if (await hasActedOn(a.id, c._id)) continue; // mungkin sudah dibalas manual dari Inbox
      if ((await getSettings()).paused && !opts.manual) break;
      try {
        const out = await replyComment(c._id, text);
        sent++;
        await recordAction({ ...base, replyText: text, status: 'sent', resultId: out.commentId || null });
        await log('info', src, `Balasan terkirim ke @${author}: ${text}`);
      } catch (e) {
        failed++;
        if (await recordSendError(e, base, text, src, a.id)) break;
      }
    }
    return finish(`terkirim ${sent}${dry ? `, dry-run ${dry}` : ''}, skip ${skipped}, gagal ${failed}`);
  });
  if (!r.busy) return r.value;
  const status = 'ditunda: akun sedang menjalankan pekerjaan lain';
  if (!opts.manual) await updateAccount(a.id, { nextReplyAt: new Date(Date.now() + 120_000), lastReplyStatus: status });
  return { status: opts.manual ? 'akun sedang menjalankan pekerjaan lain, coba lagi nanti' : status };
}

/** Dipanggil webhook `comment`: jadwalkan balas komentar akun ini secepatnya. */
export async function nudgeReplies(replizAccountId: string) {
  const rows = await db.update(threadsAccounts).set({ nextReplyAt: new Date() })
    .where(and(eq(threadsAccounts.replizAccountId, replizAccountId), eq(threadsAccounts.replyEnabled, true)))
    .returning({ id: threadsAccounts.id });
  return rows.length;
}

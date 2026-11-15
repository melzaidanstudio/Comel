import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import {
  ROOT, PORT, HOST, SESSION_SECRET, ADMIN_PASSWORD, ADMIN_PASSWORD_FROM_ENV, SCREENSHOT_DIR, DATA_DIR,
} from './config.js';
import {
  db, getSettings, saveSettings, insert, update, getById, list, remove, recentLogs, log,
} from './db.js';
import { PROVIDER_PRESETS, chat, generateReply, resolveProvider } from './llm.js';
import { readPersonaFile, writePersonaFile, effectivePersona } from './persona.js';
import { runTrigger, runReplyJob, collectCandidates, runningJobs } from './engine.js';
import { startScheduler } from './scheduler.js';
import { verifyAccount, browser as browserPoster } from './posters/index.js';
import { parseExpr } from './filters.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// ---------- auth ----------
const COOKIE = 'comel_session';
const sign = (v) => crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('hex');
function makeToken() {
  const exp = String(Date.now() + 30 * 86400 * 1000);
  return `${exp}.${sign(exp)}`;
}
function validToken(tok) {
  if (!tok) return false;
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const loginAttempts = new Map();
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const a = loginAttempts.get(ip) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Terlalu banyak percobaan, coba lagi beberapa menit lagi.' });
  const pw = String(req.body?.password || '');
  const ok = pw.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(ADMIN_PASSWORD));
  if (!ok) {
    a.n += 1;
    if (a.n >= 5) { a.until = Date.now() + 5 * 60 * 1000; a.n = 0; }
    loginAttempts.set(ip, a);
    return res.status(401).json({ error: 'Password salah' });
  }
  loginAttempts.delete(ip);
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${makeToken()}; HttpOnly; Path=/; Max-Age=${30 * 86400}; SameSite=Lax${secure ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});
app.use('/api', (req, res, next) => {
  if (validToken(readCookie(req, COOKIE))) return next();
  res.status(401).json({ error: 'Belum login' });
});

const wrap = (fn) => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
};
const idOf = (req) => Number(req.params.id);
function mustGet(table, id) {
  const row = getById(table, id);
  if (!row) { const e = new Error('Data tidak ditemukan'); e.status = 404; throw e; }
  return row;
}

// ---------- masking rahasia ----------
const mask = (s) => (s ? `••••${String(s).slice(-4)}` : '');
function publicProvider(p) {
  return { ...p, api_key: undefined, api_key_masked: mask(p.api_key), has_key: Boolean(p.api_key) };
}
function publicAccount(a) {
  return {
    ...a,
    access_token: undefined,
    cookies: undefined,
    token_masked: mask(a.access_token),
    has_token: Boolean(a.access_token),
    cookie_info: browserPoster.cookieSummary(a.cookies),
    sent_24h: db.prepare("SELECT COUNT(*) n FROM actions WHERE account_id = ? AND status = 'sent' AND created_at >= unixepoch() - 86400").get(a.id).n,
  };
}
/** Field rahasia hanya diubah jika diisi; kirim clear_<field>: true untuk mengosongkan. */
function secretPatch(body, fields) {
  const out = { ...body };
  for (const f of fields) {
    if (body[`clear_${f}`]) out[f] = '';
    else if (!body[f]) delete out[f];
  }
  return out;
}

// ---------- info & settings ----------
app.get('/api/me', wrap(() => ({ ok: true, version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version })));
app.get('/api/settings', wrap(() => getSettings()));
app.put('/api/settings', wrap((req) => saveSettings(req.body || {})));
app.get('/api/presets', wrap(() => PROVIDER_PRESETS));

app.get('/api/stats', wrap(() => {
  const q = (sql, ...p) => db.prepare(sql).get(...p).n;
  return {
    accounts: q('SELECT COUNT(*) n FROM accounts WHERE enabled = 1'),
    triggers: q('SELECT COUNT(*) n FROM triggers WHERE enabled = 1'),
    sent24: q("SELECT COUNT(*) n FROM actions WHERE status = 'sent' AND created_at >= unixepoch() - 86400"),
    failed24: q("SELECT COUNT(*) n FROM actions WHERE status = 'failed' AND created_at >= unixepoch() - 86400"),
    skipped24: q("SELECT COUNT(*) n FROM actions WHERE status IN ('skipped','dry_run') AND created_at >= unixepoch() - 86400"),
    running: [...runningJobs],
    paused: getSettings().paused,
  };
}));

// ---------- providers ----------
app.get('/api/providers', wrap(() => list('providers').map(publicProvider)));
app.post('/api/providers', wrap((req) => {
  const p = insert('providers', req.body);
  if (req.body.is_default || list('providers').length === 1) setDefaultProvider(p.id);
  return publicProvider(getById('providers', p.id));
}));
app.put('/api/providers/:id', wrap((req) => {
  mustGet('providers', idOf(req));
  const p = update('providers', idOf(req), secretPatch(req.body, ['api_key']));
  if (req.body.is_default) setDefaultProvider(p.id);
  return publicProvider(getById('providers', p.id));
}));
app.delete('/api/providers/:id', wrap((req) => { remove('providers', idOf(req)); }));
app.post('/api/providers/:id/test', wrap(async (req) => {
  const p = mustGet('providers', idOf(req));
  const t0 = Date.now();
  const out = await chat(p, [
    { role: 'system', content: 'Jawab singkat.' },
    { role: 'user', content: 'Balas dengan satu kalimat: "Halo, koneksi berhasil!"' },
  ], { max_tokens: 60 });
  return { ok: true, reply: out, ms: Date.now() - t0 };
}));
function setDefaultProvider(id) {
  db.prepare('UPDATE providers SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END').run(id);
}

// ---------- accounts ----------
app.get('/api/accounts', wrap(() => list('accounts').map(publicAccount)));
app.post('/api/accounts', wrap((req) => {
  const body = { ...req.body, username: String(req.body.username || '').replace(/^@/, '').trim() };
  if (body.cookies) browserPoster.parseCookies(body.cookies); // validasi format
  return publicAccount(insert('accounts', body));
}));
app.put('/api/accounts/:id', wrap((req) => {
  mustGet('accounts', idOf(req));
  const body = secretPatch(req.body, ['access_token', 'cookies']);
  if (body.username !== undefined) body.username = String(body.username).replace(/^@/, '').trim();
  if (body.cookies) browserPoster.parseCookies(body.cookies);
  if (body.access_token) body.token_refreshed_at = 0;
  return publicAccount(update('accounts', idOf(req), body));
}));
app.delete('/api/accounts/:id', wrap((req) => { remove('accounts', idOf(req)); }));
app.post('/api/accounts/:id/verify', wrap(async (req) => {
  const a = mustGet('accounts', idOf(req));
  try {
    return await verifyAccount(a);
  } catch (e) {
    update('accounts', a.id, { status_note: `ERROR: ${e.message.slice(0, 200)}` });
    throw e;
  }
}));
app.post('/api/accounts/:id/run-replies', wrap(async (req) => {
  mustGet('accounts', idOf(req));
  return runReplyJob(idOf(req), { manual: true });
}));
app.get('/api/accounts/:id/persona', wrap((req) => ({
  soul: readPersonaFile('soul.md', idOf(req)), memory: readPersonaFile('memory.md', idOf(req)),
})));
app.put('/api/accounts/:id/persona', wrap((req) => {
  mustGet('accounts', idOf(req));
  if (req.body.soul !== undefined) writePersonaFile('soul.md', req.body.soul, idOf(req));
  if (req.body.memory !== undefined) writePersonaFile('memory.md', req.body.memory, idOf(req));
}));

// ---------- persona global ----------
app.get('/api/persona', wrap(() => ({ soul: readPersonaFile('soul.md'), memory: readPersonaFile('memory.md') })));
app.put('/api/persona', wrap((req) => {
  if (req.body.soul !== undefined) writePersonaFile('soul.md', req.body.soul);
  if (req.body.memory !== undefined) writePersonaFile('memory.md', req.body.memory);
}));

// ---------- triggers ----------
function normalizeTrigger(body) {
  const b = { ...body };
  if (typeof b.queries === 'string') b.queries = b.queries.split('\n').map((s) => s.trim()).filter(Boolean);
  if (b.match_expr !== undefined) parseExpr(b.match_expr); // lempar error kalau sintaks salah
  return b;
}
app.get('/api/triggers', wrap(() => list('triggers')));
app.post('/api/triggers', wrap((req) => insert('triggers', { ...normalizeTrigger(req.body), next_run_at: 0 })));
app.put('/api/triggers/:id', wrap((req) => {
  mustGet('triggers', idOf(req));
  return update('triggers', idOf(req), normalizeTrigger(req.body));
}));
app.delete('/api/triggers/:id', wrap((req) => { remove('triggers', idOf(req)); }));
app.post('/api/triggers/:id/run', wrap(async (req) => {
  mustGet('triggers', idOf(req));
  return runTrigger(idOf(req), { manual: true });
}));
app.post('/api/triggers/:id/preview', wrap(async (req) => {
  const t = mustGet('triggers', idOf(req));
  const a = mustGet('accounts', t.account_id);
  return collectCandidates(t, a);
}));
/** Buat contoh komentar untuk satu postingan (tanpa mengirim). */
app.post('/api/triggers/:id/test-generate', wrap(async (req) => {
  const t = mustGet('triggers', idOf(req));
  const a = mustGet('accounts', t.account_id);
  const post = req.body.post;
  if (!post?.text && !post?.code) throw new Error('Data postingan kosong');
  const text = await generateReply({
    provider: resolveProvider(t.provider_id, a.provider_id),
    persona: effectivePersona(a.id),
    kind: 'comment',
    post: { likes: 0, replies: 0, reposts: 0, shares: 0, ...post },
    instruction: t.instruction,
  });
  return { text };
}));

// ---------- riwayat & log ----------
app.get('/api/actions', wrap((req) => {
  const where = []; const params = [];
  if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
  if (req.query.account_id) { where.push('a.account_id = ?'); params.push(Number(req.query.account_id)); }
  if (req.query.kind) { where.push('a.kind = ?'); params.push(req.query.kind); }
  const limit = Math.min(500, Number(req.query.limit) || 100);
  return db.prepare(`
    SELECT a.*, acc.name AS account_name, t.name AS trigger_name
    FROM actions a LEFT JOIN accounts acc ON acc.id = a.account_id LEFT JOIN triggers t ON t.id = a.trigger_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY a.id DESC LIMIT ${limit}`).all(...params);
}));
app.get('/api/logs', wrap((req) => recentLogs(Math.min(1000, Number(req.query.limit) || 200))));
app.get('/api/screenshots/:file', (req, res) => {
  const f = path.basename(req.params.file);
  const p = path.join(SCREENSHOT_DIR, f);
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// ---------- frontend ----------
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, HOST, () => {
  log('info', 'server', `Comel berjalan di http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (data: ${DATA_DIR})`);
  if (!ADMIN_PASSWORD_FROM_ENV) {
    console.log(`\n  Password dashboard: ${ADMIN_PASSWORD}\n  (disimpan di data/.admin_password — set ADMIN_PASSWORD di .env untuk menggantinya)\n`);
  }
  startScheduler();
});

/**
 * Kirim balasan dengan mengendalikan browser (Playwright) memakai cookie login Threads.
 * Engine: "chromium" (paling andal) atau "lightpanda" (via CDP, ringan tapi eksperimental untuk form kompleks).
 *
 * Catatan: cara ini meniru pengguna di threads.com. Selector bisa berubah kapan saja jika Meta
 * mengubah tampilan; bila gagal, screenshot disimpan di data/screenshots untuk diperiksa.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { CHROMIUM_PATH, COOKIE_DIR, LIGHTPANDA_BIN, SCREENSHOT_DIR } from '../config.js';
import { update, getById, log } from '../db.js';
import { decrypt, totp } from '../secrets.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (a, b) => a + Math.floor(Math.random() * (b - a));

// ---------- cookie ----------
/**
 * Terima cookie dalam format:
 *  - JSON array hasil ekspor ekstensi (Cookie-Editor / EditThisCookie)
 *  - string header: "sessionid=...; csrftoken=...; ds_user_id=..."
 */
export function parseCookies(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  let list = [];
  if (s.startsWith('[') || s.startsWith('{')) {
    let j = JSON.parse(s);
    if (!Array.isArray(j)) j = j.cookies || [j];
    list = j.map((c) => ({
      name: c.name,
      value: String(c.value ?? ''),
      domain: c.domain,
      path: c.path || '/',
      secure: c.secure ?? true,
      httpOnly: Boolean(c.httpOnly),
      expires: Number(c.expirationDate || c.expires) > 0 ? Math.floor(Number(c.expirationDate || c.expires)) : undefined,
      sameSite: ({ no_restriction: 'None', lax: 'Lax', strict: 'Strict', none: 'None' })[String(c.sameSite || '').toLowerCase()] || 'Lax',
    }));
  } else {
    list = s.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      const i = p.indexOf('=');
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), path: '/', secure: true, httpOnly: false, sameSite: 'Lax' };
    });
  }
  return list
    .filter((c) => c.name && c.value)
    .map((c) => {
      let domain = c.domain || '.threads.com';
      // cookie lama dari threads.net dipindah ke threads.com
      domain = domain.replace(/threads\.net$/, 'threads.com');
      if (!/threads\.com$/.test(domain)) return null;
      const out = { ...c, domain };
      if (!out.expires) delete out.expires;
      return out;
    })
    .filter(Boolean);
}

export function cookieSummary(raw) {
  try {
    const list = parseCookies(raw);
    const names = list.map((c) => c.name);
    return { count: list.length, hasSession: names.includes('sessionid'), names };
  } catch (e) {
    return { count: 0, hasSession: false, error: e.message };
  }
}

/** Tulis file cookie (format CDP/Puppeteer) untuk dipakai `lightpanda fetch --cookie`. */
export function writeCookieFile(account) {
  const list = parseCookies(account.cookies);
  if (!list.length) return null;
  const p = path.join(COOKIE_DIR, `account-${account.id}.json`);
  fs.writeFileSync(p, JSON.stringify(list, null, 2), { mode: 0o600 });
  return p;
}

// ---------- browser ----------
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function startLightpandaServer() {
  const port = await freePort();
  const child = spawn(LIGHTPANDA_BIN, ['serve', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'error'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return { child, endpoint: `ws://127.0.0.1:${port}` };
    } catch { /* belum siap */ }
  }
  child.kill('SIGKILL');
  throw new Error('Lightpanda CDP server tidak bisa dijalankan');
}

/** Buka browser (Chromium atau Lightpanda via CDP). Kembalikan { context, close }. */
async function openBrowser(engine) {
  let browser; let lp;
  try {
    if (engine === 'lightpanda') {
      lp = await startLightpandaServer();
      browser = await chromium.connectOverCDP(lp.endpoint);
      const context = await browser.newContext();
      return { context, close: async () => { try { await browser.close(); } catch { /* */ } lp.child.kill('SIGKILL'); } };
    }
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({ userAgent: UA, locale: 'id-ID', viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
    return { context, close: async () => { try { await browser.close(); } catch { /* */ } } };
  } catch (e) {
    try { await browser?.close(); } catch { /* */ }
    lp?.child.kill('SIGKILL');
    throw e;
  }
}

async function saveContextCookies(account, context) {
  try {
    const fresh = (await context.cookies('https://www.threads.com')).filter((c) => c.value);
    if (fresh.some((c) => c.name === 'sessionid')) {
      update('accounts', account.id, { cookies: JSON.stringify(fresh) });
      return true;
    }
  } catch { /* abaikan */ }
  return false;
}

/** Error khusus: sesi tidak valid → boleh dicoba login ulang otomatis. */
class SessionError extends Error {}

async function withBrowser(account, fn) {
  const cookies = parseCookies(account.cookies);
  if (!cookies.some((c) => c.name === 'sessionid')) {
    throw new SessionError('Belum ada sesi login (cookie "sessionid" kosong).');
  }
  const { context, close } = await openBrowser(account.browser_engine);
  try {
    await context.addCookies(cookies);
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const result = await fn(page);
    await saveContextCookies(account, context); // simpan cookie terbaru supaya sesi tetap segar
    return result;
  } finally {
    await close();
  }
}

// ---------- login otomatis dengan username + password ----------
const LOGIN_URL = 'https://www.threads.com/login?show_choice_screen=false';
const AUTO_LOGIN_COOLDOWN_SEC = 30 * 60;
const pending2fa = new Map(); // accountId -> { page, context, close, timer, waitFor }

function loginCreds(account) {
  if (!account.login_username || !account.login_password_enc) return null;
  return {
    username: account.login_username,
    password: decrypt(account.login_password_enc),
    totpSecret: account.totp_secret_enc ? decrypt(account.totp_secret_enc) : '',
  };
}

export function canAutoLogin(account) {
  const now = Math.floor(Date.now() / 1000);
  return Boolean(account.auto_login && account.login_username && account.login_password_enc
    && !account.login_paused && now - (account.last_login_attempt || 0) > AUTO_LOGIN_COOLDOWN_SEC);
}

/** Tunggu respons JSON dari endpoint login (…/accounts/login/ajax/…). */
function waitLoginResponse(page, pattern, timeoutMs = 30_000) {
  return page.waitForResponse((r) => r.request().method() === 'POST' && pattern.test(r.url()), { timeout: timeoutMs })
    .then(async (r) => {
      const text = await r.text().catch(() => '');
      try { return JSON.parse(text.replace(/^for \(;;\);/, '')); } catch { return { raw: text.slice(0, 300), httpStatus: r.status() }; }
    });
}

function failLogin(account, message, { pause = true } = {}) {
  update('accounts', account.id, { status_note: `ERROR login: ${message}`.slice(0, 250), login_paused: pause ? 1 : 0 });
  log('error', `akun:${account.name}`, `Login gagal: ${message}`);
  const e = new Error(`Login gagal: ${message}`);
  e.loginFailed = true;
  return e;
}

async function finishSuccess(account, session) {
  await sleep(4000);
  const ok = await saveContextCookies(account, session.context);
  if (!ok) throw failLogin(account, 'login diterima tetapi cookie sesi tidak didapat');
  update('accounts', account.id, { status_note: `Login OK (${account.login_engine || 'lightpanda'})`, login_paused: 0 });
  log('info', `akun:${account.name}`, `Login berhasil sebagai ${account.login_username}`);
  return { ok: true, loggedIn: true };
}

/** Klik locator pertama yang bisa diklik (timeout pendek), kalau semua gagal jalankan fallback. */
async function clickFirstWorking(page, locators, fallback) {
  for (const loc of locators) {
    try {
      if (!(await loc.count())) continue;
      await loc.click({ timeout: 5000 });
      return;
    } catch { /* coba berikutnya */ }
  }
  await fallback();
}

const CODE_INPUT = 'input[autocomplete="one-time-code"], input[name="verificationCode"], input[name*="code" i], input[inputmode="numeric"], input[type="tel"], input[maxlength="6"], input[maxlength="8"]';

async function submit2faCode(account, session, code) {
  const { page } = session;
  let input = page.locator(CODE_INPUT).first();
  try {
    await input.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    // fallback: input teks pertama yang terlihat
    input = page.locator('input[type="text"]:visible, input:not([type]):visible').first();
  }
  await input.fill(String(code).replace(/\s/g, ''));
  const resp = waitLoginResponse(page, /two_factor|login\/ajax/i).catch(() => null);
  await clickFirstWorking(page, [
    page.getByRole('button', { name: /^(Confirm|Konfirmasi|Submit|Kirim|Verify|Verifikasi|Next|Berikutnya|Lanjut)$/i }).first(),
    page.locator('input[type="submit"], button[type="submit"]').first(),
  ], () => input.press('Enter'));
  const j = await resp;
  if (j?.authenticated) return finishSuccess(account, session);
  if (!j) {
    // sebagian versi tidak memakai XHR yang sama; cek cookie
    if (await saveContextCookies(account, session.context)) return finishSuccess(account, session);
    throw failLogin(account, 'tidak ada respons setelah memasukkan kode 2FA');
  }
  throw failLogin(account, j.message || 'kode 2FA ditolak');
}

/**
 * Login ke threads.com dengan username + password tersimpan.
 * opts.code = kode 2FA manual (jika diminta). Jika 2FA diperlukan dan tidak ada kunci TOTP / kode,
 * browser dibiarkan terbuka 5 menit dan fungsi mengembalikan { needs2fa: true }.
 */
export async function loginWithPassword(account, opts = {}) {
  const creds = loginCreds(account);
  if (!creds) throw new Error('Username/password login belum diisi');
  update('accounts', account.id, { last_login_attempt: Math.floor(Date.now() / 1000) });
  closePending(account.id);

  const engine = account.login_engine || 'lightpanda';
  const session = await openBrowser(engine);
  let keepOpen = false;
  try {
    const page = await session.context.newPage();
    session.page = page;
    page.setDefaultTimeout(30_000);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const pass = page.locator('input[type="password"]').first();
    await pass.waitFor({ state: 'visible', timeout: 30_000 });
    const user = page.locator('input[autocomplete="username"], input[name="username"], input[type="text"]').first();
    await user.click();
    await user.fill(creds.username);
    await sleep(jitter(400, 900));
    await pass.click();
    await pass.fill(creds.password);
    await sleep(jitter(500, 1100));

    const resp = waitLoginResponse(page, /accounts\/login\/ajax/i).catch(() => null);
    await clickFirstWorking(page, [
      page.locator('input[type="submit"], button[type="submit"]').first(),
      page.getByRole('button', { name: /^(Log in|Masuk|Login)$/i }).first(),
    ], () => pass.press('Enter'));
    const j = await resp;

    if (!j) {
      const shot = engine === 'chromium' ? await screenshot(page, 'login-noresp') : null;
      throw failLogin(account, `tidak ada respons dari server login${shot ? ` (screenshot: ${shot})` : ''}`, { pause: false });
    }
    if (j.authenticated) return await finishSuccess(account, session);

    if (j.two_factor_required) {
      const code = opts.code || (creds.totpSecret ? totp(creds.totpSecret) : '');
      if (code) return await submit2faCode(account, session, code);
      // simpan sesi browser, tunggu kode dari pengguna (maks 5 menit)
      keepOpen = true;
      const timer = setTimeout(() => closePending(account.id), 5 * 60 * 1000);
      pending2fa.set(account.id, { ...session, timer });
      update('accounts', account.id, { status_note: 'Menunggu kode 2FA (5 menit)' });
      return { ok: false, needs2fa: true, message: 'Threads meminta kode 2FA. Masukkan kode dari SMS / aplikasi authenticator.' };
    }
    if (j.checkpoint_url || /checkpoint/i.test(j.message || '')) {
      throw failLogin(account, 'Meta meminta verifikasi keamanan (checkpoint). Buka Threads/Instagram di HP, konfirmasi "Ini saya", lalu klik "Login sekarang" lagi.');
    }
    if (j.user === false) throw failLogin(account, 'username tidak ditemukan');
    if (j.user === true && j.authenticated === false) throw failLogin(account, 'password salah');
    throw failLogin(account, j.message || j.raw || JSON.stringify(j).slice(0, 200));
  } finally {
    if (!keepOpen) await session.close();
  }
}

function closePending(accountId) {
  const p = pending2fa.get(accountId);
  if (!p) return;
  clearTimeout(p.timer);
  pending2fa.delete(accountId);
  p.close().catch(() => {});
}

/** Lanjutkan login yang sedang menunggu kode 2FA. */
export async function submitPending2fa(account, code) {
  const p = pending2fa.get(account.id);
  if (!p) throw new Error('Tidak ada login yang menunggu kode 2FA (mungkin sudah lewat 5 menit). Klik "Login sekarang" lagi.');
  clearTimeout(p.timer);
  pending2fa.delete(account.id);
  try {
    return await submit2faCode(account, p, code);
  } finally {
    await p.close();
  }
}

/**
 * Jalankan fn dengan sesi login. Bila sesi tidak ada / kedaluwarsa dan akun punya
 * username+password tersimpan, login otomatis sekali lalu coba lagi.
 */
async function withSession(account, fn, { manual = false } = {}) {
  try {
    return await withBrowser(account, fn);
  } catch (e) {
    if (!(e instanceof SessionError)) throw e;
    // Setelah login gagal (password salah/checkpoint) hanya tombol "Login sekarang" yang boleh mencoba lagi,
    // supaya tidak berulang-ulang login gagal (bisa membuat akun dikunci Meta).
    const allowed = manual
      ? Boolean(account.login_username && account.login_password_enc && !account.login_paused)
      : canAutoLogin(account);
    if (!allowed) {
      const hint = account.login_username && account.login_password_enc
        ? (account.login_paused ? ' Login otomatis dijeda setelah gagal — klik "Login sekarang".' : ' Login otomatis baru bisa dicoba lagi 30 menit setelah percobaan terakhir.')
        : ' Isi username & password login atau tempel cookie baru.';
      throw new Error(`${e.message}${hint}`);
    }
    log('info', `akun:${account.name}`, `${e.message} Mencoba login otomatis…`);
    const r = await loginWithPassword(account);
    if (!r.ok) throw new Error(`Sesi kedaluwarsa dan login butuh kode 2FA. Buka menu Akun → "Login sekarang".`);
    const fresh = getById('accounts', account.id);
    return withBrowser(fresh, fn);
  }
}

async function screenshot(page, tag) {
  try {
    const file = path.join(SCREENSHOT_DIR, `${Date.now()}-${tag}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return path.basename(file);
  } catch {
    return null;
  }
}

async function isLoggedOut(page) {
  // Halaman yang sudah login tidak punya tautan /login sama sekali (meski tersembunyi).
  const loginLink = page.locator('a[href^="/login"], a[href*="/accounts/login"], a[href*="threads.com/login"]');
  try { return (await loginLink.count()) > 0; } catch { return false; }
}

export async function verify(account) {
  return withSession(account, async (page) => {
    await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(4000);
    if (await isLoggedOut(page)) throw new SessionError('Sesi login tidak valid / sudah kedaluwarsa.');
    update('accounts', account.id, { status_note: `Sesi OK (${account.browser_engine})` });
    return { ok: true };
  }, { manual: true });
}

const REPLY_LABELS = ['Reply', 'Balas', 'Comment', 'Komentari', 'Komentar', 'Responder'];
const POST_LABELS = /^(Post|Posting|Kirim|Publikasikan|Bagikan|Reply|Balas)$/i;

/** Balas sebuah postingan / komentar berdasarkan URL-nya. */
export async function reply(account, target, text) {
  if (!target.url) throw new Error('URL postingan tujuan tidak diketahui');
  return withSession(account, async (page) => {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(jitter(3500, 6000));
    if (await isLoggedOut(page)) throw new SessionError('Sesi login tidak valid / kedaluwarsa.');
    if (target.code && !page.url().includes(target.code)) {
      throw new Error(`Halaman postingan tidak terbuka (dialihkan ke ${page.url()}) — postingan dihapus/privat atau sesi tidak valid`);
    }

    // tombol balas pada postingan utama (yang pertama di halaman postingan).
    // Threads menaruh label ikon di <svg><title>Comment</title></svg> (kadang di aria-label).
    const labelRe = new RegExp(`^(${REPLY_LABELS.join('|')})$`, 'i');
    const byTitle = page.locator('[role="button"]').filter({ has: page.locator('svg > title', { hasText: labelRe }) });
    const byAria = page.locator(REPLY_LABELS.map((l) => `svg[aria-label="${l}"]`).join(', '));
    const icon = byTitle.or(byAria).first();
    try {
      await icon.waitFor({ state: 'visible', timeout: 20_000 });
    } catch {
      const shot = await screenshot(page, `noreplybtn-${target.code || 'x'}`);
      throw new Error(`Tombol balas tidak ditemukan${shot ? ` (screenshot: ${shot})` : ''}`);
    }
    await icon.click();
    await sleep(jitter(1200, 2200));

    const dialog = page.locator('[role="dialog"]').last();
    let box = dialog.locator('[contenteditable="true"]').first();
    if (!(await box.count())) box = page.locator('[contenteditable="true"][role="textbox"], [contenteditable="true"]').first();
    try {
      await box.waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      const shot = await screenshot(page, `nocomposer-${target.code || 'x'}`);
      throw new Error(`Kotak balasan tidak muncul${shot ? ` (screenshot: ${shot})` : ''}`);
    }
    await box.click();
    await page.keyboard.type(text, { delay: jitter(25, 60) });
    await sleep(jitter(800, 1600));

    const scope = (await dialog.count()) ? dialog : page;
    const btn = scope.getByRole('button', { name: POST_LABELS }).last();
    try {
      await btn.waitFor({ state: 'visible', timeout: 10_000 });
      await btn.click();
    } catch {
      const shot = await screenshot(page, `nopostbtn-${target.code || 'x'}`);
      throw new Error(`Tombol "Post" tidak ditemukan${shot ? ` (screenshot: ${shot})` : ''}`);
    }

    // tunggu dialog tertutup / teks terkirim
    try {
      if (await dialog.count()) await dialog.waitFor({ state: 'detached', timeout: 25_000 });
      else await sleep(6000);
    } catch {
      const shot = await screenshot(page, `notsent-${target.code || 'x'}`);
      throw new Error(`Tidak ada konfirmasi terkirim (dialog masih terbuka)${shot ? ` (screenshot: ${shot})` : ''}`);
    }
    await sleep(jitter(1500, 3000));
    return { resultId: null };
  });
}

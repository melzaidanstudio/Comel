/**
 * Kirim balasan dengan mengendalikan browser (Playwright) memakai sesi login Threads.
 * Sesi didapat dari cookie yang ditempel, atau login otomatis dengan username + password tersimpan.
 * Engine: "chromium" (andal) atau "lightpanda" (via CDP, ringan).
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type BrowserContext, type Locator, type Page } from 'playwright-core';
import { CHROMIUM_PATH, COOKIE_DIR, LIGHTPANDA_BIN, SCREENSHOT_DIR } from '../config';
import { getAccount, updateAccount } from '../accounts';
import { log } from '../logger';
import { decrypt, totp } from '../secrets';
import type { ThreadsAccount } from '../db/schema';
import type { ReplyResult, ReplyTarget } from './types';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

// ---------- cookie ----------
type Cookie = {
  name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean;
  expires?: number; sameSite: 'Strict' | 'Lax' | 'None';
};

/** JSON array (Cookie-Editor/EditThisCookie) atau header "sessionid=...; csrftoken=...". */
export function parseCookies(raw: string | null | undefined): Cookie[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  let list: Array<Partial<Cookie>>;
  if (s.startsWith('[') || s.startsWith('{')) {
    let j = JSON.parse(s);
    if (!Array.isArray(j)) j = j.cookies || [j];
    list = (j as Array<Record<string, unknown>>).map((c) => {
      const exp = Number(c.expirationDate || c.expires);
      const ss = String(c.sameSite || '').toLowerCase();
      return {
        name: String(c.name || ''),
        value: String(c.value ?? ''),
        domain: c.domain ? String(c.domain) : undefined,
        path: String(c.path || '/'),
        secure: c.secure === undefined ? true : Boolean(c.secure),
        httpOnly: Boolean(c.httpOnly),
        expires: exp > 0 ? Math.floor(exp) : undefined,
        sameSite: ss === 'strict' ? 'Strict' : ss === 'none' || ss === 'no_restriction' ? 'None' : 'Lax',
      };
    });
  } else {
    list = s.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      const i = p.indexOf('=');
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim(), path: '/', secure: true, httpOnly: false, sameSite: 'Lax' as const };
    });
  }
  return list.filter((c) => c.name && c.value).flatMap((c) => {
    const domain = (c.domain || '.threads.com').replace(/threads\.net$/, 'threads.com');
    if (!/threads\.com$/.test(domain)) return [];
    const out = { ...c, domain } as Cookie;
    if (!out.expires) delete out.expires;
    return [out];
  });
}

export function cookieSummary(raw: string) {
  try {
    const list = parseCookies(raw);
    return { count: list.length, hasSession: list.some((c) => c.name === 'sessionid') };
  } catch (e) {
    return { count: 0, hasSession: false, error: (e as Error).message };
  }
}

/** File cookie (format CDP) untuk `lightpanda fetch --cookie`. */
export function writeCookieFile(a: ThreadsAccount): string | null {
  const list = parseCookies(a.cookies);
  if (!list.length) return null;
  const p = path.join(COOKIE_DIR, `account-${a.id}.json`);
  fs.writeFileSync(p, JSON.stringify(list, null, 2), { mode: 0o600 });
  return p;
}

// ---------- browser ----------
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address() as net.AddressInfo; srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function startLightpandaServer(): Promise<{ child: ChildProcess; endpoint: string }> {
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

type Session = { context: BrowserContext; close: () => Promise<void>; page?: Page };

async function openBrowser(engine: string): Promise<Session> {
  if (engine === 'lightpanda') {
    const lp = await startLightpandaServer();
    try {
      const browser = await chromium.connectOverCDP(lp.endpoint);
      const context = await browser.newContext();
      return { context, close: async () => { await browser.close().catch(() => {}); lp.child.kill('SIGKILL'); } };
    } catch (e) {
      lp.child.kill('SIGKILL');
      throw e;
    }
  }
  const browser = await chromium.launch({
    headless: true, executablePath: CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ userAgent: UA, locale: 'id-ID', viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
    return { context, close: async () => { await browser.close().catch(() => {}); } };
  } catch (e) {
    await browser.close().catch(() => {});
    throw e;
  }
}

async function saveContextCookies(a: ThreadsAccount, context: BrowserContext): Promise<boolean> {
  try {
    const fresh = (await context.cookies('https://www.threads.com')).filter((c) => c.value);
    if (fresh.some((c) => c.name === 'sessionid')) {
      await updateAccount(a.id, { cookies: JSON.stringify(fresh) });
      return true;
    }
  } catch { /* abaikan */ }
  return false;
}

async function screenshot(page: Page, tag: string): Promise<string | null> {
  try {
    const file = path.join(SCREENSHOT_DIR, `${Date.now()}-${tag.replace(/[^\w-]/g, '')}.png`);
    await page.screenshot({ path: file });
    return path.basename(file);
  } catch { return null; }
}

/** Halaman yang sudah login tidak punya tautan /login sama sekali (meski tersembunyi). */
async function isLoggedOut(page: Page): Promise<boolean> {
  try { return (await page.locator('a[href^="/login"], a[href*="/accounts/login"], a[href*="threads.com/login"]').count()) > 0; } catch { return false; }
}

/** Sesi tidak valid → boleh dicoba login ulang otomatis. */
class SessionError extends Error {}

async function withBrowser<T>(a: ThreadsAccount, fn: (page: Page) => Promise<T>): Promise<T> {
  const cookies = parseCookies(a.cookies);
  if (!cookies.some((c) => c.name === 'sessionid')) throw new SessionError('Belum ada sesi login (cookie "sessionid" kosong).');
  const s = await openBrowser(a.browserEngine);
  try {
    await s.context.addCookies(cookies);
    const page = await s.context.newPage();
    page.setDefaultTimeout(20_000);
    const out = await fn(page);
    await saveContextCookies(a, s.context); // simpan cookie terbaru supaya sesi tetap segar
    return out;
  } finally {
    await s.close();
  }
}

async function clickFirstWorking(locators: Locator[], fallback: () => Promise<void>) {
  for (const loc of locators) {
    try {
      if (!(await loc.count())) continue;
      await loc.click({ timeout: 5000 });
      return;
    } catch { /* coba berikutnya */ }
  }
  await fallback();
}

// ---------- login otomatis dengan username + password ----------
const LOGIN_URL = 'https://www.threads.com/login?show_choice_screen=false';
const AUTO_LOGIN_COOLDOWN_MS = 30 * 60_000;
type Pending = Session & { timer: NodeJS.Timeout };
const g = globalThis as unknown as { __comelPending2fa?: Map<number, Pending> };
const pending2fa = (g.__comelPending2fa ??= new Map());

export function canAutoLogin(a: ThreadsAccount) {
  const last = a.lastLoginAttempt?.getTime() ?? 0;
  return Boolean(a.autoLogin && a.loginUsername && a.loginPasswordEnc && !a.loginPaused && Date.now() - last > AUTO_LOGIN_COOLDOWN_MS);
}

function waitLoginResponse(page: Page, pattern: RegExp, timeoutMs = 30_000) {
  return page.waitForResponse((r) => r.request().method() === 'POST' && pattern.test(r.url()), { timeout: timeoutMs })
    .then(async (r) => {
      const text = await r.text().catch(() => '');
      try { return JSON.parse(text.replace(/^for \(;;\);/, '')); } catch { return { raw: text.slice(0, 300), httpStatus: r.status() }; }
    })
    .catch(() => null);
}

async function failLogin(a: ThreadsAccount, message: string, { pause = true } = {}) {
  await updateAccount(a.id, { statusNote: `ERROR login: ${message}`.slice(0, 250), loginPaused: pause });
  await log('error', `akun:${a.name}`, `Login gagal: ${message}`);
  return new Error(`Login gagal: ${message}`);
}

async function finishSuccess(a: ThreadsAccount, s: Session) {
  await sleep(4000);
  if (!(await saveContextCookies(a, s.context))) throw await failLogin(a, 'login diterima tetapi cookie sesi tidak didapat');
  await updateAccount(a.id, { statusNote: `Login OK (${a.loginEngine})`, loginPaused: false });
  await log('info', `akun:${a.name}`, `Login berhasil sebagai ${a.loginUsername}`);
  return { ok: true as const, loggedIn: true as const };
}

const CODE_INPUT = 'input[autocomplete="one-time-code"], input[name="verificationCode"], input[name*="code" i], input[inputmode="numeric"], input[type="tel"], input[maxlength="6"], input[maxlength="8"]';

async function submit2faCode(a: ThreadsAccount, s: Session, code: string) {
  const page = s.page!;
  let input = page.locator(CODE_INPUT).first();
  try { await input.waitFor({ state: 'visible', timeout: 20_000 }); } catch {
    input = page.locator('input[type="text"]:visible, input:not([type]):visible').first();
  }
  await input.fill(String(code).replace(/\s/g, ''));
  const resp = waitLoginResponse(page, /two_factor|login\/ajax/i);
  await clickFirstWorking([
    page.getByRole('button', { name: /^(Confirm|Konfirmasi|Submit|Kirim|Verify|Verifikasi|Next|Berikutnya|Lanjut)$/i }).first(),
    page.locator('input[type="submit"], button[type="submit"]').first(),
  ], () => input.press('Enter'));
  const j = await resp;
  if (j?.authenticated) return finishSuccess(a, s);
  if (!j && (await saveContextCookies(a, s.context))) return finishSuccess(a, s);
  throw await failLogin(a, j?.message || (j ? 'kode 2FA ditolak' : 'tidak ada respons setelah memasukkan kode 2FA'));
}

function closePending(accountId: number) {
  const p = pending2fa.get(accountId);
  if (!p) return;
  clearTimeout(p.timer);
  pending2fa.delete(accountId);
  p.close().catch(() => {});
}

export type LoginResult = { ok: true; loggedIn: true } | { ok: false; needs2fa: true; message: string };

/**
 * Login ke threads.com dengan username + password tersimpan.
 * Bila 2FA diminta tanpa kunci TOTP / kode, browser dibiarkan terbuka 5 menit → { needs2fa: true }.
 */
export async function loginWithPassword(a: ThreadsAccount, opts: { code?: string } = {}): Promise<LoginResult> {
  if (!a.loginUsername || !a.loginPasswordEnc) throw new Error('Username/password login belum diisi');
  const password = decrypt(a.loginPasswordEnc);
  const totpSecret = a.totpSecretEnc ? decrypt(a.totpSecretEnc) : '';
  await updateAccount(a.id, { lastLoginAttempt: new Date() });
  closePending(a.id);

  const s = await openBrowser(a.loginEngine || 'lightpanda');
  let keepOpen = false;
  try {
    const page = await s.context.newPage();
    s.page = page;
    page.setDefaultTimeout(30_000);
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const pass = page.locator('input[type="password"]').first();
    await pass.waitFor({ state: 'visible', timeout: 30_000 });
    const user = page.locator('input[autocomplete="username"], input[name="username"], input[type="text"]').first();
    await user.click();
    await user.fill(a.loginUsername);
    await sleep(jitter(400, 900));
    await pass.click();
    await pass.fill(password);
    await sleep(jitter(500, 1100));

    const resp = waitLoginResponse(page, /accounts\/login\/ajax/i);
    await clickFirstWorking([
      page.locator('input[type="submit"], button[type="submit"]').first(),
      page.getByRole('button', { name: /^(Log in|Masuk|Login)$/i }).first(),
    ], () => pass.press('Enter'));
    const j = await resp;

    if (!j) {
      const shot = a.loginEngine === 'chromium' ? await screenshot(page, 'login-noresp') : null;
      throw await failLogin(a, `tidak ada respons dari server login${shot ? ` (screenshot: ${shot})` : ''}`, { pause: false });
    }
    if (j.authenticated) return await finishSuccess(a, s);
    if (j.two_factor_required) {
      const code = opts.code || (totpSecret ? totp(totpSecret) : '');
      if (code) return await submit2faCode(a, s, code);
      keepOpen = true;
      const timer = setTimeout(() => closePending(a.id), 5 * 60_000);
      pending2fa.set(a.id, { ...s, timer });
      await updateAccount(a.id, { statusNote: 'Menunggu kode 2FA (5 menit)' });
      return { ok: false, needs2fa: true, message: 'Threads meminta kode 2FA. Masukkan kode dari SMS / aplikasi authenticator.' };
    }
    if (j.checkpoint_url || /checkpoint/i.test(j.message || '')) {
      throw await failLogin(a, 'Meta meminta verifikasi keamanan (checkpoint). Buka Threads/Instagram di HP, konfirmasi "Ini saya", lalu klik "Login sekarang" lagi.');
    }
    if (j.user === false) throw await failLogin(a, 'username tidak ditemukan');
    if (j.user === true && j.authenticated === false) throw await failLogin(a, 'password salah');
    throw await failLogin(a, j.message || j.raw || JSON.stringify(j).slice(0, 200));
  } finally {
    if (!keepOpen) await s.close();
  }
}

export async function submitPending2fa(a: ThreadsAccount, code: string) {
  const p = pending2fa.get(a.id);
  if (!p) throw new Error('Tidak ada login yang menunggu kode 2FA (mungkin sudah lewat 5 menit). Klik "Login sekarang" lagi.');
  clearTimeout(p.timer);
  pending2fa.delete(a.id);
  try { return await submit2faCode(a, p, code); } finally { await p.close(); }
}

/** Jalankan fn dengan sesi login; bila sesi habis dan password tersimpan → login otomatis sekali lalu ulangi. */
async function withSession<T>(a: ThreadsAccount, fn: (page: Page) => Promise<T>, { manual = false } = {}): Promise<T> {
  try {
    return await withBrowser(a, fn);
  } catch (e) {
    if (!(e instanceof SessionError)) throw e;
    const hasCreds = Boolean(a.loginUsername && a.loginPasswordEnc);
    // setelah gagal (password salah/checkpoint) hanya tombol "Login sekarang" yang boleh mencoba lagi
    const allowed = manual ? hasCreds && !a.loginPaused : canAutoLogin(a);
    if (!allowed) {
      const hint = hasCreds
        ? (a.loginPaused ? ' Login otomatis dijeda setelah gagal — klik "Login sekarang".' : ' Login otomatis baru bisa dicoba lagi 30 menit setelah percobaan terakhir.')
        : ' Isi username & password login atau tempel cookie baru.';
      throw new Error(`${e.message}${hint}`);
    }
    await log('info', `akun:${a.name}`, `${e.message} Mencoba login otomatis…`);
    const r = await loginWithPassword(a);
    if (!r.ok) throw new Error('Sesi kedaluwarsa dan login butuh kode 2FA. Buka menu Akun → "Login sekarang".');
    return withBrowser((await getAccount(a.id))!, fn);
  }
}

export async function verify(a: ThreadsAccount) {
  return withSession(a, async (page) => {
    await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(4000);
    if (await isLoggedOut(page)) throw new SessionError('Sesi login tidak valid / sudah kedaluwarsa.');
    await updateAccount(a.id, { statusNote: `Sesi OK (${a.browserEngine})` });
    return { ok: true, username: a.username };
  }, { manual: true });
}

const REPLY_LABELS = ['Reply', 'Balas', 'Comment', 'Komentari', 'Komentar', 'Responder'];
const POST_LABELS = /^(Post|Posting|Kirim|Publikasikan|Bagikan|Reply|Balas)$/i;

export async function reply(a: ThreadsAccount, target: ReplyTarget, text: string): Promise<ReplyResult> {
  if (!target.url) throw new Error('URL postingan tujuan tidak diketahui');
  const tag = target.code || 'x';
  return withSession(a, async (page) => {
    await page.goto(target.url!, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(jitter(3500, 6000));
    if (await isLoggedOut(page)) throw new SessionError('Sesi login tidak valid / kedaluwarsa.');
    if (target.code && !page.url().includes(target.code)) {
      throw new Error(`Halaman postingan tidak terbuka (dialihkan ke ${page.url()}) — postingan dihapus/privat atau sesi tidak valid`);
    }

    // tombol balas postingan utama; label ikon ada di <svg><title>Comment</title></svg> (kadang aria-label)
    const labelRe = new RegExp(`^(${REPLY_LABELS.join('|')})$`, 'i');
    const byTitle = page.locator('[role="button"]').filter({ has: page.locator('svg > title', { hasText: labelRe }) });
    const byAria = page.locator(REPLY_LABELS.map((l) => `svg[aria-label="${l}"]`).join(', '));
    const icon = byTitle.or(byAria).first();
    try { await icon.waitFor({ state: 'visible', timeout: 20_000 }); } catch {
      const shot = await screenshot(page, `noreplybtn-${tag}`);
      throw new Error(`Tombol balas tidak ditemukan${shot ? ` (screenshot: ${shot})` : ''}`);
    }
    await icon.click();
    await sleep(jitter(1200, 2200));

    const dialog = page.locator('[role="dialog"]').last();
    let box = dialog.locator('[contenteditable="true"]').first();
    if (!(await box.count())) box = page.locator('[contenteditable="true"][role="textbox"], [contenteditable="true"]').first();
    try { await box.waitFor({ state: 'visible', timeout: 15_000 }); } catch {
      const shot = await screenshot(page, `nocomposer-${tag}`);
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
      const shot = await screenshot(page, `nopostbtn-${tag}`);
      throw new Error(`Tombol "Post" tidak ditemukan${shot ? ` (screenshot: ${shot})` : ''}`);
    }
    try {
      if (await dialog.count()) await dialog.waitFor({ state: 'detached', timeout: 25_000 });
      else await sleep(6000);
    } catch {
      const shot = await screenshot(page, `notsent-${tag}`);
      throw new Error(`Tidak ada konfirmasi terkirim (dialog masih terbuka)${shot ? ` (screenshot: ${shot})` : ''}`);
    }
    await sleep(jitter(1500, 3000));
    return { resultId: null };
  });
}

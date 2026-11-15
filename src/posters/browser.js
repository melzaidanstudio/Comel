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
import { update } from '../db.js';

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

async function withBrowser(account, fn) {
  const cookies = parseCookies(account.cookies);
  if (!cookies.some((c) => c.name === 'sessionid')) {
    throw new Error('Cookie "sessionid" tidak ada. Ekspor ulang cookie dari threads.com saat sudah login.');
  }
  let browser; let lp; let context;
  try {
    if (account.browser_engine === 'lightpanda') {
      lp = await startLightpandaServer();
      browser = await chromium.connectOverCDP(lp.endpoint);
      context = await browser.newContext();
    } else {
      browser = await chromium.launch({
        headless: true,
        executablePath: CHROMIUM_PATH || undefined,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      context = await browser.newContext({ userAgent: UA, locale: 'id-ID', viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Jakarta' });
    }
    await context.addCookies(cookies);
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const result = await fn(page);
    // simpan cookie terbaru supaya sesi tetap segar
    try {
      const fresh = (await context.cookies('https://www.threads.com')).filter((c) => c.value);
      if (fresh.some((c) => c.name === 'sessionid')) update('accounts', account.id, { cookies: JSON.stringify(fresh) });
    } catch { /* abaikan */ }
    return result;
  } finally {
    try { await browser?.close(); } catch { /* abaikan */ }
    lp?.child.kill('SIGKILL');
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
  return withBrowser(account, async (page) => {
    await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(4000);
    if (await isLoggedOut(page)) throw new Error('Cookie tidak valid / sudah kedaluwarsa (halaman meminta login)');
    update('accounts', account.id, { status_note: `Cookie OK (${account.browser_engine})` });
    return { ok: true };
  });
}

const REPLY_LABELS = ['Reply', 'Balas', 'Comment', 'Komentari', 'Komentar', 'Responder'];
const POST_LABELS = /^(Post|Posting|Kirim|Publikasikan|Bagikan|Reply|Balas)$/i;

/** Balas sebuah postingan / komentar berdasarkan URL-nya. */
export async function reply(account, target, text) {
  if (!target.url) throw new Error('URL postingan tujuan tidak diketahui');
  return withBrowser(account, async (page) => {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await sleep(jitter(3500, 6000));
    if (await isLoggedOut(page)) throw new Error('Cookie tidak valid / kedaluwarsa (diminta login)');
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

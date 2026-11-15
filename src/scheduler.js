import { db, getSettings, update, log, list } from './db.js';
import { runTrigger, runReplyJob } from './engine.js';
import { api as apiPoster } from './posters/index.js';

const TICK_MS = 20_000;
const nowSec = () => Math.floor(Date.now() / 1000);

function localMinutes(timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}

/** "07:00-12:00, 18:00-23:00" — mendukung rentang lewat tengah malam (22:00-02:00). Kosong = 24 jam. */
export function withinActiveHours(spec, timezone, minutes = localMinutes(timezone)) {
  const s = String(spec || '').trim();
  if (!s) return true;
  const toMin = (t) => { const [h, m = '0'] = t.trim().split(/[:.]/); return Number(h) * 60 + Number(m); };
  return s.split(',').some((range) => {
    const [a, b] = range.split('-');
    if (!a || !b) return true;
    const start = toMin(a); const end = toMin(b);
    if (Number.isNaN(start) || Number.isNaN(end)) return true;
    return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  });
}

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const settings = getSettings();
    const now = nowSec();

    // trigger komentar
    const due = db.prepare('SELECT * FROM triggers WHERE enabled = 1 AND next_run_at <= ?').all(now);
    for (const t of due) {
      const interval = Math.max(1, Number(t.interval_minutes) || 15) * 60;
      update('triggers', t.id, { next_run_at: now + interval });
      if (settings.paused) continue;
      if (!withinActiveHours(t.active_hours, settings.timezone)) {
        update('triggers', t.id, { last_status: `di luar jam aktif (${t.active_hours})` });
        continue;
      }
      runTrigger(t.id).catch((e) => {
        log('error', `trigger:${t.name}`, e.message);
        update('triggers', t.id, { last_run_at: nowSec(), last_status: `ERROR: ${e.message.slice(0, 200)}` });
      });
    }

    // balas komentar otomatis
    const accounts = db.prepare('SELECT * FROM accounts WHERE enabled = 1 AND reply_enabled = 1 AND next_reply_at <= ?').all(now);
    for (const a of accounts) {
      update('accounts', a.id, { next_reply_at: now + Math.max(5, Number(a.reply_interval_minutes) || 30) * 60 });
      if (settings.paused) continue;
      runReplyJob(a.id).catch((e) => {
        log('error', `balas:${a.name}`, e.message);
        update('accounts', a.id, { last_reply_status: `ERROR: ${e.message.slice(0, 200)}` });
      });
    }
  } catch (e) {
    log('error', 'scheduler', e.message);
  } finally {
    ticking = false;
  }
}

async function refreshTokens() {
  for (const a of list('accounts')) {
    if (a.method === 'api' && a.enabled && a.access_token) await apiPoster.maybeRefreshToken(a);
  }
}

export function startScheduler() {
  setInterval(tick, TICK_MS);
  setTimeout(tick, 3000);
  setInterval(() => refreshTokens().catch((e) => log('error', 'scheduler', e.message)), 6 * 3600 * 1000);
  setTimeout(() => refreshTokens().catch(() => {}), 10_000);
  log('info', 'scheduler', 'Penjadwal berjalan');
}

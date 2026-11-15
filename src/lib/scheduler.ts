import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from './db';
import { threadsAccounts, triggers } from './db/schema';
import { updateAccount } from './accounts';
import { runReplyJob, runTrigger } from './engine';
import { resolveActiveHours, withinActiveHours } from './hours';
import { log } from './logger';
import { api as apiPoster } from './posters';
import { getSettings } from './settings';

const TICK_MS = 20_000;
let ticking = false;

/** Klaim pekerjaan yang jatuh tempo secara atomik (aman walau ada lebih dari satu worker). */
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const settings = await getSettings();

    const due = await db.update(triggers)
      .set({ nextRunAt: sql`now() + (greatest(${triggers.intervalMinutes}, 1) * interval '1 minute')` })
      .where(and(eq(triggers.enabled, true), or(isNull(triggers.nextRunAt), lte(triggers.nextRunAt, sql`now()`))))
      .returning();
    for (const t of due) {
      if (settings.paused) continue;
      const hours = resolveActiveHours(t.activeHours, settings);
      if (!withinActiveHours(hours, settings.timezone)) {
        await db.update(triggers).set({ lastStatus: `di luar jam aktif (${hours})` }).where(eq(triggers.id, t.id));
        continue;
      }
      runTrigger(t.id).catch(async (e) => {
        await log('error', `trigger:${t.name}`, e.message);
        await db.update(triggers).set({ lastRunAt: new Date(), lastStatus: `ERROR: ${String(e.message).slice(0, 200)}` }).where(eq(triggers.id, t.id));
      });
    }

    const dueAcc = await db.update(threadsAccounts)
      .set({ nextReplyAt: sql`now() + (greatest(${threadsAccounts.replyIntervalMinutes}, 5) * interval '1 minute')` })
      .where(and(eq(threadsAccounts.enabled, true), eq(threadsAccounts.replyEnabled, true),
        or(isNull(threadsAccounts.nextReplyAt), lte(threadsAccounts.nextReplyAt, sql`now()`))))
      .returning();
    for (const a of dueAcc) {
      if (settings.paused) continue;
      const hours = resolveActiveHours(a.replyActiveHours, settings);
      if (!withinActiveHours(hours, settings.timezone)) {
        await updateAccount(a.id, { lastReplyStatus: `di luar jam aktif (${hours})` });
        continue;
      }
      runReplyJob(a.id).catch(async (e) => {
        await log('error', `balas:${a.name}`, e.message);
        await updateAccount(a.id, { lastReplyStatus: `ERROR: ${String(e.message).slice(0, 200)}` });
      });
    }
  } catch (e) {
    await log('error', 'scheduler', (e as Error).message);
  } finally {
    ticking = false;
  }
}

async function refreshTokens() {
  const rows = await db.select().from(threadsAccounts).where(and(eq(threadsAccounts.method, 'api'), eq(threadsAccounts.enabled, true)));
  for (const a of rows) if (a.accessToken) await apiPoster.maybeRefreshToken(a);
}

export function startScheduler() {
  setInterval(tick, TICK_MS);
  setTimeout(tick, 3000);
  setInterval(() => { refreshTokens().catch((e) => log('error', 'scheduler', e.message)); }, 6 * 3600_000);
  setTimeout(() => { refreshTokens().catch(() => {}); }, 10_000);
  void log('info', 'scheduler', 'Penjadwal berjalan');
}

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { threadsAccounts } from '@/lib/db/schema';
import { nudgeReplies } from '@/lib/engine';
import { log } from '@/lib/logger';
import { ensureWebhookToken } from '@/lib/repliz';

/** Peringatan "tidak dibalas" cukup sekali per akun per jam, supaya Log sistem tidak penuh. */
const warnedAt = new Map<string, number>();

type ReplizEvent = { platform?: string; type?: string; accountId?: string; data?: Record<string, unknown> };

function sameToken(a: string, b: string) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Webhook Repliz (publik, diverifikasi dengan header x-token).
 * Event `comment` di akun Threads → jadwalkan balas komentar akun itu sekarang.
 * Jawab 2xx secepatnya; pekerjaan berat dilakukan worker.
 */
export async function POST(req: Request) {
  const token = req.headers.get('x-token') || '';
  if (!sameToken(token, await ensureWebhookToken())) return Response.json({ error: 'token salah' }, { status: 401 });

  let ev: ReplizEvent;
  try { ev = await req.json(); } catch { return Response.json({ error: 'body bukan JSON' }, { status: 400 }); }

  if (ev.type === 'testing') return Response.json({ ok: true });
  if (ev.type === 'comment' && ev.platform === 'threads' && ev.accountId) {
    const n = await nudgeReplies(ev.accountId);
    const text = String((ev.data?.comment as { text?: string } | undefined)?.text || '').slice(0, 80);
    if (n) {
      await log('info', 'webhook', `Komentar baru di Threads (${ev.accountId}), balas komentar dijadwalkan: ${text}`);
    } else if (Date.now() - (warnedAt.get(ev.accountId) || 0) > 3600_000) {
      warnedAt.set(ev.accountId, Date.now());
      // jelaskan kenapa tidak dibalas, supaya tidak membingungkan di Log sistem
      const [a] = await db.select({ name: threadsAccounts.name, username: threadsAccounts.username })
        .from(threadsAccounts).where(eq(threadsAccounts.replizAccountId, ev.accountId)).limit(1);
      const why = a
        ? `"Balas komentar otomatis" belum aktif di akun ${a.name}${a.username ? ` (@${a.username})` : ''} — nyalakan di menu Akun Threads → Edit`
        : 'akun Repliz ini belum ditambahkan di Comel — tambahkan lewat Akun Threads → Tambah dari Repliz';
      await log('warn', 'webhook', `Komentar baru di Threads (${ev.accountId}) tidak dibalas: ${why}. Isi: ${text} (peringatan ini muncul maks. sekali per jam per akun)`);
    }
  } else if (ev.type === 'keyword_match') {
    await log('info', 'webhook', `Keyword Watch menemukan postingan (${ev.accountId})`);
  }
  return Response.json({ ok: true });
}

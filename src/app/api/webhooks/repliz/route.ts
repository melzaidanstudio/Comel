import crypto from 'node:crypto';
import { nudgeReplies } from '@/lib/engine';
import { log } from '@/lib/logger';
import { ensureWebhookToken } from '@/lib/repliz';

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
    await log('info', 'webhook', `Komentar baru di Threads (${ev.accountId})${n ? ', balas komentar dijadwalkan' : ''}: ${text}`);
  } else if (ev.type === 'keyword_match') {
    await log('info', 'webhook', `Keyword Watch menemukan postingan (${ev.accountId})`);
  }
  return Response.json({ ok: true });
}

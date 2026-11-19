import { ZodError } from 'zod';
import { bearerFrom, verifyApiToken } from './api-tokens';
import { auth } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const notFound = (what = 'Data') => new HttpError(404, `${what} tidak ditemukan`);

type Ctx = { params: Promise<Record<string, string>> };

/** Origin yang boleh mengubah data: alamat dashboard (BETTER_AUTH_URL) + BETTER_AUTH_TRUSTED_ORIGINS. */
function allowedOrigins(req: Request): Set<string> {
  const out = new Set<string>();
  const add = (u?: string) => { try { if (u) out.add(new URL(u).origin); } catch { /* abaikan */ } };
  add(process.env.BETTER_AUTH_URL);
  for (const u of (process.env.BETTER_AUTH_TRUSTED_ORIGINS || '').split(',')) add(u.trim());
  if (!out.size) { // pengembangan lokal tanpa BETTER_AUTH_URL
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (host) { add(`http://${host}`); add(`https://${host}`); }
  }
  return out;
}

/** Tolak permintaan pengubah data dari situs lain (CSRF), termasuk subdomain lain di domain yang sama. */
function crossSite(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return false;
  const origin = req.headers.get('origin');
  if (!origin) return false; // bukan browser (curl/server) — tetap butuh cookie sesi
  return !allowedOrigins(req).has(origin);
}

/**
 * Bungkus route handler: wajib login (sesi better-auth, atau token API `Authorization: Bearer comel_…`),
 * ubah hasil jadi JSON, dan ubah error jadi { error } dengan status yang sesuai.
 * `sessionOnly`: hanya sesi login di browser (dipakai untuk mengelola token API itu sendiri).
 */
export function route<C = Ctx>(
  fn: (req: Request, ctx: C) => Promise<unknown> | unknown,
  opts: { sessionOnly?: boolean } = {},
) {
  return async (req: Request, ctx: C) => {
    try {
      const bearer = bearerFrom(req.headers);
      if (bearer) {
        // token API: tanpa cookie, jadi pemeriksaan Origin (CSRF) tidak diperlukan
        if (opts.sessionOnly) return Response.json({ error: 'Hanya bisa dari dashboard (login), bukan dengan token API' }, { status: 403 });
        if (!await verifyApiToken(bearer)) return Response.json({ error: 'Token API tidak valid atau sudah dicabut' }, { status: 401 });
      } else {
        if (crossSite(req)) return Response.json({ error: 'Origin tidak diizinkan' }, { status: 403 });
        const s = await auth.api.getSession({ headers: req.headers });
        if (!s) return Response.json({ error: 'Belum login' }, { status: 401 });
      }
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ZodError) {
        const first = e.issues[0];
        return Response.json({ error: `Input tidak valid: ${first?.path.join('.') || ''} ${first?.message || ''}`.trim() }, { status: 400 });
      }
      const status = e instanceof HttpError ? e.status : 400;
      const message = e instanceof Error ? e.message : String(e);
      // error tak terduga juga dicatat di log server supaya bisa dilacak
      if (!(e instanceof HttpError)) console.error(`[api] ${req.method} ${new URL(req.url).pathname}:`, e);
      return Response.json({ error: message }, { status });
    }
  };
}

export async function idOf(ctx: Ctx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'ID tidak valid');
  return n;
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

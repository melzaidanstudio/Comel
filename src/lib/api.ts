import { ZodError } from 'zod';
import { auth } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const notFound = (what = 'Data') => new HttpError(404, `${what} tidak ditemukan`);

type Ctx = { params: Promise<Record<string, string>> };

/**
 * Bungkus route handler: wajib login (better-auth), ubah hasil jadi JSON,
 * dan ubah error jadi { error } dengan status yang sesuai.
 */
export function route<C = Ctx>(
  fn: (req: Request, ctx: C) => Promise<unknown> | unknown,
) {
  return async (req: Request, ctx: C) => {
    try {
      const s = await auth.api.getSession({ headers: req.headers });
      if (!s) return Response.json({ error: 'Belum login' }, { status: 401 });
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

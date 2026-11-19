import { z } from 'zod';
import { body, route } from '@/lib/api';
import { createApiToken, listApiTokens } from '@/lib/api-tokens';
import { log } from '@/lib/logger';

const schema = z.object({ name: z.string().trim().min(1, 'isi nama token').max(60) });

/** Token akses API — hanya bisa dikelola dari dashboard (sesi login), tidak dengan token API. */
export const GET = route(() => listApiTokens(), { sessionOnly: true });

export const POST = route(async (req) => {
  const { name } = schema.parse(await body(req));
  const { token, row } = await createApiToken(name);
  await log('info', 'token', `Token API "${name}" dibuat (${row.prefix}…)`);
  return { ...row, token }; // token lengkap hanya dikirim sekali, di sini
}, { sessionOnly: true });

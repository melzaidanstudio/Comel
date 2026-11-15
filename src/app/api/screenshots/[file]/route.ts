import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError, route } from '@/lib/api';
import { SCREENSHOT_DIR } from '@/lib/config';

export const GET = route(async (_req, ctx: { params: Promise<{ file: string }> }) => {
  const file = path.basename((await ctx.params).file);
  try {
    const data = await fs.readFile(path.join(SCREENSHOT_DIR, file));
    return new Response(data, { headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600' } });
  } catch {
    throw new HttpError(404, 'Screenshot tidak ditemukan');
  }
});

import { idOf, notFound, route } from '@/lib/api';
import { deleteApiToken } from '@/lib/api-tokens';
import { log } from '@/lib/logger';

export const DELETE = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const id = await idOf(ctx);
  if (!await deleteApiToken(id)) throw notFound('Token');
  await log('info', 'token', `Token API #${id} dicabut`);
}, { sessionOnly: true });

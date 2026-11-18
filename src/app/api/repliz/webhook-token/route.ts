import { HttpError, route } from '@/lib/api';
import { ensureWebhookToken } from '@/lib/repliz';

/** Buat token webhook baru (token lama langsung tidak berlaku). */
export const POST = route(async () => {
  if (process.env.REPLIZ_WEBHOOK_TOKEN) throw new HttpError(400, 'Token webhook diatur lewat REPLIZ_WEBHOOK_TOKEN di .env server.');
  return { webhookToken: await ensureWebhookToken(true) };
});

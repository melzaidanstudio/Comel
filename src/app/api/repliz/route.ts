import { body, HttpError, route } from '@/lib/api';
import { ensureWebhookToken, getReplizConnection, missingKeysMessage, saveReplizKeys } from '@/lib/repliz';
import { replizKeysSchema } from '@/lib/validators';

const mask = (s: string) => (s ? `${s.slice(0, 4)}••••${s.slice(-4)}` : '');

/** Status koneksi Repliz (tanpa membuka Secret Key). */
export const GET = route(async () => {
  const c = await getReplizConnection();
  return {
    source: c.source,
    hasKeys: c.source !== 'none',
    accessKeyMasked: mask(c.accessKey),
    webhookToken: await ensureWebhookToken(),
    webhookTokenFromEnv: Boolean(process.env.REPLIZ_WEBHOOK_TOKEN),
    webhookPath: '/api/webhooks/repliz',
  };
}, { sessionOnly: true }); // berisi token webhook → hanya dari dashboard

export const PUT = route(async (req) => {
  if ((await getReplizConnection()).source === 'env') {
    throw new HttpError(400, 'Kunci Repliz diatur lewat environment (REPLIZ_ACCESS_KEY / REPLIZ_SECRET_KEY); ubah di file .env server.');
  }
  const input = replizKeysSchema.parse(await body(req));
  await saveReplizKeys(input);
  if (!input.clear) {
    const c = await getReplizConnection();
    if (c.source === 'none') throw new HttpError(400, missingKeysMessage(c));
  }
}, { sessionOnly: true }); // kunci Repliz hanya bisa diganti dari dashboard

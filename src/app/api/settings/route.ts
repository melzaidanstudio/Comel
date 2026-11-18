import { body, route } from '@/lib/api';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '@/lib/settings';
import { settingsSchema } from '@/lib/validators';

/** ?defaults=1 → nilai yang disarankan (untuk tombol "Default"), tanpa menyimpan apa pun. */
export const GET = route((req) => (new URL(req.url).searchParams.get('defaults') ? DEFAULT_SETTINGS : getSettings()));
export const PUT = route(async (req) => saveSettings(settingsSchema.parse(await body(req))));

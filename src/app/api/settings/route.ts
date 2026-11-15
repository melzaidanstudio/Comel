import { body, route } from '@/lib/api';
import { getSettings, saveSettings } from '@/lib/settings';
import { settingsSchema } from '@/lib/validators';

export const GET = route(() => getSettings());
export const PUT = route(async (req) => saveSettings(settingsSchema.parse(await body(req))));

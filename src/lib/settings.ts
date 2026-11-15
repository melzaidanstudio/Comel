import { db } from './db';
import { settings } from './db/schema';
import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: 'Asia/Jakarta',
  activeStart: '06:00', // jam aktif default
  activeEnd: '22:00',
  paused: false, // tombol darurat
  delayMinSeconds: 25, // jeda antar komentar dalam satu putaran
  delayMaxSeconds: 70,
  maxChars: 280, // Threads maks 500
  skipSensitive: true,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out as AppSettings;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS) || v === undefined) continue;
    await db.insert(settings).values({ key: k, value: v })
      .onConflictDoUpdate({ target: settings.key, set: { value: v } });
  }
  return getSettings();
}

import { db } from './db';
import { settings } from './db/schema';
import type { AppSettings } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  timezone: 'Asia/Jakarta',
  activeStart: '06:00', // jam aktif default
  activeEnd: '22:00',
  paused: false, // tombol darurat
  delayMinSeconds: 180, // jeda antar komentar 3–10 menit (sama dengan pacing Repliz)
  delayMaxSeconds: 600,
  metricLookupMax: 12, // maks postingan yang dicek metrik viralnya via Lightpanda per putaran
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

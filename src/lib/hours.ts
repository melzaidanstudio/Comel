import type { AppSettings } from './types';

/** true bila nama zona waktu IANA valid (mis. Asia/Jakarta). "WIB" tidak valid. */
export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch { return false; }
}

function localMinutes(timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone && isValidTimezone(timezone) ? timezone : 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')!.value);
  const m = Number(parts.find((p) => p.type === 'minute')!.value);
  return h * 60 + m;
}

/**
 * ''/'default' → jam aktif default di Pengaturan; '24h' → selalu; selain itu rentang kustom.
 * Return '' berarti 24 jam.
 */
export function resolveActiveHours(spec: string | null | undefined, s: Pick<AppSettings, 'activeStart' | 'activeEnd'>): string {
  const v = String(spec || '').trim();
  if (!v || v === 'default') return s.activeStart && s.activeEnd && s.activeStart !== s.activeEnd ? `${s.activeStart}-${s.activeEnd}` : '';
  if (v === '24h') return '';
  return v;
}

/** "07:00-12:00, 18:00-23:00", mendukung lewat tengah malam (22:00-02:00). Kosong = 24 jam. */
export function withinActiveHours(spec: string, timezone: string, minutesOverride?: number): boolean {
  const s = String(spec || '').trim();
  if (!s) return true;
  const minutes = minutesOverride ?? localMinutes(timezone);
  const toMin = (t: string) => { const [h, m = '0'] = t.trim().split(/[:.]/); return Number(h) * 60 + Number(m); };
  return s.split(',').some((range) => {
    const [a, b] = range.split('-');
    if (!a || !b) return true;
    const start = toMin(a); const end = toMin(b);
    if (Number.isNaN(start) || Number.isNaN(end)) return true;
    return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  });
}

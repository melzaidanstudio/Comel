import type { Action, Tag, Trigger } from '@/lib/db/schema';
import type { Json } from '@/lib/client';
import type { PublicAccount, PublicProvider } from '@/lib/public';
import type { AppSettings, EvaluatedPost } from '@/lib/types';

export type TriggerJ = Json<Trigger>;
export type AccountJ = Json<PublicAccount>;
export type ProviderJ = Json<PublicProvider>;
export type TagJ = Json<Tag>;
export type ActionRow = Json<Action> & { accountName: string | null; triggerName: string | null };
export type LogRow = { id: number; ts: string; level: string; source: string; message: string };
export type Stats = { sent24: number; failed24: number; skipped24: number; accounts: number; triggers: number; paused: boolean };
export type Preview = { queries: string[]; posts: EvaluatedPost[]; errors: string[] };
export type { AppSettings, EvaluatedPost };

export function defaultHoursLabel(s?: Pick<AppSettings, 'activeStart' | 'activeEnd'>) {
  if (!s) return '06:00–22:00';
  return s.activeStart && s.activeEnd && s.activeStart !== s.activeEnd ? `${s.activeStart}–${s.activeEnd}` : '24 jam';
}

export function activeHoursLabel(v: string, s?: AppSettings) {
  if (!v || v === 'default') return `${defaultHoursLabel(s)} (default)`;
  if (v === '24h') return '24 jam';
  return v.replace(/-/g, '–');
}

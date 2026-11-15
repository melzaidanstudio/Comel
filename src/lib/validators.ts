import { z } from 'zod';
import { parseExpr } from './filters';

const int = (min = 0, max = 1_000_000) => z.number().int().min(min).max(max);
const hhmm = z.string().regex(/^([01]\d|2[0-4]):[0-5]\d$/, 'format jam HH:MM');
const activeHours = z.string().max(100).refine(
  (v) => v === '' || v === '24h' || /^(\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2})(\s*,\s*\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2})*$/.test(v),
  'format jam aktif: kosong, 24h, atau 06:00-22:00',
);

export const settingsSchema = z.object({
  timezone: z.string().min(1),
  activeStart: hhmm,
  activeEnd: hhmm,
  paused: z.boolean(),
  delayMinSeconds: int(0, 3600),
  delayMaxSeconds: int(0, 3600),
  maxChars: int(20, 500),
  skipSensitive: z.boolean(),
}).partial();

export const providerSchema = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(['openai', 'anthropic']),
  baseUrl: z.string().url('Base URL tidak valid'),
  apiKey: z.string().max(2000).optional(),
  clearApiKey: z.boolean().optional(),
  model: z.string().min(1).max(200),
  temperature: z.number().min(0).max(2),
  maxTokens: int(16, 32000),
  isDefault: z.boolean(),
});

export const accountSchema = z.object({
  name: z.string().min(1).max(100),
  username: z.string().max(100).transform((s) => s.replace(/^@/, '').trim()),
  method: z.enum(['api', 'browser']),
  accessToken: z.string().max(4000).optional(),
  clearAccessToken: z.boolean().optional(),
  cookies: z.string().max(100_000).optional(),
  clearCookies: z.boolean().optional(),
  browserEngine: z.enum(['chromium', 'lightpanda']),
  loginEngine: z.enum(['chromium', 'lightpanda']),
  scrapeWithCookies: z.boolean(),
  loginUsername: z.string().max(200).transform((s) => s.replace(/^@/, '').trim()),
  loginPassword: z.string().max(500).optional(),
  totpSecret: z.string().max(200).optional(),
  clearLoginSecrets: z.boolean().optional(),
  autoLogin: z.boolean(),
  dailyLimit: int(0, 1000),
  providerId: z.number().int().positive().nullable(),
  enabled: z.boolean(),
  replyEnabled: z.boolean(),
  replyIntervalMinutes: int(5, 1440),
  replyPerRun: int(0, 50),
  replyScope: z.enum(['both', 'own_posts', 'my_comments']),
  replyMaxAgeHours: int(1, 24 * 30),
  replyInstruction: z.string().max(5000),
  replyDryRun: z.boolean(),
  replyActiveHours: activeHours,
});

export const triggerSchema = z.object({
  name: z.string().min(1).max(100),
  accountId: z.number().int().positive(),
  enabled: z.boolean(),
  queries: z.array(z.string().max(200)).max(20),
  matchExpr: z.string().max(1000).refine((v) => { try { parseExpr(v); return true; } catch { return false; } }, {
    message: 'ekspresi kata kunci tidak valid (cek tanda kurung/operator)',
  }),
  excludeWords: z.string().max(2000),
  excludeUsers: z.string().max(2000),
  includeReplies: z.boolean(),
  topicTags: z.string().max(2000),
  excludeTags: z.string().max(2000),
  tagMatch: z.enum(['exact', 'contains']),
  tagAsSource: z.boolean(),
  minLikes: int(),
  minReplies: int(),
  minReposts: int(),
  minShares: int(),
  minQuotes: int(),
  metricLogic: z.enum(['all', 'any']),
  maxAgeHours: int(0, 24 * 365),
  minAgeMinutes: int(0, 60 * 24 * 30),
  activeHours,
  sortBy: z.enum(['engagement', 'newest']),
  actionsPerRun: int(0, 50),
  intervalMinutes: int(1, 1440),
  authorCooldownHours: int(0, 24 * 365),
  instruction: z.string().max(5000),
  providerId: z.number().int().positive().nullable(),
  dryRun: z.boolean(),
});

export const personaSchema = z.object({
  soul: z.string().max(50_000).optional(),
  memory: z.string().max(100_000).optional(),
});

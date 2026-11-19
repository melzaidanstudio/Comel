import {
  boolean, index, integer, jsonb, pgTable, real, serial, text, timestamp,
} from 'drizzle-orm/pg-core';

const tz = () => timestamp({ withTimezone: true, mode: 'date' });
const createdAt = () => tz().notNull().defaultNow();

// ============ better-auth ============
export const user = pgTable('user', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const session = pgTable('session', {
  id: text().primaryKey(),
  expiresAt: tz().notNull(),
  token: text().notNull().unique(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text().notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: tz(),
  refreshTokenExpiresAt: tz(),
  scope: text(),
  password: text(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

export const verification = pgTable('verification', {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: tz().notNull(),
  createdAt: createdAt(),
  updatedAt: createdAt(),
});

// ============ aplikasi ============
export const settings = pgTable('settings', {
  key: text().primaryKey(),
  value: jsonb(),
});

/** Token akses API (Authorization: Bearer comel_…) — yang disimpan hanya hash SHA-256-nya. */
export const apiTokens = pgTable('api_tokens', {
  id: serial().primaryKey(),
  name: text().notNull(),
  tokenHash: text().notNull().unique(),
  prefix: text().notNull(), // awal token untuk dikenali di daftar, mis. "comel_Ab12"
  lastUsedAt: tz(),
  createdAt: createdAt(),
});

export const providers = pgTable('providers', {
  id: serial().primaryKey(),
  name: text().notNull(),
  kind: text().notNull().default('openai'), // openai (OpenAI-compatible) | anthropic
  baseUrl: text().notNull(),
  apiKey: text().notNull().default(''),
  model: text().notNull(),
  temperature: real().notNull().default(0.8),
  maxTokens: integer().notNull().default(400),
  isDefault: boolean().notNull().default(false),
  createdAt: createdAt(),
});

export const threadsAccounts = pgTable('threads_accounts', {
  id: serial().primaryKey(),
  name: text().notNull(),
  username: text().notNull().default(''),
  // akun Threads yang terhubung di Repliz (jembatan koneksi)
  replizAccountId: text().notNull().default(''),
  picture: text().notNull().default(''),
  isConnected: boolean().notNull().default(false),
  syncedAt: tz(),
  // umum
  dailyLimit: integer().notNull().default(50),
  hourlyLimit: integer().notNull().default(10),
  providerId: integer().references(() => providers.id, { onDelete: 'set null' }),
  enabled: boolean().notNull().default(true),
  // balas komentar otomatis
  replyEnabled: boolean().notNull().default(false),
  replyIntervalMinutes: integer().notNull().default(30),
  replyPerRun: integer().notNull().default(5),
  replyMaxAgeHours: integer().notNull().default(48),
  replyInstruction: text().notNull().default(''),
  replyDryRun: boolean().notNull().default(false),
  replyActiveHours: text().notNull().default(''), // '' = ikuti default, '24h', 'HH:MM-HH:MM'
  nextReplyAt: tz(),
  lastReplyStatus: text().notNull().default(''),
  statusNote: text().notNull().default(''),
  createdAt: createdAt(),
});

/** soul.md & memory.md — scope 'global' atau 'account:<id>' */
export const personas = pgTable('personas', {
  scope: text().primaryKey(),
  soul: text().notNull().default(''),
  memory: text().notNull().default(''),
  updatedAt: createdAt(),
});

export const triggers = pgTable('triggers', {
  id: serial().primaryKey(),
  name: text().notNull(),
  accountId: integer().notNull().references(() => threadsAccounts.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull().default(true),
  // kata kunci
  queries: jsonb().$type<string[]>().notNull().default([]),
  matchExpr: text().notNull().default(''),
  excludeWords: text().notNull().default(''),
  excludeUsers: text().notNull().default(''),
  includeReplies: boolean().notNull().default(false),
  languages: text().notNull().default(''), // kode ISO 639-1 dipisah koma, mis. "id"; kosong = semua bahasa
  // topic tag
  topicTags: text().notNull().default(''),
  excludeTags: text().notNull().default(''),
  tagMatch: text().notNull().default('exact'), // exact | contains
  tagAsSource: boolean().notNull().default(true),
  // viralitas
  minLikes: integer().notNull().default(0),
  minReplies: integer().notNull().default(0),
  minReposts: integer().notNull().default(0),
  minShares: integer().notNull().default(0),
  minQuotes: integer().notNull().default(0),
  metricLogic: text().notNull().default('all'), // all | any
  // waktu & jadwal
  maxAgeHours: integer().notNull().default(0),
  minAgeMinutes: integer().notNull().default(0),
  activeHours: text().notNull().default(''),
  sortBy: text().notNull().default('engagement'), // engagement | newest
  actionsPerRun: integer().notNull().default(3),
  intervalMinutes: integer().notNull().default(15),
  authorCooldownHours: integer().notNull().default(168), // 7 hari, sama dengan aturan Repliz
  // AI
  instruction: text().notNull().default(''),
  providerId: integer().references(() => providers.id, { onDelete: 'set null' }),
  dryRun: boolean().notNull().default(false),
  // status
  nextRunAt: tz(),
  lastRunAt: tz(),
  lastStatus: text().notNull().default(''),
  createdAt: createdAt(),
});

export type PostMetrics = {
  likes: number; replies: number; reposts: number; shares: number; quotes: number;
  takenAt: number; tag: string | null;
};

export const actions = pgTable('actions', {
  id: serial().primaryKey(),
  accountId: integer().references(() => threadsAccounts.id, { onDelete: 'set null' }),
  triggerId: integer().references(() => triggers.id, { onDelete: 'set null' }),
  kind: text().notNull(), // comment | reply
  targetCode: text(),
  targetId: text(),
  targetUser: text(),
  targetText: text(),
  targetUrl: text(),
  metrics: jsonb().$type<PostMetrics>(),
  replyText: text(),
  status: text().notNull(), // sent | failed | dry_run | skipped
  error: text(),
  resultId: text(),
  createdAt: createdAt(),
}, (t) => [
  index().on(t.accountId, t.targetCode),
  index().on(t.accountId, t.createdAt),
]);

export const logs = pgTable('logs', {
  id: serial().primaryKey(),
  ts: createdAt(),
  level: text().notNull(),
  source: text().notNull(),
  message: text().notNull(),
}, (t) => [index().on(t.ts)]);

export const tags = pgTable('tags', {
  norm: text().primaryKey(),
  tagId: text().notNull().default(''),
  name: text().notNull(),
  displayName: text().notNull().default(''),
  isCommunity: boolean().notNull().default(false),
  seenCount: integer().notNull().default(0),
  lastSeen: createdAt(),
});

export type Provider = typeof providers.$inferSelect;
export type ThreadsAccount = typeof threadsAccounts.$inferSelect;
export type Trigger = typeof triggers.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type Tag = typeof tags.$inferSelect;

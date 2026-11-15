import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './config.js';

export const db = new DatabaseSync(path.join(DATA_DIR, 'comel.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS providers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'openai',   -- openai (OpenAI-compatible) | anthropic
  base_url    TEXT NOT NULL,
  api_key     TEXT DEFAULT '',
  model       TEXT NOT NULL,
  temperature REAL DEFAULT 0.8,
  max_tokens  INTEGER DEFAULT 400,
  is_default  INTEGER DEFAULT 0,
  created_at  INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS accounts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  username         TEXT DEFAULT '',
  method           TEXT NOT NULL DEFAULT 'api',  -- api | browser
  access_token     TEXT DEFAULT '',
  threads_user_id  TEXT DEFAULT '',
  token_refreshed_at INTEGER DEFAULT 0,
  cookies          TEXT DEFAULT '',
  browser_engine   TEXT DEFAULT 'chromium',      -- chromium | lightpanda
  scrape_with_cookies INTEGER DEFAULT 0,
  daily_limit      INTEGER DEFAULT 50,
  provider_id      INTEGER,
  enabled          INTEGER DEFAULT 1,
  -- balas komentar otomatis
  reply_enabled    INTEGER DEFAULT 0,
  reply_interval_minutes INTEGER DEFAULT 30,
  reply_per_run    INTEGER DEFAULT 5,
  reply_scope      TEXT DEFAULT 'both',          -- own_posts | my_comments | both
  reply_max_age_hours INTEGER DEFAULT 48,
  reply_instruction TEXT DEFAULT '',
  reply_dry_run    INTEGER DEFAULT 0,
  next_reply_at    INTEGER DEFAULT 0,
  last_reply_status TEXT DEFAULT '',
  status_note      TEXT DEFAULT '',
  created_at       INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS triggers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  account_id       INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  enabled          INTEGER DEFAULT 1,
  queries          TEXT DEFAULT '[]',     -- JSON array kata pencarian
  match_expr       TEXT DEFAULT '',       -- contoh: kuliner AND (bogor OR "kota bogor")
  exclude_words    TEXT DEFAULT '',       -- dipisah koma
  exclude_users    TEXT DEFAULT '',       -- dipisah koma
  min_likes        INTEGER DEFAULT 0,
  min_replies      INTEGER DEFAULT 0,
  min_reposts      INTEGER DEFAULT 0,
  min_shares       INTEGER DEFAULT 0,
  min_quotes       INTEGER DEFAULT 0,
  metric_logic     TEXT DEFAULT 'all',    -- all (semua syarat) | any (salah satu)
  max_age_hours    INTEGER DEFAULT 0,     -- 0 = tanpa batas
  min_age_minutes  INTEGER DEFAULT 0,
  include_replies  INTEGER DEFAULT 0,     -- ikutkan postingan yang berupa balasan
  sort_by          TEXT DEFAULT 'engagement', -- engagement | newest
  actions_per_run  INTEGER DEFAULT 3,
  interval_minutes INTEGER DEFAULT 15,
  active_hours     TEXT DEFAULT '',       -- contoh 07:00-22:00, kosong = 24 jam
  author_cooldown_hours INTEGER DEFAULT 24,
  instruction      TEXT DEFAULT '',
  provider_id      INTEGER,
  dry_run          INTEGER DEFAULT 0,
  next_run_at      INTEGER DEFAULT 0,
  last_run_at      INTEGER DEFAULT 0,
  last_status      TEXT DEFAULT '',
  created_at       INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS actions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id   INTEGER,
  trigger_id   INTEGER,
  kind         TEXT NOT NULL,          -- comment | reply
  target_code  TEXT,
  target_id    TEXT,
  target_user  TEXT,
  target_text  TEXT,
  target_url   TEXT,
  metrics      TEXT,
  reply_text   TEXT,
  status       TEXT NOT NULL,          -- sent | failed | dry_run | skipped
  error        TEXT,
  result_id    TEXT,
  created_at   INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_actions_acc_target ON actions(account_id, target_code);
CREATE INDEX IF NOT EXISTS idx_actions_acc_time ON actions(account_id, created_at);

CREATE TABLE IF NOT EXISTS logs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER DEFAULT (unixepoch()),
  level   TEXT,
  source  TEXT,
  message TEXT
);
`);

// ---------- settings ----------
const DEFAULT_SETTINGS = {
  timezone: 'Asia/Jakarta',
  paused: false,              // tombol darurat: hentikan semua aksi
  delay_min_seconds: 25,      // jeda antar komentar dalam satu putaran
  delay_max_seconds: 70,
  max_chars: 280,             // panjang maksimal komentar (Threads maks 500)
  skip_sensitive: true,
};

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

export function saveSettings(patch) {
  const stmt = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    stmt.run(k, JSON.stringify(v));
  }
  return getSettings();
}

// ---------- helper CRUD generik ----------
const TABLE_COLUMNS = {};
function columns(table) {
  if (!TABLE_COLUMNS[table]) {
    TABLE_COLUMNS[table] = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  }
  return TABLE_COLUMNS[table];
}

function clean(table, obj) {
  const cols = columns(table).filter((c) => !['id', 'created_at'].includes(c));
  const out = {};
  for (const c of cols) {
    if (obj[c] === undefined) continue;
    let v = obj[c];
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (Array.isArray(v) || (v && typeof v === 'object')) v = JSON.stringify(v);
    if (v === '' && /^(min_|max_|daily_|reply_per|reply_interval|reply_max|actions_per|interval_|author_|provider_id)/.test(c)) {
      v = c === 'provider_id' ? null : 0;
    }
    out[c] = v;
  }
  return out;
}

export function insert(table, obj) {
  const data = clean(table, obj);
  const keys = Object.keys(data);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  const r = db.prepare(sql).run(...keys.map((k) => data[k]));
  return getById(table, Number(r.lastInsertRowid));
}

export function update(table, id, obj) {
  const data = clean(table, obj);
  const keys = Object.keys(data);
  if (keys.length) {
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...keys.map((k) => data[k]), id);
  }
  return getById(table, id);
}

export function getById(table, id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) || null;
}

export function list(table, order = 'id ASC') {
  return db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
}

export function remove(table, id) {
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

// ---------- logs ----------
export function log(level, source, message) {
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  db.prepare('INSERT INTO logs(level, source, message) VALUES (?, ?, ?)').run(level, source, msg);
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${source}: ${msg}`;
  if (level === 'error') console.error(line); else console.log(line);
  // jaga ukuran tabel log
  if (Math.random() < 0.02) db.prepare('DELETE FROM logs WHERE id < (SELECT MAX(id) - 5000 FROM logs)').run();
}

export function recentLogs(limit = 200) {
  return db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit);
}

// ---------- actions ----------
export function recordAction(a) {
  return insert('actions', a);
}

export function hasActedOn(accountId, code) {
  return Boolean(db.prepare(
    "SELECT 1 FROM actions WHERE account_id = ? AND target_code = ? AND status IN ('sent','skipped','dry_run') LIMIT 1",
  ).get(accountId, code));
}

export function failedAttempts(accountId, code) {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM actions WHERE account_id = ? AND target_code = ? AND status = 'failed'",
  ).get(accountId, code).n;
}

export function recentlyCommentedAuthor(accountId, username, hours) {
  if (!hours) return false;
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  return Boolean(db.prepare(
    "SELECT 1 FROM actions WHERE account_id = ? AND target_user = ? AND status = 'sent' AND kind = 'comment' AND created_at >= ? LIMIT 1",
  ).get(accountId, username, since));
}

export function sentLast24h(accountId) {
  const since = Math.floor(Date.now() / 1000) - 86400;
  return db.prepare(
    "SELECT COUNT(*) AS n FROM actions WHERE account_id = ? AND status = 'sent' AND created_at >= ?",
  ).get(accountId, since).n;
}

export function recentReplyTexts(accountId, limit = 8) {
  return db.prepare(
    "SELECT reply_text FROM actions WHERE account_id = ? AND status IN ('sent','dry_run') AND reply_text IS NOT NULL ORDER BY id DESC LIMIT ?",
  ).all(accountId, limit).map((r) => r.reply_text);
}

import Database from 'better-sqlite3'
import { mkdirSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomInt } from 'node:crypto'

// 保留内部主键与所有关联；六位 UID 仅作为公开登录标识，避开已有数字账号。
export function allocatePublicUid(database) {
  const occupied = new Set(database.prepare('SELECT public_uid, username FROM users').all().flatMap(row => [row.public_uid, row.username]))
  const start = randomInt(100000, 1000000)
  for (let offset = 0; offset < 900000; offset++) {
    const candidate = String(100000 + (start - 100000 + offset) % 900000)
    if (!occupied.has(candidate)) return candidate
  }
  throw Error('六位 UID 已用尽。')
}

export function openAccountDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const database = new Database(path)
  if (path !== ':memory:') chmodSync(path, 0o600)
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.pragma('busy_timeout = 3000')
  const version = database.pragma('user_version', { simple: true })
  if (version > 2) { database.close(); throw Error('账号数据库版本高于当前程序，请使用匹配版本。') }
  if (version === 0) database.transaction(() => {
    database.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
        password_hash TEXT NOT NULL, email TEXT, email_verified_at INTEGER, auth_version INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE security_questions (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 2), question TEXT NOT NULL, answer_hash TEXT NOT NULL,
        normalization_version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id, slot));
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        auth_version INTEGER NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX sessions_by_user ON sessions(user_id);
      CREATE TABLE recovery_challenges (token_hash TEXT PRIMARY KEY, subject TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        auth_version INTEGER, questions TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL);
      CREATE INDEX challenges_by_subject ON recovery_challenges(subject);
      CREATE TABLE hakisub_room_presets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        preset_name TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1, configuration TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE INDEX presets_by_user ON hakisub_room_presets(user_id);
      CREATE TABLE user_projects (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, project_key TEXT NOT NULL,
        created_at INTEGER NOT NULL, PRIMARY KEY(user_id, project_key));
      CREATE TABLE rate_limit_events (action TEXT NOT NULL, subject TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX limits_by_subject ON rate_limit_events(action, subject, created_at);
      CREATE TABLE registration_events (user_id TEXT NOT NULL REFERENCES users(id), subject TEXT NOT NULL, created_at INTEGER NOT NULL, quota_exempt INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX registrations_by_subject ON registration_events(subject, created_at);
      CREATE TABLE security_events (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      INSERT INTO schema_migrations VALUES (1, ${Date.now()});
      PRAGMA user_version = 1;
    `)
  }).immediate()
  if (version < 2) database.transaction(() => {
    if (!database.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'public_uid')) database.exec('ALTER TABLE users ADD COLUMN public_uid TEXT')
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_by_public_uid ON users(public_uid)')
    const update = database.prepare('UPDATE users SET public_uid=? WHERE id=?')
    for (const user of database.prepare('SELECT id FROM users WHERE public_uid IS NULL ORDER BY created_at,id').all()) update.run(allocatePublicUid(database), user.id)
    database.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (2,?)').run(Date.now())
    database.pragma('user_version = 2')
  }).immediate()
  return database
}

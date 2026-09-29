// SQLite schema + connection (better-sqlite3, parameterized queries everywhere)
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','banned')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade TEXT DEFAULT 'الصف الثالث الثانوي',
  avatar_emoji TEXT DEFAULT '⚗️'
);
CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_id INTEGER NOT NULL REFERENCES terms(id),
  accepted_at INTEGER NOT NULL,
  UNIQUE(user_id, terms_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT 'الصف الثالث الثانوي',
  subject TEXT NOT NULL DEFAULT 'الكيمياء',
  chapter TEXT NOT NULL DEFAULT 'الباب الأول',
  duration_min INTEGER NOT NULL DEFAULT 180,
  total_questions INTEGER NOT NULL DEFAULT 60,
  pause_enabled INTEGER NOT NULL DEFAULT 1,
  max_pause_min INTEGER NOT NULL DEFAULT 30,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  image_url TEXT,
  choice_a TEXT NOT NULL,
  choice_b TEXT NOT NULL,
  choice_c TEXT NOT NULL,
  choice_d TEXT NOT NULL,
  correct_choice TEXT NOT NULL CHECK(correct_choice IN ('A','B','C','D')),
  explanation TEXT DEFAULT '',
  difficulty TEXT DEFAULT 'medium',
  chapter TEXT DEFAULT 'الباب الأول',
  tags TEXT DEFAULT '',
  is_sample INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exam_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','paused','submitted')),
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  submitted_at INTEGER,
  time_used_sec INTEGER DEFAULT 0,
  paused_until INTEGER,
  total_paused_sec INTEGER DEFAULT 0,
  pause_count INTEGER DEFAULT 0,
  score INTEGER,
  total INTEGER,
  percentage REAL,
  grade_label TEXT
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  selected_choice TEXT CHECK(selected_choice IN ('A','B','C','D')),
  marked INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(attempt_id, question_id)
);
CREATE TABLE IF NOT EXISTS pause_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read INTEGER DEFAULT 0,
  read_at INTEGER,
  UNIQUE(notification_id, user_id)
);
CREATE TABLE IF NOT EXISTS bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  is_permanent INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target TEXT DEFAULT '',
  meta TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}

module.exports = { db, getSetting, setSetting, DB_PATH };

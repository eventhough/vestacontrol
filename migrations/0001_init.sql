-- Key/value app settings (password hash, Vestaboard key, timezone, ...).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Scheduled notes: both one-time and repeating.
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,        -- JSON NoteContent
  schedule TEXT NOT NULL,       -- JSON Schedule
  next_run_at INTEGER,          -- UTC ms; NULL once there are no more runs
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'scheduled',
  author TEXT,
  hold_minutes INTEGER NOT NULL DEFAULT 0,
  state TEXT,                   -- JSON widget state (e.g. rotation position)
  last_sent_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX notes_due ON notes (enabled, next_run_at);

-- Everything that was sent (or failed/skipped), for the history screen.
CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT,
  title TEXT,
  layout TEXT,
  status TEXT NOT NULL,
  detail TEXT,
  author TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX history_created ON history (created_at DESC);

-- Saved designs and messages people want to reuse.
CREATE TABLE favorites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

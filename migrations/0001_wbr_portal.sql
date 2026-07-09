-- West Baton Rouge Parish portal — initial schema (Cloudflare D1 / SQLite)
-- Applied to the WBR_DB binding. Idempotent-ish: uses IF NOT EXISTS.

-- ---- service requests (311) ----
CREATE TABLE IF NOT EXISTS issues (
  id           TEXT PRIMARY KEY,              -- e.g. WBR-24817
  category     TEXT NOT NULL,                 -- pothole|drainage|light|debris|sign|water
  title        TEXT NOT NULL,
  description  TEXT,
  address      TEXT,
  lat          REAL,
  lng          REAL,
  status       TEXT NOT NULL DEFAULT 'new',   -- new|prog|done
  reporter_name    TEXT,
  reporter_contact TEXT,
  source       TEXT NOT NULL DEFAULT 'app',   -- app|web|staff
  photo_key    TEXT,                          -- R2 object key, optional
  assigned_to  TEXT,                          -- staff username or crew
  created_at   TEXT NOT NULL,                 -- ISO8601
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_issues_status  ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at DESC);

-- ---- status/audit history for each request ----
CREATE TABLE IF NOT EXISTS issue_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id   TEXT NOT NULL REFERENCES issues(id),
  kind       TEXT NOT NULL,                   -- created|status|assign|note|notify
  detail     TEXT,
  actor      TEXT,                            -- staff username or 'resident'
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_issue ON issue_events(issue_id, id);

-- ---- staff accounts (real auth) ----
CREATE TABLE IF NOT EXISTS staff_users (
  username   TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'staff',   -- admin|clerk|publicworks|staff
  pw_hash    TEXT NOT NULL,                    -- PBKDF2 hash (see auth helper)
  pw_salt    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- ---- alert subscribers (mass comms) ----
CREATE TABLE IF NOT EXISTS alert_subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT,
  phone      TEXT,
  name       TEXT,
  district   TEXT,                            -- optional segmentation
  channels   TEXT NOT NULL DEFAULT 'email',   -- csv: email,sms,push
  verified   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(email),
  UNIQUE(phone)
);

-- ---- sent alert log ----
CREATE TABLE IF NOT EXISTS alerts_sent (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel     TEXT NOT NULL,                  -- email|sms|push
  audience    TEXT,
  subject     TEXT,
  body        TEXT NOT NULL,
  recipients  INTEGER NOT NULL DEFAULT 0,
  sent_by     TEXT,
  status      TEXT NOT NULL DEFAULT 'queued', -- queued|sent|partial|failed
  created_at  TEXT NOT NULL
);

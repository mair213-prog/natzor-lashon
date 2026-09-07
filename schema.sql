CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','study','dorm')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('class','dorm')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  goal_target INTEGER NOT NULL DEFAULT 500 CHECK (goal_target > 0),
  UNIQUE(name, type)
);

CREATE TABLE IF NOT EXISTS group_students (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, student_id)
);

CREATE TABLE IF NOT EXISTS user_groups (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS score_periods (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_score_period ON score_periods((active)) WHERE active=true;

INSERT INTO score_periods(name,active)
SELECT 'תקופה ראשונה',true
WHERE NOT EXISTS (SELECT 1 FROM score_periods);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('plus','minus')),
  area TEXT NOT NULL CHECK (area IN ('class','dorm')),
  period_id INTEGER REFERENCES score_periods(id),
  hour_slot TIMESTAMPTZ NOT NULL DEFAULT date_trunc('hour', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration from v2/v3.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_student_id_report_type_hour_slot_key;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS period_id INTEGER REFERENCES score_periods(id);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS goal_target INTEGER NOT NULL DEFAULT 500;

UPDATE reports
SET period_id=(SELECT id FROM score_periods WHERE active=true ORDER BY id LIMIT 1)
WHERE period_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_student ON reports(student_id);
CREATE INDEX IF NOT EXISTS idx_reports_student_type_created ON reports(student_id, report_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_period ON reports(period_id);

-- Daily email reminder settings.
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_time TIME;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_timezone TEXT NOT NULL DEFAULT 'Asia/Jerusalem';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_last_sent_date DATE;

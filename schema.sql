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

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('plus','minus')),
  area TEXT NOT NULL CHECK (area IN ('class','dorm')),
  hour_slot TIMESTAMPTZ NOT NULL DEFAULT date_trunc('hour', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration from v2: the old version limited each +/- to once per clock hour.
-- v3 enforces a true rolling 5-minute cooldown in server code instead.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_student_id_report_type_hour_slot_key;

CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_student ON reports(student_id);
CREATE INDEX IF NOT EXISTS idx_reports_student_type_created ON reports(student_id, report_type, created_at DESC);

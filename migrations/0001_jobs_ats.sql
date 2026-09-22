PRAGMA foreign_keys = ON;

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  team TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  workplace_type TEXT NOT NULL DEFAULT 'Remote',
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  responsibilities TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  application_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  published_at TEXT,
  closes_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE job_questions (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('short','long','file')),
  prompt TEXT NOT NULL,
  help_text TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  portfolio_url TEXT NOT NULL DEFAULT '',
  cover_letter TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0,1)),
  source TEXT NOT NULL DEFAULT 'jobs',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','review','shortlist','interview','offer','hired','rejected','withdrawn')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE application_answers (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES job_questions(id) ON DELETE RESTRICT,
  answer_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(application_id, question_id)
);

CREATE TABLE application_files (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES job_questions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('resume','test')),
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE application_notes (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT 'Admin',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  actor TEXT NOT NULL DEFAULT 'Admin',
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_jobs_status_sort ON jobs(status, sort_order, published_at);
CREATE INDEX idx_questions_job_sort ON job_questions(job_id, sort_order);
CREATE INDEX idx_applications_job_status_created ON applications(job_id, status, created_at DESC);
CREATE INDEX idx_applications_email ON applications(email);
CREATE INDEX idx_answers_application ON application_answers(application_id);
CREATE INDEX idx_files_application ON application_files(application_id);
CREATE INDEX idx_notes_application_created ON application_notes(application_id, created_at DESC);
CREATE INDEX idx_events_application_created ON application_events(application_id, created_at DESC);

-- Structured interviews and scorecards for the hiring desk. Both belong to
-- an application and are removed with it (privacy deletion and retention).

CREATE TABLE application_interviews (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('screen', 'work_sample', 'technical', 'culture', 'final')),
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 45 CHECK (duration_minutes BETWEEN 10 AND 480),
  location TEXT NOT NULL DEFAULT '',
  interviewers TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled', 'no_show')),
  created_by TEXT,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX application_interviews_app ON application_interviews(application_id, scheduled_at);
CREATE INDEX application_interviews_when ON application_interviews(status, scheduled_at);

-- One scorecard per person per interview. Ratings use a 1–4 scale (no
-- neutral middle); evidence is required so a recommendation is never bare.
CREATE TABLE application_scorecards (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  interview_id TEXT REFERENCES application_interviews(id) ON DELETE SET NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('strong_yes', 'yes', 'no', 'strong_no')),
  ratings TEXT NOT NULL DEFAULT '{}',
  evidence TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX application_scorecards_app ON application_scorecards(application_id, created_at);
CREATE UNIQUE INDEX application_scorecards_one ON application_scorecards(application_id, author_id, COALESCE(interview_id, ''));

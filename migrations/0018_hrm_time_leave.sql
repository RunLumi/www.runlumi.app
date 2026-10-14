-- P3: versioned work calendars, auditable attendance, locked periods and leave.
-- No jurisdiction, workweek, allowance or accrual period is seeded.

CREATE TABLE hrm_work_calendar_versions (
  id TEXT PRIMARY KEY,
  calendar_key TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  legal_entity TEXT NOT NULL,
  timezone TEXT NOT NULL,
  schedule_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','reviewed','active','retired','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  activated_by TEXT,
  activated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(calendar_key,version_number)
);
CREATE UNIQUE INDEX hrm_one_active_calendar_per_key ON hrm_work_calendar_versions(calendar_key) WHERE state='active';
CREATE INDEX hrm_calendar_versions ON hrm_work_calendar_versions(calendar_key,version_number DESC);

CREATE TABLE hrm_work_assignments (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  calendar_version_id TEXT NOT NULL REFERENCES hrm_work_calendar_versions(id),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(employment_id,effective_from)
);
CREATE INDEX hrm_work_assignment_scope ON hrm_work_assignments(person_id,effective_from,effective_to);
CREATE TRIGGER hrm_work_assignment_identity_immutable
BEFORE UPDATE OF person_id,employment_id,calendar_version_id,effective_from ON hrm_work_assignments
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_time_periods (
  id TEXT PRIMARY KEY,
  period_key TEXT NOT NULL UNIQUE,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open','reviewing','locked','reopen_requested','reopened')),
  snapshot_json TEXT,
  snapshot_checksum TEXT,
  entry_count INTEGER,
  opened_by TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  locked_by TEXT,
  locked_at TEXT,
  reopened_by TEXT,
  reopened_at TEXT,
  reopen_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ends_on >= starts_on),
  CHECK ((state IN ('locked','reopen_requested') AND snapshot_json IS NOT NULL AND snapshot_checksum IS NOT NULL AND locked_at IS NOT NULL) OR state NOT IN ('locked','reopen_requested'))
);
CREATE INDEX hrm_time_periods_state ON hrm_time_periods(state,starts_on,ends_on);

CREATE TABLE hrm_time_period_snapshots (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES hrm_time_periods(id),
  snapshot_revision INTEGER NOT NULL CHECK (snapshot_revision > 0),
  snapshot_json TEXT NOT NULL,
  snapshot_checksum TEXT NOT NULL,
  entry_count INTEGER NOT NULL CHECK (entry_count >= 0),
  locked_by TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  UNIQUE(period_id,snapshot_revision)
);
CREATE INDEX hrm_time_snapshots_period ON hrm_time_period_snapshots(period_id,snapshot_revision DESC);
CREATE TRIGGER hrm_time_snapshot_no_update BEFORE UPDATE ON hrm_time_period_snapshots BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_time_snapshot_no_delete BEFORE DELETE ON hrm_time_period_snapshots BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_time_entries (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES hrm_time_periods(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  assignment_id TEXT NOT NULL REFERENCES hrm_work_assignments(id),
  calendar_version_id TEXT NOT NULL REFERENCES hrm_work_calendar_versions(id),
  work_date TEXT NOT NULL,
  shift_key TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
  check_in_utc TEXT NOT NULL,
  check_out_utc TEXT NOT NULL,
  break_minutes INTEGER NOT NULL CHECK (break_minutes >= 0),
  worked_minutes INTEGER NOT NULL CHECK (worked_minutes >= 0),
  overtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),
  overtime_state TEXT NOT NULL DEFAULT 'none' CHECK (overtime_state IN ('none','pending_approval','approved','rejected')),
  overtime_reviewed_by TEXT,
  overtime_reviewed_at TEXT,
  overtime_reason TEXT,
  source TEXT NOT NULL CHECK (source IN ('employee','hr_import','hr_manual')),
  state TEXT NOT NULL CHECK (state IN ('submitted','approved','rejected')),
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (check_out_utc > check_in_utc),
  CHECK (worked_minutes <= planned_minutes + 1440),
  UNIQUE(employment_id,work_date,shift_key)
);
CREATE INDEX hrm_time_entries_person_date ON hrm_time_entries(person_id,work_date);
CREATE INDEX hrm_time_entries_period_state ON hrm_time_entries(period_id,state,work_date);
CREATE TRIGGER hrm_time_entry_open_period_insert
BEFORE INSERT ON hrm_time_entries
WHEN NOT EXISTS (SELECT 1 FROM hrm_time_periods p WHERE p.id=NEW.period_id AND p.state IN ('open','reopened') AND p.starts_on<=NEW.work_date AND p.ends_on>=NEW.work_date)
BEGIN SELECT RAISE(ABORT,'time_period_locked'); END;
CREATE TRIGGER hrm_time_entry_open_period_update
BEFORE UPDATE OF check_in_utc,check_out_utc,break_minutes,worked_minutes,overtime_minutes,overtime_state,state ON hrm_time_entries
WHEN NOT EXISTS (SELECT 1 FROM hrm_time_periods p WHERE p.id=NEW.period_id AND p.state IN ('open','reviewing','reopened'))
BEGIN SELECT RAISE(ABORT,'time_period_locked'); END;
CREATE TRIGGER hrm_time_entry_identity_immutable
BEFORE UPDATE OF period_id,person_id,employment_id,assignment_id,calendar_version_id,work_date,shift_key,planned_minutes,source,submitted_by,submitted_at ON hrm_time_entries
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_time_adjustments (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES hrm_time_entries(id),
  expected_entry_version INTEGER NOT NULL,
  old_check_in_utc TEXT NOT NULL,
  old_check_out_utc TEXT NOT NULL,
  old_break_minutes INTEGER NOT NULL,
  proposed_check_in_utc TEXT NOT NULL,
  proposed_check_out_utc TEXT NOT NULL,
  proposed_break_minutes INTEGER NOT NULL,
  proposed_worked_minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending_approval','approved','rejected','withdrawn')),
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX hrm_time_adjustment_queue ON hrm_time_adjustments(state,submitted_at);

CREATE TABLE hrm_leave_policy_versions (
  id TEXT PRIMARY KEY,
  policy_key TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','reviewed','active','retired','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  activated_by TEXT,
  activated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(policy_key,version_number)
);
CREATE UNIQUE INDEX hrm_one_active_leave_policy_per_key ON hrm_leave_policy_versions(policy_key) WHERE state='active';

CREATE TABLE hrm_leave_policy_assignments (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  policy_version_id TEXT NOT NULL REFERENCES hrm_leave_policy_versions(id),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(employment_id,effective_from)
);
CREATE INDEX hrm_leave_assignment_scope ON hrm_leave_policy_assignments(person_id,effective_from,effective_to);
CREATE TRIGGER hrm_leave_assignment_identity_immutable
BEFORE UPDATE OF person_id,employment_id,policy_version_id,effective_from ON hrm_leave_policy_assignments
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_leave_requests (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  assignment_id TEXT NOT NULL REFERENCES hrm_leave_policy_assignments(id),
  policy_version_id TEXT NOT NULL REFERENCES hrm_leave_policy_versions(id),
  leave_type_key TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  portion TEXT NOT NULL CHECK (portion IN ('full','half_first','half_second')),
  requested_minutes INTEGER NOT NULL CHECK (requested_minutes > 0),
  calculation_json TEXT NOT NULL,
  private_reason TEXT NOT NULL DEFAULT '',
  cancellation_reason TEXT,
  handoff_note TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('pending_approval','approved','rejected','withdrawn','cancellation_requested','cancelled','cancellation_rejected')),
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ends_on >= starts_on)
);
CREATE INDEX hrm_leave_request_person_dates ON hrm_leave_requests(person_id,starts_on,ends_on,state);
CREATE INDEX hrm_leave_request_queue ON hrm_leave_requests(state,submitted_at);

CREATE TABLE hrm_leave_ledger (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  assignment_id TEXT NOT NULL REFERENCES hrm_leave_policy_assignments(id),
  policy_version_id TEXT NOT NULL REFERENCES hrm_leave_policy_versions(id),
  leave_type_key TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('annual_grant','accrual','manual_adjustment','used','returned','carryover','expired')),
  minutes INTEGER NOT NULL CHECK (minutes != 0),
  period_key TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(reference_id,event_kind)
);
CREATE INDEX hrm_leave_ledger_balance ON hrm_leave_ledger(employment_id,leave_type_key,period_key);
CREATE TRIGGER hrm_leave_ledger_no_update BEFORE UPDATE ON hrm_leave_ledger BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_leave_ledger_no_delete BEFORE DELETE ON hrm_leave_ledger BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_leave_events (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL REFERENCES hrm_leave_requests(id),
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_leave_events_request ON hrm_leave_events(leave_request_id,created_at);
CREATE TRIGGER hrm_leave_events_no_update BEFORE UPDATE ON hrm_leave_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_leave_events_no_delete BEFORE DELETE ON hrm_leave_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TRIGGER hrm_leave_no_locked_period_insert
BEFORE INSERT ON hrm_leave_requests
WHEN EXISTS (SELECT 1 FROM hrm_time_periods p WHERE p.state IN ('locked','reopen_requested') AND p.starts_on<=NEW.ends_on AND p.ends_on>=NEW.starts_on)
BEGIN SELECT RAISE(ABORT,'time_period_locked'); END;
CREATE TRIGGER hrm_leave_no_locked_period_state_change
BEFORE UPDATE OF state ON hrm_leave_requests
WHEN NEW.state IN ('approved','cancellation_requested','cancelled') AND EXISTS (SELECT 1 FROM hrm_time_periods p WHERE p.state IN ('locked','reopen_requested') AND p.starts_on<=NEW.ends_on AND p.ends_on>=NEW.starts_on)
BEGIN SELECT RAISE(ABORT,'leave_cancel_requires_adjustment'); END;

CREATE TRIGGER hrm_time_period_lock_guard
BEFORE UPDATE OF state ON hrm_time_periods
WHEN NEW.state='locked' AND (
  EXISTS (SELECT 1 FROM hrm_time_entries t WHERE t.period_id=NEW.id AND (t.state!='approved' OR t.overtime_state NOT IN ('none','approved')))
  OR EXISTS (SELECT 1 FROM hrm_time_adjustments a JOIN hrm_time_entries t ON t.id=a.entry_id WHERE t.period_id=NEW.id AND a.state='pending_approval')
  OR EXISTS (SELECT 1 FROM hrm_leave_requests r WHERE r.state IN ('pending_approval','cancellation_requested') AND r.starts_on<=NEW.ends_on AND r.ends_on>=NEW.starts_on)
)
BEGIN SELECT RAISE(ABORT,'time_period_not_ready'); END;

CREATE TRIGGER hrm_work_assignment_no_locked_overlap_insert
BEFORE INSERT ON hrm_work_assignments
WHEN EXISTS (
  SELECT 1 FROM hrm_time_periods p
  WHERE p.state IN ('reviewing','locked','reopen_requested','reopened')
    AND NEW.effective_from<=p.ends_on AND (NEW.effective_to IS NULL OR NEW.effective_to>=p.starts_on)
)
BEGIN SELECT RAISE(ABORT,'time_period_locked'); END;
CREATE TRIGGER hrm_work_assignment_no_locked_overlap_end
BEFORE UPDATE OF effective_to ON hrm_work_assignments
WHEN EXISTS (
  SELECT 1 FROM hrm_time_periods p
  WHERE p.state IN ('reviewing','locked','reopen_requested','reopened')
    AND OLD.effective_from<=p.ends_on AND (OLD.effective_to IS NULL OR OLD.effective_to>=p.starts_on)
    AND NEW.effective_to IS NOT OLD.effective_to
)
BEGIN SELECT RAISE(ABORT,'time_period_locked'); END;

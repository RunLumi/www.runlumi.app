-- P4: versioned payroll inputs and immutable employee-visible payslips.
-- This migration creates no policy, currency, component, employee or pay amount.
CREATE TABLE workspace_roles_payroll (
  user_id TEXT NOT NULL REFERENCES workspace_members(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('hr','sales_manager','sales_executive','partner','finance','fulfillment','employee','people_manager','hrm_officer','hrm_admin','payroll_officer')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id,role)
);
INSERT INTO workspace_roles_payroll SELECT user_id,role,granted_by,granted_at FROM workspace_roles;
DROP TABLE workspace_roles;
ALTER TABLE workspace_roles_payroll RENAME TO workspace_roles;
CREATE INDEX workspace_roles_role ON workspace_roles(role);

CREATE TABLE hrm_payroll_policy_versions (
  id TEXT PRIMARY KEY,
  policy_key TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  legal_entity TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  minor_unit_scale INTEGER NOT NULL CHECK (minor_unit_scale BETWEEN 0 AND 3),
  components_json TEXT NOT NULL CHECK (json_valid(components_json)),
  rounding_policy TEXT NOT NULL DEFAULT 'minor_unit_exact' CHECK (rounding_policy='minor_unit_exact'),
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
  UNIQUE (policy_key,revision),
  CHECK (reviewed_by IS NULL OR reviewed_by != created_by),
  CHECK (activated_by IS NULL OR activated_by != created_by)
);
CREATE INDEX hrm_payroll_policy_state ON hrm_payroll_policy_versions(state,policy_key,revision DESC);
CREATE UNIQUE INDEX hrm_one_active_payroll_policy ON hrm_payroll_policy_versions(policy_key) WHERE state='active';
CREATE TRIGGER hrm_payroll_policy_definition_immutable
BEFORE UPDATE OF policy_key,revision,title_en,title_vi,legal_entity,currency,minor_unit_scale,components_json,rounding_policy,created_by,created_at ON hrm_payroll_policy_versions
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_policy_no_delete BEFORE DELETE ON hrm_payroll_policy_versions BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_policy_state_guard BEFORE UPDATE OF state ON hrm_payroll_policy_versions
WHEN NOT (OLD.state=NEW.state OR (OLD.state='draft' AND NEW.state IN ('reviewed','rejected')) OR (OLD.state='reviewed' AND NEW.state='active') OR (OLD.state='active' AND NEW.state='retired'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;

CREATE TABLE hrm_payroll_runs (
  id TEXT PRIMARY KEY,
  period_key TEXT NOT NULL,
  period_id TEXT NOT NULL REFERENCES hrm_time_periods(id),
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES hrm_payroll_policy_versions(id),
  adjustment_of_payslip_id TEXT REFERENCES hrm_payslips(id),
  reason TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('draft','calculated','reviewed','approved','published','closed')),
  input_revision INTEGER NOT NULL DEFAULT 1 CHECK (input_revision > 0),
  snapshot_json TEXT CHECK (snapshot_json IS NULL OR json_valid(snapshot_json)),
  snapshot_checksum TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  approved_by TEXT,
  approved_at TEXT,
  approval_reason TEXT,
  published_by TEXT,
  published_at TEXT,
  closed_by TEXT,
  closed_at TEXT,
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ends_on >= starts_on),
  CHECK (reviewed_by IS NULL OR reviewed_by != created_by),
  CHECK (approved_by IS NULL OR approved_by != created_by),
  CHECK ((state IN ('calculated','reviewed','approved','published','closed') AND snapshot_json IS NOT NULL AND snapshot_checksum IS NOT NULL) OR state='draft')
);
CREATE UNIQUE INDEX hrm_payroll_one_regular_run ON hrm_payroll_runs(policy_version_id,period_id) WHERE adjustment_of_payslip_id IS NULL;
CREATE UNIQUE INDEX hrm_payroll_one_correction_per_slip ON hrm_payroll_runs(adjustment_of_payslip_id) WHERE adjustment_of_payslip_id IS NOT NULL;
CREATE INDEX hrm_payroll_runs_state ON hrm_payroll_runs(state,period_key DESC,created_at DESC);
CREATE TRIGGER hrm_payroll_run_identity_immutable
BEFORE UPDATE OF period_key,period_id,starts_on,ends_on,policy_version_id,adjustment_of_payslip_id,reason,created_by,created_at ON hrm_payroll_runs
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_run_snapshot_immutable
BEFORE UPDATE OF snapshot_json,snapshot_checksum ON hrm_payroll_runs
WHEN OLD.state IN ('published','closed')
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_run_state_guard BEFORE UPDATE OF state ON hrm_payroll_runs
WHEN NOT (OLD.state=NEW.state OR OLD.state IN ('calculated','reviewed','approved') AND NEW.state='draft' OR OLD.state='draft' AND NEW.state='calculated' OR OLD.state='calculated' AND NEW.state='reviewed' OR OLD.state='reviewed' AND NEW.state='approved' OR OLD.state='approved' AND NEW.state='published' OR OLD.state='published' AND NEW.state='closed')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;

CREATE TABLE hrm_payroll_run_people (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES hrm_payroll_runs(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  employee_code_snapshot TEXT NOT NULL,
  display_name_snapshot TEXT NOT NULL,
  gross_minor INTEGER,
  deductions_minor INTEGER,
  net_minor INTEGER,
  UNIQUE(run_id,person_id)
);
CREATE INDEX hrm_payroll_run_people_person ON hrm_payroll_run_people(person_id,run_id);
CREATE TRIGGER hrm_payroll_run_people_published_update BEFORE UPDATE ON hrm_payroll_run_people
WHEN EXISTS(SELECT 1 FROM hrm_payroll_runs WHERE id=OLD.run_id AND state IN ('published','closed'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_run_people_published_delete BEFORE DELETE ON hrm_payroll_run_people
WHEN EXISTS(SELECT 1 FROM hrm_payroll_runs WHERE id=OLD.run_id AND state IN ('published','closed'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_payroll_lines (
  id TEXT PRIMARY KEY,
  run_person_id TEXT NOT NULL REFERENCES hrm_payroll_run_people(id),
  component_code TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('earning','deduction')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0 AND amount_minor <= 9007199254740991),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('employment_record','locked_time','approved_adjustment','manual_evidence')),
  source_reference TEXT NOT NULL,
  zero_reason TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_person_id,component_code),
  CHECK (amount_minor != 0 OR length(trim(zero_reason)) > 0)
);
CREATE INDEX hrm_payroll_lines_person ON hrm_payroll_lines(run_person_id,component_code);
CREATE TRIGGER hrm_payroll_lines_published_insert BEFORE INSERT ON hrm_payroll_lines
WHEN EXISTS(SELECT 1 FROM hrm_payroll_run_people rp JOIN hrm_payroll_runs r ON r.id=rp.run_id WHERE rp.id=NEW.run_person_id AND r.state IN ('published','closed'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_lines_published_update BEFORE UPDATE ON hrm_payroll_lines
WHEN EXISTS(SELECT 1 FROM hrm_payroll_run_people rp JOIN hrm_payroll_runs r ON r.id=rp.run_id WHERE rp.id=OLD.run_person_id AND r.state IN ('published','closed'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_lines_published_delete BEFORE DELETE ON hrm_payroll_lines
WHEN EXISTS(SELECT 1 FROM hrm_payroll_run_people rp JOIN hrm_payroll_runs r ON r.id=rp.run_id WHERE rp.id=OLD.run_person_id AND r.state IN ('published','closed'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_payslips (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES hrm_payroll_runs(id),
  run_person_id TEXT NOT NULL REFERENCES hrm_payroll_run_people(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  supersedes_payslip_id TEXT REFERENCES hrm_payslips(id),
  state TEXT NOT NULL CHECK (state IN ('published','superseded')),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  snapshot_checksum TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  UNIQUE(run_person_id),
  CHECK (supersedes_payslip_id IS NULL OR supersedes_payslip_id != id)
);
CREATE INDEX hrm_payslips_person ON hrm_payslips(person_id,issued_at DESC);
CREATE TRIGGER hrm_payslip_content_immutable
BEFORE UPDATE OF run_id,run_person_id,person_id,supersedes_payslip_id,snapshot_json,snapshot_checksum,issued_by,issued_at ON hrm_payslips
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payslip_no_delete BEFORE DELETE ON hrm_payslips BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payslip_state_guard BEFORE UPDATE OF state ON hrm_payslips
WHEN NOT (OLD.state='published' AND NEW.state='superseded')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;

CREATE TABLE hrm_payroll_payments (
  id TEXT PRIMARY KEY,
  payslip_id TEXT NOT NULL REFERENCES hrm_payslips(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  paid_on TEXT NOT NULL,
  payment_reference TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  confirmed_by TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  request_key TEXT NOT NULL,
  UNIQUE(confirmed_by,request_key)
);
CREATE INDEX hrm_payroll_payments_slip ON hrm_payroll_payments(payslip_id,paid_on);
CREATE TRIGGER hrm_payroll_payment_no_update BEFORE UPDATE ON hrm_payroll_payments BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_payment_no_delete BEFORE DELETE ON hrm_payroll_payments BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_payroll_disputes (
  id TEXT PRIMARY KEY,
  payslip_id TEXT NOT NULL REFERENCES hrm_payslips(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  component_code TEXT,
  state TEXT NOT NULL CHECK (state IN ('submitted','investigating','answered','resolved','reopened')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  opened_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX hrm_payroll_dispute_queue ON hrm_payroll_disputes(state,updated_at DESC);
CREATE INDEX hrm_payroll_dispute_person ON hrm_payroll_disputes(person_id,created_at DESC);
CREATE TRIGGER hrm_payroll_dispute_no_delete BEFORE DELETE ON hrm_payroll_disputes BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TABLE hrm_payroll_dispute_events (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES hrm_payroll_disputes(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted','investigating','answered','resolved','reopened')),
  body TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_payroll_dispute_events_order ON hrm_payroll_dispute_events(dispute_id,created_at,id);
CREATE TRIGGER hrm_payroll_dispute_event_no_update BEFORE UPDATE ON hrm_payroll_dispute_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_dispute_event_no_delete BEFORE DELETE ON hrm_payroll_dispute_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

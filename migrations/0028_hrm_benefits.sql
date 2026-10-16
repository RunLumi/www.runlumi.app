-- Configurable HR benefits without inferred amounts, eligibility formulas or payroll effects.
CREATE TABLE hrm_benefit_plans (
  id TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL CHECK(length(trim(plan_code)) BETWEEN 2 AND 48),
  version_no INTEGER NOT NULL CHECK(version_no > 0),
  legal_entity TEXT NOT NULL CHECK(length(trim(legal_entity)) BETWEEN 1 AND 200),
  category TEXT NOT NULL CHECK(category IN ('health','insurance','wellness','family','reimbursement','other')),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 2000),
  eligibility_text TEXT NOT NULL CHECK(length(trim(eligibility_text)) BETWEEN 1 AND 2000),
  effective_from TEXT NOT NULL CHECK(length(effective_from)=10),
  effective_to TEXT NOT NULL CHECK(length(effective_to)=10 AND effective_to>=effective_from),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','retired')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(legal_entity,plan_code,version_no),
  CHECK(state!='active' OR (reviewed_by IS NOT NULL AND reviewed_by!=created_by AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_benefit_one_active_plan ON hrm_benefit_plans(legal_entity,plan_code) WHERE state='active';
CREATE INDEX hrm_benefit_plan_visibility ON hrm_benefit_plans(legal_entity,state,effective_from,effective_to,plan_code);
CREATE TRIGGER hrm_benefit_plan_identity_immutable
BEFORE UPDATE OF plan_code,version_no,legal_entity,category,name,description,eligibility_text,effective_from,effective_to,created_by,created_at ON hrm_benefit_plans
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_benefit_plan_state_guard BEFORE UPDATE OF state ON hrm_benefit_plans
WHEN NOT (OLD.state=NEW.state OR OLD.state='draft' AND NEW.state='active' OR OLD.state='active' AND NEW.state='retired')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_benefit_plan_no_delete BEFORE DELETE ON hrm_benefit_plans
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_benefit_enrollments (
  id TEXT PRIMARY KEY,
  plan_version_id TEXT NOT NULL REFERENCES hrm_benefit_plans(id),
  plan_code TEXT NOT NULL,
  plan_version_no INTEGER NOT NULL CHECK(plan_version_no>0),
  legal_entity TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('health','insurance','wellness','family','reimbursement','other')),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  state TEXT NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','approved','declined','cancelled')),
  employee_note TEXT NOT NULL DEFAULT '' CHECK(length(employee_note)<=1000),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT NOT NULL DEFAULT '' CHECK(length(review_reason)<=1000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(state NOT IN ('approved','declined') OR (reviewed_by IS NOT NULL AND reviewed_by!=created_by AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_benefit_one_open_enrollment ON hrm_benefit_enrollments(person_id,plan_code) WHERE state IN ('submitted','approved');
CREATE INDEX hrm_benefit_enrollment_queue ON hrm_benefit_enrollments(legal_entity,state,created_at DESC);
CREATE INDEX hrm_benefit_enrollment_person ON hrm_benefit_enrollments(person_id,created_at DESC);
CREATE TRIGGER hrm_benefit_enrollment_identity_immutable
BEFORE UPDATE OF plan_version_id,plan_code,plan_version_no,legal_entity,category,person_id,employment_id,employee_note,created_by,created_at ON hrm_benefit_enrollments
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_benefit_enrollment_state_guard BEFORE UPDATE OF state ON hrm_benefit_enrollments
WHEN NOT (OLD.state=NEW.state OR OLD.state='submitted' AND NEW.state IN ('approved','declined','cancelled') OR OLD.state='approved' AND NEW.state='cancelled')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_benefit_enrollment_no_delete BEFORE DELETE ON hrm_benefit_enrollments
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_benefit_events (
  id TEXT PRIMARY KEY,
  plan_version_id TEXT REFERENCES hrm_benefit_plans(id),
  enrollment_id TEXT REFERENCES hrm_benefit_enrollments(id),
  person_id TEXT REFERENCES hrm_people(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('plan_created','plan_activated','plan_retired','enrollment_submitted','enrollment_approved','enrollment_declined','enrollment_cancelled')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_benefit_events_plan ON hrm_benefit_events(plan_version_id,created_at,id);
CREATE INDEX hrm_benefit_events_enrollment ON hrm_benefit_events(enrollment_id,created_at,id);
CREATE TRIGGER hrm_benefit_event_no_update BEFORE UPDATE ON hrm_benefit_events
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_benefit_event_no_delete BEFORE DELETE ON hrm_benefit_events
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

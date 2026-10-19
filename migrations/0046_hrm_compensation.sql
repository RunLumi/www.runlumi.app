-- P4: effective, independently reviewed compensation that payroll lines must
-- trace to (§10.1). This migration creates no compensation, amount, currency,
-- proration rule or employee data. A version pays one declared amount per
-- payroll period while it covers the whole period; partial periods have no
-- default proration and stay blocked until an owner-approved rule exists.
CREATE TABLE hrm_compensation_versions (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  legal_entity TEXT NOT NULL,
  component_code TEXT NOT NULL CHECK (length(component_code) BETWEEN 1 AND 40 AND component_code GLOB '[a-z]*' AND component_code NOT GLOB '*[^a-z0-9_]*'),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  minor_unit_scale INTEGER NOT NULL CHECK (minor_unit_scale BETWEEN 0 AND 3),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 0 AND 9007199254740991),
  cadence TEXT NOT NULL DEFAULT 'per_payroll_period' CHECK (cadence='per_payroll_period'),
  effective_from TEXT NOT NULL CHECK (effective_from GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  effective_until TEXT CHECK (effective_until IS NULL OR effective_until GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('contract_issue','decision_reference')),
  source_reference TEXT NOT NULL CHECK (length(trim(source_reference)) BETWEEN 1 AND 200),
  basis_note TEXT NOT NULL CHECK (length(trim(basis_note)) BETWEEN 1 AND 1000),
  supersedes_id TEXT REFERENCES hrm_compensation_versions(id),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','approved','rejected','cancelled','superseded')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  CHECK (reviewed_by IS NULL OR reviewed_by != created_by),
  CHECK (supersedes_id IS NULL OR supersedes_id != id),
  CHECK (state NOT IN ('approved','rejected','superseded') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(review_reason)) > 0))
);
CREATE INDEX hrm_compensation_lookup ON hrm_compensation_versions(employment_id,component_code,state,effective_from);
CREATE INDEX hrm_compensation_recent ON hrm_compensation_versions(created_at DESC,id);
-- One open replacement per superseded version.
CREATE UNIQUE INDEX hrm_compensation_one_replacement ON hrm_compensation_versions(supersedes_id) WHERE supersedes_id IS NOT NULL AND state IN ('draft','approved','superseded');

CREATE TRIGGER hrm_compensation_definition_immutable
BEFORE UPDATE OF person_id,employment_id,legal_entity,component_code,currency,minor_unit_scale,amount_minor,cadence,effective_from,source_kind,source_reference,basis_note,supersedes_id,created_by,created_at ON hrm_compensation_versions
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
-- Every version starts as a draft and is approved through the guarded update
-- path, so a direct insert cannot bypass review or the overlap trigger.
CREATE TRIGGER hrm_compensation_insert_draft BEFORE INSERT ON hrm_compensation_versions
WHEN NEW.state!='draft' OR NEW.reviewed_by IS NOT NULL
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_compensation_no_delete BEFORE DELETE ON hrm_compensation_versions BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_compensation_review_immutable
BEFORE UPDATE OF reviewed_by,reviewed_at,review_reason ON hrm_compensation_versions
WHEN OLD.reviewed_by IS NOT NULL
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_compensation_state_guard BEFORE UPDATE OF state ON hrm_compensation_versions
WHEN NOT (OLD.state=NEW.state OR (OLD.state='draft' AND NEW.state IN ('approved','rejected','cancelled')) OR (OLD.state='approved' AND NEW.state='superseded'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;

-- An approved version replaced in full needs a draft replacement starting no
-- later than it; the replacement is approved in the same batch.
CREATE TRIGGER hrm_compensation_supersede_requires_replacement
BEFORE UPDATE OF state ON hrm_compensation_versions
WHEN OLD.state='approved' AND NEW.state='superseded' AND NOT EXISTS (
  SELECT 1 FROM hrm_compensation_versions n WHERE n.supersedes_id=OLD.id AND n.state='draft' AND n.effective_from<=OLD.effective_from
  AND (n.effective_until IS NULL OR (OLD.effective_until IS NOT NULL AND n.effective_until>=OLD.effective_until)))
BEGIN SELECT RAISE(ABORT,'hrm_compensation_replacement_required'); END;

-- An approved range may only be shortened, and only to end the day before a
-- draft replacement that starts inside it.
CREATE TRIGGER hrm_compensation_end_date_guard
BEFORE UPDATE OF effective_until ON hrm_compensation_versions
WHEN NOT (OLD.effective_until IS NEW.effective_until) AND NOT (
  OLD.state='approved' AND NEW.effective_until IS NOT NULL
  AND (OLD.effective_until IS NULL OR NEW.effective_until<OLD.effective_until)
  AND EXISTS (SELECT 1 FROM hrm_compensation_versions n WHERE n.supersedes_id=OLD.id AND n.state='draft' AND n.effective_from=date(NEW.effective_until,'+1 day') AND n.effective_from>OLD.effective_from
  AND (n.effective_until IS NULL OR (OLD.effective_until IS NOT NULL AND n.effective_until>=OLD.effective_until))))
BEGIN SELECT RAISE(ABORT,'hrm_compensation_end_date_invalid'); END;

-- Approved versions of one employment component never overlap. Draft,
-- rejected, cancelled and superseded rows are not effective.
CREATE TRIGGER hrm_compensation_no_overlap
BEFORE UPDATE OF state ON hrm_compensation_versions
WHEN NEW.state='approved' AND OLD.state='draft' AND EXISTS (
  SELECT 1 FROM hrm_compensation_versions o
  WHERE o.id!=NEW.id AND o.employment_id=NEW.employment_id AND o.component_code=NEW.component_code AND o.state='approved'
  AND o.effective_from<=COALESCE(NEW.effective_until,'9999-12-31') AND COALESCE(o.effective_until,'9999-12-31')>=NEW.effective_from)
BEGIN SELECT RAISE(ABORT,'hrm_compensation_overlap'); END;

-- Run review/approval checks whether the actor entered any input to the run.
CREATE INDEX hrm_audit_target_action ON hrm_audit(target_id,action,actor_id);

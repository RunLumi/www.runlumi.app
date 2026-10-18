-- Owner-defined offboarding financial review terms. No policy, checklist,
-- jurisdiction, exemption or production activation is seeded by this migration.
CREATE TABLE hrm_closeout_policy_versions (
 id TEXT PRIMARY KEY,
 policy_key TEXT NOT NULL,
 legal_entity TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 title_en TEXT NOT NULL,
 title_vi TEXT NOT NULL,
 purpose TEXT NOT NULL,
 jurisdiction TEXT NOT NULL,
 source_version_id TEXT REFERENCES hrm_legal_template_versions(id),
 source_checksum TEXT,
 checklist_json TEXT NOT NULL CHECK(json_valid(checklist_json) AND json_type(checklist_json)='array' AND json_array_length(checklist_json) BETWEEN 1 AND 30),
 allow_no_payroll INTEGER NOT NULL CHECK(allow_no_payroll IN (0,1)),
 no_payroll_instructions TEXT,
 effective_from TEXT NOT NULL,
 effective_until TEXT NOT NULL CHECK(effective_until>=effective_from),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','reviewed','active','retired','rejected')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 reviewed_by TEXT CHECK(reviewed_by IS NULL OR reviewed_by!=created_by),
 reviewed_at TEXT,
 review_reason TEXT,
 activated_by TEXT CHECK(activated_by IS NULL OR activated_by!=created_by),
 activated_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 actor_id TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(legal_entity,policy_key,revision),
 CHECK(allow_no_payroll=0 OR (no_payroll_instructions IS NOT NULL AND length(trim(no_payroll_instructions))>0)),
 CHECK((source_version_id IS NULL)=(source_checksum IS NULL)),
 CHECK(state NOT IN ('reviewed','active','retired') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(state NOT IN ('active','retired') OR (activated_by IS NOT NULL AND activated_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_closeout_one_active_policy ON hrm_closeout_policy_versions(legal_entity,policy_key) WHERE state='active';
CREATE INDEX hrm_closeout_policy_entity ON hrm_closeout_policy_versions(legal_entity,created_at DESC,id);
CREATE TRIGGER hrm_closeout_policy_definition_immutable
BEFORE UPDATE OF id,policy_key,legal_entity,revision,title_en,title_vi,purpose,jurisdiction,source_version_id,source_checksum,checklist_json,allow_no_payroll,no_payroll_instructions,effective_from,effective_until,created_by,created_at ON hrm_closeout_policy_versions
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_policy_no_delete BEFORE DELETE ON hrm_closeout_policy_versions
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_policy_transition BEFORE UPDATE OF state ON hrm_closeout_policy_versions
WHEN NOT (OLD.state=NEW.state OR OLD.state='draft' AND NEW.state IN ('reviewed','rejected') OR OLD.state='reviewed' AND NEW.state='active' OR OLD.state='active' AND NEW.state='retired')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_closeout_policy_review_immutable
BEFORE UPDATE OF reviewed_by,reviewed_at,review_reason ON hrm_closeout_policy_versions WHEN OLD.state!='draft'
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_policy_activation_immutable
BEFORE UPDATE OF activated_by,activated_at ON hrm_closeout_policy_versions WHEN OLD.state!='reviewed'
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TABLE hrm_closeout_policy_events (
 id INTEGER PRIMARY KEY,
 policy_id TEXT NOT NULL REFERENCES hrm_closeout_policy_versions(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('created','approve','reject','activate','retire')),
 reason TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TRIGGER hrm_closeout_policy_event_no_update BEFORE UPDATE ON hrm_closeout_policy_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_policy_event_no_delete BEFORE DELETE ON hrm_closeout_policy_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

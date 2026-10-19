-- Financial retention is separate from the general file queue: its metadata
-- requires payroll authority. No duration, policy, employee or activation is seeded.
CREATE TABLE hrm_financial_retention_policy_versions (
 id TEXT PRIMARY KEY NOT NULL,
 policy_key TEXT NOT NULL CHECK(length(policy_key) BETWEEN 1 AND 80),
 legal_entity TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 title_en TEXT NOT NULL CHECK(length(trim(title_en)) BETWEEN 1 AND 160),
 title_vi TEXT NOT NULL CHECK(length(trim(title_vi)) BETWEEN 1 AND 160),
 purpose TEXT NOT NULL CHECK(length(trim(purpose)) BETWEEN 1 AND 1000),
 source_version_id TEXT NOT NULL REFERENCES hrm_legal_template_versions(id),
 source_checksum TEXT NOT NULL CHECK(length(source_checksum)=64),
 effective_from TEXT NOT NULL,
 effective_until TEXT NOT NULL CHECK(effective_until>=effective_from),
 file_days INTEGER CHECK(file_days IS NULL OR (typeof(file_days)='integer' AND file_days BETWEEN 1 AND 36500)),
 file_anchor TEXT CHECK(file_anchor IN ('file_created','employment_ended','case_completed')),
 file_basis TEXT NOT NULL CHECK(length(trim(file_basis)) BETWEEN 1 AND 1000),
 dossier_days INTEGER CHECK(dossier_days IS NULL OR (typeof(dossier_days)='integer' AND dossier_days BETWEEN 1 AND 36500)),
 dossier_anchor TEXT CHECK(dossier_anchor IN ('dossier_prepared','dossier_applied','employment_ended','case_completed')),
 dossier_basis TEXT NOT NULL CHECK(length(trim(dossier_basis)) BETWEEN 1 AND 1000),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','reviewed','active','retired','rejected')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 reviewed_by TEXT,
 reviewed_at TEXT,
 review_reason TEXT,
 activated_by TEXT,
 activated_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 actor_id TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(legal_entity,policy_key,revision),
 CHECK((file_days IS NULL AND file_anchor IS NULL) OR (file_days IS NOT NULL AND file_anchor IS NOT NULL)),
 CHECK((dossier_days IS NULL AND dossier_anchor IS NULL) OR (dossier_days IS NOT NULL AND dossier_anchor IS NOT NULL)),
 CHECK(reviewed_by IS NULL OR reviewed_by!=created_by),
 CHECK(activated_by IS NULL OR (activated_by!=created_by AND reviewed_by IS NOT NULL)),
 CHECK(state='draft' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL AND length(trim(review_reason))>0)),
 CHECK(state NOT IN ('active','retired') OR (activated_by IS NOT NULL AND activated_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_financial_retention_active ON hrm_financial_retention_policy_versions(legal_entity,policy_key) WHERE state='active';
CREATE INDEX hrm_financial_retention_history ON hrm_financial_retention_policy_versions(legal_entity,policy_key,revision DESC);
CREATE TRIGGER hrm_financial_retention_content_immutable BEFORE UPDATE ON hrm_financial_retention_policy_versions
WHEN NEW.id IS NOT OLD.id OR NEW.policy_key IS NOT OLD.policy_key OR NEW.legal_entity IS NOT OLD.legal_entity
 OR NEW.revision IS NOT OLD.revision OR NEW.title_en IS NOT OLD.title_en OR NEW.title_vi IS NOT OLD.title_vi
 OR NEW.purpose IS NOT OLD.purpose OR NEW.source_version_id IS NOT OLD.source_version_id OR NEW.source_checksum IS NOT OLD.source_checksum
 OR NEW.effective_from IS NOT OLD.effective_from OR NEW.effective_until IS NOT OLD.effective_until
 OR NEW.file_days IS NOT OLD.file_days OR NEW.file_anchor IS NOT OLD.file_anchor OR NEW.file_basis IS NOT OLD.file_basis
 OR NEW.dossier_days IS NOT OLD.dossier_days OR NEW.dossier_anchor IS NOT OLD.dossier_anchor OR NEW.dossier_basis IS NOT OLD.dossier_basis
 OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_financial_retention_no_delete BEFORE DELETE ON hrm_financial_retention_policy_versions BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_financial_retention_transition BEFORE UPDATE OF state ON hrm_financial_retention_policy_versions
WHEN NOT(OLD.state=NEW.state OR OLD.state='draft' AND NEW.state IN ('reviewed','rejected') OR OLD.state='reviewed' AND NEW.state='active' OR OLD.state='active' AND NEW.state='retired')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_financial_retention_review_immutable BEFORE UPDATE OF reviewed_by,reviewed_at,review_reason ON hrm_financial_retention_policy_versions
WHEN OLD.reviewed_by IS NOT NULL AND (NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.review_reason IS NOT OLD.review_reason)
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_financial_disposition_requests (
 id TEXT PRIMARY KEY NOT NULL,
 target_kind TEXT NOT NULL CHECK(target_kind IN ('file','dossier')),
 case_id TEXT NOT NULL REFERENCES hrm_offboarding_cases(id),
 file_id TEXT REFERENCES hrm_closeout_files(id),
 dossier_id TEXT REFERENCES hrm_closeout_dossiers(id),
 policy_id TEXT NOT NULL REFERENCES hrm_financial_retention_policy_versions(id),
 policy_revision INTEGER NOT NULL CHECK(policy_revision>0),
 policy_version INTEGER NOT NULL CHECK(policy_version>0),
 target_version INTEGER NOT NULL CHECK(target_version>0),
 case_version INTEGER NOT NULL CHECK(case_version>0),
 target_checksum TEXT NOT NULL CHECK(length(target_checksum)=64),
 control_checksum TEXT NOT NULL CHECK(length(control_checksum)=64),
 target_size_bytes INTEGER NOT NULL CHECK(target_size_bytes BETWEEN 1 AND 5242880),
 object_key_snapshot TEXT,
 anchor_snapshot TEXT NOT NULL,
 due_on TEXT NOT NULL CHECK(length(due_on)=10),
 state TEXT NOT NULL DEFAULT 'pending_review' CHECK(state IN ('pending_review','approved','rejected','blocked','deleting','retryable','completed')),
 request_reason TEXT NOT NULL CHECK(length(trim(request_reason)) BETWEEN 1 AND 1000),
 requested_by TEXT NOT NULL,
 requested_at TEXT NOT NULL,
 reviewed_by TEXT,
 reviewed_at TEXT,
 review_reason TEXT,
 started_by TEXT,
 started_at TEXT,
 completed_by TEXT,
 completed_at TEXT,
 completion_detail TEXT,
 block_reason TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 actor_id TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((target_kind='file' AND file_id IS NOT NULL AND dossier_id IS NULL AND object_key_snapshot IS NOT NULL)
 OR (target_kind='dossier' AND dossier_id IS NOT NULL AND file_id IS NULL AND object_key_snapshot IS NULL)),
 CHECK(reviewed_by IS NULL OR reviewed_by!=requested_by),
 CHECK(started_by IS NULL OR (started_by!=requested_by AND reviewed_by IS NOT NULL AND started_by!=reviewed_by)),
 CHECK(completed_by IS NULL OR (completed_by!=requested_by AND reviewed_by IS NOT NULL AND completed_by!=reviewed_by)),
 CHECK(state NOT IN ('approved','rejected','deleting','retryable','completed') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL AND length(trim(review_reason))>0)),
 CHECK(state NOT IN ('deleting','retryable','completed') OR (started_by IS NOT NULL AND started_at IS NOT NULL)),
 CHECK(state!='completed' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_financial_disposition_file_once ON hrm_financial_disposition_requests(file_id) WHERE target_kind='file' AND state IN ('pending_review','approved','deleting','retryable','completed');
CREATE UNIQUE INDEX hrm_financial_disposition_dossier_once ON hrm_financial_disposition_requests(dossier_id) WHERE target_kind='dossier' AND state IN ('pending_review','approved','deleting','retryable','completed');
CREATE INDEX hrm_financial_disposition_case ON hrm_financial_disposition_requests(case_id,state,requested_at,id);
CREATE INDEX hrm_financial_disposition_policy ON hrm_financial_disposition_requests(policy_id,state);
CREATE TRIGGER hrm_financial_disposition_identity_immutable BEFORE UPDATE ON hrm_financial_disposition_requests
WHEN NEW.id IS NOT OLD.id OR NEW.target_kind IS NOT OLD.target_kind OR NEW.case_id IS NOT OLD.case_id
 OR NEW.file_id IS NOT OLD.file_id OR NEW.dossier_id IS NOT OLD.dossier_id OR NEW.policy_id IS NOT OLD.policy_id
 OR NEW.policy_revision IS NOT OLD.policy_revision OR NEW.policy_version IS NOT OLD.policy_version
 OR NEW.target_version IS NOT OLD.target_version OR NEW.case_version IS NOT OLD.case_version
 OR NEW.target_checksum IS NOT OLD.target_checksum OR NEW.control_checksum IS NOT OLD.control_checksum OR NEW.target_size_bytes IS NOT OLD.target_size_bytes OR NEW.object_key_snapshot IS NOT OLD.object_key_snapshot
 OR NEW.anchor_snapshot IS NOT OLD.anchor_snapshot OR NEW.due_on IS NOT OLD.due_on
 OR NEW.request_reason IS NOT OLD.request_reason OR NEW.requested_by IS NOT OLD.requested_by OR NEW.requested_at IS NOT OLD.requested_at
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_financial_disposition_review_immutable BEFORE UPDATE OF reviewed_by,reviewed_at,review_reason ON hrm_financial_disposition_requests
WHEN OLD.reviewed_by IS NOT NULL AND (NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.review_reason IS NOT OLD.review_reason)
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_financial_disposition_start_immutable BEFORE UPDATE OF started_by,started_at ON hrm_financial_disposition_requests
WHEN OLD.started_by IS NOT NULL AND (NEW.started_by IS NOT OLD.started_by OR NEW.started_at IS NOT OLD.started_at)
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_financial_disposition_no_delete BEFORE DELETE ON hrm_financial_disposition_requests BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_financial_disposition_transition BEFORE UPDATE OF state ON hrm_financial_disposition_requests
WHEN NOT(OLD.state=NEW.state OR OLD.state='pending_review' AND NEW.state IN ('approved','rejected','blocked')
 OR OLD.state='approved' AND NEW.state IN ('deleting','blocked') OR OLD.state='deleting' AND NEW.state IN ('retryable','completed')
 OR OLD.state='retryable' AND NEW.state IN ('deleting','completed'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_financial_disposition_target BEFORE INSERT ON hrm_financial_disposition_requests
WHEN NEW.state!='pending_review' OR NEW.version!=1
 OR (NEW.target_kind='file' AND NOT EXISTS(SELECT 1 FROM hrm_closeout_files f WHERE f.id=NEW.file_id AND f.case_id=NEW.case_id AND f.checksum=NEW.target_checksum AND f.object_key=NEW.object_key_snapshot AND f.version=NEW.target_version AND f.object_deleted_at IS NULL))
 OR (NEW.target_kind='dossier' AND NOT EXISTS(SELECT 1 FROM hrm_closeout_dossiers d WHERE d.id=NEW.dossier_id AND d.case_id=NEW.case_id AND d.version=NEW.target_version AND d.payload_disposition_state='none'))
 OR NOT EXISTS(SELECT 1 FROM hrm_offboarding_cases c JOIN hrm_employments e ON e.id=c.employment_id JOIN hrm_people person ON person.id=c.person_id
 JOIN hrm_financial_retention_policy_versions p ON p.id=NEW.policy_id
 WHERE c.id=NEW.case_id AND c.version=NEW.case_version AND p.legal_entity=e.legal_entity
 AND p.state='active' AND p.revision=NEW.policy_revision AND p.version=NEW.policy_version
 AND c.employee_user_id IS NOT NEW.requested_by AND person.user_id IS NOT NEW.requested_by)
BEGIN SELECT RAISE(ABORT,'financial_disposition_changed'); END;

CREATE TABLE hrm_financial_retention_events (
 id INTEGER PRIMARY KEY,
 policy_id TEXT REFERENCES hrm_financial_retention_policy_versions(id),
 request_id TEXT REFERENCES hrm_financial_disposition_requests(id),
 event_type TEXT NOT NULL,
 detail_json TEXT NOT NULL CHECK(json_valid(detail_json) AND json_type(detail_json)='object'),
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX hrm_financial_retention_event_policy ON hrm_financial_retention_events(policy_id,id);
CREATE INDEX hrm_financial_retention_event_request ON hrm_financial_retention_events(request_id,id);
CREATE TRIGGER hrm_financial_retention_event_no_update BEFORE UPDATE ON hrm_financial_retention_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_financial_retention_event_no_delete BEFORE DELETE ON hrm_financial_retention_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

-- A new hold wins before reservation. Once irreversible work is reserved,
-- report that conflict instead of claiming that a late hold was applied.
CREATE TRIGGER hrm_financial_person_hold_in_progress BEFORE INSERT ON hrm_legal_holds
WHEN NEW.scope_kind='person' AND NEW.category='*' AND NEW.state='active'
 AND EXISTS(SELECT 1 FROM hrm_financial_disposition_requests r JOIN hrm_offboarding_cases c ON c.id=r.case_id
 WHERE c.person_id=NEW.person_id AND r.state IN ('deleting','retryable'))
BEGIN SELECT RAISE(ABORT,'financial_disposition_in_progress'); END;
CREATE TRIGGER hrm_financial_person_hold_blocks AFTER INSERT ON hrm_legal_holds
WHEN NEW.scope_kind='person' AND NEW.category='*' AND NEW.state='active' BEGIN
 UPDATE hrm_financial_disposition_requests SET state='blocked',block_reason='A current person-wide legal hold requires a fresh decision.',version=version+1,actor_id='system:hrm-financial-hold',updated_at=NEW.placed_at
 WHERE state IN ('pending_review','approved') AND case_id IN (SELECT id FROM hrm_offboarding_cases WHERE person_id=NEW.person_id);
END;
CREATE TRIGGER hrm_financial_file_hold_blocks AFTER INSERT ON hrm_closeout_file_holds BEGIN
 UPDATE hrm_financial_disposition_requests SET state='blocked',block_reason='A current financial file hold requires a fresh decision.',version=version+1,actor_id='system:hrm-financial-hold',updated_at=NEW.placed_at
 WHERE state IN ('pending_review','approved') AND file_id=NEW.file_id;
END;
CREATE TRIGGER hrm_financial_file_changed_blocks AFTER UPDATE OF version ON hrm_closeout_files
WHEN NEW.version!=OLD.version BEGIN
 UPDATE hrm_financial_disposition_requests SET state='blocked',block_reason='The financial file changed; prepare a fresh request.',version=version+1,actor_id='system:hrm-financial-source',updated_at=NEW.updated_at
 WHERE state IN ('pending_review','approved') AND file_id=NEW.id AND target_version!=NEW.version;
END;
CREATE TRIGGER hrm_financial_case_changed_blocks AFTER UPDATE OF version ON hrm_offboarding_cases
WHEN NEW.version!=OLD.version BEGIN
 UPDATE hrm_financial_disposition_requests SET state='blocked',block_reason='The financial case changed; prepare a fresh request.',version=version+1,actor_id='system:hrm-financial-source',updated_at=NEW.updated_at
 WHERE state IN ('pending_review','approved') AND case_id=NEW.id AND case_version!=NEW.version;
END;
CREATE TRIGGER hrm_financial_dossier_changed_blocks AFTER UPDATE OF version ON hrm_closeout_dossiers
WHEN NEW.version!=OLD.version BEGIN
 UPDATE hrm_financial_disposition_requests SET state='blocked',block_reason='The financial dossier changed; prepare a fresh request.',version=version+1,actor_id='system:hrm-financial-source',updated_at=NEW.updated_at
 WHERE state IN ('pending_review','approved') AND dossier_id=NEW.id AND target_version!=NEW.version;
END;
CREATE TRIGGER hrm_financial_identity_changed_blocks AFTER UPDATE OF user_id ON hrm_people
WHEN NEW.user_id IS NOT OLD.user_id BEGIN
 UPDATE hrm_financial_disposition_requests SET state='blocked',block_reason='The verified employee identity changed; prepare a fresh request.',version=version+1,actor_id='system:hrm-financial-identity',updated_at=NEW.updated_at
 WHERE state IN ('pending_review','approved') AND case_id IN (SELECT id FROM hrm_offboarding_cases WHERE person_id=NEW.id);
END;
CREATE TRIGGER hrm_financial_policy_ongoing BEFORE UPDATE OF state ON hrm_financial_retention_policy_versions
WHEN OLD.state='active' AND NEW.state!='active'
 AND EXISTS(SELECT 1 FROM hrm_financial_disposition_requests r WHERE r.policy_id=OLD.id AND r.state IN ('deleting','retryable'))
BEGIN SELECT RAISE(ABORT,'financial_disposition_in_progress'); END;
CREATE TRIGGER hrm_financial_policy_replaced AFTER UPDATE OF state ON hrm_financial_retention_policy_versions
WHEN OLD.state='active' AND NEW.state!='active' BEGIN
 UPDATE hrm_financial_disposition_requests SET state='blocked',block_reason='The retention policy changed; prepare a fresh request.',version=version+1,actor_id=NEW.actor_id,updated_at=NEW.updated_at
 WHERE policy_id=NEW.id AND state IN ('pending_review','approved');
END;

-- This scope exists only inside the metadata transaction. It authorizes a
-- narrow historical-source exception, not arbitrary writes or fresh approval.
CREATE TABLE hrm_financial_disposition_execution_scope (
 request_id TEXT PRIMARY KEY NOT NULL REFERENCES hrm_financial_disposition_requests(id),
 phase TEXT NOT NULL CHECK(phase IN ('reserve','complete')),
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TRIGGER hrm_financial_execution_scope_guard BEFORE INSERT ON hrm_financial_disposition_execution_scope
WHEN NOT EXISTS(SELECT 1 FROM hrm_financial_disposition_requests r WHERE r.id=NEW.request_id AND r.state IN ('deleting','retryable')
 AND r.reviewed_by IS NOT NULL AND r.started_by IS NOT NULL AND NEW.actor_id!=r.requested_by AND NEW.actor_id!=r.reviewed_by)
BEGIN SELECT RAISE(ABORT,'financial_disposition_changed'); END;

DROP TRIGGER hrm_closeout_watch_closeout_files_update;
CREATE TRIGGER hrm_closeout_watch_closeout_files_pending AFTER UPDATE OF state,reviewed_by,reviewed_at,object_deleted_at,disposition_state ON hrm_closeout_files
WHEN EXISTS(SELECT 1 FROM hrm_closeout_dossier_files link JOIN hrm_closeout_dossiers d ON d.id=link.dossier_id
 WHERE link.file_id=NEW.id AND d.state IN ('prepared','approved')) BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 VALUES(NEW.case_id,'hrm_closeout_files',NEW.id,NEW.actor_id);
END;
CREATE TRIGGER hrm_closeout_watch_closeout_files_applied AFTER UPDATE OF state,reviewed_by,reviewed_at,object_deleted_at,disposition_state ON hrm_closeout_files
WHEN EXISTS(SELECT 1 FROM hrm_closeout_dossier_files link JOIN hrm_closeout_dossiers d ON d.id=link.dossier_id WHERE link.file_id=NEW.id AND d.state='applied')
 AND NOT EXISTS(SELECT 1 FROM hrm_closeout_dossier_files link JOIN hrm_closeout_dossiers d ON d.id=link.dossier_id WHERE link.file_id=NEW.id AND d.state IN ('prepared','approved'))
 AND NOT(OLD.state IS NEW.state AND OLD.reviewed_by IS NEW.reviewed_by AND OLD.reviewed_at IS NEW.reviewed_at
 AND EXISTS(SELECT 1 FROM hrm_financial_disposition_execution_scope s JOIN hrm_financial_disposition_requests r ON r.id=s.request_id
 JOIN hrm_offboarding_cases c ON c.id=r.case_id WHERE r.target_kind='file' AND r.file_id=NEW.id AND r.case_id=NEW.case_id
 AND r.target_checksum=NEW.checksum AND r.object_key_snapshot=NEW.object_key AND r.state IN ('deleting','retryable') AND c.state='completed')) BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 VALUES(NEW.case_id,'hrm_closeout_files',NEW.id,NEW.actor_id);
END;

-- A source DOCX cannot be destroyed/rejected while an authorized disposition
-- relies on that reviewed source. A source queued first makes policy validation fail.
CREATE TRIGGER hrm_financial_policy_source_delete_guard BEFORE INSERT ON hrm_file_deletion_requests
WHEN NEW.source_table='hrm_legal_files' AND NEW.state IN ('pending_review','approved','deleting','retryable')
 AND EXISTS(SELECT 1 FROM hrm_financial_disposition_requests r JOIN hrm_financial_retention_policy_versions p ON p.id=r.policy_id
 JOIN hrm_legal_template_versions v ON v.id=p.source_version_id WHERE v.source_file_id=NEW.source_file_id AND r.state IN ('deleting','retryable'))
BEGIN SELECT RAISE(ABORT,'financial_disposition_in_progress'); END;
CREATE TRIGGER hrm_financial_policy_source_review_guard BEFORE UPDATE OF state,object_deleted_at ON hrm_legal_files
WHEN (NEW.state!='reviewed' OR NEW.object_deleted_at IS NOT NULL)
 AND EXISTS(SELECT 1 FROM hrm_financial_disposition_requests r JOIN hrm_financial_retention_policy_versions p ON p.id=r.policy_id
 JOIN hrm_legal_template_versions v ON v.id=p.source_version_id WHERE v.source_file_id=NEW.id AND r.state IN ('deleting','retryable'))
BEGIN SELECT RAISE(ABORT,'financial_disposition_in_progress'); END;

ALTER TABLE hrm_closeout_dossiers ADD COLUMN payload_disposition_state TEXT NOT NULL DEFAULT 'none' CHECK(payload_disposition_state IN ('none','deleting','completed'));
ALTER TABLE hrm_closeout_dossiers ADD COLUMN payload_disposed_at TEXT;
ALTER TABLE hrm_closeout_dossiers ADD COLUMN payload_disposed_checksum TEXT CHECK(payload_disposed_checksum IS NULL OR length(payload_disposed_checksum)=64);
ALTER TABLE hrm_closeout_dossiers ADD COLUMN disposition_request_id TEXT REFERENCES hrm_financial_disposition_requests(id);

DROP TRIGGER hrm_closeout_dossier_basis_immutable;
CREATE TRIGGER hrm_closeout_dossier_identity_immutable BEFORE UPDATE OF id,case_id,person_id,employment_id,employee_user_id,policy_id,source_revision,basis_checksum,prepared_by,prepared_at ON hrm_closeout_dossiers BEGIN
 SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_closeout_dossier_private_payload_guard BEFORE UPDATE OF basis_json,checks_json,no_payroll_evidence_json ON hrm_closeout_dossiers
WHEN NEW.basis_json!='{}' OR NEW.checks_json!='[]' OR NEW.no_payroll_evidence_json!='[]'
 OR NEW.payload_disposed_at IS NULL OR NEW.payload_disposed_checksum IS NULL OR NEW.disposition_request_id IS NULL
 OR NOT EXISTS(SELECT 1 FROM hrm_financial_disposition_execution_scope s JOIN hrm_financial_disposition_requests r ON r.id=s.request_id
 WHERE s.phase='complete' AND r.target_kind='dossier' AND r.dossier_id=OLD.id AND r.case_id=OLD.case_id
 AND r.id=NEW.disposition_request_id AND r.target_checksum=NEW.payload_disposed_checksum AND r.state IN ('deleting','retryable'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

DROP TRIGGER hrm_closeout_dossier_review_immutable;
CREATE TRIGGER hrm_closeout_dossier_reviewer_immutable BEFORE UPDATE OF reviewed_by,reviewed_at ON hrm_closeout_dossiers
WHEN OLD.state!='prepared' BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_dossier_reason_immutable BEFORE UPDATE OF review_reason ON hrm_closeout_dossiers
WHEN OLD.state!='prepared' AND NOT(NEW.review_reason='Disposed under approved retention'
 AND EXISTS(SELECT 1 FROM hrm_financial_disposition_execution_scope s JOIN hrm_financial_disposition_requests r ON r.id=s.request_id
 WHERE s.phase='complete' AND r.target_kind='dossier' AND r.dossier_id=OLD.id AND r.id=NEW.disposition_request_id AND r.state IN ('deleting','retryable')))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_dossier_disposition_guard BEFORE UPDATE OF payload_disposition_state,payload_disposed_at,payload_disposed_checksum,disposition_request_id ON hrm_closeout_dossiers
WHEN OLD.payload_disposed_at IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM hrm_financial_disposition_execution_scope s JOIN hrm_financial_disposition_requests r ON r.id=s.request_id
 WHERE r.target_kind='dossier' AND r.dossier_id=OLD.id AND r.case_id=OLD.case_id AND r.state IN ('deleting','retryable')
 AND ((s.phase='reserve' AND OLD.payload_disposition_state='none' AND NEW.payload_disposition_state='deleting' AND NEW.payload_disposed_at IS NULL AND NEW.disposition_request_id=r.id)
 OR (s.phase='complete' AND NEW.payload_disposition_state='completed' AND NEW.payload_disposed_at IS NOT NULL AND NEW.payload_disposed_checksum=r.target_checksum AND NEW.disposition_request_id=r.id
 AND NEW.basis_json='{}' AND NEW.checks_json='[]' AND NEW.no_payroll_evidence_json='[]' AND NEW.review_reason='Disposed under approved retention')))
BEGIN SELECT RAISE(ABORT,'financial_disposition_changed'); END;
CREATE TRIGGER hrm_closeout_dossier_disposition_hold_guard BEFORE UPDATE OF payload_disposition_state,payload_disposed_at ON hrm_closeout_dossiers
WHEN EXISTS(SELECT 1 FROM hrm_legal_holds h WHERE h.scope_kind='person' AND h.person_id=OLD.person_id AND h.category='*' AND h.state='active')
BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_held'); END;

-- Direct copies of a dossier review reason are part of that private payload.
-- Other independently authored source-event notes are separate records.
DROP TRIGGER hrm_closeout_event_no_update;
CREATE TRIGGER hrm_closeout_event_no_update BEFORE UPDATE ON hrm_closeout_events
WHEN NEW.id IS NOT OLD.id OR NEW.case_id IS NOT OLD.case_id OR NEW.dossier_id IS NOT OLD.dossier_id
 OR NEW.event_type IS NOT OLD.event_type OR NEW.actor_id IS NOT OLD.actor_id OR NEW.created_at IS NOT OLD.created_at
 OR OLD.event_type NOT IN ('approved','rejected','applied')
 OR NEW.detail_json IS NOT json_remove(OLD.detail_json,'$.reason')
 OR NOT EXISTS(SELECT 1 FROM hrm_financial_disposition_execution_scope s JOIN hrm_financial_disposition_requests r ON r.id=s.request_id
 WHERE s.phase='complete' AND r.target_kind='dossier' AND r.dossier_id=OLD.dossier_id AND r.case_id=OLD.case_id AND r.state IN ('deleting','retryable'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TRIGGER hrm_closeout_dossier_disposition_review_guard BEFORE UPDATE OF state ON hrm_closeout_dossiers
WHEN NEW.state IN ('approved','applied') AND NEW.payload_disposition_state!='none'
BEGIN SELECT RAISE(ABORT,'financial_disposition_changed'); END;

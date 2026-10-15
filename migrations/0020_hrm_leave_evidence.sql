-- Leave request evidence uses the existing private R2 file and retention boundary.
-- Add a separately configurable retention category; do not assume a duration.

DROP TRIGGER hrm_retention_file_hold_changed;
DROP TRIGGER hrm_retention_file_created_held;
DROP INDEX hrm_files_person;
ALTER TABLE hrm_files RENAME TO hrm_files_before_leave_evidence;

CREATE TABLE hrm_files (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  record_id TEXT REFERENCES hrm_records(id),
  kind TEXT NOT NULL CHECK(kind IN ('avatar','identity','dependent','bank','tax','personal','leave_evidence')),
  object_key TEXT NOT NULL UNIQUE CHECK(object_key LIKE 'hrm/%'),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),
  checksum TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('quarantined','reviewed','rejected')),
  uploaded_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  expires_on TEXT,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retention_actor_id TEXT,
  object_deleted_at TEXT,
  CHECK(reviewed_by IS NULL OR reviewed_by != uploaded_by)
);
INSERT INTO hrm_files(id,person_id,record_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,reviewed_at,review_reason,expires_on,legal_hold,version,created_at,updated_at,retention_actor_id,object_deleted_at)
SELECT id,person_id,record_id,kind,object_key,original_name,mime_type,size_bytes,checksum,state,uploaded_by,reviewed_by,reviewed_at,review_reason,expires_on,legal_hold,version,created_at,updated_at,retention_actor_id,object_deleted_at
FROM hrm_files_before_leave_evidence;
DROP TABLE hrm_files_before_leave_evidence;
CREATE INDEX hrm_files_person ON hrm_files(person_id,kind,state);

CREATE TRIGGER hrm_retention_file_hold_changed AFTER UPDATE OF legal_hold ON hrm_files
WHEN OLD.legal_hold!=NEW.legal_hold BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,target_id,detail,created_at)
  VALUES(COALESCE(NEW.retention_actor_id,NEW.uploaded_by),CASE WHEN NEW.legal_hold=1 THEN 'file_hold_applied' ELSE 'file_hold_released' END,NEW.person_id,NEW.id,json_object('kind',NEW.kind,'legal_hold',NEW.legal_hold),NEW.updated_at);
END;
CREATE TRIGGER hrm_retention_file_created_held AFTER INSERT ON hrm_files
WHEN NEW.legal_hold=1 BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,target_id,detail,created_at)
  VALUES(COALESCE(NEW.retention_actor_id,NEW.uploaded_by),'file_created_under_legal_hold',NEW.person_id,NEW.id,json_object('kind',NEW.kind,'legal_hold',1),NEW.created_at);
END;

CREATE TABLE hrm_leave_evidence_links (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL REFERENCES hrm_leave_requests(id),
  file_id TEXT NOT NULL UNIQUE REFERENCES hrm_files(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  uploaded_by TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_leave_evidence_request ON hrm_leave_evidence_links(leave_request_id,created_at DESC);
CREATE INDEX hrm_leave_evidence_person ON hrm_leave_evidence_links(person_id,created_at DESC);
CREATE TRIGGER hrm_leave_evidence_link_insert_guard
BEFORE INSERT ON hrm_leave_evidence_links
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_leave_requests r JOIN hrm_leave_policy_versions p ON p.id=r.policy_version_id
  JOIN json_each(p.rules_json) rule ON json_extract(rule.value,'$.key')=r.leave_type_key
  WHERE r.id=NEW.leave_request_id AND r.person_id=NEW.person_id AND r.state='pending_approval' AND json_extract(rule.value,'$.evidence_required')=1
) OR NOT EXISTS(SELECT 1 FROM hrm_files f WHERE f.id=NEW.file_id AND f.person_id=NEW.person_id AND f.kind='leave_evidence' AND f.uploaded_by=NEW.uploaded_by AND f.state='quarantined')
BEGIN SELECT RAISE(ABORT,'leave_evidence_target_invalid'); END;
CREATE TRIGGER hrm_leave_evidence_link_no_update BEFORE UPDATE ON hrm_leave_evidence_links BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_leave_evidence_link_no_delete BEFORE DELETE ON hrm_leave_evidence_links BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

-- Expand the retention category constraint without rewriting prior requests/history.
DROP TRIGGER hrm_file_deletion_created;
DROP TRIGGER hrm_file_deletion_changed;
DROP TRIGGER hrm_file_deletion_identity_immutable;
DROP TRIGGER hrm_file_deletion_no_delete;
DROP INDEX hrm_file_deletion_once;
DROP INDEX hrm_file_deletion_queue;
ALTER TABLE hrm_file_deletion_requests RENAME TO hrm_file_deletion_requests_before_leave_evidence;

CREATE TABLE hrm_file_deletion_requests (
  id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL CHECK(source_table IN ('hrm_files','hrm_legal_files')),
  source_file_id TEXT NOT NULL,
  person_id TEXT REFERENCES hrm_people(id),
  category TEXT NOT NULL CHECK(category IN ('profile_photo','identity','dependent','banking','tax','personal','legal_source','legal_evidence','coi_evidence','onboarding_evidence','leave_evidence')),
  object_key_snapshot TEXT NOT NULL,
  checksum_snapshot TEXT NOT NULL,
  file_version INTEGER NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES hrm_retention_policy_versions(id),
  policy_version INTEGER NOT NULL,
  retention_due_on TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending_review','approved','deleting','retryable','completed','rejected','blocked')),
  request_reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  block_reason TEXT,
  completed_by TEXT,
  completed_at TEXT,
  completion_detail TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(reviewed_by IS NULL OR reviewed_by!=requested_by),
  CHECK(completed_by IS NULL OR completed_by!=requested_by),
  CHECK(state!='completed' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL))
);
INSERT INTO hrm_file_deletion_requests(id,source_table,source_file_id,person_id,category,object_key_snapshot,checksum_snapshot,file_version,policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,reviewed_by,reviewed_at,review_reason,block_reason,completed_by,completed_at,completion_detail,version,actor_id,created_at,updated_at)
SELECT id,source_table,source_file_id,person_id,category,object_key_snapshot,checksum_snapshot,file_version,policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,reviewed_by,reviewed_at,review_reason,block_reason,completed_by,completed_at,completion_detail,version,actor_id,created_at,updated_at
FROM hrm_file_deletion_requests_before_leave_evidence;
DROP TABLE hrm_file_deletion_requests_before_leave_evidence;
CREATE UNIQUE INDEX hrm_file_deletion_once ON hrm_file_deletion_requests(source_table,source_file_id)
  WHERE state IN ('pending_review','approved','deleting','retryable','completed');
CREATE INDEX hrm_file_deletion_queue ON hrm_file_deletion_requests(state,retention_due_on,created_at);

CREATE TRIGGER hrm_file_deletion_created AFTER INSERT ON hrm_file_deletion_requests BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'file_deletion_requested',NEW.person_id,NEW.id,json_object('file_id',NEW.source_file_id,'category',NEW.category,'retention_due_on',NEW.retention_due_on,'checksum',NEW.checksum_snapshot),NEW.created_at);
END;
CREATE TRIGGER hrm_file_deletion_changed AFTER UPDATE ON hrm_file_deletion_requests BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'file_deletion_'||NEW.state,NEW.person_id,NEW.id,json_object('file_id',NEW.source_file_id,'version',NEW.version,'reviewed_by',NEW.reviewed_by,'completed_by',NEW.completed_by),NEW.updated_at);
END;
CREATE TRIGGER hrm_file_deletion_identity_immutable BEFORE UPDATE ON hrm_file_deletion_requests
WHEN OLD.source_table!=NEW.source_table OR OLD.source_file_id!=NEW.source_file_id OR OLD.person_id!=NEW.person_id OR OLD.category!=NEW.category OR OLD.object_key_snapshot!=NEW.object_key_snapshot OR OLD.checksum_snapshot!=NEW.checksum_snapshot OR OLD.file_version!=NEW.file_version OR OLD.policy_version_id!=NEW.policy_version_id OR OLD.policy_version!=NEW.policy_version OR OLD.retention_due_on!=NEW.retention_due_on OR OLD.request_reason!=NEW.request_reason OR OLD.requested_by!=NEW.requested_by OR OLD.requested_at!=NEW.requested_at OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_file_deletion_request'); END;
CREATE TRIGGER hrm_file_deletion_no_delete BEFORE DELETE ON hrm_file_deletion_requests BEGIN
  SELECT RAISE(ABORT,'immutable_file_deletion_request');
END;

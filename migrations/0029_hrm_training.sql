-- Training and certificate evidence uses private R2 custody and its own retention category.
-- No training due date, course, certificate period or retention duration is seeded.
DROP TRIGGER hrm_retention_file_hold_changed;
DROP TRIGGER hrm_retention_file_created_held;
DROP TRIGGER hrm_leave_evidence_link_insert_guard;
DROP TRIGGER hrm_leave_evidence_link_no_update;
DROP TRIGGER hrm_leave_evidence_link_no_delete;
DROP TRIGGER hrm_service_attachment_insert_guard;
DROP TRIGGER hrm_service_attachment_no_update;
DROP TRIGGER hrm_service_attachment_no_delete;
DROP INDEX hrm_files_person;
DROP INDEX hrm_leave_evidence_request;
DROP INDEX hrm_leave_evidence_person;
DROP INDEX hrm_service_attachments_request;

ALTER TABLE hrm_files RENAME TO hrm_files_before_training;
ALTER TABLE hrm_leave_evidence_links RENAME TO hrm_leave_evidence_links_before_training;
ALTER TABLE hrm_service_request_attachments RENAME TO hrm_service_request_attachments_before_training;

CREATE TABLE hrm_files (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  record_id TEXT REFERENCES hrm_records(id),
  kind TEXT NOT NULL CHECK(kind IN ('avatar','identity','dependent','bank','tax','personal','leave_evidence','service_evidence','training_evidence')),
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
FROM hrm_files_before_training;
CREATE INDEX hrm_files_person ON hrm_files(person_id,kind,state);

CREATE TABLE hrm_leave_evidence_links (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL REFERENCES hrm_leave_requests(id),
  file_id TEXT NOT NULL UNIQUE REFERENCES hrm_files(id),
  revision_no INTEGER NOT NULL DEFAULT 1 CHECK(revision_no>0),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  uploaded_by TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO hrm_leave_evidence_links(id,leave_request_id,file_id,revision_no,person_id,uploaded_by,actor_id,created_at)
SELECT id,leave_request_id,file_id,revision_no,person_id,uploaded_by,actor_id,created_at FROM hrm_leave_evidence_links_before_training;
CREATE INDEX hrm_leave_evidence_request ON hrm_leave_evidence_links(leave_request_id,revision_no,created_at DESC);
CREATE INDEX hrm_leave_evidence_person ON hrm_leave_evidence_links(person_id,created_at DESC);

CREATE TABLE hrm_service_request_attachments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES hrm_service_requests(id),
  file_id TEXT NOT NULL UNIQUE REFERENCES hrm_files(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO hrm_service_request_attachments(id,request_id,file_id,person_id,uploaded_by,created_at)
SELECT id,request_id,file_id,person_id,uploaded_by,created_at FROM hrm_service_request_attachments_before_training;
CREATE INDEX hrm_service_attachments_request ON hrm_service_request_attachments(request_id,created_at DESC);
DROP TABLE hrm_leave_evidence_links_before_training;
DROP TABLE hrm_service_request_attachments_before_training;
DROP TABLE hrm_files_before_training;

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

CREATE TRIGGER hrm_leave_evidence_link_insert_guard
BEFORE INSERT ON hrm_leave_evidence_links
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_leave_requests r JOIN hrm_leave_policy_versions p ON p.id=r.policy_version_id
  JOIN json_each(p.rules_json) rule ON json_extract(rule.value,'$.key')=r.leave_type_key
  WHERE r.id=NEW.leave_request_id AND r.person_id=NEW.person_id AND r.state='pending_approval'
    AND r.current_revision_no=NEW.revision_no AND json_extract(rule.value,'$.evidence_required')=1
) OR NOT EXISTS(SELECT 1 FROM hrm_files f WHERE f.id=NEW.file_id AND f.person_id=NEW.person_id AND f.kind='leave_evidence' AND f.uploaded_by=NEW.uploaded_by AND f.state='quarantined')
BEGIN SELECT RAISE(ABORT,'leave_evidence_target_invalid'); END;
CREATE TRIGGER hrm_leave_evidence_link_no_update BEFORE UPDATE ON hrm_leave_evidence_links BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_leave_evidence_link_no_delete BEFORE DELETE ON hrm_leave_evidence_links BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_service_attachment_insert_guard
BEFORE INSERT ON hrm_service_request_attachments
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_service_requests r JOIN hrm_files f ON f.id=NEW.file_id
  WHERE r.id=NEW.request_id AND r.person_id=NEW.person_id AND r.state NOT IN ('resolved','cancelled')
    AND f.person_id=NEW.person_id AND f.kind='service_evidence' AND f.uploaded_by=NEW.uploaded_by AND f.state='quarantined'
)
BEGIN SELECT RAISE(ABORT,'service_attachment_target_invalid'); END;
CREATE TRIGGER hrm_service_attachment_no_update BEFORE UPDATE ON hrm_service_request_attachments BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_service_attachment_no_delete BEFORE DELETE ON hrm_service_request_attachments BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_training_courses (
  id TEXT PRIMARY KEY,
  course_code TEXT NOT NULL CHECK(length(trim(course_code)) BETWEEN 2 AND 48),
  version_no INTEGER NOT NULL CHECK(version_no>0),
  legal_entity TEXT NOT NULL CHECK(length(trim(legal_entity)) BETWEEN 1 AND 200),
  category TEXT NOT NULL CHECK(category IN ('compliance','role','professional','development','certification','other')),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 2000),
  evidence_required INTEGER NOT NULL CHECK(evidence_required IN (0,1)),
  renewal_days INTEGER CHECK(renewal_days IS NULL OR renewal_days BETWEEN 1 AND 36500),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','retired')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(legal_entity,course_code,version_no),
  CHECK(state!='active' OR (reviewed_by IS NOT NULL AND reviewed_by!=created_by AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_training_one_active_course ON hrm_training_courses(legal_entity,course_code) WHERE state='active';
CREATE INDEX hrm_training_course_visibility ON hrm_training_courses(legal_entity,state,course_code,version_no DESC);
CREATE TRIGGER hrm_training_course_identity_immutable
BEFORE UPDATE OF course_code,version_no,legal_entity,category,title,description,evidence_required,renewal_days,created_by,created_at ON hrm_training_courses
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_training_course_state_guard BEFORE UPDATE OF state ON hrm_training_courses
WHEN NOT (OLD.state=NEW.state OR OLD.state='draft' AND NEW.state='active' OR OLD.state='active' AND NEW.state='retired')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_training_course_no_delete BEFORE DELETE ON hrm_training_courses BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_training_assignments (
  id TEXT PRIMARY KEY,
  course_version_id TEXT NOT NULL REFERENCES hrm_training_courses(id),
  course_code TEXT NOT NULL,
  course_version_no INTEGER NOT NULL CHECK(course_version_no>0),
  legal_entity TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('compliance','role','professional','development','certification','other')),
  evidence_required INTEGER NOT NULL CHECK(evidence_required IN (0,1)),
  renewal_days INTEGER CHECK(renewal_days IS NULL OR renewal_days BETWEEN 1 AND 36500),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  due_on TEXT CHECK(due_on IS NULL OR length(due_on)=10),
  renew_by TEXT CHECK(renew_by IS NULL OR length(renew_by)=10),
  state TEXT NOT NULL DEFAULT 'assigned' CHECK(state IN ('assigned','submitted','approved','declined','cancelled')),
  employee_note TEXT NOT NULL DEFAULT '' CHECK(length(employee_note)<=1000),
  submitted_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT NOT NULL DEFAULT '' CHECK(length(review_reason)<=1000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(state NOT IN ('submitted','approved') OR submitted_at IS NOT NULL),
  CHECK(state!='approved' OR (reviewed_by IS NOT NULL AND reviewed_by!=created_by AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_training_one_open_assignment ON hrm_training_assignments(person_id,course_code) WHERE state IN ('assigned','submitted');
CREATE INDEX hrm_training_assignment_queue ON hrm_training_assignments(legal_entity,state,due_on,created_at DESC);
CREATE INDEX hrm_training_assignment_person ON hrm_training_assignments(person_id,created_at DESC);
CREATE TRIGGER hrm_training_assignment_identity_immutable
BEFORE UPDATE OF course_version_id,course_code,course_version_no,legal_entity,category,evidence_required,renewal_days,person_id,employment_id,due_on,created_by,created_at ON hrm_training_assignments
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_training_assignment_state_guard BEFORE UPDATE OF state ON hrm_training_assignments
WHEN NOT (OLD.state=NEW.state OR OLD.state='assigned' AND NEW.state IN ('submitted','cancelled') OR OLD.state='submitted' AND NEW.state IN ('approved','declined','cancelled'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_training_assignment_no_delete BEFORE DELETE ON hrm_training_assignments BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_training_evidence_links (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES hrm_training_assignments(id),
  file_id TEXT NOT NULL UNIQUE REFERENCES hrm_files(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_training_evidence_assignment ON hrm_training_evidence_links(assignment_id,created_at DESC);
CREATE TRIGGER hrm_training_evidence_insert_guard BEFORE INSERT ON hrm_training_evidence_links
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_training_assignments a JOIN hrm_files f ON f.id=NEW.file_id
  WHERE a.id=NEW.assignment_id AND a.person_id=NEW.person_id AND a.state IN ('assigned','submitted')
    AND f.person_id=NEW.person_id AND f.kind='training_evidence' AND f.uploaded_by=NEW.uploaded_by AND f.state='quarantined'
)
BEGIN SELECT RAISE(ABORT,'training_evidence_target_invalid'); END;
CREATE TRIGGER hrm_training_evidence_no_update BEFORE UPDATE ON hrm_training_evidence_links BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_training_evidence_no_delete BEFORE DELETE ON hrm_training_evidence_links BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_training_events (
  id TEXT PRIMARY KEY,
  course_version_id TEXT REFERENCES hrm_training_courses(id),
  assignment_id TEXT REFERENCES hrm_training_assignments(id),
  evidence_id TEXT REFERENCES hrm_training_evidence_links(id),
  person_id TEXT REFERENCES hrm_people(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('course_created','course_activated','course_retired','assignment_created','assignment_submitted','assignment_approved','assignment_declined','assignment_cancelled','evidence_uploaded','evidence_reviewed')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_training_events_assignment ON hrm_training_events(assignment_id,created_at,id);
CREATE INDEX hrm_training_events_course ON hrm_training_events(course_version_id,created_at,id);
CREATE TRIGGER hrm_training_event_no_update BEFORE UPDATE ON hrm_training_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_training_event_no_delete BEFORE DELETE ON hrm_training_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

-- Expand append-only retention deletion history for the new evidence category.
DROP TRIGGER hrm_file_deletion_created;
DROP TRIGGER hrm_file_deletion_changed;
DROP TRIGGER hrm_file_deletion_identity_immutable;
DROP TRIGGER hrm_file_deletion_no_delete;
DROP INDEX hrm_file_deletion_once;
DROP INDEX hrm_file_deletion_queue;
ALTER TABLE hrm_file_deletion_requests RENAME TO hrm_file_deletion_requests_before_training;
CREATE TABLE hrm_file_deletion_requests (
  id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL CHECK(source_table IN ('hrm_files','hrm_legal_files')),
  source_file_id TEXT NOT NULL,
  person_id TEXT REFERENCES hrm_people(id),
  category TEXT NOT NULL CHECK(category IN ('profile_photo','identity','dependent','banking','tax','personal','legal_source','legal_evidence','coi_evidence','onboarding_evidence','leave_evidence','service_evidence','training_evidence')),
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
SELECT id,source_table,source_file_id,person_id,category,object_key_snapshot,checksum_snapshot,file_version,policy_version_id,policy_version,retention_due_on,state,request_reason,requested_by,requested_at,reviewed_by,reviewed_at,review_reason,block_reason,completed_by,completed_at,completion_detail,version,actor_id,created_at,updated_at FROM hrm_file_deletion_requests_before_training;
DROP TABLE hrm_file_deletion_requests_before_training;
CREATE UNIQUE INDEX hrm_file_deletion_once ON hrm_file_deletion_requests(source_table,source_file_id) WHERE state IN ('pending_review','approved','deleting','retryable','completed');
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
CREATE TRIGGER hrm_file_deletion_no_delete BEFORE DELETE ON hrm_file_deletion_requests BEGIN SELECT RAISE(ABORT,'immutable_file_deletion_request'); END;

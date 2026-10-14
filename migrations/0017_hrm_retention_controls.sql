-- Configurable category retention, explicit legal holds and approved private-file deletion.
-- No retention duration is seeded; production remains gated until an owner-reviewed version exists.
ALTER TABLE hrm_files ADD COLUMN retention_actor_id TEXT;
ALTER TABLE hrm_files ADD COLUMN object_deleted_at TEXT;
ALTER TABLE hrm_legal_files ADD COLUMN object_deleted_at TEXT;

CREATE TABLE hrm_retention_policy_versions (
  id TEXT PRIMARY KEY,
  version_number INTEGER NOT NULL UNIQUE CHECK(version_number>0),
  rules_json TEXT NOT NULL CHECK(json_valid(rules_json) AND json_type(rules_json)='array'),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','reviewed','active','retired','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  activated_by TEXT,
  activated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(reviewed_by IS NULL OR reviewed_by!=created_by),
  CHECK(activated_by IS NULL OR (activated_by!=created_by AND reviewed_by IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_one_active_retention_policy ON hrm_retention_policy_versions(state) WHERE state='active';
CREATE INDEX hrm_retention_policy_history ON hrm_retention_policy_versions(version_number DESC,state);

CREATE TABLE hrm_legal_holds (
  id TEXT PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK(scope_kind IN ('person','file')),
  person_id TEXT REFERENCES hrm_people(id),
  category TEXT,
  source_table TEXT CHECK(source_table IN ('hrm_files','hrm_legal_files')),
  target_file_id TEXT,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','released')),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
  placed_by TEXT NOT NULL,
  placed_at TEXT NOT NULL,
  released_by TEXT,
  released_at TEXT,
  release_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((scope_kind='person' AND person_id IS NOT NULL AND category IS NOT NULL AND source_table IS NULL AND target_file_id IS NULL) OR
        (scope_kind='file' AND source_table IS NOT NULL AND target_file_id IS NOT NULL)),
  CHECK((state='active' AND released_by IS NULL AND released_at IS NULL AND release_reason IS NULL) OR
        (state='released' AND released_by IS NOT NULL AND released_at IS NOT NULL AND release_reason IS NOT NULL)),
  CHECK(released_by IS NULL OR released_by!=placed_by)
);
CREATE UNIQUE INDEX hrm_active_person_hold ON hrm_legal_holds(person_id,category) WHERE state='active' AND scope_kind='person';
CREATE UNIQUE INDEX hrm_active_file_hold ON hrm_legal_holds(source_table,target_file_id) WHERE state='active' AND scope_kind='file';
CREATE INDEX hrm_legal_holds_person ON hrm_legal_holds(person_id,state,created_at DESC);

CREATE TABLE hrm_file_deletion_requests (
  id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL CHECK(source_table IN ('hrm_files','hrm_legal_files')),
  source_file_id TEXT NOT NULL,
  person_id TEXT REFERENCES hrm_people(id),
  category TEXT NOT NULL CHECK(category IN ('profile_photo','identity','dependent','banking','tax','personal','legal_source','legal_evidence','coi_evidence','onboarding_evidence')),
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
CREATE UNIQUE INDEX hrm_file_deletion_once ON hrm_file_deletion_requests(source_table,source_file_id)
  WHERE state IN ('pending_review','approved','deleting','retryable','completed');
CREATE INDEX hrm_file_deletion_queue ON hrm_file_deletion_requests(state,retention_due_on,created_at);

CREATE TRIGGER hrm_retention_policy_created AFTER INSERT ON hrm_retention_policy_versions BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,target_id,detail,created_at)
  VALUES(NEW.actor_id,'retention_policy_created',NEW.id,json_object('version_number',NEW.version_number,'state',NEW.state),NEW.created_at);
END;
CREATE TRIGGER hrm_retention_policy_changed AFTER UPDATE ON hrm_retention_policy_versions BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,target_id,detail,created_at)
  VALUES(NEW.actor_id,'retention_policy_'||NEW.state,NEW.id,json_object('version_number',NEW.version_number,'version',NEW.version),NEW.updated_at);
END;
CREATE TRIGGER hrm_retention_policy_content_immutable BEFORE UPDATE ON hrm_retention_policy_versions
WHEN OLD.version_number!=NEW.version_number OR OLD.rules_json!=NEW.rules_json OR OLD.created_by!=NEW.created_by OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_retention_policy_version'); END;
CREATE TRIGGER hrm_retention_policy_no_delete BEFORE DELETE ON hrm_retention_policy_versions BEGIN
  SELECT RAISE(ABORT,'immutable_retention_policy_version');
END;

CREATE TRIGGER hrm_legal_hold_created AFTER INSERT ON hrm_legal_holds BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'legal_hold_placed',NEW.person_id,NEW.id,json_object('scope_kind',NEW.scope_kind,'category',NEW.category,'source_table',NEW.source_table,'target_file_id',NEW.target_file_id,'reason',NEW.reason),NEW.placed_at);
END;
CREATE TRIGGER hrm_legal_hold_changed AFTER UPDATE ON hrm_legal_holds BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'legal_hold_'||NEW.state,NEW.person_id,NEW.id,json_object('version',NEW.version,'release_reason',NEW.release_reason),NEW.updated_at);
END;
CREATE TRIGGER hrm_legal_hold_identity_immutable BEFORE UPDATE ON hrm_legal_holds
WHEN OLD.scope_kind!=NEW.scope_kind OR OLD.person_id IS NOT NEW.person_id OR OLD.category IS NOT NEW.category OR OLD.source_table IS NOT NEW.source_table OR OLD.target_file_id IS NOT NEW.target_file_id OR OLD.reason!=NEW.reason OR OLD.placed_by!=NEW.placed_by OR OLD.placed_at!=NEW.placed_at OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_legal_hold'); END;
CREATE TRIGGER hrm_legal_hold_no_delete BEFORE DELETE ON hrm_legal_holds BEGIN
  SELECT RAISE(ABORT,'immutable_legal_hold');
END;

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
CREATE TRIGGER hrm_retention_legal_file_hold_changed AFTER UPDATE OF legal_hold ON hrm_legal_files
WHEN OLD.legal_hold!=NEW.legal_hold BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,CASE WHEN NEW.legal_hold=1 THEN 'legal_file_hold_applied' ELSE 'legal_file_hold_released' END,NEW.person_id,NEW.id,json_object('kind',NEW.kind,'legal_hold',NEW.legal_hold),NEW.updated_at);
END;
CREATE TRIGGER hrm_retention_legal_file_created_held AFTER INSERT ON hrm_legal_files
WHEN NEW.legal_hold=1 BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'legal_file_created_under_hold',NEW.person_id,NEW.id,json_object('kind',NEW.kind,'legal_hold',1),NEW.created_at);
END;

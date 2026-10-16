-- Structured profile retention is configurable and has no seeded rule or deletion.
CREATE TABLE hrm_structured_retention_policy_versions (
  id TEXT PRIMARY KEY,
  legal_entity TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK(version_number>0),
  rules_json TEXT NOT NULL CHECK(json_valid(rules_json) AND json_type(rules_json)='array' AND json_array_length(rules_json)=6),
  state TEXT NOT NULL CHECK(state IN ('draft','reviewed','active','retired','rejected')),
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
  UNIQUE(legal_entity,version_number),
  CHECK(reviewed_by IS NULL OR reviewed_by!=created_by),
  CHECK(activated_by IS NULL OR activated_by!=created_by),
  CHECK(state NOT IN ('reviewed','active','retired','rejected') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL AND length(trim(review_reason))>0)),
  CHECK(state NOT IN ('active','retired') OR (activated_by IS NOT NULL AND activated_at IS NOT NULL))
);
CREATE INDEX hrm_structured_retention_policy_history ON hrm_structured_retention_policy_versions(legal_entity,version_number DESC,state);
CREATE UNIQUE INDEX hrm_structured_retention_one_active ON hrm_structured_retention_policy_versions(legal_entity) WHERE state='active';
CREATE TRIGGER hrm_structured_retention_rules_valid BEFORE INSERT ON hrm_structured_retention_policy_versions
WHEN EXISTS(
  SELECT 1 FROM json_each(NEW.rules_json) rule
  WHERE COALESCE(json_type(rule.value),'')!='object'
    OR (SELECT COUNT(*) FROM json_each(rule.value))!=4
    OR COALESCE(json_type(rule.value,'$.kind'),'') NOT IN ('text')
    OR json_extract(rule.value,'$.kind') NOT IN ('contact','personal','identity','dependent','bank','tax')
    OR COALESCE(json_type(rule.value,'$.retention_days'),'missing') NOT IN ('null','integer')
    OR (json_type(rule.value,'$.retention_days')='integer' AND (json_extract(rule.value,'$.retention_days')<1 OR json_extract(rule.value,'$.retention_days')>36500))
    OR COALESCE(json_type(rule.value,'$.retention_anchor'),'missing') NOT IN ('null','text')
    OR (json_type(rule.value,'$.retention_days')='null' AND json_type(rule.value,'$.retention_anchor')!='null')
    OR (json_type(rule.value,'$.retention_days')='integer' AND (json_type(rule.value,'$.retention_anchor')!='text' OR json_extract(rule.value,'$.retention_anchor') NOT IN ('record_created','effective_to')))
    OR COALESCE(json_type(rule.value,'$.basis'),'')!='text'
    OR length(trim(json_extract(rule.value,'$.basis'))) NOT BETWEEN 1 AND 1000
) OR (SELECT COUNT(DISTINCT json_extract(rule.value,'$.kind')) FROM json_each(NEW.rules_json) rule)!=6
BEGIN SELECT RAISE(ABORT,'structured_retention_rules_invalid'); END;
CREATE TRIGGER hrm_structured_retention_definition_immutable
BEFORE UPDATE OF legal_entity,version_number,rules_json,created_by,created_at ON hrm_structured_retention_policy_versions
BEGIN SELECT RAISE(ABORT,'immutable_structured_retention_policy'); END;
CREATE TRIGGER hrm_structured_retention_state_guard BEFORE UPDATE OF state ON hrm_structured_retention_policy_versions
WHEN NOT (OLD.state=NEW.state OR (OLD.state='draft' AND NEW.state IN ('reviewed','rejected')) OR (OLD.state='reviewed' AND NEW.state='active') OR (OLD.state='active' AND NEW.state='retired'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_structured_retention_no_delete BEFORE DELETE ON hrm_structured_retention_policy_versions BEGIN
  SELECT RAISE(ABORT,'immutable_structured_retention_policy');
END;

CREATE TABLE hrm_structured_disposition_requests (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL REFERENCES hrm_records(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  record_kind TEXT NOT NULL CHECK(record_kind IN ('contact','personal','identity','dependent','bank','tax')),
  record_version INTEGER NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES hrm_structured_retention_policy_versions(id),
  policy_version INTEGER NOT NULL,
  retention_due_on TEXT NOT NULL CHECK(length(retention_due_on)=10),
  state TEXT NOT NULL CHECK(state IN ('pending_review','approved','executing','completed','rejected','blocked')),
  request_reason TEXT NOT NULL CHECK(length(trim(request_reason)) BETWEEN 1 AND 500),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  completed_by TEXT,
  completed_at TEXT,
  completion_detail TEXT,
  block_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(reviewed_by IS NULL OR reviewed_by!=requested_by),
  CHECK(completed_by IS NULL OR (completed_by!=requested_by AND completed_by!=reviewed_by)),
  CHECK(state!='completed' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_structured_disposition_once ON hrm_structured_disposition_requests(record_id)
  WHERE state IN ('pending_review','approved','executing','completed');
CREATE INDEX hrm_structured_disposition_queue ON hrm_structured_disposition_requests(state,retention_due_on,created_at DESC);
CREATE INDEX hrm_structured_disposition_person ON hrm_structured_disposition_requests(person_id,created_at DESC);
CREATE TABLE hrm_structured_disposition_guards (
  request_id TEXT PRIMARY KEY REFERENCES hrm_structured_disposition_requests(id),
  record_id TEXT NOT NULL REFERENCES hrm_records(id),
  valid INTEGER NOT NULL CHECK(valid=1),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE hrm_structured_disposition_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES hrm_structured_disposition_requests(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('created','approved','rejected','executing','completed','blocked')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_structured_disposition_events_order ON hrm_structured_disposition_events(request_id,created_at,id);
CREATE TRIGGER hrm_structured_disposition_state_guard BEFORE UPDATE OF state ON hrm_structured_disposition_requests
WHEN NOT (OLD.state=NEW.state OR (OLD.state='pending_review' AND NEW.state IN ('approved','rejected','blocked')) OR (OLD.state='approved' AND NEW.state IN ('executing','blocked')) OR (OLD.state='executing' AND NEW.state='completed'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_structured_disposition_identity_immutable BEFORE UPDATE ON hrm_structured_disposition_requests
WHEN OLD.record_id!=NEW.record_id OR OLD.person_id!=NEW.person_id OR OLD.record_kind!=NEW.record_kind OR OLD.record_version!=NEW.record_version OR OLD.policy_version_id!=NEW.policy_version_id OR OLD.policy_version!=NEW.policy_version OR OLD.retention_due_on!=NEW.retention_due_on OR OLD.request_reason!=NEW.request_reason OR OLD.requested_by!=NEW.requested_by OR OLD.requested_at!=NEW.requested_at OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_structured_disposition_request'); END;
CREATE TRIGGER hrm_structured_disposition_no_delete BEFORE DELETE ON hrm_structured_disposition_requests BEGIN
  SELECT RAISE(ABORT,'immutable_structured_disposition_request');
END;
CREATE TRIGGER hrm_structured_disposition_created AFTER INSERT ON hrm_structured_disposition_requests BEGIN
  INSERT INTO hrm_structured_disposition_events(id,request_id,event_type,detail_json,actor_id,created_at)
  VALUES('strdisp_evt_'||lower(hex(randomblob(16))),NEW.id,'created',json_object('record_kind',NEW.record_kind,'policy_version',NEW.policy_version,'retention_due_on',NEW.retention_due_on),NEW.requested_by,NEW.created_at);
END;
CREATE TRIGGER hrm_structured_disposition_changed AFTER UPDATE OF state ON hrm_structured_disposition_requests
WHEN OLD.state!=NEW.state BEGIN
  INSERT INTO hrm_structured_disposition_events(id,request_id,event_type,detail_json,actor_id,created_at)
  VALUES('strdisp_evt_'||lower(hex(randomblob(16))),NEW.id,NEW.state,json_object('version',NEW.version),NEW.actor_id,NEW.updated_at);
END;
CREATE TRIGGER hrm_structured_disposition_event_no_update BEFORE UPDATE ON hrm_structured_disposition_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_structured_disposition_event_no_delete BEFORE DELETE ON hrm_structured_disposition_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;

-- Existing immutable history can be purged only by the separately reviewed disposition executor.
DROP TRIGGER hrm_record_history_no_delete;
CREATE TRIGGER hrm_record_history_disposition_guard BEFORE DELETE ON hrm_record_history
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_structured_disposition_guards g JOIN hrm_structured_disposition_requests r ON r.id=g.request_id
  WHERE g.record_id=OLD.record_id AND g.valid=1 AND r.state='executing'
)
BEGIN SELECT RAISE(ABORT,'structured_disposition_guard_required'); END;
CREATE TRIGGER hrm_record_disposition_lock BEFORE UPDATE ON hrm_records
WHEN EXISTS(SELECT 1 FROM hrm_structured_disposition_requests r WHERE r.record_id=OLD.id AND r.state IN ('pending_review','approved','executing','completed'))
 AND NOT EXISTS(SELECT 1 FROM hrm_structured_disposition_guards g JOIN hrm_structured_disposition_requests r ON r.id=g.request_id WHERE g.record_id=OLD.id AND g.valid=1 AND r.state='executing')
BEGIN SELECT RAISE(ABORT,'structured_disposition_in_progress'); END;
CREATE TRIGGER hrm_record_history_insert_disposition_guard BEFORE INSERT ON hrm_record_history
WHEN EXISTS(SELECT 1 FROM hrm_structured_disposition_requests r WHERE r.record_id=NEW.record_id AND r.state IN ('pending_review','approved','executing','completed'))
 AND NOT (NEW.data='{}' AND EXISTS(SELECT 1 FROM hrm_structured_disposition_guards g JOIN hrm_structured_disposition_requests r ON r.id=g.request_id WHERE g.record_id=NEW.record_id AND g.valid=1 AND r.state='executing'))
BEGIN SELECT RAISE(ABORT,'structured_disposition_in_progress'); END;
CREATE TRIGGER hrm_change_request_disposition_insert_lock BEFORE INSERT ON hrm_change_requests
WHEN EXISTS(SELECT 1 FROM hrm_structured_disposition_requests r WHERE r.record_id=NEW.record_id AND r.state IN ('pending_review','approved','executing','completed'))
BEGIN SELECT RAISE(ABORT,'structured_disposition_in_progress'); END;
CREATE TRIGGER hrm_change_request_disposition_update_guard BEFORE UPDATE OF data ON hrm_change_requests
WHEN OLD.data!=NEW.data AND NOT EXISTS(
  SELECT 1 FROM hrm_structured_disposition_guards g JOIN hrm_structured_disposition_requests r ON r.id=g.request_id
  WHERE g.record_id=OLD.record_id AND g.valid=1 AND r.state='executing'
)
BEGIN SELECT RAISE(ABORT,'structured_disposition_guard_required'); END;
CREATE TRIGGER hrm_file_record_disposition_insert_guard BEFORE INSERT ON hrm_files
WHEN NEW.record_id IS NOT NULL AND EXISTS(SELECT 1 FROM hrm_structured_disposition_requests r WHERE r.record_id=NEW.record_id AND r.state IN ('pending_review','approved','executing','completed'))
BEGIN SELECT RAISE(ABORT,'structured_disposition_in_progress'); END;

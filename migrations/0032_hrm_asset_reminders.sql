-- Reminder schedules require an owner-approved version; no offsets or recipients are seeded.
CREATE TABLE hrm_asset_reminder_policy_versions (
  id TEXT PRIMARY KEY,
  legal_entity TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK(version_number>0),
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  days_before_due_json TEXT NOT NULL CHECK(json_valid(days_before_due_json) AND json_type(days_before_due_json)='array' AND json_array_length(days_before_due_json) BETWEEN 1 AND 12),
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
CREATE INDEX hrm_asset_reminder_policy_state ON hrm_asset_reminder_policy_versions(legal_entity,state,version_number DESC);
CREATE UNIQUE INDEX hrm_asset_reminder_one_active ON hrm_asset_reminder_policy_versions(legal_entity) WHERE state='active';
CREATE TRIGGER hrm_asset_reminder_policy_offsets_valid BEFORE INSERT ON hrm_asset_reminder_policy_versions
WHEN EXISTS(
  SELECT 1 FROM json_each(NEW.days_before_due_json) day
  WHERE day.type!='integer' OR day.value < -365 OR day.value > 365
) OR (SELECT COUNT(*) FROM json_each(NEW.days_before_due_json))!=(
  SELECT COUNT(DISTINCT day.value) FROM json_each(NEW.days_before_due_json) day
)
BEGIN SELECT RAISE(ABORT,'asset_reminder_policy_offsets_invalid'); END;
CREATE TRIGGER hrm_asset_reminder_policy_definition_immutable
BEFORE UPDATE OF legal_entity,version_number,title_en,title_vi,days_before_due_json,created_by,created_at ON hrm_asset_reminder_policy_versions
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_asset_reminder_policy_no_delete BEFORE DELETE ON hrm_asset_reminder_policy_versions BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_asset_reminder_policy_state_guard BEFORE UPDATE OF state ON hrm_asset_reminder_policy_versions
WHEN NOT (OLD.state=NEW.state OR (OLD.state='draft' AND NEW.state IN ('reviewed','rejected')) OR (OLD.state='reviewed' AND NEW.state='active') OR (OLD.state='active' AND NEW.state='retired'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;

CREATE TABLE hrm_asset_reminders (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES hrm_asset_assignments(id),
  asset_id TEXT NOT NULL REFERENCES hrm_assets(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  recipient_user_id TEXT NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES hrm_asset_reminder_policy_versions(id),
  due_on TEXT NOT NULL CHECK(length(due_on)=10),
  days_before_due INTEGER NOT NULL CHECK(days_before_due BETWEEN -365 AND 365),
  event_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'unread' CHECK(state IN ('unread','read','resolved')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_by TEXT,
  read_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK((state='unread' AND read_by IS NULL AND read_at IS NULL) OR (state IN ('read','resolved') AND read_by IS NOT NULL AND read_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_asset_reminder_unique_event ON hrm_asset_reminders(assignment_id,recipient_user_id,due_on,days_before_due);
CREATE INDEX hrm_asset_reminder_recipient ON hrm_asset_reminders(recipient_user_id,state,created_at DESC);
CREATE INDEX hrm_asset_reminder_assignment ON hrm_asset_reminders(assignment_id,state,due_on);

CREATE TABLE hrm_asset_reminder_events (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES hrm_asset_reminders(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('created','read','resolved')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_asset_reminder_events_order ON hrm_asset_reminder_events(reminder_id,created_at,id);
CREATE TRIGGER hrm_asset_reminder_insert_guard BEFORE INSERT ON hrm_asset_reminders
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_asset_assignments x JOIN hrm_assets a ON a.id=x.asset_id JOIN hrm_people p ON p.id=x.person_id
  JOIN hrm_asset_reminder_policy_versions v ON v.id=NEW.policy_version_id AND v.legal_entity=a.legal_entity
  WHERE x.id=NEW.assignment_id AND x.asset_id=NEW.asset_id AND x.person_id=NEW.person_id
    AND x.state IN ('assigned','return_requested') AND x.expected_return_on=NEW.due_on
    AND v.state='active' AND EXISTS(SELECT 1 FROM json_each(v.days_before_due_json) day WHERE day.type='integer' AND day.value=NEW.days_before_due)
    AND EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id
      WHERE m.user_id=NEW.recipient_user_id AND m.enabled=1
        AND ((r.role IN ('hrm_officer','hrm_admin') AND x.offered_by=NEW.recipient_user_id)
          OR (r.role='employee' AND p.user_id=NEW.recipient_user_id)))
)
BEGIN SELECT RAISE(ABORT,'asset_reminder_target_invalid'); END;
CREATE TRIGGER hrm_asset_reminder_identity_immutable BEFORE UPDATE ON hrm_asset_reminders
WHEN OLD.assignment_id!=NEW.assignment_id OR OLD.asset_id!=NEW.asset_id OR OLD.person_id!=NEW.person_id OR OLD.recipient_user_id!=NEW.recipient_user_id OR OLD.policy_version_id!=NEW.policy_version_id OR OLD.due_on!=NEW.due_on OR OLD.days_before_due!=NEW.days_before_due OR OLD.event_key!=NEW.event_key OR OLD.created_by!=NEW.created_by OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_asset_reminder'); END;
CREATE TRIGGER hrm_asset_reminder_state_guard BEFORE UPDATE OF state ON hrm_asset_reminders
WHEN NOT (OLD.state=NEW.state OR (OLD.state='unread' AND NEW.state IN ('read','resolved')))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_asset_reminder_no_delete BEFORE DELETE ON hrm_asset_reminders BEGIN
  SELECT RAISE(ABORT,'immutable_asset_reminder');
END;
CREATE TRIGGER hrm_asset_reminder_created AFTER INSERT ON hrm_asset_reminders BEGIN
  INSERT INTO hrm_asset_reminder_events(id,reminder_id,event_type,detail_json,actor_id,created_at)
  VALUES('assetrem_evt_'||lower(hex(randomblob(16))),NEW.id,'created',json_object('assignment_id',NEW.assignment_id,'due_on',NEW.due_on,'days_before_due',NEW.days_before_due),NEW.created_by,NEW.created_at);
END;
CREATE TRIGGER hrm_asset_reminder_changed AFTER UPDATE OF state ON hrm_asset_reminders
WHEN OLD.state!=NEW.state BEGIN
  INSERT INTO hrm_asset_reminder_events(id,reminder_id,event_type,detail_json,actor_id,created_at)
  VALUES('assetrem_evt_'||lower(hex(randomblob(16))),NEW.id,NEW.state,json_object('version',NEW.version),COALESCE(NEW.read_by,NEW.created_by),NEW.updated_at);
END;
CREATE TRIGGER hrm_asset_reminder_no_event_update BEFORE UPDATE ON hrm_asset_reminder_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_asset_reminder_no_event_delete BEFORE DELETE ON hrm_asset_reminder_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_asset_reminders_resolve_on_assignment_close
AFTER UPDATE OF state ON hrm_asset_assignments
WHEN OLD.state IN ('assigned','return_requested') AND NEW.state IN ('returned','cancelled') BEGIN
  UPDATE hrm_asset_reminders SET state='resolved',version=version+1,read_by='system:hrm_asset_reminder',read_at=NEW.updated_at,updated_at=NEW.updated_at
  WHERE assignment_id=NEW.id AND state='unread';
END;

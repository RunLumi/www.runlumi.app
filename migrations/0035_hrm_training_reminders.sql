-- Training deadline reminders are versioned and have no seeded policy or offsets.
CREATE TABLE hrm_training_reminder_policy_versions (
  id TEXT PRIMARY KEY,
  policy_ref TEXT NOT NULL UNIQUE,
  legal_entity TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK(version_number>0),
  title_en TEXT NOT NULL CHECK(length(trim(title_en)) BETWEEN 1 AND 120),
  title_vi TEXT NOT NULL CHECK(length(trim(title_vi)) BETWEEN 1 AND 120),
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
CREATE INDEX hrm_training_reminder_policy_state ON hrm_training_reminder_policy_versions(legal_entity,state,version_number DESC);
CREATE UNIQUE INDEX hrm_training_reminder_one_active ON hrm_training_reminder_policy_versions(legal_entity) WHERE state='active';
CREATE TRIGGER hrm_training_reminder_offsets_valid BEFORE INSERT ON hrm_training_reminder_policy_versions
WHEN EXISTS(
  SELECT 1 FROM json_each(NEW.days_before_due_json) day
  WHERE day.type!='integer' OR day.value < -365 OR day.value > 365
) OR (SELECT COUNT(*) FROM json_each(NEW.days_before_due_json))!=(SELECT COUNT(DISTINCT day.value) FROM json_each(NEW.days_before_due_json) day)
BEGIN SELECT RAISE(ABORT,'training_reminder_offsets_invalid'); END;
CREATE TRIGGER hrm_training_reminder_policy_definition_immutable
BEFORE UPDATE OF legal_entity,version_number,title_en,title_vi,days_before_due_json,created_by,created_at ON hrm_training_reminder_policy_versions
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_training_reminder_policy_state_guard BEFORE UPDATE OF state ON hrm_training_reminder_policy_versions
WHEN NOT (OLD.state=NEW.state OR (OLD.state='draft' AND NEW.state IN ('reviewed','rejected')) OR (OLD.state='reviewed' AND NEW.state='active') OR (OLD.state='active' AND NEW.state='retired'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_training_reminder_policy_no_delete BEFORE DELETE ON hrm_training_reminder_policy_versions BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;

CREATE TABLE hrm_training_reminders (
  id TEXT PRIMARY KEY,
  reminder_ref TEXT NOT NULL UNIQUE,
  assignment_id TEXT NOT NULL REFERENCES hrm_training_assignments(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  recipient_user_id TEXT NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES hrm_training_reminder_policy_versions(id),
  deadline_kind TEXT NOT NULL CHECK(deadline_kind IN ('completion','renewal')),
  due_on TEXT NOT NULL CHECK(length(due_on)=10),
  days_before_due INTEGER NOT NULL CHECK(days_before_due BETWEEN -365 AND 365),
  event_key TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'unread' CHECK(state IN ('unread','read','resolved')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_by TEXT,
  read_at TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK((state='unread' AND read_by IS NULL AND read_at IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (state='read' AND read_by IS NOT NULL AND read_at IS NOT NULL AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (state='resolved' AND read_by IS NULL AND read_at IS NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  UNIQUE(assignment_id,recipient_user_id,deadline_kind,due_on,days_before_due)
);
CREATE INDEX hrm_training_reminder_inbox ON hrm_training_reminders(recipient_user_id,state,created_at DESC);
CREATE INDEX hrm_training_reminder_assignment ON hrm_training_reminders(assignment_id,state,due_on);

CREATE TABLE hrm_training_reminder_events (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL REFERENCES hrm_training_reminders(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('created','read','resolved')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_training_reminder_events_order ON hrm_training_reminder_events(reminder_id,created_at,id);

CREATE TABLE hrm_training_reminder_policy_events (
  id TEXT PRIMARY KEY,
  policy_version_id TEXT NOT NULL REFERENCES hrm_training_reminder_policy_versions(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('created','reviewed','rejected','activated','retired')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_training_reminder_policy_events_order ON hrm_training_reminder_policy_events(policy_version_id,created_at,id);
CREATE TRIGGER hrm_training_reminder_policy_created AFTER INSERT ON hrm_training_reminder_policy_versions BEGIN
  INSERT INTO hrm_training_reminder_policy_events(id,policy_version_id,event_type,detail_json,actor_id,created_at)
  VALUES('trnrem_policy_evt_'||lower(hex(randomblob(16))),NEW.id,'created',json_object('legal_entity',NEW.legal_entity,'version_number',NEW.version_number),NEW.created_by,NEW.created_at);
  INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at)
  VALUES(NEW.created_by,'hrm_training_reminder_policy_created',NEW.id,json_object('legal_entity',NEW.legal_entity,'version_number',NEW.version_number),NEW.created_at);
END;
CREATE TRIGGER hrm_training_reminder_policy_state_changed AFTER UPDATE OF state ON hrm_training_reminder_policy_versions
WHEN OLD.state!=NEW.state BEGIN
  INSERT INTO hrm_training_reminder_policy_events(id,policy_version_id,event_type,detail_json,actor_id,created_at)
  VALUES('trnrem_policy_evt_'||lower(hex(randomblob(16))),NEW.id,CASE NEW.state WHEN 'reviewed' THEN 'reviewed' WHEN 'rejected' THEN 'rejected' WHEN 'active' THEN 'activated' ELSE 'retired' END,json_object('version',NEW.version),NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at)
  VALUES(NEW.actor_id,'hrm_training_reminder_policy_state_changed',NEW.id,json_object('state',NEW.state,'version',NEW.version),NEW.updated_at);
END;
CREATE TRIGGER hrm_training_reminder_policy_event_no_update BEFORE UPDATE ON hrm_training_reminder_policy_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_training_reminder_policy_event_no_delete BEFORE DELETE ON hrm_training_reminder_policy_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;

CREATE TRIGGER hrm_training_reminder_insert_guard BEFORE INSERT ON hrm_training_reminders
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_training_assignments a
  JOIN hrm_training_reminder_policy_versions v ON v.id=NEW.policy_version_id AND v.legal_entity=a.legal_entity AND v.state='active'
  JOIN hrm_people p ON p.id=a.person_id AND p.id=NEW.person_id
  JOIN hrm_employments e ON e.id=a.employment_id AND e.person_id=a.person_id AND e.status IN ('probation','active','notice')
  WHERE a.id=NEW.assignment_id
    AND (e.started_on IS NULL OR e.started_on<=date('now','+7 hours'))
    AND (e.ended_on IS NULL OR e.ended_on>date('now','+7 hours'))
    AND EXISTS(SELECT 1 FROM json_each(v.days_before_due_json) day WHERE day.type='integer' AND day.value=NEW.days_before_due)
    AND ((NEW.deadline_kind='completion' AND a.state IN ('assigned','submitted') AND a.due_on=NEW.due_on)
      OR (NEW.deadline_kind='renewal' AND a.state='approved' AND a.renew_by=NEW.due_on))
    AND EXISTS(SELECT 1 FROM workspace_members m JOIN workspace_roles r ON r.user_id=m.user_id
      WHERE m.user_id=NEW.recipient_user_id AND m.enabled=1
        AND ((r.role='employee' AND p.user_id=NEW.recipient_user_id)
          OR (r.role IN ('hrm_officer','hrm_admin') AND a.created_by=NEW.recipient_user_id)))
)
BEGIN SELECT RAISE(ABORT,'training_reminder_target_invalid'); END;
CREATE TRIGGER hrm_training_reminder_identity_immutable BEFORE UPDATE ON hrm_training_reminders
WHEN OLD.reminder_ref!=NEW.reminder_ref OR OLD.assignment_id!=NEW.assignment_id OR OLD.person_id!=NEW.person_id OR OLD.recipient_user_id!=NEW.recipient_user_id OR OLD.policy_version_id!=NEW.policy_version_id OR OLD.deadline_kind!=NEW.deadline_kind OR OLD.due_on!=NEW.due_on OR OLD.days_before_due!=NEW.days_before_due OR OLD.event_key!=NEW.event_key OR OLD.created_by!=NEW.created_by OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_training_reminder'); END;
CREATE TRIGGER hrm_training_reminder_state_guard BEFORE UPDATE OF state ON hrm_training_reminders
WHEN NOT (OLD.state=NEW.state OR (OLD.state='unread' AND NEW.state IN ('read','resolved')))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_training_reminder_no_delete BEFORE DELETE ON hrm_training_reminders BEGIN
  SELECT RAISE(ABORT,'immutable_training_reminder');
END;
CREATE TRIGGER hrm_training_reminder_created AFTER INSERT ON hrm_training_reminders BEGIN
  INSERT INTO hrm_training_reminder_events(id,reminder_id,event_type,detail_json,actor_id,created_at)
  VALUES('trnrem_evt_'||lower(hex(randomblob(16))),NEW.id,'created',json_object('deadline_kind',NEW.deadline_kind,'due_on',NEW.due_on,'days_before_due',NEW.days_before_due),NEW.created_by,NEW.created_at);
END;
CREATE TRIGGER hrm_training_reminder_changed AFTER UPDATE OF state ON hrm_training_reminders
WHEN OLD.state!=NEW.state BEGIN
  INSERT INTO hrm_training_reminder_events(id,reminder_id,event_type,detail_json,actor_id,created_at)
  VALUES('trnrem_evt_'||lower(hex(randomblob(16))),NEW.id,NEW.state,json_object('version',NEW.version),COALESCE(NEW.read_by,NEW.resolved_by,NEW.created_by),NEW.updated_at);
END;
CREATE TRIGGER hrm_training_reminder_event_no_update BEFORE UPDATE ON hrm_training_reminder_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_training_reminder_event_no_delete BEFORE DELETE ON hrm_training_reminder_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;

CREATE TRIGGER hrm_training_reminders_resolve_on_assignment_change
AFTER UPDATE OF state,renew_by ON hrm_training_assignments
WHEN OLD.state!=NEW.state OR OLD.renew_by IS NOT NEW.renew_by BEGIN
  UPDATE hrm_training_reminders SET state='resolved',version=version+1,resolved_by='system:hrm_training_reminder',resolved_at=NEW.updated_at,updated_at=NEW.updated_at
  WHERE assignment_id=NEW.id AND state='unread'
    AND ((deadline_kind='completion' AND NEW.state IN ('approved','declined','cancelled'))
      OR (deadline_kind='renewal' AND (NEW.state!='approved' OR NEW.renew_by IS NULL OR OLD.renew_by IS NOT NEW.renew_by)));
END;
CREATE TRIGGER hrm_training_reminders_resolve_on_renewal_assignment
AFTER INSERT ON hrm_training_assignments
WHEN NEW.state='assigned' BEGIN
  UPDATE hrm_training_reminders SET state='resolved',version=version+1,resolved_by='system:hrm_training_reminder',resolved_at=NEW.created_at,updated_at=NEW.created_at
  WHERE state='unread' AND deadline_kind='renewal' AND assignment_id IN (
    SELECT old_assignment.id FROM hrm_training_assignments old_assignment
    WHERE old_assignment.person_id=NEW.person_id AND old_assignment.course_code=NEW.course_code AND old_assignment.legal_entity=NEW.legal_entity AND old_assignment.id!=NEW.id
  );
END;

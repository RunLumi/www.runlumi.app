-- P5 service desk and in-app notification outbox. No external channel is configured.
CREATE TABLE hrm_service_requests (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('employment_confirmation','profile_support','policy_question','benefit_question','asset_return','training_question','reimbursement','sensitive_complaint','other')),
  subject TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('submitted','triaged','in_progress','answered','resolved','reopened','cancelled')),
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('standard','restricted')),
  assigned_to_user_id TEXT,
  due_on TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((request_type='sensitive_complaint' AND sensitivity='restricted') OR (request_type!='sensitive_complaint' AND sensitivity='standard'))
);
CREATE INDEX hrm_service_requests_person ON hrm_service_requests(person_id,created_at DESC);
CREATE INDEX hrm_service_requests_queue ON hrm_service_requests(state,assigned_to_user_id,updated_at DESC);
CREATE TRIGGER hrm_service_request_identity_immutable
BEFORE UPDATE OF person_id,employment_id,request_type,subject,sensitivity,created_by,created_at ON hrm_service_requests
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_service_request_state_guard BEFORE UPDATE OF state ON hrm_service_requests
WHEN NOT (OLD.state=NEW.state OR OLD.state='submitted' AND NEW.state IN ('triaged','cancelled') OR OLD.state='triaged' AND NEW.state IN ('in_progress','cancelled') OR OLD.state='in_progress' AND NEW.state IN ('answered','resolved','cancelled') OR OLD.state='answered' AND NEW.state IN ('resolved','reopened') OR OLD.state='resolved' AND NEW.state='reopened' OR OLD.state='reopened' AND NEW.state IN ('triaged','in_progress'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;

CREATE TABLE hrm_service_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES hrm_service_requests(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted','assigned','triaged','in_progress','employee_message','staff_message','answered','resolved','reopened','cancelled')),
  visibility TEXT NOT NULL CHECK (visibility IN ('employee','hr_only')),
  body TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_service_events_order ON hrm_service_request_events(request_id,created_at,id);
CREATE TRIGGER hrm_service_event_no_update BEFORE UPDATE ON hrm_service_request_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_service_event_no_delete BEFORE DELETE ON hrm_service_request_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_notification_outbox (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES hrm_service_requests(id),
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('request_created','request_assigned','request_updated')),
  href TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','delivered','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(recipient_user_id,event_key)
);
CREATE INDEX hrm_notification_outbox_queue ON hrm_notification_outbox(recipient_user_id,state,created_at);

CREATE TABLE hrm_notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES hrm_service_requests(id),
  outbox_id TEXT NOT NULL UNIQUE REFERENCES hrm_notification_outbox(id),
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('request_created','request_assigned','request_updated')),
  href TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'unread' CHECK (state IN ('unread','read')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE(recipient_user_id,event_key)
);
CREATE INDEX hrm_notifications_inbox ON hrm_notifications(recipient_user_id,state,created_at DESC);
CREATE TRIGGER hrm_notification_state_guard BEFORE UPDATE OF state ON hrm_notifications
WHEN NOT (OLD.state=NEW.state OR OLD.state='unread' AND NEW.state='read')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_notification_content_immutable
BEFORE UPDATE OF recipient_user_id,request_id,outbox_id,event_key,event_type,href,created_at ON hrm_notifications
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_notification_no_delete BEFORE DELETE ON hrm_notifications BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

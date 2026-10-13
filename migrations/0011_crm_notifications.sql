-- Outbound team notifications (Lark group bot). Each CRM event or digest is
-- claimed once by event_id, so concurrent senders never post it twice.
-- The marker row records when notifications were switched on: only events
-- after it are announced, never the history before.

CREATE TABLE crm_notifications (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX crm_notifications_retry ON crm_notifications(status, updated_at);
CREATE INDEX crm_events_created ON crm_events(created_at);

INSERT INTO crm_notifications (id, event_id, kind, status, attempts, created_at, updated_at)
VALUES ('marker', 'marker:start', 'marker', 'skipped', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

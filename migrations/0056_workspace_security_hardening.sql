-- Workspace security hardening after pre-release review (workstream 4). Additive only.

-- Events the notification dispatcher has finished (every target sent or
-- skipped, or no rule matched), so each run reads only unfinished events and
-- a busy CRM never delays newer events behind older ones.
CREATE TABLE workspace_notification_settled (
  event_id TEXT PRIMARY KEY,
  settled_at TEXT NOT NULL
);

-- Rate limit for failed passkey checks and audit review by action.
CREATE INDEX workspace_audit_action_time ON workspace_audit(action, created_at DESC);
CREATE INDEX workspace_audit_actor_action_time ON workspace_audit(actor_id, action, created_at DESC);

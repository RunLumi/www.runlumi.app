-- Notification rules with internal recipients, and Slack, Discord and
-- Microsoft Teams webhooks next to the built-in Lark bot (redesign
-- workstream 4, decision R-09). Additive only.

-- A webhook URL is a credential: only AES-GCM ciphertext (key: the
-- WORKSPACE_WEBHOOK_KEY Worker secret) and a masked hint are stored.
CREATE TABLE workspace_notification_destinations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  platform TEXT NOT NULL CHECK (platform IN ('slack', 'discord', 'teams')),
  url_sealed TEXT NOT NULL,
  url_hint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_result TEXT NOT NULL DEFAULT '',
  last_sent_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Which CRM events, under which safe conditions, go to whom. Recipients are
-- always internal Workspace members (roles, people, the record owner) and
-- only receive what their own permissions let them see.
CREATE TABLE workspace_notification_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  module TEXT NOT NULL DEFAULT 'crm' CHECK (module IN ('crm')),
  events TEXT NOT NULL CHECK (json_valid(events)),
  conditions TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(conditions)),
  recipients TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(recipients)),
  email INTEGER NOT NULL DEFAULT 0 CHECK (email IN (0, 1)),
  destinations TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(destinations)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One row per rule, event and channel target, claimed before sending so each
-- is sent once. A failure never affects the CRM write that caused it.
CREATE TABLE workspace_notification_deliveries (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (rule_id, event_id, target)
);
CREATE INDEX workspace_notification_deliveries_time ON workspace_notification_deliveries(created_at DESC);
CREATE INDEX workspace_notification_deliveries_target ON workspace_notification_deliveries(target, created_at DESC);

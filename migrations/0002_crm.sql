-- EmDash owns identity in CONTENT_DB. This database stores only stable user IDs;
-- it contains no copies of CMS sessions, credentials, or profile data.
CREATE TABLE crm_members (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  granted_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE crm_leads (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  value_vnd INTEGER NOT NULL DEFAULT 0 CHECK (value_vnd >= 0 AND value_vnd <= 1000000000000),
  next_action TEXT NOT NULL DEFAULT '',
  next_contact_on TEXT,
  lost_reason TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX crm_leads_owner_updated ON crm_leads(owner_id, updated_at DESC);
CREATE INDEX crm_leads_stage ON crm_leads(stage);
CREATE INDEX crm_leads_followup ON crm_leads(owner_id, next_contact_on);

CREATE TABLE crm_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('created', 'updated', 'note')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX crm_activities_lead ON crm_activities(lead_id, created_at DESC);

-- Lead object (Workspace redesign, workstream 3). A Lead is an unqualified
-- person-at-a-business before anyone has a company, contact or opportunity for
-- it. Referrals (crm.refer) and signed local.runlumi.app enquiries now arrive
-- as Leads; conversion creates or reuses a company and contact and opens an
-- opportunity that keeps the lead's source and referrer attribution.
--
-- Additive only. The legacy `crm_leads` table from migration 0002 is a
-- different, frozen table and is not touched.
CREATE TABLE crm_lead_records (
  id TEXT PRIMARY KEY,
  -- System lifecycle; the business status label comes from the versioned lead process (R-01).
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'converted', 'disqualified')),
  status_id TEXT NOT NULL,
  process_id TEXT NOT NULL REFERENCES crm_policies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  job_title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL CHECK (length(trim(company)) BETWEEN 1 AND 160),
  industry TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_norm TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  need TEXT NOT NULL DEFAULT '',
  playbook_key TEXT NOT NULL DEFAULT '',
  source_channel TEXT NOT NULL,
  source_detail TEXT NOT NULL DEFAULT '',
  referrer_id TEXT,
  owner_id TEXT,
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown', 'granted', 'refused', 'withdrawn')),
  consent_evidence TEXT NOT NULL DEFAULT '',
  suppressed INTEGER NOT NULL DEFAULT 0 CHECK (suppressed IN (0, 1)),
  next_action TEXT NOT NULL DEFAULT '',
  next_action_due TEXT,
  disqualify_reason_id TEXT NOT NULL DEFAULT '',
  disqualify_note TEXT NOT NULL DEFAULT '',
  converted_account_id TEXT REFERENCES crm_accounts(id) ON DELETE RESTRICT,
  converted_contact_id TEXT REFERENCES crm_contacts(id) ON DELETE RESTRICT,
  converted_opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  converted_by TEXT,
  converted_at TEXT,
  created_by TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state != 'converted' OR (converted_account_id IS NOT NULL AND converted_contact_id IS NOT NULL AND converted_opportunity_id IS NOT NULL AND converted_at IS NOT NULL))
);
CREATE INDEX crm_lead_records_owner ON crm_lead_records(owner_id, state, updated_at DESC);
CREATE INDEX crm_lead_records_state ON crm_lead_records(state, created_at);
CREATE INDEX crm_lead_records_referrer ON crm_lead_records(referrer_id, created_at DESC);
CREATE INDEX crm_lead_records_phone ON crm_lead_records(phone_norm);
-- One lead converts into exactly one opportunity.
CREATE UNIQUE INDEX crm_lead_records_converted_opp ON crm_lead_records(converted_opportunity_id) WHERE converted_opportunity_id IS NOT NULL;

-- A converted lead's record is frozen: its conversion links never change.
CREATE TRIGGER crm_lead_records_converted_frozen BEFORE UPDATE ON crm_lead_records
WHEN OLD.state = 'converted' BEGIN SELECT RAISE(ABORT, 'lead_converted'); END;
CREATE TRIGGER crm_lead_records_no_delete BEFORE DELETE ON crm_lead_records BEGIN SELECT RAISE(ABORT, 'lead_history'); END;

-- Website enquiries and CRM events can now point at a lead instead of an opportunity.
ALTER TABLE crm_inbound ADD COLUMN lead_id TEXT REFERENCES crm_lead_records(id) ON DELETE RESTRICT;
ALTER TABLE crm_events ADD COLUMN lead_id TEXT REFERENCES crm_lead_records(id) ON DELETE RESTRICT;
CREATE INDEX crm_events_lead ON crm_events(lead_id, created_at DESC);
CREATE INDEX crm_inbound_lead ON crm_inbound(lead_id);

-- The organisation's lead process, version 1. Status and reason labels are
-- data, never code (R-01); admins save a new version to change them. Every
-- version has at least one open status; the first is where new leads start.
INSERT INTO crm_policies (id, policy_key, version, body, source_ref, effective_from, created_by, created_at) VALUES (
  'crm-lead-process@1', 'crm-lead-process', 1,
  '{"statuses":[{"id":"received","en":"Received","vi":"Đã tiếp nhận","target_hours":24},{"id":"reached","en":"Reached","vi":"Đã liên hệ được"},{"id":"callback","en":"Call back later","vi":"Hẹn liên hệ lại"}],"disqualify_reasons":[{"id":"not_fit","en":"Not a fit","vi":"Không phù hợp"},{"id":"no_response","en":"No response","vi":"Không phản hồi"},{"id":"duplicate","en":"Duplicate","vi":"Trùng lặp"},{"id":"spam","en":"Spam or misdirected","vi":"Spam hoặc gửi nhầm"},{"id":"declined","en":"Declined to be contacted","vi":"Từ chối được liên hệ"}]}',
  'Workspace redesign decision R-01 (2026-10-29): labels are org data; initial labels from the approved Leads boards.',
  '2026-10-29', 'system:migration-0051', '2026-10-29T00:00:00.000Z'
);

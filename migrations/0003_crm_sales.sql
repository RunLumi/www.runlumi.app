-- CRM sales model: accounts, contacts, opportunities under versioned playbooks,
-- versioned offers, quotes, an append-only commercial ledger, fulfillment,
-- tasks, costs, cohorts and server-to-server intake.
--
-- EmDash (CONTENT_DB) remains the only identity store. Every *_id that names a
-- person is an EmDash user ID; no credentials or sessions are stored here.
-- 0002 tables (crm_leads, crm_activities) are kept untouched for recovery;
-- their rows are copied into the new model below and flagged needs_review.

-- Independent CRM capabilities for members. They grant no ATS access and do
-- not require the EmDash admin role.
CREATE TABLE crm_capabilities (
  user_id TEXT NOT NULL REFERENCES crm_members(user_id) ON DELETE CASCADE,
  capability TEXT NOT NULL CHECK (capability IN ('finance', 'fulfillment')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, capability)
);

-- Idempotency keys for form posts and intake. A retried request finds its
-- key and returns the original result instead of writing twice.
CREATE TABLE crm_requests (
  request_key TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  ref_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE crm_offers (
  id TEXT PRIMARY KEY,
  offer_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  name_en TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('one_time', 'first_year', 'annual', 'setup', 'monthly', 'project', 'custom')),
  list_price_vnd INTEGER CHECK (list_price_vnd IS NULL OR (list_price_vnd >= 0 AND list_price_vnd <= 1000000000000)),
  scope_en TEXT NOT NULL DEFAULT '',
  scope_vi TEXT NOT NULL DEFAULT '',
  conditions_en TEXT NOT NULL DEFAULT '',
  conditions_vi TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT '{}',
  source_ref TEXT NOT NULL DEFAULT '',
  effective_from TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (offer_key, version)
);

CREATE TABLE crm_playbooks (
  id TEXT PRIMARY KEY,
  playbook_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  name_en TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('acquisition', 'solution', 'renewal', 'legacy')),
  description_en TEXT NOT NULL DEFAULT '',
  description_vi TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (playbook_key, version)
);

-- Internal decisions such as the Local cohort gate, versioned with source.
CREATE TABLE crm_policies (
  id TEXT PRIMARY KEY,
  policy_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (policy_key, version)
);

CREATE TABLE crm_cohorts (
  cohort_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  playbook_key TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  target_size INTEGER,
  policy_id TEXT REFERENCES crm_policies(id),
  costing_complete INTEGER NOT NULL DEFAULT 0 CHECK (costing_complete IN (0, 1)),
  costing_note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE crm_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone_norm TEXT NOT NULL DEFAULT '',
  do_not_contact INTEGER NOT NULL DEFAULT 0 CHECK (do_not_contact IN (0, 1)),
  dnc_reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  legacy_lead_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX crm_accounts_phone ON crm_accounts(phone_norm);
CREATE INDEX crm_accounts_name ON crm_accounts(name COLLATE NOCASE);

CREATE TABLE crm_contacts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES crm_accounts(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'other' CHECK (role IN ('owner', 'manager', 'decision_maker', 'buyer', 'technical', 'staff', 'other')),
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phone_norm TEXT NOT NULL DEFAULT '',
  zalo TEXT NOT NULL DEFAULT '',
  contact_basis TEXT NOT NULL DEFAULT '',
  preferred_channel TEXT NOT NULL DEFAULT '' CHECK (preferred_channel IN ('', 'phone', 'zalo', 'email', 'visit', 'facebook', 'other')),
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown', 'granted', 'refused', 'withdrawn')),
  consent_evidence TEXT NOT NULL DEFAULT '',
  do_not_contact INTEGER NOT NULL DEFAULT 0 CHECK (do_not_contact IN (0, 1)),
  dnc_reason TEXT NOT NULL DEFAULT '',
  dnc_recorded_by TEXT,
  dnc_recorded_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX crm_contacts_account ON crm_contacts(account_id);
CREATE INDEX crm_contacts_phone ON crm_contacts(phone_norm);

CREATE TABLE crm_opportunities (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES crm_accounts(id) ON DELETE RESTRICT,
  primary_contact_id TEXT REFERENCES crm_contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  playbook_id TEXT NOT NULL REFERENCES crm_playbooks(id) ON DELETE RESTRICT,
  stage_id TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open', 'won', 'lost', 'paused')),
  -- Current owner (NULL = waiting for admin assignment). Reassignment changes
  -- only this column; attribution columns below never change on reassignment.
  owner_id TEXT,
  seller_id TEXT,
  created_by TEXT NOT NULL,
  source_channel TEXT NOT NULL DEFAULT 'other' CHECK (source_channel IN ('field_visit', 'facebook', 'zalo', 'phone', 'email', 'referral', 'inbound_web', 'event', 'existing_customer', 'other')),
  source_detail TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  parent_id TEXT REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  relation TEXT NOT NULL DEFAULT 'new' CHECK (relation IN ('new', 'upgrade', 'renewal', 'expansion')),
  offer_id TEXT REFERENCES crm_offers(id),
  -- NULL means unknown; 0 is a real, verified zero.
  estimated_value_vnd INTEGER CHECK (estimated_value_vnd IS NULL OR (estimated_value_vnd >= 0 AND estimated_value_vnd <= 1000000000000)),
  fields TEXT NOT NULL DEFAULT '{}',
  checks TEXT NOT NULL DEFAULT '{}',
  next_action TEXT NOT NULL DEFAULT '',
  next_action_due TEXT,
  lost_reason TEXT NOT NULL DEFAULT '',
  cohort_key TEXT REFERENCES crm_cohorts(cohort_key),
  service_period_start TEXT,
  service_period_end TEXT,
  renewal_due_on TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_review IN (0, 1)),
  legacy_data TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX crm_opps_owner ON crm_opportunities(owner_id, outcome, next_action_due);
CREATE INDEX crm_opps_playbook ON crm_opportunities(playbook_id, stage_id);
CREATE INDEX crm_opps_account ON crm_opportunities(account_id);
CREATE INDEX crm_opps_parent ON crm_opportunities(parent_id);
CREATE INDEX crm_opps_cohort ON crm_opportunities(cohort_key);
CREATE INDEX crm_opps_renewal ON crm_opportunities(renewal_due_on);
CREATE INDEX crm_opps_service_end ON crm_opportunities(service_period_end);

CREATE TABLE crm_stage_history (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  playbook_id TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  skipped TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX crm_stage_history_opp ON crm_stage_history(opportunity_id, created_at);

CREATE TABLE crm_tasks (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('call', 'message', 'visit', 'meeting', 'demo', 'pilot_review', 'follow_up', 'internal', 'support')),
  title TEXT NOT NULL,
  due_on TEXT,
  due_time TEXT,
  contact_id TEXT REFERENCES crm_contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT '',
  assignee_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  outcome TEXT NOT NULL DEFAULT '',
  meeting_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (meeting_confirmed IN (0, 1)),
  needs_help INTEGER NOT NULL DEFAULT 0 CHECK (needs_help IN (0, 1)),
  help_note TEXT NOT NULL DEFAULT '',
  -- State of an action taken outside the CRM. "unknown" is never retried
  -- automatically; a person verifies and records the result.
  external_state TEXT NOT NULL DEFAULT 'none' CHECK (external_state IN ('none', 'draft', 'submitting', 'verified', 'failed', 'unknown')),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX crm_tasks_due ON crm_tasks(status, due_on);
CREATE INDEX crm_tasks_opp ON crm_tasks(opportunity_id, status);

CREATE TABLE crm_events (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  account_id TEXT REFERENCES crm_accounts(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX crm_events_opp ON crm_events(opportunity_id, created_at DESC);
CREATE INDEX crm_events_account ON crm_events(account_id, created_at DESC);

CREATE TABLE crm_quotes (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  offer_id TEXT NOT NULL REFERENCES crm_offers(id) ON DELETE RESTRICT,
  -- Frozen copy of the offer terms and lines at quote time.
  snapshot TEXT NOT NULL,
  list_price_vnd INTEGER,
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0 AND price_vnd <= 1000000000000),
  credit_vnd INTEGER NOT NULL DEFAULT 0 CHECK (credit_vnd >= 0),
  credit_source_entry_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'accepted', 'withdrawn')),
  accepted_on TEXT,
  acceptance_evidence TEXT NOT NULL DEFAULT '',
  accepted_by TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX crm_quotes_opp ON crm_quotes(opportunity_id, status);

CREATE TABLE crm_ledger (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES crm_accounts(id) ON DELETE RESTRICT,
  quote_id TEXT REFERENCES crm_quotes(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('receivable', 'credit', 'payment', 'refund', 'void')),
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd >= 0 AND amount_vnd <= 1000000000000),
  occurred_on TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected')),
  method TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  -- refund → payment; void → any entry; credit → source payment.
  target_entry_id TEXT REFERENCES crm_ledger(id) ON DELETE RESTRICT,
  period_start TEXT,
  period_end TEXT,
  recorded_by TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX crm_ledger_opp ON crm_ledger(opportunity_id, created_at);
CREATE INDEX crm_ledger_account ON crm_ledger(account_id, kind);
-- A source payment funds at most one credit; retries cannot double-credit.
CREATE UNIQUE INDEX crm_ledger_one_credit ON crm_ledger(target_entry_id) WHERE kind = 'credit';
CREATE UNIQUE INDEX crm_ledger_one_void ON crm_ledger(target_entry_id) WHERE kind = 'void';
CREATE UNIQUE INDEX crm_ledger_one_receivable ON crm_ledger(quote_id) WHERE kind = 'receivable';

CREATE TABLE crm_fulfillments (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL UNIQUE REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('local_site', 'renewal_activation', 'solution_delivery')),
  status TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  blocked_reason TEXT NOT NULL DEFAULT '',
  handoff TEXT NOT NULL DEFAULT '{}',
  checks TEXT NOT NULL DEFAULT '{}',
  owner_approval TEXT,
  acceptance TEXT,
  assignee_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX crm_fulfillments_status ON crm_fulfillments(status, blocked);

CREATE TABLE crm_costs (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  cohort_key TEXT REFERENCES crm_cohorts(cohort_key),
  category TEXT NOT NULL CHECK (category IN ('research', 'preview', 'travel', 'sales', 'delivery', 'support', 'domain', 'hosting', 'printing', 'generation', 'payment_fee', 'ads', 'other')),
  basis TEXT NOT NULL DEFAULT 'actual' CHECK (basis IN ('actual', 'estimate')),
  minutes INTEGER CHECK (minutes IS NULL OR (minutes >= 0 AND minutes <= 100000)),
  amount_vnd INTEGER CHECK (amount_vnd IS NULL OR (amount_vnd >= 0 AND amount_vnd <= 1000000000000)),
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (minutes IS NOT NULL OR amount_vnd IS NOT NULL),
  CHECK (opportunity_id IS NOT NULL OR cohort_key IS NOT NULL)
);
CREATE INDEX crm_costs_opp ON crm_costs(opportunity_id);
CREATE INDEX crm_costs_cohort ON crm_costs(cohort_key);

-- Enquiries Lumi Local's marketing site forwards server-to-server. Customer
-- enquiries to Starter sites never come here.
CREATE TABLE crm_inbound (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  opportunity_id TEXT REFERENCES crm_opportunities(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'assigned', 'dismissed')),
  suppressed INTEGER NOT NULL DEFAULT 0 CHECK (suppressed IN (0, 1)),
  handled_by TEXT,
  handled_at TEXT,
  dismiss_reason TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL
);
CREATE INDEX crm_inbound_status ON crm_inbound(status, received_at);

-- seed:begin (generated by scripts/crm-seed-sql.mjs; do not edit by hand)
INSERT INTO crm_offers (id, offer_key, version, name_en, name_vi, charge_type, list_price_vnd, scope_en, scope_vi, conditions_en, conditions_vi, rules, source_ref, effective_from, active, created_by, created_at) VALUES ('local-trust-kit@1', 'local-trust-kit', 1, 'Lumi Trust Kit', 'Lumi Trust Kit', 'one_time', 399000, 'Google review QR and print-ready artwork, short public-presence audit and checklist, review-request message template, contact/Maps QR assets where appropriate.', 'Mã QR đánh giá Google và file in sẵn, kiểm tra nhanh hiện diện công khai và checklist, mẫu tin nhắn mời đánh giá, QR liên hệ/Maps khi phù hợp.', 'Artwork only: no printing, stands or shipping unless quoted separately. No Google Business Profile management, passwords or edit access. No ranking, traffic or revenue promise. Alerts only where implemented and verified.', 'Chỉ gồm file thiết kế: không in ấn, chân đế hay vận chuyển nếu chưa báo giá riêng. Không quản lý Google Business Profile, không xin mật khẩu hay quyền chỉnh sửa. Không cam kết thứ hạng, lượt truy cập hay doanh thu. Cảnh báo chỉ khi đã triển khai và kiểm chứng.', '{}', 'RunLumi/local.runlumi PRICING.md, COPY.md, STRATEGY.md @ 3a6024e (2026-10-07)', '2026-10-04', 1, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_offers (id, offer_key, version, name_en, name_vi, charge_type, list_price_vnd, scope_en, scope_vi, conditions_en, conditions_vi, rules, source_ref, effective_from, active, created_by, created_at) VALUES ('local-starter@1', 'local-starter', 1, 'Lumi Local Starter', 'Lumi Local Starter', 'first_year', 1990000, 'Mobile-first business site with owner-verified content, Call/Zalo, Maps directions, contact form, hosting and SSL for year one, basic local-search structure, one basic revision round, RunLumi subdomain or own domain, print-ready review QR artwork.', 'Website ưu tiên di động với nội dung chủ đã xác nhận, Gọi/Zalo, chỉ đường Maps, form liên hệ, hosting và SSL năm đầu, cấu trúc tìm kiếm địa phương cơ bản, một vòng chỉnh sửa cơ bản, subdomain RunLumi hoặc tên miền riêng, file QR đánh giá in sẵn.', 'Not a store, booking system or CRM: no checkout, booking calendar, automated enquiry follow-up or reminders. Agree enquiry destination and response owner before publication. Extra scope is quoted before work. Year two renews separately.', 'Không phải cửa hàng, hệ thống đặt lịch hay CRM: không thanh toán trực tuyến, lịch đặt chỗ, tự động chăm sóc hay nhắc lịch. Thống nhất nơi nhận yêu cầu và người phản hồi trước khi xuất bản. Phạm vi thêm phải báo giá trước. Năm hai gia hạn riêng.', '{"credit":{"from_offer":"local-trust-kit","window_days":30,"amount":"full_paid"}}', 'RunLumi/local.runlumi PRICING.md, COPY.md, STRATEGY.md @ 3a6024e (2026-10-07)', '2026-10-04', 1, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_offers (id, offer_key, version, name_en, name_vi, charge_type, list_price_vnd, scope_en, scope_vi, conditions_en, conditions_vi, rules, source_ref, effective_from, active, created_by, created_at) VALUES ('local-renewal-subdomain@1', 'local-renewal-subdomain', 1, 'Local renewal — RunLumi address', 'Gia hạn Local — địa chỉ RunLumi', 'annual', 599000, 'From year two: RunLumi subdomain, hosting, SSL and technical maintenance within scope.', 'Từ năm hai: subdomain RunLumi, hosting, SSL và bảo trì kỹ thuật trong phạm vi.', 'Renewal is a separate decision and is never counted as year-one money.', 'Gia hạn là quyết định riêng và không tính vào tiền năm đầu.', '{}', 'RunLumi/local.runlumi PRICING.md, COPY.md, STRATEGY.md @ 3a6024e (2026-10-07)', '2026-10-04', 1, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_offers (id, offer_key, version, name_en, name_vi, charge_type, list_price_vnd, scope_en, scope_vi, conditions_en, conditions_vi, rules, source_ref, effective_from, active, created_by, created_at) VALUES ('local-renewal-domain@1', 'local-renewal-domain', 1, 'Local renewal — custom domain', 'Gia hạn Local — tên miền riêng', 'annual', 999000, 'From year two: one standard custom domain, hosting, SSL and technical maintenance within scope.', 'Từ năm hai: một tên miền riêng tiêu chuẩn, hosting, SSL và bảo trì kỹ thuật trong phạm vi.', 'Premium, aftermarket or unusually priced domains are quoted separately. Confirm domain eligibility and cost before payment.', 'Tên miền premium, chuyển nhượng hoặc giá đặc biệt được báo giá riêng. Xác nhận tên miền hợp lệ và chi phí trước khi thanh toán.', '{}', 'RunLumi/local.runlumi PRICING.md, COPY.md, STRATEGY.md @ 3a6024e (2026-10-07)', '2026-10-04', 1, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_offers (id, offer_key, version, name_en, name_vi, charge_type, list_price_vnd, scope_en, scope_vi, conditions_en, conditions_vi, rules, source_ref, effective_from, active, created_by, created_at) VALUES ('lumi-solution@1', 'lumi-solution', 1, 'Lumi solution / workflow engagement', 'Giải pháp / workflow Lumi', 'custom', NULL, 'Scope agreed per opportunity across Assistant, Workspace, BI and Agents. Every capability in scope must be confirmed by Lumi before quoting.', 'Phạm vi thống nhất theo từng cơ hội trên Assistant, Workspace, BI và Agents. Mọi khả năng trong phạm vi phải được Lumi xác nhận trước khi báo giá.', 'No list price. Setup, recurring and project fees are recorded only when agreed. No invented prices, SLAs or feature availability.', 'Không có giá niêm yết. Phí setup, định kỳ và dự án chỉ ghi khi đã thỏa thuận. Không tự đặt giá, SLA hay khả năng chưa có.', '{}', 'RunLumi/local.runlumi PRICING.md, COPY.md, STRATEGY.md @ 3a6024e (2026-10-07)', '2026-10-04', 1, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_playbooks (id, playbook_key, version, name_en, name_vi, kind, description_en, description_vi, definition, active, created_by, created_at) VALUES ('local-preview@1', 'local-preview', 1, 'Lumi Local — preview sale', 'Lumi Local — bán qua preview', 'acquisition', 'Starter directly, Trust Kit when the owner needs the smaller deliverable. No enterprise pilot.', 'Bán Starter trực tiếp, Trust Kit khi chủ cần gói nhỏ hơn. Không chạy pilot kiểu doanh nghiệp lớn.', '{"stages":[{"id":"new","en":"New","vi":"Mới","outcome":"open"},{"id":"qualified","en":"Qualified to approach","vi":"Đủ điều kiện tiếp cận","outcome":"open","milestone":"qualified","requires":["industry","location","presence_checked"]},{"id":"owner_talked","en":"Talked with owner","vi":"Đã trao đổi với chủ","outcome":"open","milestone":"conversation","requires":["owner_contact_basis","friction"]},{"id":"preview_shown","en":"Preview shown","vi":"Đã xem preview","outcome":"open","milestone":"preview_shown","skippable":true,"requires":["preview_version","preview_sources","preview_private"]},{"id":"deciding","en":"Deciding","vi":"Đang quyết định","outcome":"open","requires":["owner_feedback","next_step"]},{"id":"accepted","en":"Accepted","vi":"Đã chấp thuận","outcome":"won","requires":["accepted_quote","offer_choice"]},{"id":"not_fit","en":"Not a fit","vi":"Không phù hợp","outcome":"lost"},{"id":"not_continuing","en":"Not continuing","vi":"Không tiếp tục","outcome":"lost"}],"fields":[{"key":"industry","en":"Industry","vi":"Ngành","type":"text","stage":"new"},{"key":"location","en":"Location / area","vi":"Địa điểm / khu vực","type":"text","stage":"new"},{"key":"business_identity","en":"Business identity checked (name, address, phone)","vi":"Thông tin nhận diện đã kiểm tra (tên, địa chỉ, SĐT)","type":"long_text","stage":"new"},{"key":"maps_url","en":"Google Maps link","vi":"Link Google Maps","type":"url","stage":"new"},{"key":"page_url","en":"Facebook/Zalo page","vi":"Trang Facebook/Zalo","type":"url","stage":"new"},{"key":"website_status","en":"Website status","vi":"Tình trạng website","type":"select","stage":"new","options":[{"value":"none_found","en":"None found after checks","vi":"Không tìm thấy sau khi kiểm tra"},{"value":"owner_confirmed_none","en":"Owner confirmed none","vi":"Chủ xác nhận chưa có"},{"value":"link_hub_only","en":"Link hub only","vi":"Chỉ có trang tổng hợp link"},{"value":"needs_review","en":"Existing site needs review","vi":"Có website cần xem lại"},{"value":"suitable","en":"Existing site suitable","vi":"Website hiện tại phù hợp"},{"value":"unknown","en":"Unknown","vi":"Chưa rõ"}]},{"key":"owner_name","en":"Owner / manager","vi":"Chủ / quản lý","type":"text","stage":"qualified"},{"key":"owner_contact_basis","en":"Basis for contacting the owner","vi":"Căn cứ liên hệ chủ","type":"text","stage":"qualified","help_en":"How you know this person decides and may be contacted (met in person, referral, listed number).","help_vi":"Vì sao biết người này quyết định và có thể liên hệ (gặp trực tiếp, giới thiệu, số công khai)."},{"key":"friction","en":"Specific friction (service, information or contact route)","vi":"Vướng mắc cụ thể (dịch vụ, thông tin hoặc đường liên hệ)","type":"long_text","stage":"qualified","help_en":"Ask about the last real enquiry that ran into it.","help_vi":"Hỏi về lần gần nhất khách gặp vướng mắc này."},{"key":"preview_private","en":"Preview is private and marked draft","vi":"Preview riêng tư và ghi rõ bản nháp","type":"yes_no","stage":"owner_talked"},{"key":"preview_url","en":"Private preview link","vi":"Link preview riêng tư","type":"url","stage":"owner_talked"},{"key":"preview_version","en":"Preview version","vi":"Phiên bản preview","type":"text","stage":"owner_talked"},{"key":"preview_sources","en":"Information sources used","vi":"Nguồn thông tin đã dùng","type":"long_text","stage":"owner_talked"},{"key":"asset_rights","en":"Asset permission","vi":"Quyền dùng hình ảnh/tài liệu","type":"select","stage":"owner_talked","options":[{"value":"owner_supplied","en":"Owner supplied / approved","vi":"Chủ cung cấp / đồng ý"},{"value":"licensed","en":"Licensed stock","vi":"Ảnh có giấy phép"},{"value":"placeholder","en":"Placeholders only","vi":"Chỉ dùng ảnh minh họa tạm"},{"value":"unknown","en":"Not confirmed","vi":"Chưa xác nhận"}]},{"key":"owner_feedback","en":"Owner feedback","vi":"Phản hồi của chủ","type":"long_text","stage":"preview_shown"},{"key":"objection","en":"Main objection","vi":"Băn khoăn chính","type":"select","stage":"preview_shown","options":[{"value":"diy_ai","en":"Can make it myself with AI","vi":"Tự làm bằng AI được"},{"value":"has_facebook","en":"Already has Facebook","vi":"Đã có Facebook"},{"value":"google_access","en":"Worried about Google access","vi":"Lo về quyền Google"},{"value":"ranking","en":"Asks about ranking","vi":"Hỏi về thứ hạng"},{"value":"guarantee","en":"Wants a customer guarantee","vi":"Muốn cam kết khách"},{"value":"think","en":"Wants to think","vi":"Muốn suy nghĩ thêm"},{"value":"price","en":"Price","vi":"Giá"},{"value":"other","en":"Other","vi":"Khác"}]},{"key":"offer_choice","en":"Offer chosen","vi":"Gói đã chọn","type":"select","stage":"deciding","options":[{"value":"starter","en":"Starter","vi":"Starter"},{"value":"trust_kit","en":"Trust Kit","vi":"Trust Kit"},{"value":"none","en":"Neither yet","vi":"Chưa chọn"}]},{"key":"agreed_next_step","en":"Next step the owner agreed to","vi":"Bước tiếp theo chủ đã đồng ý","type":"text","stage":"deciding"},{"key":"google_management_needed","en":"Owner needs manual Google management","vi":"Chủ cần quản lý Google thủ công","type":"yes_no","stage":"deciding","help_en":"Out of scope; recorded for the cohort gate.","help_vi":"Ngoài phạm vi; ghi lại cho cổng đánh giá cohort."}],"checklist":[{"key":"presence_checked","en":"Maps, page and website checked","vi":"Đã kiểm tra Maps, trang và website","stage":"new"},{"key":"scope_explained","en":"Scope, exclusions and renewal explained","vi":"Đã giải thích phạm vi, loại trừ và gia hạn","stage":"deciding"},{"key":"no_google_credentials","en":"No Google password or edit access requested","vi":"Không xin mật khẩu hay quyền chỉnh sửa Google","stage":"deciding"}],"offers":["local-starter","local-trust-kit"]}', 1, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_playbooks (id, playbook_key, version, name_en, name_vi, kind, description_en, description_vi, definition, active, created_by, created_at) VALUES ('lumi-solution@1', 'lumi-solution', 1, 'Lumi solution / AI workflow', 'Giải pháp / workflow AI của Lumi', 'solution', 'Discovery-led sale for coordination, analysis or execution work across Assistant, Workspace, BI and Agents.', 'Bán theo khám phá nhu cầu cho công việc phối hợp, phân tích hoặc thực thi qua Assistant, Workspace, BI và Agents.', '{"stages":[{"id":"new","en":"New","vi":"Mới","outcome":"open"},{"id":"contacted","en":"Contacted","vi":"Đã liên hệ","outcome":"open","milestone":"conversation","requires":["primary_contact"]},{"id":"discovery","en":"Discovery","vi":"Khám phá nhu cầu","outcome":"open","requires":["current_workflow","pain"]},{"id":"qualified","en":"Qualified","vi":"Đủ điều kiện","outcome":"open","milestone":"qualified","requires":["frequency","baseline","decision_maker","systems_data"]},{"id":"demo","en":"Demo / evaluation","vi":"Demo / đánh giá","outcome":"open","milestone":"demo_done","skippable":true,"requires":["demo_outcome"]},{"id":"pilot","en":"Pilot","vi":"Pilot","outcome":"open","milestone":"pilot_done","skippable":true,"requires":["pilot_scope","pilot_owner_lumi","pilot_owner_customer","pilot_deadline","pilot_success_criteria"]},{"id":"proposal","en":"Proposal","vi":"Đề xuất","outcome":"open","milestone":"proposal","requires":["capabilities_confirmed","next_step"]},{"id":"accepted","en":"Accepted","vi":"Đã chấp thuận","outcome":"won","requires":["accepted_quote"]},{"id":"lost","en":"Lost","vi":"Thua","outcome":"lost"},{"id":"on_hold","en":"On hold","vi":"Tạm hoãn","outcome":"paused"}],"fields":[{"key":"current_workflow","en":"Current workflow","vi":"Quy trình hiện tại","type":"long_text","stage":"contacted"},{"key":"pain","en":"Pain in the customer''s words","vi":"Vấn đề theo lời khách","type":"long_text","stage":"contacted"},{"key":"frequency","en":"How often it happens","vi":"Tần suất","type":"text","stage":"discovery"},{"key":"baseline","en":"Baseline today (measured or estimated — say which)","vi":"Hiện trạng (đo được hay ước tính — ghi rõ)","type":"long_text","stage":"discovery"},{"key":"target","en":"Target outcome","vi":"Mục tiêu","type":"long_text","stage":"discovery"},{"key":"systems_data","en":"Software and data involved","vi":"Phần mềm và dữ liệu liên quan","type":"long_text","stage":"discovery"},{"key":"access_requirements","en":"Access and deployment requirements","vi":"Yêu cầu truy cập và triển khai","type":"long_text","stage":"discovery"},{"key":"buyer","en":"Buyer","vi":"Người mua","type":"text","stage":"discovery"},{"key":"decision_maker","en":"Decision-maker","vi":"Người quyết định","type":"text","stage":"discovery"},{"key":"technical_sponsor","en":"Technical sponsor","vi":"Đầu mối kỹ thuật","type":"text","stage":"discovery"},{"key":"capabilities_to_confirm","en":"Capabilities Lumi must confirm","vi":"Khả năng Lumi cần xác nhận","type":"long_text","stage":"qualified"},{"key":"capabilities_confirmed","en":"Capabilities confirmed by Lumi","vi":"Lumi đã xác nhận khả năng","type":"yes_no","stage":"qualified"},{"key":"demo_outcome","en":"Demo outcome","vi":"Kết quả demo","type":"select","stage":"qualified","options":[{"value":"continue","en":"Continue to scope","vi":"Tiếp tục xác định phạm vi"},{"value":"pilot","en":"Wants a pilot","vi":"Muốn chạy pilot"},{"value":"not_fit","en":"Not a fit","vi":"Không phù hợp"},{"value":"follow_up","en":"Follow-up needed","vi":"Cần trao đổi thêm"}]},{"key":"demo_notes","en":"Demo notes","vi":"Ghi chú demo","type":"long_text","stage":"qualified"},{"key":"pilot_scope","en":"Pilot scope","vi":"Phạm vi pilot","type":"long_text","stage":"demo"},{"key":"pilot_owner_lumi","en":"Pilot owner at Lumi","vi":"Người phụ trách pilot phía Lumi","type":"text","stage":"demo"},{"key":"pilot_owner_customer","en":"Pilot owner at customer","vi":"Người phụ trách pilot phía khách","type":"text","stage":"demo"},{"key":"pilot_deadline","en":"Pilot end date","vi":"Ngày kết thúc pilot","type":"date","stage":"demo"},{"key":"pilot_success_criteria","en":"Success criteria","vi":"Tiêu chí thành công","type":"long_text","stage":"demo"},{"key":"measured_result","en":"Measured result","vi":"Kết quả đo được","type":"long_text","stage":"pilot","help_en":"Only what was measured, with evidence; keep expectations elsewhere.","help_vi":"Chỉ ghi điều đã đo, kèm bằng chứng; kỳ vọng ghi riêng."},{"key":"result_evidence","en":"Evidence link or reference","vi":"Bằng chứng (link hoặc tham chiếu)","type":"text","stage":"pilot"},{"key":"expected_value","en":"Expected value (not yet measured)","vi":"Giá trị kỳ vọng (chưa đo)","type":"long_text","stage":"pilot"}],"checklist":[{"key":"no_unverified_promises","en":"No unconfirmed capability, SLA or price promised","vi":"Không hứa khả năng, SLA hay giá chưa xác nhận","stage":"qualified"}],"offers":["lumi-solution"]}', 1, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_playbooks (id, playbook_key, version, name_en, name_vi, kind, description_en, description_vi, definition, active, created_by, created_at) VALUES ('local-renewal@1', 'local-renewal', 1, 'Lumi Local — renewal', 'Lumi Local — gia hạn', 'renewal', 'Year-two and later renewal for a live Local site. Payment and activation are recorded separately.', 'Gia hạn từ năm hai cho website Local đang chạy. Thanh toán và kích hoạt được ghi riêng.', '{"stages":[{"id":"pending_review","en":"Pending review","vi":"Chờ xem xét","outcome":"open"},{"id":"discussed","en":"Discussed","vi":"Đã trao đổi","outcome":"open","milestone":"conversation","requires":["owner_feedback"]},{"id":"proposed","en":"Proposed","vi":"Đề xuất","outcome":"open","milestone":"proposal","requires":["plan_choice","next_step"]},{"id":"accepted","en":"Accepted","vi":"Chấp thuận","outcome":"won","requires":["accepted_quote"]},{"id":"not_renewing","en":"Not renewing","vi":"Không gia hạn","outcome":"lost"},{"id":"on_hold","en":"On hold","vi":"Tạm hoãn","outcome":"paused"}],"fields":[{"key":"current_plan","en":"Current plan","vi":"Gói hiện tại","type":"text","stage":"pending_review"},{"key":"usage_notes","en":"How the site is used / issues","vi":"Cách website được dùng / vấn đề","type":"long_text","stage":"pending_review"},{"key":"owner_feedback","en":"Owner feedback","vi":"Phản hồi của chủ","type":"long_text","stage":"pending_review"},{"key":"plan_choice","en":"Plan for next period","vi":"Gói cho kỳ tới","type":"select","stage":"discussed","options":[{"value":"subdomain","en":"RunLumi address (599k)","vi":"Địa chỉ RunLumi (599k)"},{"value":"domain","en":"Custom domain (999k)","vi":"Tên miền riêng (999k)"},{"value":"undecided","en":"Undecided","vi":"Chưa quyết"}]},{"key":"domain_cost_confirmed","en":"Domain eligibility and cost confirmed","vi":"Đã xác nhận tên miền và chi phí","type":"yes_no","stage":"discussed"}],"checklist":[],"offers":["local-renewal-subdomain","local-renewal-domain"]}', 1, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_playbooks (id, playbook_key, version, name_en, name_vi, kind, description_en, description_vi, definition, active, created_by, created_at) VALUES ('legacy@1', 'legacy', 1, 'Legacy lead (needs review)', 'Lead cũ (cần xem lại)', 'legacy', 'Records migrated from the first CRM. Stages are kept as recorded and prove nothing about payment or delivery.', 'Hồ sơ chuyển từ CRM đầu tiên. Giai đoạn giữ nguyên như đã ghi và không chứng minh thanh toán hay bàn giao.', '{"stages":[{"id":"new","en":"New (legacy)","vi":"Mới (cũ)","outcome":"open"},{"id":"contacted","en":"Contacted (legacy)","vi":"Đã liên hệ (cũ)","outcome":"open"},{"id":"qualified","en":"Qualified (legacy)","vi":"Đủ điều kiện (cũ)","outcome":"open"},{"id":"proposal","en":"Proposal (legacy)","vi":"Đề xuất (cũ)","outcome":"open"},{"id":"won","en":"Won (legacy, unverified)","vi":"Thành công (cũ, chưa xác minh)","outcome":"won"},{"id":"lost","en":"Lost (legacy)","vi":"Đã mất (cũ)","outcome":"lost"}],"fields":[],"checklist":[],"offers":[]}', 0, 'system:migration-0003', '2026-10-07T00:00:00.000Z');
INSERT INTO crm_policies (id, policy_key, version, body, source_ref, effective_from, created_by, created_at) VALUES ('local-cohort-gate@1', 'local-cohort-gate', 1, '{"cohort_size":30,"continue":{"min_paid_businesses":6,"min_paid_starters":2,"max_avg_preview_minutes":5,"manual_google_management_allowed":false},"scale":{"max_cac_vnd":600000,"max_median_fulfillment_minutes":120,"max_p90_fulfillment_minutes":240,"requires_positive_contribution":true,"unknown_costs_fail":true},"review_trigger":{"zero_starters_after_owner_conversations":20},"credit_window_days":30}', 'RunLumi/local.runlumi STRATEGY.md @ 3a6024e — Economics and gates (decision record 2026-10-04)', '2026-10-04', 'system:migration-0003', '2026-10-07T00:00:00.000Z');
-- seed:end

-- Legacy migration: copy every 0002 lead into account + contact +
-- opportunity, preserving the lead ID as the opportunity ID (old /crm/<id>
-- links keep working), owner, version and timestamps. Stages stay in the
-- legacy playbook; "won" proves nothing about payment, so no ledger rows are
-- created. A zero value is treated as unknown; the original row is retained
-- in legacy_data and crm_leads itself is not modified.
INSERT INTO crm_accounts (id, name, phone_norm, legacy_lead_id, created_by, created_at, updated_at)
SELECT 'acc_' || id, company, '', id, created_by, created_at, updated_at FROM crm_leads;

-- phone_norm mirrors normalizePhone() in src/lib/crm/core.ts for the
-- separators people actually type.
INSERT INTO crm_contacts (id, account_id, name, email, phone, phone_norm, created_by, created_at, updated_at)
SELECT 'con_' || id, 'acc_' || id, contact_name, email, phone,
  CASE WHEN length(p) >= 11 AND substr(p, 1, 2) = '84' THEN '0' || substr(p, 3) ELSE p END,
  created_by, created_at, updated_at
FROM (SELECT *, replace(replace(replace(replace(replace(replace(phone, ' ', ''), '.', ''), '-', ''), '(', ''), ')', ''), '+', '') AS p FROM crm_leads);
UPDATE crm_accounts SET phone_norm = (SELECT phone_norm FROM crm_contacts WHERE crm_contacts.account_id = crm_accounts.id)
WHERE legacy_lead_id IS NOT NULL;

INSERT INTO crm_opportunities (
  id, account_id, primary_contact_id, title, playbook_id, stage_id, outcome, owner_id, seller_id, created_by,
  source_channel, source_detail, estimated_value_vnd, next_action, next_action_due, lost_reason,
  needs_review, legacy_data, version, created_at, updated_at, closed_at)
SELECT id, 'acc_' || id, 'con_' || id, company, 'legacy@1', stage,
  CASE stage WHEN 'won' THEN 'won' WHEN 'lost' THEN 'lost' ELSE 'open' END,
  owner_id, NULL, created_by, 'other', source, NULLIF(value_vnd, 0), next_action, next_contact_on, lost_reason,
  1, json_object('company', company, 'contact_name', contact_name, 'email', email, 'phone', phone, 'source', source,
    'owner_id', owner_id, 'stage', stage, 'value_vnd', value_vnd, 'next_action', next_action,
    'next_contact_on', next_contact_on, 'lost_reason', lost_reason, 'version', version, 'created_by', created_by,
    'updated_by', updated_by, 'created_at', created_at, 'updated_at', updated_at),
  version, created_at, updated_at, CASE WHEN stage IN ('won', 'lost') THEN updated_at END
FROM crm_leads;

INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, reason, actor_id, created_at)
SELECT 'legacy_' || id, id, 'legacy@1', NULL, stage, 'migrated from crm_leads', created_by, created_at FROM crm_leads;

INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at)
SELECT 'legacy_' || id, lead_id, 'acc_' || lead_id, actor_id, actor_name, 'legacy_' || kind,
  json_object('body', body), created_at FROM crm_activities;

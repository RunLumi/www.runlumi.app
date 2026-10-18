-- Isolated monthly management Finance. No live amounts, imported operational data or identity copies.
CREATE TABLE finance_books (
  id TEXT PRIMARY KEY CHECK(id='main'),
  entity_name TEXT NOT NULL CHECK(length(entity_name) BETWEEN 1 AND 200),
  currency TEXT NOT NULL CHECK(length(currency)=3 AND currency=upper(currency)),
  precision INTEGER NOT NULL CHECK(precision BETWEEN 0 AND 6),
  fiscal_start_month INTEGER NOT NULL CHECK(fiscal_start_month BETWEEN 1 AND 12),
  timezone TEXT NOT NULL,
  first_period TEXT NOT NULL CHECK(length(first_period)=7 AND first_period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(first_period,6,2) BETWEEN '01' AND '12'),
  cash_floor INTEGER CHECK(cash_floor BETWEEN 0 AND 9007199254740991),
  variance_amount_threshold INTEGER CHECK(variance_amount_threshold BETWEEN 0 AND 9007199254740991),
  variance_percent_threshold_bps INTEGER CHECK(variance_percent_threshold_bps BETWEEN 0 AND 10000),
  policy_note TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
) STRICT;

CREATE TABLE finance_definition_sets (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES finance_books(id),
  fiscal_year INTEGER NOT NULL CHECK(fiscal_year BETWEEN 1900 AND 2200),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  calculation_version TEXT NOT NULL,
  expected_inputs TEXT NOT NULL CHECK(json_valid(expected_inputs) AND json_type(expected_inputs)='array'),
  created_at TEXT NOT NULL, published_at TEXT,
  UNIQUE(book_id,fiscal_year)
) STRICT;

CREATE TABLE finance_lines (
  definition_set_id TEXT NOT NULL REFERENCES finance_definition_sets(id),
  line_code TEXT NOT NULL,
  basis TEXT NOT NULL CHECK(basis IN ('pnl','cash','position','aging','control')),
  line_group TEXT NOT NULL,
  label_en TEXT NOT NULL, label_vi TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('input','derived')),
  sign INTEGER NOT NULL CHECK(sign IN (-1,1)),
  required INTEGER NOT NULL CHECK(required IN (0,1)),
  allow_na INTEGER NOT NULL CHECK(allow_na IN (0,1)),
  require_note INTEGER NOT NULL DEFAULT 0 CHECK(require_note IN (0,1)),
  nonnegative INTEGER NOT NULL DEFAULT 0 CHECK(nonnegative IN (0,1)),
  cost_behavior TEXT NOT NULL DEFAULT 'unspecified' CHECK(cost_behavior IN ('fixed','variable','mixed','unspecified')),
  aggregation TEXT NOT NULL CHECK(aggregation IN ('flow','stock')),
  PRIMARY KEY(definition_set_id,line_code)
) STRICT;

CREATE TABLE finance_segments (
  definition_set_id TEXT NOT NULL REFERENCES finance_definition_sets(id),
  segment_code TEXT NOT NULL,
  label_en TEXT NOT NULL, label_vi TEXT NOT NULL,
  active_from TEXT NOT NULL, active_to TEXT,
  PRIMARY KEY(definition_set_id,segment_code),
  CHECK(active_to IS NULL OR active_to>=active_from)
) STRICT;

CREATE TABLE finance_periods (
  period TEXT PRIMARY KEY CHECK(length(period)=7 AND period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(period,6,2) BETWEEN '01' AND '12'),
  book_id TEXT NOT NULL REFERENCES finance_books(id),
  definition_set_id TEXT NOT NULL REFERENCES finance_definition_sets(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  authoritative_closed_revision_id TEXT REFERENCES finance_actual_revisions(id) DEFERRABLE INITIALLY DEFERRED,
  working_revision_id TEXT REFERENCES finance_actual_revisions(id) DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE finance_plan_versions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES finance_books(id),
  fiscal_year INTEGER NOT NULL,
  definition_set_id TEXT NOT NULL REFERENCES finance_definition_sets(id),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK(kind IN ('budget','forecast','scenario')),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  is_baseline INTEGER NOT NULL DEFAULT 0 CHECK(is_baseline IN (0,1)),
  assumptions TEXT NOT NULL DEFAULT '',
  source_plan_id TEXT REFERENCES finance_plan_versions(id),
  actual_cutoff TEXT,
  source_actuals TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(source_actuals) AND json_type(source_actuals)='object'),
  reporting_snapshot TEXT CHECK(reporting_snapshot IS NULL OR json_valid(reporting_snapshot)),
  created_at TEXT NOT NULL, published_at TEXT,
  UNIQUE(id,definition_set_id),
  CHECK(is_baseline=0 OR (kind='budget' AND state='published'))
) STRICT;
CREATE UNIQUE INDEX finance_official_baseline ON finance_plan_versions(book_id,fiscal_year) WHERE is_baseline=1;
CREATE INDEX finance_plans_year_state ON finance_plan_versions(fiscal_year,state,created_at);

CREATE TABLE finance_actual_revisions (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL REFERENCES finance_periods(period),
  definition_set_id TEXT NOT NULL REFERENCES finance_definition_sets(id),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','closed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  opening_source_revision_id TEXT REFERENCES finance_actual_revisions(id),
  supersedes_revision_id TEXT REFERENCES finance_actual_revisions(id),
  sources TEXT NOT NULL CHECK(json_valid(sources) AND json_type(sources)='object'),
  reporting_snapshot TEXT CHECK(reporting_snapshot IS NULL OR json_valid(reporting_snapshot)),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, closed_at TEXT,
  UNIQUE(id,definition_set_id),
  CHECK(state!='closed' OR (closed_at IS NOT NULL AND reporting_snapshot IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX finance_one_working_revision ON finance_actual_revisions(period) WHERE state='draft';
CREATE INDEX finance_actuals_period_state ON finance_actual_revisions(period,state,created_at);

CREATE TABLE finance_cash_accounts (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES finance_books(id),
  account_code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
  active_from TEXT NOT NULL, active_to TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  CHECK(active_to IS NULL OR active_to>=active_from)
) STRICT;

CREATE TABLE finance_write_operations (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL, request_key TEXT NOT NULL,
  action TEXT NOT NULL, target_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  content_fingerprint TEXT,
  receipt TEXT NOT NULL CHECK(json_valid(receipt)),
  created_at TEXT NOT NULL,
  UNIQUE(actor_id,request_key)
) STRICT;
CREATE UNIQUE INDEX finance_import_fingerprint ON finance_write_operations(action,target_id,content_fingerprint) WHERE content_fingerprint IS NOT NULL;

CREATE TABLE finance_plan_values (
  plan_id TEXT NOT NULL,
  definition_set_id TEXT NOT NULL,
  period TEXT NOT NULL,
  line_code TEXT NOT NULL, segment_code TEXT NOT NULL,
  value_state TEXT NOT NULL CHECK(value_state IN ('entered','not_applicable')),
  amount INTEGER CHECK(amount BETWEEN -9007199254740991 AND 9007199254740991),
  note TEXT NOT NULL DEFAULT '', evidence_ref TEXT NOT NULL DEFAULT '',
  source_operation_id TEXT NOT NULL REFERENCES finance_write_operations(id),
  PRIMARY KEY(plan_id,period,line_code,segment_code),
  FOREIGN KEY(plan_id,definition_set_id) REFERENCES finance_plan_versions(id,definition_set_id),
  FOREIGN KEY(definition_set_id,line_code) REFERENCES finance_lines(definition_set_id,line_code),
  FOREIGN KEY(definition_set_id,segment_code) REFERENCES finance_segments(definition_set_id,segment_code),
  CHECK((value_state='entered' AND amount IS NOT NULL) OR (value_state='not_applicable' AND amount IS NULL AND length(trim(note))>0)),
  CHECK(amount IS NULL OR amount>=0 OR length(trim(note))>0)
) STRICT;

CREATE TABLE finance_actual_values (
  actual_revision_id TEXT NOT NULL,
  definition_set_id TEXT NOT NULL,
  line_code TEXT NOT NULL, segment_code TEXT NOT NULL,
  value_state TEXT NOT NULL CHECK(value_state IN ('entered','not_applicable')),
  amount INTEGER CHECK(amount BETWEEN -9007199254740991 AND 9007199254740991),
  note TEXT NOT NULL DEFAULT '', evidence_ref TEXT NOT NULL DEFAULT '',
  source_operation_id TEXT NOT NULL REFERENCES finance_write_operations(id),
  PRIMARY KEY(actual_revision_id,line_code,segment_code),
  FOREIGN KEY(actual_revision_id,definition_set_id) REFERENCES finance_actual_revisions(id,definition_set_id),
  FOREIGN KEY(definition_set_id,line_code) REFERENCES finance_lines(definition_set_id,line_code),
  FOREIGN KEY(definition_set_id,segment_code) REFERENCES finance_segments(definition_set_id,segment_code),
  CHECK((value_state='entered' AND amount IS NOT NULL) OR (value_state='not_applicable' AND amount IS NULL AND length(trim(note))>0)),
  CHECK(amount IS NULL OR amount>=0 OR length(trim(note))>0)
) STRICT;

CREATE TABLE finance_balance_observations (
  actual_revision_id TEXT NOT NULL REFERENCES finance_actual_revisions(id),
  account_code TEXT NOT NULL REFERENCES finance_cash_accounts(account_code),
  observation_kind TEXT NOT NULL CHECK(observation_kind IN ('opening','closing')),
  amount INTEGER CHECK(amount BETWEEN -9007199254740991 AND 9007199254740991),
  restricted_amount INTEGER CHECK(restricted_amount BETWEEN 0 AND 9007199254740991),
  classification TEXT NOT NULL CHECK(classification IN ('cash','borrowing')),
  evidence_ref TEXT NOT NULL DEFAULT '', as_of_date TEXT NOT NULL DEFAULT '',
  source_operation_id TEXT NOT NULL REFERENCES finance_write_operations(id),
  PRIMARY KEY(actual_revision_id,account_code,observation_kind)
) STRICT;

CREATE TABLE finance_import_batches (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES finance_books(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  kind TEXT NOT NULL CHECK(kind IN ('plan','actual')),
  plan_id TEXT REFERENCES finance_plan_versions(id),
  fiscal_year INTEGER NOT NULL,
  definition_set_id TEXT NOT NULL REFERENCES finance_definition_sets(id),
  definition_version INTEGER NOT NULL,
  book_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('preview','partial','committed','discarded')),
  content_hash TEXT NOT NULL,
  months TEXT NOT NULL CHECK(json_valid(months) AND json_type(months)='array'),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  CHECK((kind='plan' AND plan_id IS NOT NULL) OR (kind='actual' AND plan_id IS NULL))
) STRICT;
CREATE INDEX finance_imports_status_time ON finance_import_batches(status,created_at);

CREATE TABLE finance_audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
  action TEXT NOT NULL, target_id TEXT NOT NULL,
  period TEXT,
  operation_id TEXT NOT NULL REFERENCES finance_write_operations(id),
  detail TEXT NOT NULL CHECK(json_valid(detail)),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX finance_audit_target_time ON finance_audit_events(target_id,created_at DESC,id);
CREATE INDEX finance_audit_time ON finance_audit_events(created_at DESC,id);

-- Each assertion inserts 1 or deliberately violates CHECK. Zero-row UPDATE is never a guard.
CREATE TABLE finance_write_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1)) STRICT;

CREATE TRIGGER finance_book_measurements_immutable BEFORE UPDATE ON finance_books
WHEN (NEW.currency!=OLD.currency OR NEW.precision!=OLD.precision OR NEW.fiscal_start_month!=OLD.fiscal_start_month OR NEW.first_period!=OLD.first_period OR NEW.timezone!=OLD.timezone)
 AND (EXISTS(SELECT 1 FROM finance_plan_values) OR EXISTS(SELECT 1 FROM finance_actual_values) OR EXISTS(SELECT 1 FROM finance_periods) OR EXISTS(SELECT 1 FROM finance_balance_observations))
BEGIN SELECT RAISE(ABORT,'finance_measurements_immutable'); END;
CREATE TRIGGER finance_book_no_delete BEFORE DELETE ON finance_books BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;

CREATE TRIGGER finance_definition_immutable BEFORE UPDATE ON finance_definition_sets WHEN OLD.state='published'
BEGIN SELECT RAISE(ABORT,'finance_definition_immutable'); END;
CREATE TRIGGER finance_definition_no_delete BEFORE DELETE ON finance_definition_sets
BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;
CREATE TRIGGER finance_line_frozen_insert BEFORE INSERT ON finance_lines WHEN EXISTS(SELECT 1 FROM finance_definition_sets WHERE id=NEW.definition_set_id AND state='published')
BEGIN SELECT RAISE(ABORT,'finance_definition_immutable'); END;
CREATE TRIGGER finance_line_frozen_update BEFORE UPDATE ON finance_lines WHEN EXISTS(SELECT 1 FROM finance_definition_sets WHERE id=OLD.definition_set_id AND state='published')
BEGIN SELECT RAISE(ABORT,'finance_definition_immutable'); END;
CREATE TRIGGER finance_line_frozen_delete BEFORE DELETE ON finance_lines WHEN EXISTS(SELECT 1 FROM finance_definition_sets WHERE id=OLD.definition_set_id AND state='published')
BEGIN SELECT RAISE(ABORT,'finance_definition_immutable'); END;
CREATE TRIGGER finance_segment_frozen_insert BEFORE INSERT ON finance_segments WHEN EXISTS(SELECT 1 FROM finance_definition_sets WHERE id=NEW.definition_set_id AND state='published')
BEGIN SELECT RAISE(ABORT,'finance_definition_immutable'); END;
CREATE TRIGGER finance_segment_frozen_update BEFORE UPDATE ON finance_segments WHEN EXISTS(SELECT 1 FROM finance_definition_sets WHERE id=OLD.definition_set_id AND state='published')
BEGIN SELECT RAISE(ABORT,'finance_definition_immutable'); END;
CREATE TRIGGER finance_segment_frozen_delete BEFORE DELETE ON finance_segments WHEN EXISTS(SELECT 1 FROM finance_definition_sets WHERE id=OLD.definition_set_id AND state='published')
BEGIN SELECT RAISE(ABORT,'finance_definition_immutable'); END;

CREATE TRIGGER finance_plan_immutable BEFORE UPDATE ON finance_plan_versions WHEN OLD.state='published'
BEGIN SELECT RAISE(ABORT,'finance_plan_immutable'); END;
CREATE TRIGGER finance_plan_no_delete BEFORE DELETE ON finance_plan_versions
BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;
CREATE TRIGGER finance_plan_value_insert_guard BEFORE INSERT ON finance_plan_values
WHEN NOT EXISTS(SELECT 1 FROM finance_plan_versions WHERE id=NEW.plan_id AND state='draft')
 OR NOT EXISTS(SELECT 1 FROM finance_lines WHERE definition_set_id=NEW.definition_set_id AND line_code=NEW.line_code AND kind='input' AND (NEW.value_state!='not_applicable' OR allow_na=1) AND (require_note=0 OR length(trim(NEW.note))>0))
BEGIN SELECT RAISE(ABORT,'finance_value_locked_or_invalid'); END;
CREATE TRIGGER finance_plan_value_update_guard BEFORE UPDATE ON finance_plan_values
WHEN NOT EXISTS(SELECT 1 FROM finance_plan_versions WHERE id=OLD.plan_id AND state='draft')
 OR NOT EXISTS(SELECT 1 FROM finance_plan_versions WHERE id=NEW.plan_id AND state='draft')
 OR NOT EXISTS(SELECT 1 FROM finance_lines WHERE definition_set_id=NEW.definition_set_id AND line_code=NEW.line_code AND kind='input' AND (NEW.value_state!='not_applicable' OR allow_na=1) AND (require_note=0 OR length(trim(NEW.note))>0))
BEGIN SELECT RAISE(ABORT,'finance_value_locked_or_invalid'); END;
CREATE TRIGGER finance_plan_value_delete_guard BEFORE DELETE ON finance_plan_values WHEN NOT EXISTS(SELECT 1 FROM finance_plan_versions WHERE id=OLD.plan_id AND state='draft')
BEGIN SELECT RAISE(ABORT,'finance_plan_immutable'); END;

CREATE TRIGGER finance_actual_immutable BEFORE UPDATE ON finance_actual_revisions WHEN OLD.state='closed'
BEGIN SELECT RAISE(ABORT,'finance_actual_immutable'); END;
CREATE TRIGGER finance_actual_no_delete BEFORE DELETE ON finance_actual_revisions
BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;
CREATE TRIGGER finance_actual_value_insert_guard BEFORE INSERT ON finance_actual_values
WHEN NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=NEW.actual_revision_id AND state='draft')
 OR NOT EXISTS(SELECT 1 FROM finance_lines WHERE definition_set_id=NEW.definition_set_id AND line_code=NEW.line_code AND kind='input' AND (NEW.value_state!='not_applicable' OR allow_na=1) AND (require_note=0 OR length(trim(NEW.note))>0))
BEGIN SELECT RAISE(ABORT,'finance_value_locked_or_invalid'); END;
CREATE TRIGGER finance_actual_value_update_guard BEFORE UPDATE ON finance_actual_values
WHEN NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=OLD.actual_revision_id AND state='draft')
 OR NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=NEW.actual_revision_id AND state='draft')
 OR NOT EXISTS(SELECT 1 FROM finance_lines WHERE definition_set_id=NEW.definition_set_id AND line_code=NEW.line_code AND kind='input' AND (NEW.value_state!='not_applicable' OR allow_na=1) AND (require_note=0 OR length(trim(NEW.note))>0))
BEGIN SELECT RAISE(ABORT,'finance_value_locked_or_invalid'); END;
CREATE TRIGGER finance_actual_value_delete_guard BEFORE DELETE ON finance_actual_values WHEN NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=OLD.actual_revision_id AND state='draft')
BEGIN SELECT RAISE(ABORT,'finance_actual_immutable'); END;
CREATE TRIGGER finance_observation_insert_guard BEFORE INSERT ON finance_balance_observations WHEN NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=NEW.actual_revision_id AND state='draft')
BEGIN SELECT RAISE(ABORT,'finance_actual_immutable'); END;
CREATE TRIGGER finance_observation_update_guard BEFORE UPDATE ON finance_balance_observations WHEN NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=OLD.actual_revision_id AND state='draft') OR NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=NEW.actual_revision_id AND state='draft')
BEGIN SELECT RAISE(ABORT,'finance_actual_immutable'); END;
CREATE TRIGGER finance_observation_delete_guard BEFORE DELETE ON finance_balance_observations WHEN NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=OLD.actual_revision_id AND state='draft')
BEGIN SELECT RAISE(ABORT,'finance_actual_immutable'); END;

CREATE TRIGGER finance_period_pointers_guard BEFORE UPDATE ON finance_periods
WHEN (NEW.working_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=NEW.working_revision_id AND period=NEW.period AND definition_set_id=NEW.definition_set_id AND state='draft'))
 OR (NEW.authoritative_closed_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM finance_actual_revisions WHERE id=NEW.authoritative_closed_revision_id AND period=NEW.period AND definition_set_id=NEW.definition_set_id AND state='closed'))
BEGIN SELECT RAISE(ABORT,'finance_period_pointer_invalid'); END;
CREATE TRIGGER finance_period_no_delete BEFORE DELETE ON finance_periods BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;
CREATE TRIGGER finance_account_no_delete BEFORE DELETE ON finance_cash_accounts BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;
CREATE TRIGGER finance_operation_no_update BEFORE UPDATE ON finance_write_operations BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;
CREATE TRIGGER finance_operation_no_delete BEFORE DELETE ON finance_write_operations BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;
CREATE TRIGGER finance_audit_no_update BEFORE UPDATE ON finance_audit_events BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;
CREATE TRIGGER finance_audit_no_delete BEFORE DELETE ON finance_audit_events BEGIN SELECT RAISE(ABORT,'finance_history_immutable'); END;

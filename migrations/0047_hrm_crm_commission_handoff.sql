-- CRM commission handed to HRM payroll (spec §10.1, HRM-13). Recorded CRM
-- commission never becomes pay by itself: Finance confirms an employee's
-- earned lines for one month as an immutable handoff, and payroll may import
-- that confirmed total once. Customer, opportunity and ledger detail stays in
-- CRM; HRM reads only the handoff total, month, owner and line count. This
-- migration creates no handoff, policy approval or payroll data.
CREATE TABLE crm_commission_handoffs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]'),
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0 AND amount_vnd <= 9007199254740991),
  line_count INTEGER NOT NULL CHECK (line_count > 0),
  lines_digest TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'confirmed' CHECK (state IN ('confirmed','voided')),
  confirmed_by TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  voided_by TEXT,
  voided_at TEXT,
  void_reason TEXT,
  CHECK (confirmed_by != user_id),
  CHECK ((state='confirmed' AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
    OR (state='voided' AND voided_by IS NOT NULL AND voided_at IS NOT NULL AND length(trim(void_reason)) > 0))
);
CREATE INDEX crm_commission_handoffs_user ON crm_commission_handoffs(user_id,period,state);

CREATE TABLE crm_commission_handoff_lines (
  handoff_id TEXT NOT NULL REFERENCES crm_commission_handoffs(id),
  line_key TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('seller','referrer')),
  component TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  eligible_on TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  PRIMARY KEY (handoff_id,line_key)
);
-- An earned commission line can sit in only one live handoff.
CREATE UNIQUE INDEX crm_commission_line_once ON crm_commission_handoff_lines(line_key) WHERE active=1;

CREATE TRIGGER crm_commission_handoff_immutable
BEFORE UPDATE OF id,user_id,period,amount_vnd,line_count,lines_digest,confirmed_by,confirmed_at ON crm_commission_handoffs
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER crm_commission_handoff_no_delete BEFORE DELETE ON crm_commission_handoffs BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER crm_commission_handoff_state BEFORE UPDATE OF state,voided_by,voided_at,void_reason ON crm_commission_handoffs
WHEN NOT (OLD.state='confirmed' AND NEW.state='voided')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER crm_commission_handoff_line_immutable
BEFORE UPDATE OF handoff_id,line_key,opportunity_id,policy_id,role,component,amount_vnd,eligible_on ON crm_commission_handoff_lines
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER crm_commission_handoff_line_release BEFORE UPDATE OF active ON crm_commission_handoff_lines
WHEN NOT (OLD.active=1 AND NEW.active=0 AND EXISTS(SELECT 1 FROM crm_commission_handoffs h WHERE h.id=OLD.handoff_id AND h.state='voided'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER crm_commission_handoff_line_no_delete BEFORE DELETE ON crm_commission_handoff_lines BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

-- One channel per person and month: a commission month is either recorded as
-- a manual CRM payout or handed to payroll, never both.
CREATE TRIGGER crm_commission_handoff_not_paid_out BEFORE INSERT ON crm_commission_handoffs
WHEN EXISTS(SELECT 1 FROM crm_commission_payouts WHERE user_id=NEW.user_id AND period=NEW.period)
BEGIN SELECT RAISE(ABORT,'crm_commission_period_paid_out'); END;
CREATE TRIGGER crm_commission_payout_not_handed_off BEFORE INSERT ON crm_commission_payouts
WHEN EXISTS(SELECT 1 FROM crm_commission_handoffs WHERE user_id=NEW.user_id AND period=NEW.period AND state='confirmed')
BEGIN SELECT RAISE(ABORT,'crm_commission_period_handed_off'); END;

-- Payroll lines gain the `crm_commission` source kind. SQLite cannot alter a
-- CHECK constraint, so the table is rebuilt with identical columns, data,
-- index and triggers (0024 publish immutability, 0043 closeout watches).
CREATE TABLE hrm_payroll_lines_v2 (
  id TEXT PRIMARY KEY,
  run_person_id TEXT NOT NULL REFERENCES hrm_payroll_run_people(id),
  component_code TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('earning','deduction')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0 AND amount_minor <= 9007199254740991),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('employment_record','locked_time','approved_adjustment','manual_evidence','crm_commission')),
  source_reference TEXT NOT NULL,
  zero_reason TEXT NOT NULL DEFAULT '',
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(run_person_id,component_code),
  CHECK (amount_minor != 0 OR length(trim(zero_reason)) > 0)
);
INSERT INTO hrm_payroll_lines_v2(id,run_person_id,component_code,title_en,title_vi,direction,amount_minor,source_kind,source_reference,zero_reason,actor_id,created_at,updated_at)
  SELECT id,run_person_id,component_code,title_en,title_vi,direction,amount_minor,source_kind,source_reference,zero_reason,actor_id,created_at,updated_at FROM hrm_payroll_lines;
DROP TABLE hrm_payroll_lines;
ALTER TABLE hrm_payroll_lines_v2 RENAME TO hrm_payroll_lines;
CREATE INDEX hrm_payroll_lines_person ON hrm_payroll_lines(run_person_id,component_code);
CREATE INDEX hrm_payroll_lines_source ON hrm_payroll_lines(source_kind,source_reference);
CREATE TRIGGER hrm_payroll_lines_published_insert BEFORE INSERT ON hrm_payroll_lines
WHEN EXISTS(SELECT 1 FROM hrm_payroll_run_people rp JOIN hrm_payroll_runs r ON r.id=rp.run_id WHERE rp.id=NEW.run_person_id AND r.state IN ('published','closed'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_lines_published_update BEFORE UPDATE ON hrm_payroll_lines
WHEN EXISTS(SELECT 1 FROM hrm_payroll_run_people rp JOIN hrm_payroll_runs r ON r.id=rp.run_id WHERE rp.id=OLD.run_person_id AND r.state IN ('published','closed'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_lines_published_delete BEFORE DELETE ON hrm_payroll_lines
WHEN EXISTS(SELECT 1 FROM hrm_payroll_run_people rp JOIN hrm_payroll_runs r ON r.id=rp.run_id WHERE rp.id=OLD.run_person_id AND r.state IN ('published','closed'))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_watch_payroll_lines_insert AFTER INSERT ON hrm_payroll_lines BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_lines',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payroll_run_people rp WHERE rp.id=NEW.run_person_id AND rp.employment_id=c.employment_id);
END;
CREATE TRIGGER hrm_closeout_watch_payroll_lines_update AFTER UPDATE ON hrm_payroll_lines BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_lines',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payroll_run_people rp WHERE rp.id=NEW.run_person_id AND rp.employment_id=c.employment_id);
END;
CREATE TRIGGER hrm_closeout_watch_payroll_lines_delete AFTER DELETE ON hrm_payroll_lines BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_lines',OLD.id,OLD.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payroll_run_people rp WHERE rp.id=OLD.run_person_id AND rp.employment_id=c.employment_id);
END;

-- A commission line must equal one confirmed handoff for the paid employee's
-- own EmDash account and the run's calendar month.
CREATE TRIGGER hrm_payroll_lines_commission_source BEFORE INSERT ON hrm_payroll_lines
WHEN NEW.source_kind='crm_commission' AND NOT EXISTS(
  SELECT 1 FROM crm_commission_handoffs h JOIN hrm_payroll_run_people rp ON rp.id=NEW.run_person_id JOIN hrm_people p ON p.id=rp.person_id JOIN hrm_payroll_runs r ON r.id=rp.run_id
  WHERE h.id=NEW.source_reference AND h.state='confirmed' AND h.user_id=p.user_id AND h.amount_vnd=NEW.amount_minor
  AND h.period=substr(r.starts_on,1,7) AND h.period=substr(r.ends_on,1,7))
BEGIN SELECT RAISE(ABORT,'crm_commission_handoff_invalid'); END;
CREATE TRIGGER hrm_payroll_lines_commission_source_update BEFORE UPDATE OF source_kind,source_reference,amount_minor ON hrm_payroll_lines
WHEN NEW.source_kind='crm_commission' AND NOT EXISTS(
  SELECT 1 FROM crm_commission_handoffs h JOIN hrm_payroll_run_people rp ON rp.id=NEW.run_person_id JOIN hrm_people p ON p.id=rp.person_id JOIN hrm_payroll_runs r ON r.id=rp.run_id
  WHERE h.id=NEW.source_reference AND h.state='confirmed' AND h.user_id=p.user_id AND h.amount_vnd=NEW.amount_minor
  AND h.period=substr(r.starts_on,1,7) AND h.period=substr(r.ends_on,1,7))
BEGIN SELECT RAISE(ABORT,'crm_commission_handoff_invalid'); END;

-- (Created after the rebuild: a trigger naming a dropped table would block
-- the rename.) Once payroll references a handoff, it cannot be voided; a later change
-- goes through a linked payroll correction instead.
CREATE TRIGGER crm_commission_handoff_void_unused BEFORE UPDATE OF state ON crm_commission_handoffs
WHEN NEW.state='voided' AND EXISTS(SELECT 1 FROM hrm_payroll_lines WHERE source_kind='crm_commission' AND source_reference=OLD.id)
BEGIN SELECT RAISE(ABORT,'crm_commission_handoff_in_payroll'); END;

-- A customer refund after a commission handoff (spec §10.1, HRM-13). The CRM
-- marks the line forfeited, but the confirmed handoff and any payslip that
-- used it stay immutable. Finance records an explicit, append-only refund
-- notice for the forfeited handed-off lines; payroll staff see it and decide
-- any recovery through a reviewed correction. Nothing is deducted
-- automatically. Creates no notices or amounts.
CREATE TABLE crm_commission_refund_notices (
  id TEXT PRIMARY KEY,
  handoff_id TEXT NOT NULL REFERENCES crm_commission_handoffs(id),
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0 AND amount_vnd <= 9007199254740991),
  line_count INTEGER NOT NULL CHECK (line_count > 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX crm_commission_refund_notices_handoff ON crm_commission_refund_notices(handoff_id,recorded_at);
-- Each forfeited handed-off line is noticed once.
CREATE TABLE crm_commission_refund_lines (
  notice_id TEXT NOT NULL REFERENCES crm_commission_refund_notices(id),
  handoff_id TEXT NOT NULL,
  line_key TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  PRIMARY KEY (handoff_id,line_key)
);
CREATE TRIGGER crm_commission_refund_notice_immutable BEFORE UPDATE ON crm_commission_refund_notices BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER crm_commission_refund_notice_no_delete BEFORE DELETE ON crm_commission_refund_notices BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER crm_commission_refund_line_immutable BEFORE UPDATE ON crm_commission_refund_lines BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER crm_commission_refund_line_no_delete BEFORE DELETE ON crm_commission_refund_lines BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
-- A noticed line must be a frozen line of that confirmed handoff, at its
-- frozen amount; the notice cannot exceed what was handed off.
CREATE TRIGGER crm_commission_refund_line_valid BEFORE INSERT ON crm_commission_refund_lines
WHEN NOT EXISTS(SELECT 1 FROM crm_commission_handoff_lines l JOIN crm_commission_handoffs h ON h.id=l.handoff_id JOIN crm_commission_refund_notices n ON n.id=NEW.notice_id AND n.handoff_id=h.id
  WHERE l.handoff_id=NEW.handoff_id AND l.line_key=NEW.line_key AND l.amount_vnd=NEW.amount_vnd AND h.state='confirmed')
BEGIN SELECT RAISE(ABORT,'crm_commission_refund_invalid'); END;
CREATE TRIGGER crm_commission_refund_notice_bound BEFORE INSERT ON crm_commission_refund_notices
WHEN NEW.recorded_by=(SELECT user_id FROM crm_commission_handoffs WHERE id=NEW.handoff_id)
  OR NOT EXISTS(SELECT 1 FROM crm_commission_handoffs WHERE id=NEW.handoff_id AND state='confirmed')
  -- Before payroll uses a handoff, Finance voids and re-confirms instead.
  OR NOT EXISTS(SELECT 1 FROM hrm_payroll_lines WHERE source_kind='crm_commission' AND source_reference=NEW.handoff_id)
  OR NEW.amount_vnd+COALESCE((SELECT SUM(amount_vnd) FROM crm_commission_refund_notices WHERE handoff_id=NEW.handoff_id),0)>(SELECT amount_vnd FROM crm_commission_handoffs WHERE id=NEW.handoff_id)
BEGIN SELECT RAISE(ABORT,'crm_commission_refund_invalid'); END;

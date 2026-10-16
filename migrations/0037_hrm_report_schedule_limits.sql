-- Resume is another transition to active. Keep the 20-schedule cap at D1 so
-- concurrent API requests and direct writes cannot bypass the same invariant.
CREATE TRIGGER hrm_report_schedule_active_limit_insert
BEFORE INSERT ON hrm_report_schedules
WHEN NEW.state='active' AND (
  SELECT COUNT(*) FROM hrm_report_schedules
  WHERE legal_entity=NEW.legal_entity AND state='active'
)>=20
BEGIN SELECT RAISE(ABORT,'hrm_report_schedule_limit'); END;

CREATE TRIGGER hrm_report_schedule_active_limit_resume
BEFORE UPDATE OF state ON hrm_report_schedules
WHEN OLD.state!='active' AND NEW.state='active' AND (
  SELECT COUNT(*) FROM hrm_report_schedules
  WHERE legal_entity=NEW.legal_entity AND state='active'
)>=20
BEGIN SELECT RAISE(ABORT,'hrm_report_schedule_limit'); END;

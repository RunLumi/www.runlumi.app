-- Calendar assignment edits must not change the expected-work snapshot of a
-- period under review or locked. An independently reopened period is editable.
DROP TRIGGER IF EXISTS hrm_work_assignment_no_locked_overlap_insert;
DROP TRIGGER IF EXISTS hrm_work_assignment_no_locked_overlap_end;

CREATE TRIGGER hrm_work_assignment_no_locked_overlap_insert
BEFORE INSERT ON hrm_work_assignments
WHEN EXISTS (
  SELECT 1 FROM hrm_time_periods p
  WHERE p.state IN ('reviewing','locked','reopen_requested')
    AND NEW.effective_from<=p.ends_on
    AND (NEW.effective_to IS NULL OR NEW.effective_to>=p.starts_on)
)
BEGIN SELECT RAISE(ABORT,'time_period_locked'); END;

CREATE TRIGGER hrm_work_assignment_no_locked_overlap_end
BEFORE UPDATE OF effective_to ON hrm_work_assignments
WHEN OLD.effective_to IS NOT NEW.effective_to AND EXISTS (
  SELECT 1 FROM hrm_time_periods p
  WHERE p.state IN ('reviewing','locked','reopen_requested')
    AND OLD.effective_from<=p.ends_on
    AND (OLD.effective_to IS NULL OR OLD.effective_to>=p.starts_on OR NEW.effective_to IS NULL OR NEW.effective_to>=p.starts_on)
)
BEGIN SELECT RAISE(ABORT,'time_period_locked_calendar_change'); END;

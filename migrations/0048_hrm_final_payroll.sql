-- P4: final pay for an employment that has already ended (spec §7, §10).
-- A regular run enrols only probation/active/notice employments and cannot
-- publish while a participant has ended. A final run is an explicit,
-- single-person run for one ended employment that overlapped the locked
-- period. It follows every regular control (locked time, traced
-- compensation, independent review/approval, immutable slips). Creates no
-- runs, amounts or employee data.
ALTER TABLE hrm_payroll_runs ADD COLUMN final_employment_id TEXT REFERENCES hrm_employments(id);

-- The regular-run key now excludes final runs; one final run per
-- employment, policy and period.
DROP INDEX hrm_payroll_one_regular_run;
CREATE UNIQUE INDEX hrm_payroll_one_regular_run ON hrm_payroll_runs(policy_version_id,period_id) WHERE adjustment_of_payslip_id IS NULL AND final_employment_id IS NULL;
CREATE UNIQUE INDEX hrm_payroll_one_final_run ON hrm_payroll_runs(policy_version_id,period_id,final_employment_id) WHERE final_employment_id IS NOT NULL;

CREATE TRIGGER hrm_payroll_run_final_immutable BEFORE UPDATE OF final_employment_id ON hrm_payroll_runs
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_payroll_run_final_not_correction BEFORE INSERT ON hrm_payroll_runs
WHEN NEW.final_employment_id IS NOT NULL AND NEW.adjustment_of_payslip_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
-- A final run carries exactly its one employment.
CREATE TRIGGER hrm_payroll_final_run_roster BEFORE INSERT ON hrm_payroll_run_people
WHEN EXISTS(SELECT 1 FROM hrm_payroll_runs r WHERE r.id=NEW.run_id AND r.final_employment_id IS NOT NULL AND (r.final_employment_id!=NEW.employment_id
  OR EXISTS(SELECT 1 FROM hrm_payroll_run_people o WHERE o.run_id=NEW.run_id)))
BEGIN SELECT RAISE(ABORT,'hrm_final_payroll_roster'); END;

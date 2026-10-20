-- Owner decision 2026-10-20: HRM covers employees and contractors (CTV), and
-- contractors are never in payroll. Every employment period now records its
-- relationship type. Existing periods stay employees. Which profile fields a
-- contractor needs is a separate owner decision (P0 item 1).
ALTER TABLE hrm_employments ADD COLUMN relationship_type TEXT NOT NULL DEFAULT 'employee' CHECK (relationship_type IN ('employee','contractor'));

-- Employment history now captures the relationship type.
DROP TRIGGER hrm_employment_created;
DROP TRIGGER hrm_employment_changed;
CREATE TRIGGER hrm_employment_created AFTER INSERT ON hrm_employments BEGIN
  INSERT INTO hrm_employment_history VALUES(NEW.id,NEW.version,json_object('person_id',NEW.person_id,'work_email',NEW.work_email,'work_phone',NEW.work_phone,'department',NEW.department,'job_title',NEW.job_title,'legal_entity',NEW.legal_entity,'location',NEW.location,'manager_user_id',NEW.manager_user_id,'status',NEW.status,'started_on',NEW.started_on,'ended_on',NEW.ended_on,'relationship_type',NEW.relationship_type),NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,created_at) VALUES(NEW.actor_id,'employment_created',NEW.person_id,NEW.id,NEW.updated_at);
END;
CREATE TRIGGER hrm_employment_changed AFTER UPDATE ON hrm_employments BEGIN
  INSERT INTO hrm_employment_history VALUES(NEW.id,NEW.version,json_object('person_id',NEW.person_id,'work_email',NEW.work_email,'work_phone',NEW.work_phone,'department',NEW.department,'job_title',NEW.job_title,'legal_entity',NEW.legal_entity,'location',NEW.location,'manager_user_id',NEW.manager_user_id,'status',NEW.status,'started_on',NEW.started_on,'ended_on',NEW.ended_on,'relationship_type',NEW.relationship_type),NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(NEW.actor_id,'employment_updated',NEW.person_id,NEW.id,json_object('version',NEW.version),NEW.updated_at);
END;

-- Contractors never enter payroll: no compensation version and no payroll
-- run participation, whatever path inserts the row.
CREATE TRIGGER hrm_compensation_employee_only BEFORE INSERT ON hrm_compensation_versions
WHEN EXISTS(SELECT 1 FROM hrm_employments WHERE id=NEW.employment_id AND relationship_type!='employee')
BEGIN SELECT RAISE(ABORT,'hrm_contractor_not_payroll'); END;
CREATE TRIGGER hrm_payroll_run_people_employee_only BEFORE INSERT ON hrm_payroll_run_people
WHEN EXISTS(SELECT 1 FROM hrm_employments WHERE id=NEW.employment_id AND relationship_type!='employee')
BEGIN SELECT RAISE(ABORT,'hrm_contractor_not_payroll'); END;
-- Once payroll or compensation references an employment, its type is fixed:
-- issued pay must stay explainable by the relationship it was paid under.
CREATE TRIGGER hrm_relationship_type_fixed_after_payroll BEFORE UPDATE OF relationship_type ON hrm_employments
WHEN NEW.relationship_type!=OLD.relationship_type AND (EXISTS(SELECT 1 FROM hrm_payroll_run_people WHERE employment_id=OLD.id) OR EXISTS(SELECT 1 FROM hrm_compensation_versions WHERE employment_id=OLD.id))
BEGIN SELECT RAISE(ABORT,'hrm_relationship_type_fixed'); END;

-- Offboarding case, scoped checklist and durable role-revocation handoff.
CREATE TABLE hrm_offboarding_cases (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL UNIQUE REFERENCES hrm_employments(id),
  employee_user_id TEXT,
  manager_user_id TEXT,
  ended_on TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','completed','cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_by TEXT,
  completed_at TEXT,
  cancelled_by TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT
);
CREATE INDEX hrm_offboarding_person ON hrm_offboarding_cases(person_id,ended_on DESC);
CREATE INDEX hrm_offboarding_queue ON hrm_offboarding_cases(state,ended_on);

CREATE TABLE hrm_offboarding_tasks (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES hrm_offboarding_cases(id),
  task_key TEXT NOT NULL CHECK(task_key IN ('manager_handover','asset_return','workspace_access','records_review','payroll_closeout')),
  assignee_kind TEXT NOT NULL CHECK(assignee_kind IN ('manager','hrm_officer','hrm_admin','system_admin')),
  assignee_user_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','completed','blocked','not_required','superseded')),
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  completion_note TEXT,
  blocked_reason TEXT,
  completed_by TEXT,
  completed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(case_id,task_key),
  CHECK(state NOT IN ('completed','not_required','superseded') OR (completed_by IS NOT NULL AND completed_at IS NOT NULL AND completion_note IS NOT NULL))
);
CREATE INDEX hrm_offboarding_tasks_assignee ON hrm_offboarding_tasks(assignee_user_id,state,task_key);
CREATE INDEX hrm_offboarding_tasks_case ON hrm_offboarding_tasks(case_id,state,task_key);

CREATE TRIGGER hrm_offboarding_end_date_required_update BEFORE UPDATE OF status,ended_on ON hrm_employments
WHEN NEW.status='ended' AND NEW.ended_on IS NULL BEGIN
  SELECT RAISE(ABORT,'offboarding_end_date_required');
END;
CREATE TRIGGER hrm_offboarding_end_date_required_insert BEFORE INSERT ON hrm_employments
WHEN NEW.status='ended' AND NEW.ended_on IS NULL BEGIN
  SELECT RAISE(ABORT,'offboarding_end_date_required');
END;

CREATE TRIGGER hrm_offboarding_created AFTER INSERT ON hrm_offboarding_cases BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,employment_id,offboarding_case_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'offboarding_started',NEW.person_id,NEW.employment_id,NEW.id,NEW.id,json_object('ended_on',NEW.ended_on),NEW.created_at);
END;
CREATE TRIGGER hrm_offboarding_tasks_seeded AFTER INSERT ON hrm_offboarding_cases BEGIN
  INSERT INTO hrm_offboarding_tasks(id,case_id,task_key,assignee_kind,assignee_user_id,state,required,completion_note,completed_by,completed_at,version,actor_id,created_at,updated_at)
  VALUES('offtask_'||lower(hex(randomblob(16))),NEW.id,'manager_handover','manager',NEW.manager_user_id,
    CASE WHEN NEW.manager_user_id IS NULL THEN 'not_required' ELSE 'pending' END,1,
    CASE WHEN NEW.manager_user_id IS NULL THEN 'No direct manager was assigned when the employment period ended.' ELSE NULL END,
    CASE WHEN NEW.manager_user_id IS NULL THEN NEW.actor_id ELSE NULL END,CASE WHEN NEW.manager_user_id IS NULL THEN NEW.created_at ELSE NULL END,1,NEW.actor_id,NEW.created_at,NEW.created_at);
  INSERT INTO hrm_offboarding_tasks(id,case_id,task_key,assignee_kind,assignee_user_id,state,required,version,actor_id,created_at,updated_at)
  VALUES('offtask_'||lower(hex(randomblob(16))),NEW.id,'asset_return','hrm_officer',NULL,'pending',1,1,NEW.actor_id,NEW.created_at,NEW.created_at);
  INSERT INTO hrm_offboarding_tasks(id,case_id,task_key,assignee_kind,assignee_user_id,state,required,completion_note,completed_by,completed_at,version,actor_id,created_at,updated_at)
  VALUES('offtask_'||lower(hex(randomblob(16))),NEW.id,'workspace_access','system_admin',NULL,
    CASE WHEN NEW.employee_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.user_id=NEW.employee_user_id AND m.enabled=1) THEN 'not_required' ELSE 'pending' END,1,
    CASE WHEN NEW.employee_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.user_id=NEW.employee_user_id AND m.enabled=1) THEN 'No active Workspace membership existed at the end date.' ELSE NULL END,
    CASE WHEN NEW.employee_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.user_id=NEW.employee_user_id AND m.enabled=1) THEN NEW.actor_id ELSE NULL END,
    CASE WHEN NEW.employee_user_id IS NULL OR NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.user_id=NEW.employee_user_id AND m.enabled=1) THEN NEW.created_at ELSE NULL END,1,NEW.actor_id,NEW.created_at,NEW.created_at);
  INSERT INTO hrm_offboarding_tasks(id,case_id,task_key,assignee_kind,assignee_user_id,state,required,version,actor_id,created_at,updated_at)
  VALUES('offtask_'||lower(hex(randomblob(16))),NEW.id,'records_review','hrm_admin',NULL,'pending',1,1,NEW.actor_id,NEW.created_at,NEW.created_at);
  INSERT INTO hrm_offboarding_tasks(id,case_id,task_key,assignee_kind,assignee_user_id,state,required,blocked_reason,version,actor_id,created_at,updated_at)
  VALUES('offtask_'||lower(hex(randomblob(16))),NEW.id,'payroll_closeout','hrm_admin',NULL,'blocked',1,
    'Payroll/P4 is not enabled; no final settlement or payment is asserted.',1,NEW.actor_id,NEW.created_at,NEW.created_at);
END;
CREATE TRIGGER hrm_offboarding_changed AFTER UPDATE ON hrm_offboarding_cases BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,employment_id,offboarding_case_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'offboarding_'||NEW.state,NEW.person_id,NEW.employment_id,NEW.id,NEW.id,json_object('version',NEW.version,'previous_state',OLD.state),NEW.updated_at);
END;
CREATE TRIGGER hrm_offboarding_task_created AFTER INSERT ON hrm_offboarding_tasks BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,employment_id,offboarding_case_id,target_id,detail,created_at)
  SELECT NEW.actor_id,'offboarding_task_'||NEW.state,c.person_id,c.employment_id,c.id,NEW.id,json_object('task_key',NEW.task_key,'assignee_kind',NEW.assignee_kind,'required',NEW.required),NEW.created_at
  FROM hrm_offboarding_cases c WHERE c.id=NEW.case_id;
END;
CREATE TRIGGER hrm_offboarding_task_changed AFTER UPDATE ON hrm_offboarding_tasks BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,employment_id,offboarding_case_id,target_id,detail,created_at)
  SELECT NEW.actor_id,'offboarding_task_'||NEW.state,c.person_id,c.employment_id,c.id,NEW.id,
    json_object('task_key',NEW.task_key,'version',NEW.version,'previous_state',OLD.state,'completion_note',NEW.completion_note,'blocked_reason',NEW.blocked_reason),NEW.updated_at
  FROM hrm_offboarding_cases c WHERE c.id=NEW.case_id;
END;
CREATE TRIGGER hrm_offboarding_case_snapshot_immutable BEFORE UPDATE ON hrm_offboarding_cases
WHEN OLD.person_id!=NEW.person_id OR OLD.employment_id!=NEW.employment_id OR OLD.employee_user_id IS NOT NEW.employee_user_id OR OLD.manager_user_id IS NOT NEW.manager_user_id OR OLD.ended_on!=NEW.ended_on OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_offboarding_case_snapshot'); END;
CREATE TRIGGER hrm_offboarding_task_identity_immutable BEFORE UPDATE ON hrm_offboarding_tasks
WHEN OLD.case_id!=NEW.case_id OR OLD.task_key!=NEW.task_key OR OLD.assignee_kind!=NEW.assignee_kind OR OLD.required!=NEW.required OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_offboarding_task_identity'); END;
CREATE TRIGGER hrm_offboarding_case_no_delete BEFORE DELETE ON hrm_offboarding_cases BEGIN
  SELECT RAISE(ABORT,'immutable_offboarding_case');
END;
CREATE TRIGGER hrm_offboarding_task_no_delete BEFORE DELETE ON hrm_offboarding_tasks BEGIN
  SELECT RAISE(ABORT,'immutable_offboarding_task');
END;

CREATE TRIGGER hrm_offboarding_from_employment_update AFTER UPDATE OF status ON hrm_employments
WHEN OLD.status!='ended' AND NEW.status='ended' AND NEW.ended_on IS NOT NULL BEGIN
  INSERT INTO hrm_offboarding_cases(id,person_id,employment_id,employee_user_id,manager_user_id,ended_on,state,version,actor_id,created_at,updated_at)
  SELECT 'offboard_'||lower(hex(randomblob(16))),p.id,NEW.id,p.user_id,NEW.manager_user_id,NEW.ended_on,'open',1,NEW.actor_id,NEW.updated_at,NEW.updated_at
  FROM hrm_people p WHERE p.id=NEW.person_id AND NOT EXISTS(SELECT 1 FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.id);
END;

CREATE TRIGGER hrm_offboarding_from_employment_insert AFTER INSERT ON hrm_employments
WHEN NEW.status='ended' AND NEW.ended_on IS NOT NULL BEGIN
  INSERT INTO hrm_offboarding_cases(id,person_id,employment_id,employee_user_id,manager_user_id,ended_on,state,version,actor_id,created_at,updated_at)
  SELECT 'offboard_'||lower(hex(randomblob(16))),p.id,NEW.id,p.user_id,NEW.manager_user_id,NEW.ended_on,'open',1,NEW.actor_id,NEW.updated_at,NEW.updated_at
  FROM hrm_people p WHERE p.id=NEW.person_id AND NOT EXISTS(SELECT 1 FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.id);
END;

CREATE TRIGGER hrm_offboarding_superseded_by_rehire AFTER INSERT ON hrm_employments
WHEN NEW.status!='ended' AND NEW.started_on IS NOT NULL BEGIN
  UPDATE hrm_offboarding_tasks SET state='superseded',completion_note='A later employment period started; this offboarding checklist was superseded.',completed_by=NEW.actor_id,completed_at=NEW.created_at,version=version+1,actor_id=NEW.actor_id,updated_at=NEW.created_at
  WHERE state IN ('pending','blocked') AND case_id IN (SELECT id FROM hrm_offboarding_cases WHERE person_id=NEW.person_id AND state='open' AND ended_on<NEW.started_on);
  UPDATE hrm_offboarding_cases SET state='cancelled',cancelled_by=NEW.actor_id,cancelled_at=NEW.created_at,cancel_reason='A later employment period started.',version=version+1,actor_id=NEW.actor_id,updated_at=NEW.created_at
  WHERE person_id=NEW.person_id AND state='open' AND ended_on<NEW.started_on;
END;

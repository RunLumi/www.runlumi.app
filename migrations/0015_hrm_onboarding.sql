-- Versioned onboarding templates, employment-period plans, scoped tasks and immutable events.
CREATE TABLE hrm_onboarding_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','retired')),
  current_version_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX hrm_onboarding_templates_state ON hrm_onboarding_templates(state,title_en);

CREATE TABLE hrm_onboarding_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES hrm_onboarding_templates(id),
  version_number INTEGER NOT NULL CHECK(version_number>0),
  applicability_json TEXT NOT NULL CHECK(json_valid(applicability_json) AND json_type(applicability_json)='object'),
  tasks_json TEXT NOT NULL CHECK(json_valid(tasks_json) AND json_type(tasks_json)='array'),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','reviewed','active','retired','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  activated_by TEXT,
  activated_at TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(template_id,version_number),
  CHECK(reviewed_by IS NULL OR reviewed_by!=created_by),
  CHECK(activated_by IS NULL OR activated_by!=created_by)
);
CREATE INDEX hrm_onboarding_versions_template ON hrm_onboarding_template_versions(template_id,version_number DESC,state);

CREATE TABLE hrm_onboarding_plans (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL UNIQUE REFERENCES hrm_employments(id),
  template_id TEXT NOT NULL REFERENCES hrm_onboarding_templates(id),
  template_version_id TEXT NOT NULL REFERENCES hrm_onboarding_template_versions(id),
  template_snapshot_json TEXT NOT NULL CHECK(json_valid(template_snapshot_json)),
  started_on TEXT NOT NULL,
  buddy_user_id TEXT,
  hr_owner_user_id TEXT,
  admin_owner_user_id TEXT,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','completed','cancelled')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancelled_by TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT
);
CREATE INDEX hrm_onboarding_plans_person ON hrm_onboarding_plans(person_id,state,created_at DESC);

CREATE TABLE hrm_onboarding_tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES hrm_onboarding_plans(id),
  task_key TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  instructions_en TEXT NOT NULL DEFAULT '',
  instructions_vi TEXT NOT NULL DEFAULT '',
  milestone TEXT NOT NULL,
  assignee_kind TEXT NOT NULL CHECK(assignee_kind IN ('employee','manager','buddy','hrm_officer','hrm_admin')),
  assignee_user_id TEXT,
  verifier_kind TEXT NOT NULL CHECK(verifier_kind IN ('none','manager','hrm_officer','hrm_admin')),
  verifier_user_id TEXT,
  due_offset_days INTEGER NOT NULL CHECK(due_offset_days BETWEEN -365 AND 3650),
  due_at TEXT NOT NULL,
  required INTEGER NOT NULL CHECK(required IN (0,1)),
  allow_waive INTEGER NOT NULL DEFAULT 0 CHECK(allow_waive IN (0,1)),
  dependencies_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(dependencies_json) AND json_type(dependencies_json)='array'),
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('none','text','pdf')),
  action_key TEXT NOT NULL CHECK(action_key IN ('profile','identity','legal','coi','asset','training','custom')),
  evidence_file_id TEXT,
  current_submission_id TEXT,
  submission_text TEXT,
  state TEXT NOT NULL DEFAULT 'not_started' CHECK(state IN ('not_started','in_progress','submitted','verified','completed','blocked','waived')),
  submitted_by TEXT,
  submitted_at TEXT,
  completed_by TEXT,
  completed_at TEXT,
  verified_by TEXT,
  verified_at TEXT,
  review_reason TEXT,
  blocked_reason TEXT,
  waived_by TEXT,
  waived_at TEXT,
  waive_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(plan_id,task_key),
  CHECK(verifier_user_id IS NULL OR assignee_user_id IS NULL OR verifier_user_id!=assignee_user_id),
  CHECK(state!='waived' OR (waived_by IS NOT NULL AND waived_at IS NOT NULL AND waive_reason IS NOT NULL))
);
CREATE INDEX hrm_onboarding_tasks_assignee ON hrm_onboarding_tasks(assignee_user_id,state,due_at);
CREATE INDEX hrm_onboarding_tasks_verifier ON hrm_onboarding_tasks(verifier_user_id,state,due_at);
CREATE INDEX hrm_onboarding_tasks_plan ON hrm_onboarding_tasks(plan_id,state,due_at);

CREATE TABLE hrm_onboarding_submissions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES hrm_onboarding_tasks(id),
  submitted_by TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('none','text','pdf')),
  evidence_text TEXT,
  evidence_file_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending_review','verified','rejected','completed')),
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(reviewed_by IS NULL OR reviewed_by!=submitted_by)
);
CREATE INDEX hrm_onboarding_submissions_task ON hrm_onboarding_submissions(task_id,created_at DESC);

CREATE TABLE hrm_onboarding_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT REFERENCES hrm_onboarding_plans(id),
  template_id TEXT REFERENCES hrm_onboarding_templates(id),
  task_id TEXT REFERENCES hrm_onboarding_tasks(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail)),
  created_at TEXT NOT NULL,
  CHECK(plan_id IS NOT NULL OR template_id IS NOT NULL)
);
CREATE INDEX hrm_onboarding_events_plan ON hrm_onboarding_events(plan_id,created_at);
CREATE INDEX hrm_onboarding_events_task ON hrm_onboarding_events(task_id,created_at);

CREATE TRIGGER hrm_onboarding_template_created AFTER INSERT ON hrm_onboarding_templates BEGIN
  INSERT INTO hrm_onboarding_events(template_id,actor_id,action,detail,created_at)
  VALUES(NEW.id,NEW.actor_id,'template_created',json_object('template_key',NEW.template_key),NEW.created_at);
END;
CREATE TRIGGER hrm_onboarding_template_changed AFTER UPDATE ON hrm_onboarding_templates BEGIN
  INSERT INTO hrm_onboarding_events(template_id,actor_id,action,detail,created_at)
  VALUES(NEW.id,NEW.actor_id,'template_'||NEW.state,json_object('version',NEW.version,'current_version_id',NEW.current_version_id),NEW.updated_at);
END;
CREATE TRIGGER hrm_onboarding_version_created AFTER INSERT ON hrm_onboarding_template_versions BEGIN
  INSERT INTO hrm_onboarding_events(template_id,actor_id,action,detail,created_at)
  VALUES(NEW.template_id,NEW.created_by,'template_version_created',json_object('version_id',NEW.id,'version_number',NEW.version_number),NEW.created_at);
END;
CREATE TRIGGER hrm_onboarding_version_changed AFTER UPDATE ON hrm_onboarding_template_versions BEGIN
  INSERT INTO hrm_onboarding_events(template_id,actor_id,action,detail,created_at)
  VALUES(NEW.template_id,NEW.updated_by,'template_version_'||NEW.state,json_object('version_id',NEW.id,'version_number',NEW.version_number,'revision',NEW.version,'reviewed_by',NEW.reviewed_by,'activated_by',NEW.activated_by),NEW.updated_at);
END;
CREATE TRIGGER hrm_onboarding_plan_created AFTER INSERT ON hrm_onboarding_plans BEGIN
  INSERT INTO hrm_onboarding_events(plan_id,actor_id,action,detail,created_at)
  VALUES(NEW.id,NEW.actor_id,'plan_created',json_object('person_id',NEW.person_id,'employment_id',NEW.employment_id,'template_version_id',NEW.template_version_id,'started_on',NEW.started_on),NEW.created_at);
END;
CREATE TRIGGER hrm_onboarding_plan_changed AFTER UPDATE ON hrm_onboarding_plans BEGIN
  INSERT INTO hrm_onboarding_events(plan_id,actor_id,action,detail,created_at)
  VALUES(NEW.id,NEW.actor_id,'plan_'||NEW.state,json_object('version',NEW.version,'started_on',NEW.started_on,'previous_started_on',OLD.started_on,'previous_state',OLD.state,'buddy_user_id',NEW.buddy_user_id,'hr_owner_user_id',NEW.hr_owner_user_id,'admin_owner_user_id',NEW.admin_owner_user_id,'cancel_reason',NEW.cancel_reason),NEW.updated_at);
END;
CREATE TRIGGER hrm_onboarding_task_created AFTER INSERT ON hrm_onboarding_tasks BEGIN
  INSERT INTO hrm_onboarding_events(plan_id,task_id,actor_id,action,detail,created_at)
  VALUES(NEW.plan_id,NEW.id,NEW.actor_id,'task_created',json_object('task_key',NEW.task_key,'assignee_user_id',NEW.assignee_user_id,'verifier_user_id',NEW.verifier_user_id,'due_at',NEW.due_at,'required',NEW.required),NEW.created_at);
END;
CREATE TRIGGER hrm_onboarding_task_changed AFTER UPDATE ON hrm_onboarding_tasks BEGIN
  INSERT INTO hrm_onboarding_events(plan_id,task_id,actor_id,action,detail,created_at)
  VALUES(NEW.plan_id,NEW.id,NEW.actor_id,'task_'||NEW.state,json_object('version',NEW.version,'previous_state',OLD.state,'assignee_user_id',NEW.assignee_user_id,'previous_assignee_user_id',OLD.assignee_user_id,'verifier_user_id',NEW.verifier_user_id,'previous_verifier_user_id',OLD.verifier_user_id,'due_at',NEW.due_at,'previous_due_at',OLD.due_at,'current_submission_id',NEW.current_submission_id,'review_reason',NEW.review_reason,'blocked_reason',NEW.blocked_reason,'waive_reason',NEW.waive_reason),NEW.updated_at);
END;
CREATE TRIGGER hrm_onboarding_submission_created AFTER INSERT ON hrm_onboarding_submissions BEGIN
  INSERT INTO hrm_onboarding_events(plan_id,task_id,actor_id,action,detail,created_at)
  SELECT t.plan_id,t.id,NEW.actor_id,'submission_'||NEW.state,json_object('submission_id',NEW.id,'submitted_by',NEW.submitted_by,'evidence_type',NEW.evidence_type,'evidence_file_id',NEW.evidence_file_id),NEW.created_at FROM hrm_onboarding_tasks t WHERE t.id=NEW.task_id;
END;
CREATE TRIGGER hrm_onboarding_submission_changed AFTER UPDATE ON hrm_onboarding_submissions BEGIN
  INSERT INTO hrm_onboarding_events(plan_id,task_id,actor_id,action,detail,created_at)
  SELECT t.plan_id,t.id,NEW.actor_id,'submission_'||NEW.state,json_object('submission_id',NEW.id,'version',NEW.version,'reviewed_by',NEW.reviewed_by,'review_reason',NEW.review_reason),NEW.updated_at FROM hrm_onboarding_tasks t WHERE t.id=NEW.task_id;
END;
CREATE TRIGGER hrm_onboarding_submission_identity_immutable BEFORE UPDATE ON hrm_onboarding_submissions
WHEN OLD.task_id!=NEW.task_id OR OLD.submitted_by!=NEW.submitted_by OR OLD.submitted_at!=NEW.submitted_at OR OLD.evidence_type!=NEW.evidence_type OR OLD.evidence_text IS NOT NEW.evidence_text OR OLD.evidence_file_id IS NOT NEW.evidence_file_id OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_onboarding_submission'); END;
CREATE TRIGGER hrm_onboarding_events_no_update BEFORE UPDATE ON hrm_onboarding_events BEGIN SELECT RAISE(ABORT,'immutable_onboarding_event'); END;
CREATE TRIGGER hrm_onboarding_events_no_delete BEFORE DELETE ON hrm_onboarding_events BEGIN SELECT RAISE(ABORT,'immutable_onboarding_event'); END;
CREATE TRIGGER hrm_onboarding_plan_no_delete BEFORE DELETE ON hrm_onboarding_plans BEGIN SELECT RAISE(ABORT,'immutable_onboarding_plan'); END;
CREATE TRIGGER hrm_onboarding_task_no_delete BEFORE DELETE ON hrm_onboarding_tasks BEGIN SELECT RAISE(ABORT,'immutable_onboarding_task'); END;
CREATE TRIGGER hrm_onboarding_submission_no_delete BEFORE DELETE ON hrm_onboarding_submissions BEGIN SELECT RAISE(ABORT,'immutable_onboarding_submission'); END;
CREATE TRIGGER hrm_onboarding_version_no_delete BEFORE DELETE ON hrm_onboarding_template_versions BEGIN SELECT RAISE(ABORT,'immutable_onboarding_version'); END;
CREATE TRIGGER hrm_onboarding_version_content_immutable BEFORE UPDATE ON hrm_onboarding_template_versions
WHEN OLD.template_id!=NEW.template_id OR OLD.version_number!=NEW.version_number OR (OLD.state!='draft' AND (OLD.applicability_json!=NEW.applicability_json OR OLD.tasks_json!=NEW.tasks_json)) OR OLD.created_by!=NEW.created_by OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_onboarding_version'); END;
CREATE TRIGGER hrm_onboarding_plan_snapshot_immutable BEFORE UPDATE ON hrm_onboarding_plans
WHEN OLD.person_id!=NEW.person_id OR OLD.employment_id!=NEW.employment_id OR OLD.template_id!=NEW.template_id OR OLD.template_version_id!=NEW.template_version_id OR OLD.template_snapshot_json!=NEW.template_snapshot_json OR OLD.created_by!=NEW.created_by OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_onboarding_plan_snapshot'); END;
CREATE TRIGGER hrm_onboarding_task_definition_immutable BEFORE UPDATE ON hrm_onboarding_tasks
WHEN OLD.plan_id!=NEW.plan_id OR OLD.task_key!=NEW.task_key OR OLD.title_en!=NEW.title_en OR OLD.title_vi!=NEW.title_vi OR OLD.instructions_en!=NEW.instructions_en OR OLD.instructions_vi!=NEW.instructions_vi OR OLD.milestone!=NEW.milestone OR OLD.assignee_kind!=NEW.assignee_kind OR OLD.verifier_kind!=NEW.verifier_kind OR OLD.due_offset_days!=NEW.due_offset_days OR OLD.required!=NEW.required OR OLD.allow_waive!=NEW.allow_waive OR OLD.dependencies_json!=NEW.dependencies_json OR OLD.evidence_type!=NEW.evidence_type OR OLD.action_key!=NEW.action_key OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_onboarding_task_definition'); END;

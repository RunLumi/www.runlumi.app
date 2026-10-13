-- Extend the shared allowlist with HRM-only capabilities; preserve every old grant.
CREATE TABLE workspace_roles_next (
  user_id TEXT NOT NULL REFERENCES workspace_members(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('hr','sales_manager','sales_executive','partner','finance','fulfillment','employee','people_manager','hrm_officer','hrm_admin')),
  granted_by TEXT NOT NULL, granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);
INSERT INTO workspace_roles_next SELECT user_id, role, granted_by, granted_at FROM workspace_roles;
DROP TABLE workspace_roles;
ALTER TABLE workspace_roles_next RENAME TO workspace_roles;
CREATE INDEX workspace_roles_role ON workspace_roles(role);

CREATE TABLE hrm_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  legal_entity TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  retention_policy TEXT NOT NULL DEFAULT '',
  policy_reference TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT, reviewed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT, updated_at TEXT
);
INSERT INTO hrm_settings(id) VALUES (1);

-- One person may return for multiple separate employment periods.
CREATE TABLE hrm_people (
  id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  user_id TEXT UNIQUE,
  legal_name TEXT NOT NULL,
  preferred_name TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX hrm_people_name ON hrm_people(legal_name);
CREATE TABLE hrm_employments (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES hrm_people(id),
  work_email TEXT NOT NULL DEFAULT '', work_phone TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '', job_title TEXT NOT NULL DEFAULT '',
  legal_entity TEXT NOT NULL, location TEXT NOT NULL DEFAULT '',
  manager_user_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('preboarding','probation','active','notice','ended')),
  started_on TEXT, ended_on TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);
CREATE INDEX hrm_employments_person ON hrm_employments(person_id,started_on);
CREATE INDEX hrm_employments_manager ON hrm_employments(manager_user_id,status);
CREATE UNIQUE INDEX hrm_one_open_employment ON hrm_employments(person_id) WHERE status!='ended';

CREATE TABLE hrm_people_history (
  person_id TEXT NOT NULL REFERENCES hrm_people(id), version INTEGER NOT NULL,
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(person_id,version)
);
CREATE TABLE hrm_employment_history (
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id), version INTEGER NOT NULL,
  snapshot TEXT NOT NULL CHECK(json_valid(snapshot)), actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(employment_id,version)
);

CREATE TABLE hrm_records (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES hrm_people(id),
  kind TEXT NOT NULL CHECK(kind IN ('contact','personal','identity','dependent','bank','tax')),
  data TEXT NOT NULL CHECK(json_valid(data)),
  state TEXT NOT NULL CHECK(state IN ('unverified','verified','ended')),
  effective_from TEXT, effective_to TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL, verified_by TEXT, verified_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX hrm_records_person ON hrm_records(person_id,kind);
CREATE TABLE hrm_record_history (
  record_id TEXT NOT NULL REFERENCES hrm_records(id), version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)), state TEXT NOT NULL,
  effective_from TEXT, effective_to TEXT,
  actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(record_id,version)
);
CREATE TABLE hrm_change_requests (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES hrm_people(id),
  record_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('contact','personal','identity','dependent','bank','tax')),
  expected_version INTEGER NOT NULL CHECK(expected_version >= 0),
  data TEXT NOT NULL CHECK(json_valid(data)), effective_from TEXT, effective_to TEXT,
  state TEXT NOT NULL CHECK(state IN ('submitted','approved','rejected','withdrawn')),
  submitted_by TEXT NOT NULL, reviewed_by TEXT, review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(reviewed_by IS NULL OR reviewed_by != submitted_by),
  CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX hrm_changes_person ON hrm_change_requests(person_id,state);
CREATE TABLE hrm_files (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES hrm_people(id),
  record_id TEXT REFERENCES hrm_records(id),
  kind TEXT NOT NULL CHECK(kind IN ('avatar','identity','dependent','bank','tax','personal')),
  object_key TEXT NOT NULL UNIQUE CHECK(object_key LIKE 'hrm/%'),
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),
  checksum TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('quarantined','reviewed','rejected')),
  uploaded_by TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, review_reason TEXT,
  expires_on TEXT, legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK(reviewed_by IS NULL OR reviewed_by != uploaded_by)
);
CREATE INDEX hrm_files_person ON hrm_files(person_id,kind,state);
CREATE TABLE hrm_commands (
  actor_id TEXT NOT NULL, request_key TEXT NOT NULL, operation TEXT NOT NULL,
  payload_hash TEXT NOT NULL, result_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id,request_key)
);
CREATE TABLE hrm_write_guards (
  id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid = 1)
);
CREATE TABLE hrm_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL,
  action TEXT NOT NULL, person_id TEXT, target_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail)), created_at TEXT NOT NULL
);
CREATE INDEX hrm_audit_person ON hrm_audit(person_id,created_at);

CREATE TRIGGER hrm_person_created AFTER INSERT ON hrm_people BEGIN
  INSERT INTO hrm_people_history VALUES(NEW.id,NEW.version,json_object('employee_code',NEW.employee_code,'user_id',NEW.user_id,'legal_name',NEW.legal_name,'preferred_name',NEW.preferred_name),NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,created_at) VALUES(NEW.actor_id,'person_created',NEW.id,NEW.id,NEW.updated_at);
END;
CREATE TRIGGER hrm_person_changed AFTER UPDATE ON hrm_people BEGIN
  INSERT INTO hrm_people_history VALUES(NEW.id,NEW.version,json_object('employee_code',NEW.employee_code,'user_id',NEW.user_id,'legal_name',NEW.legal_name,'preferred_name',NEW.preferred_name),NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(NEW.actor_id,'person_updated',NEW.id,NEW.id,json_object('version',NEW.version),NEW.updated_at);
END;
CREATE TRIGGER hrm_employment_created AFTER INSERT ON hrm_employments BEGIN
  INSERT INTO hrm_employment_history VALUES(NEW.id,NEW.version,json_object('person_id',NEW.person_id,'work_email',NEW.work_email,'work_phone',NEW.work_phone,'department',NEW.department,'job_title',NEW.job_title,'legal_entity',NEW.legal_entity,'location',NEW.location,'manager_user_id',NEW.manager_user_id,'status',NEW.status,'started_on',NEW.started_on,'ended_on',NEW.ended_on),NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,created_at) VALUES(NEW.actor_id,'employment_created',NEW.person_id,NEW.id,NEW.updated_at);
END;
CREATE TRIGGER hrm_employment_changed AFTER UPDATE ON hrm_employments BEGIN
  INSERT INTO hrm_employment_history VALUES(NEW.id,NEW.version,json_object('person_id',NEW.person_id,'work_email',NEW.work_email,'work_phone',NEW.work_phone,'department',NEW.department,'job_title',NEW.job_title,'legal_entity',NEW.legal_entity,'location',NEW.location,'manager_user_id',NEW.manager_user_id,'status',NEW.status,'started_on',NEW.started_on,'ended_on',NEW.ended_on),NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(NEW.actor_id,'employment_updated',NEW.person_id,NEW.id,json_object('version',NEW.version),NEW.updated_at);
END;
CREATE TRIGGER hrm_record_created AFTER INSERT ON hrm_records BEGIN
  INSERT INTO hrm_record_history VALUES(NEW.id,NEW.version,NEW.data,NEW.state,NEW.effective_from,NEW.effective_to,NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(NEW.actor_id,'record_created',NEW.person_id,NEW.id,json_object('kind',NEW.kind,'version',NEW.version),NEW.updated_at);
END;
CREATE TRIGGER hrm_record_changed AFTER UPDATE ON hrm_records BEGIN
  INSERT INTO hrm_record_history VALUES(NEW.id,NEW.version,NEW.data,NEW.state,NEW.effective_from,NEW.effective_to,NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(NEW.actor_id,'record_updated',NEW.person_id,NEW.id,json_object('kind',NEW.kind,'version',NEW.version),NEW.updated_at);
END;
CREATE TRIGGER hrm_request_created AFTER INSERT ON hrm_change_requests BEGIN
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(NEW.actor_id,'change_submitted',NEW.person_id,NEW.id,json_object('kind',NEW.kind),NEW.updated_at);
END;
CREATE TRIGGER hrm_request_changed AFTER UPDATE ON hrm_change_requests BEGIN
  INSERT INTO hrm_audit(actor_id,action,person_id,target_id,detail,created_at) VALUES(NEW.actor_id,'change_'||NEW.state,NEW.person_id,NEW.id,json_object('kind',NEW.kind),NEW.updated_at);
END;
CREATE TRIGGER hrm_person_history_no_update BEFORE UPDATE ON hrm_people_history BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_person_history_no_delete BEFORE DELETE ON hrm_people_history BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_employment_history_no_update BEFORE UPDATE ON hrm_employment_history BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_employment_history_no_delete BEFORE DELETE ON hrm_employment_history BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_record_history_no_update BEFORE UPDATE ON hrm_record_history BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_record_history_no_delete BEFORE DELETE ON hrm_record_history BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_audit_no_update BEFORE UPDATE ON hrm_audit BEGIN SELECT RAISE(ABORT,'immutable_audit'); END;
CREATE TRIGGER hrm_audit_no_delete BEFORE DELETE ON hrm_audit BEGIN SELECT RAISE(ABORT,'immutable_audit'); END;

-- Case-specific financial review. No dossier, evidence, clearance, payment,
-- exemption, retention period or permission grant is seeded.
CREATE TABLE hrm_closeout_sources (
 case_id TEXT PRIMARY KEY REFERENCES hrm_offboarding_cases(id),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
);
INSERT INTO hrm_closeout_sources(case_id) SELECT id FROM hrm_offboarding_cases;
CREATE TRIGGER hrm_closeout_source_started AFTER INSERT ON hrm_offboarding_cases BEGIN
 INSERT INTO hrm_closeout_sources(case_id) VALUES(NEW.id);
END;
CREATE TRIGGER hrm_closeout_source_no_delete BEFORE DELETE ON hrm_closeout_sources BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_source_monotonic BEFORE UPDATE ON hrm_closeout_sources
WHEN NEW.case_id!=OLD.case_id OR NEW.revision!=OLD.revision+1 BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

-- These PDFs are staff-confidential. They deliberately do not enter employee
-- profile files or public CMS media. R2 holds the objects, D1 only metadata.
CREATE TABLE hrm_closeout_files (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES hrm_offboarding_cases(id),
 object_key TEXT NOT NULL UNIQUE CHECK(substr(object_key,1,length('hrm/closeout/'||case_id||'/'))='hrm/closeout/'||case_id||'/'),
 original_name TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 checksum TEXT NOT NULL CHECK(length(checksum)=64),
 state TEXT NOT NULL DEFAULT 'quarantined' CHECK(state IN ('quarantined','reviewed','rejected')),
 uploaded_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 reviewed_by TEXT CHECK(reviewed_by IS NULL OR reviewed_by!=uploaded_by),
 reviewed_at TEXT,
 review_reason TEXT,
 object_deleted_at TEXT,
 legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
 disposition_state TEXT NOT NULL DEFAULT 'none' CHECK(disposition_state IN ('none','pending_review','approved','deleting','completed','rejected','blocked')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 actor_id TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(state='quarantined' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL))
);
CREATE INDEX hrm_closeout_files_case ON hrm_closeout_files(case_id,created_at,id);
CREATE TRIGGER hrm_closeout_file_content_immutable BEFORE UPDATE OF id,case_id,object_key,original_name,size_bytes,checksum,uploaded_by,created_at ON hrm_closeout_files BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_file_review_immutable BEFORE UPDATE OF reviewed_by,reviewed_at,review_reason ON hrm_closeout_files WHEN OLD.state!='quarantined' BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_file_transition BEFORE UPDATE OF state ON hrm_closeout_files
WHEN NOT(OLD.state=NEW.state OR OLD.state='quarantined' AND NEW.state IN ('reviewed','rejected') OR OLD.state='reviewed' AND NEW.state='rejected') BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_closeout_file_no_delete BEFORE DELETE ON hrm_closeout_files BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_closeout_dossiers (
 id TEXT PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES hrm_offboarding_cases(id),
 person_id TEXT NOT NULL REFERENCES hrm_people(id),
 employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
 employee_user_id TEXT,
 policy_id TEXT NOT NULL REFERENCES hrm_closeout_policy_versions(id),
 source_revision INTEGER NOT NULL CHECK(source_revision>0),
 basis_json TEXT NOT NULL CHECK(json_valid(basis_json) AND json_type(basis_json)='object'),
 basis_checksum TEXT NOT NULL CHECK(length(basis_checksum)=64),
 checks_json TEXT NOT NULL CHECK(json_valid(checks_json) AND json_type(checks_json)='array'),
 no_payroll_evidence_json TEXT NOT NULL CHECK(json_valid(no_payroll_evidence_json) AND json_type(no_payroll_evidence_json)='array'),
 state TEXT NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','approved','rejected','applied','invalidated')),
 prepared_by TEXT NOT NULL,
 prepared_at TEXT NOT NULL,
 reviewed_by TEXT,
 reviewed_at TEXT,
 review_reason TEXT,
 applied_by TEXT,
 applied_at TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 actor_id TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(prepared_by IS NOT employee_user_id),
 CHECK(reviewed_by IS NULL OR (reviewed_by!=prepared_by AND reviewed_by IS NOT employee_user_id)),
 CHECK(state NOT IN ('approved','rejected','applied') OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL)),
 CHECK(state!='applied' OR (applied_by=reviewed_by AND applied_at IS NOT NULL))
);
CREATE INDEX hrm_closeout_dossiers_case ON hrm_closeout_dossiers(case_id,prepared_at DESC,id);
CREATE UNIQUE INDEX hrm_closeout_one_current_approval ON hrm_closeout_dossiers(case_id) WHERE state IN ('approved','applied');
CREATE TRIGGER hrm_closeout_dossier_insert_guard BEFORE INSERT ON hrm_closeout_dossiers
WHEN NEW.state!='prepared' OR NOT EXISTS(
 SELECT 1 FROM hrm_offboarding_cases c JOIN hrm_closeout_sources r ON r.case_id=c.id JOIN hrm_employments e ON e.id=c.employment_id JOIN hrm_closeout_policy_versions p ON p.id=NEW.policy_id
 WHERE c.id=NEW.case_id AND c.person_id=NEW.person_id AND c.employment_id=NEW.employment_id AND c.employee_user_id IS NEW.employee_user_id
 AND c.state='open' AND e.status='ended' AND e.ended_on=c.ended_on AND e.legal_entity=p.legal_entity AND p.state='active' AND r.revision=NEW.source_revision
) BEGIN SELECT RAISE(ABORT,'hrm_closeout_source_changed'); END;
CREATE TRIGGER hrm_closeout_dossier_basis_immutable BEFORE UPDATE OF id,case_id,person_id,employment_id,employee_user_id,policy_id,source_revision,basis_json,basis_checksum,checks_json,no_payroll_evidence_json,prepared_by,prepared_at ON hrm_closeout_dossiers BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_dossier_review_immutable BEFORE UPDATE OF reviewed_by,reviewed_at,review_reason ON hrm_closeout_dossiers WHEN OLD.state!='prepared' BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_dossier_application_immutable BEFORE UPDATE OF applied_by,applied_at ON hrm_closeout_dossiers WHEN OLD.state!='approved' BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_dossier_no_delete BEFORE DELETE ON hrm_closeout_dossiers BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_dossier_transition BEFORE UPDATE OF state ON hrm_closeout_dossiers
WHEN NOT(OLD.state=NEW.state OR OLD.state='prepared' AND NEW.state IN ('approved','rejected','invalidated') OR OLD.state='approved' AND NEW.state IN ('applied','invalidated') OR OLD.state='applied' AND NEW.state='invalidated') BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_closeout_dossier_current_review BEFORE UPDATE OF state ON hrm_closeout_dossiers
WHEN NEW.state IN ('approved','applied') AND NOT EXISTS(SELECT 1 FROM hrm_closeout_sources r JOIN hrm_offboarding_cases c ON c.id=r.case_id JOIN hrm_closeout_policy_versions p ON p.id=NEW.policy_id WHERE r.case_id=NEW.case_id AND r.revision=NEW.source_revision AND c.state='open' AND p.state='active')
BEGIN SELECT RAISE(ABORT,'hrm_closeout_source_changed'); END;
CREATE TABLE hrm_closeout_dossier_files (
 dossier_id TEXT NOT NULL REFERENCES hrm_closeout_dossiers(id),
 file_id TEXT NOT NULL REFERENCES hrm_closeout_files(id),
 checksum TEXT NOT NULL CHECK(length(checksum)=64),
 PRIMARY KEY(dossier_id,file_id)
);
CREATE TRIGGER hrm_closeout_dossier_file_guard BEFORE INSERT ON hrm_closeout_dossier_files
WHEN NOT EXISTS(SELECT 1 FROM hrm_closeout_dossiers d JOIN hrm_closeout_files f ON f.id=NEW.file_id AND f.case_id=d.case_id WHERE d.id=NEW.dossier_id AND d.state='prepared' AND f.state='reviewed' AND f.object_deleted_at IS NULL AND f.disposition_state IN ('none','rejected','blocked') AND f.checksum=NEW.checksum)
BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_invalid'); END;
CREATE TRIGGER hrm_closeout_dossier_file_no_update BEFORE UPDATE ON hrm_closeout_dossier_files BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_dossier_file_no_delete BEFORE DELETE ON hrm_closeout_dossier_files BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TABLE hrm_closeout_events (
 id INTEGER PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES hrm_offboarding_cases(id),
 dossier_id TEXT REFERENCES hrm_closeout_dossiers(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('prepared','approved','rejected','applied','invalidated','file_uploaded','file_reviewed')),
 detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),
 actor_id TEXT,
 created_at TEXT NOT NULL
);
CREATE TRIGGER hrm_closeout_event_no_update BEFORE UPDATE ON hrm_closeout_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_event_no_delete BEFORE DELETE ON hrm_closeout_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TABLE hrm_closeout_source_events (
 id INTEGER PRIMARY KEY,
 case_id TEXT NOT NULL REFERENCES hrm_offboarding_cases(id),
 source_kind TEXT NOT NULL,
 source_id TEXT NOT NULL,
 source_actor_id TEXT,
 detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json) AND json_type(detail_json)='object'),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX hrm_closeout_source_events_case ON hrm_closeout_source_events(case_id,id);
CREATE TRIGGER hrm_closeout_source_event_no_update BEFORE UPDATE ON hrm_closeout_source_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_source_event_no_delete BEFORE DELETE ON hrm_closeout_source_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_source_invalidates AFTER INSERT ON hrm_closeout_source_events BEGIN
 UPDATE hrm_closeout_sources SET revision=revision+1 WHERE case_id=NEW.case_id;
 INSERT INTO hrm_closeout_events(case_id,dossier_id,event_type,detail_json,actor_id,created_at)
 SELECT case_id,id,'invalidated',json_object('previous_state',state,'source_kind',NEW.source_kind,'source_id',NEW.source_id,'source_event_id',NEW.id,'source_actor_id',NEW.source_actor_id,'source_detail',json(NEW.detail_json)),'system:hrm-closeout-source',NEW.created_at
 FROM hrm_closeout_dossiers WHERE case_id=NEW.case_id AND state IN ('prepared','approved','applied');
 -- Only a previously applied financial approval reopens a completed case.
 -- Existing role revocation is never reversed and its task is never reset.
 UPDATE hrm_offboarding_tasks SET state='blocked',blocked_reason='Financial sources changed after review; an independent current review is required.',version=version+1,actor_id='system:hrm-closeout-source',updated_at=NEW.created_at
 WHERE case_id=NEW.case_id AND task_key='payroll_closeout' AND state='completed'
 AND EXISTS(SELECT 1 FROM hrm_closeout_dossiers d WHERE d.case_id=NEW.case_id AND d.state='applied');
 UPDATE hrm_offboarding_cases SET state='open',version=version+1,actor_id='system:hrm-closeout-source',updated_at=NEW.created_at
 WHERE id=NEW.case_id AND state='completed' AND EXISTS(SELECT 1 FROM hrm_closeout_dossiers d WHERE d.case_id=NEW.case_id AND d.state='applied');
 UPDATE hrm_closeout_dossiers SET state='invalidated',version=version+1,actor_id='system:hrm-closeout-source',updated_at=NEW.created_at WHERE case_id=NEW.case_id AND state IN ('prepared','approved','applied');
END;

CREATE TRIGGER hrm_closeout_watch_people_update AFTER UPDATE OF legal_name,employee_code,user_id ON hrm_people WHEN OLD.legal_name IS NOT NEW.legal_name OR OLD.employee_code IS NOT NEW.employee_code OR OLD.user_id IS NOT NEW.user_id BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_people',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.person_id=NEW.id;
END;

CREATE TRIGGER hrm_closeout_watch_employments_update AFTER UPDATE OF person_id,legal_entity,status,started_on,ended_on,location,department,job_title,manager_user_id ON hrm_employments WHEN OLD.person_id IS NOT NEW.person_id OR OLD.legal_entity IS NOT NEW.legal_entity OR OLD.status IS NOT NEW.status OR OLD.started_on IS NOT NEW.started_on OR OLD.ended_on IS NOT NEW.ended_on OR OLD.location IS NOT NEW.location OR OLD.department IS NOT NEW.department OR OLD.job_title IS NOT NEW.job_title OR OLD.manager_user_id IS NOT NEW.manager_user_id BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_employments',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.id;
END;

CREATE TRIGGER hrm_closeout_watch_records_insert AFTER INSERT ON hrm_records WHEN NEW.kind IN ('identity','bank','tax','dependent') BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_records',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.person_id=NEW.person_id;
END;

CREATE TRIGGER hrm_closeout_watch_records_update AFTER UPDATE ON hrm_records WHEN NEW.kind IN ('identity','bank','tax','dependent') BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_records',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.person_id=NEW.person_id;
END;

CREATE TRIGGER hrm_closeout_watch_records_delete AFTER DELETE ON hrm_records WHEN OLD.kind IN ('identity','bank','tax','dependent') BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_records',OLD.id,OLD.actor_id FROM hrm_offboarding_cases c WHERE c.person_id=OLD.person_id;
END;

CREATE TRIGGER hrm_closeout_watch_payroll_run_people_insert AFTER INSERT ON hrm_payroll_run_people BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_run_people',NEW.id,NULL FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_payroll_run_people_update AFTER UPDATE ON hrm_payroll_run_people BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_run_people',NEW.id,NULL FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_payroll_run_people_delete AFTER DELETE ON hrm_payroll_run_people BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_run_people',OLD.id,NULL FROM hrm_offboarding_cases c WHERE c.employment_id=OLD.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_payroll_runs_update AFTER UPDATE ON hrm_payroll_runs BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_runs',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payroll_run_people rp WHERE rp.run_id=NEW.id AND rp.employment_id=c.employment_id);
END;

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

CREATE TRIGGER hrm_closeout_watch_payslips_insert AFTER INSERT ON hrm_payslips BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payslips',NEW.id,NEW.issued_by FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payroll_run_people rp WHERE rp.id=NEW.run_person_id AND rp.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_payslips_update AFTER UPDATE ON hrm_payslips BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payslips',NEW.id,NEW.issued_by FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payroll_run_people rp WHERE rp.id=NEW.run_person_id AND rp.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_payroll_payments_insert AFTER INSERT ON hrm_payroll_payments BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_payments',NEW.id,NEW.confirmed_by FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payslips s JOIN hrm_payroll_run_people rp ON rp.id=s.run_person_id WHERE s.id=NEW.payslip_id AND rp.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_payroll_disputes_insert AFTER INSERT ON hrm_payroll_disputes BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_disputes',NEW.id,NULL FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payslips s JOIN hrm_payroll_run_people rp ON rp.id=s.run_person_id WHERE s.id=NEW.payslip_id AND rp.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_payroll_disputes_update AFTER UPDATE ON hrm_payroll_disputes BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_disputes',NEW.id,NULL FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payslips s JOIN hrm_payroll_run_people rp ON rp.id=s.run_person_id WHERE s.id=NEW.payslip_id AND rp.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_payroll_dispute_events_insert AFTER INSERT ON hrm_payroll_dispute_events BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_payroll_dispute_events',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payroll_disputes d JOIN hrm_payslips s ON s.id=d.payslip_id JOIN hrm_payroll_run_people rp ON rp.id=s.run_person_id WHERE d.id=NEW.dispute_id AND rp.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_time_periods_update AFTER UPDATE ON hrm_time_periods BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_time_periods',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_payroll_runs r JOIN hrm_payroll_run_people rp ON rp.run_id=r.id WHERE r.period_id=NEW.id AND rp.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_time_entries_insert AFTER INSERT ON hrm_time_entries BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_time_entries',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_time_entries_update AFTER UPDATE ON hrm_time_entries BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_time_entries',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_time_entries_delete AFTER DELETE ON hrm_time_entries BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_time_entries',OLD.id,OLD.actor_id FROM hrm_offboarding_cases c WHERE c.employment_id=OLD.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_time_adjustments_insert AFTER INSERT ON hrm_time_adjustments BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_time_adjustments',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_time_entries t WHERE t.id=NEW.entry_id AND t.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_time_adjustments_update AFTER UPDATE ON hrm_time_adjustments BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_time_adjustments',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_time_entries t WHERE t.id=NEW.entry_id AND t.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_time_adjustments_delete AFTER DELETE ON hrm_time_adjustments BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_time_adjustments',OLD.id,OLD.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_time_entries t WHERE t.id=OLD.entry_id AND t.employment_id=c.employment_id);
END;

CREATE TRIGGER hrm_closeout_watch_leave_requests_insert AFTER INSERT ON hrm_leave_requests BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_leave_requests',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_leave_requests_update AFTER UPDATE ON hrm_leave_requests BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_leave_requests',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_leave_requests_delete AFTER DELETE ON hrm_leave_requests BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_leave_requests',OLD.id,OLD.actor_id FROM hrm_offboarding_cases c WHERE c.employment_id=OLD.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_leave_ledger_insert AFTER INSERT ON hrm_leave_ledger BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_leave_ledger',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.employment_id=NEW.employment_id;
END;

CREATE TRIGGER hrm_closeout_watch_closeout_files_update AFTER UPDATE OF state,reviewed_by,reviewed_at,object_deleted_at,disposition_state ON hrm_closeout_files BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_closeout_files',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.id=NEW.case_id AND EXISTS(SELECT 1 FROM hrm_closeout_dossier_files x JOIN hrm_closeout_dossiers d ON d.id=x.dossier_id WHERE x.file_id=NEW.id AND d.state IN ('prepared','approved','applied'));
END;

CREATE TRIGGER hrm_closeout_watch_legal_files_update AFTER UPDATE OF state,reviewed_by,reviewed_at,object_deleted_at ON hrm_legal_files BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_legal_files',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE EXISTS(SELECT 1 FROM hrm_closeout_dossiers d JOIN hrm_closeout_policy_versions p ON p.id=d.policy_id JOIN hrm_legal_template_versions v ON v.id=p.source_version_id WHERE d.case_id=c.id AND v.source_file_id=NEW.id AND d.state IN ('prepared','approved','applied'));
END;

CREATE TRIGGER hrm_closeout_watch_file_deletion_requests_insert AFTER INSERT ON hrm_file_deletion_requests BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_file_deletion_requests',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE NEW.source_table='hrm_legal_files' AND EXISTS(SELECT 1 FROM hrm_closeout_dossiers d JOIN hrm_closeout_policy_versions p ON p.id=d.policy_id JOIN hrm_legal_template_versions v ON v.id=p.source_version_id WHERE d.case_id=c.id AND v.source_file_id=NEW.source_file_id AND d.state IN ('prepared','approved','applied'));
END;

CREATE TRIGGER hrm_closeout_watch_file_deletion_requests_update AFTER UPDATE ON hrm_file_deletion_requests BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id)
 SELECT c.id,'hrm_file_deletion_requests',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE NEW.source_table='hrm_legal_files' AND EXISTS(SELECT 1 FROM hrm_closeout_dossiers d JOIN hrm_closeout_policy_versions p ON p.id=d.policy_id JOIN hrm_legal_template_versions v ON v.id=p.source_version_id WHERE d.case_id=c.id AND v.source_file_id=NEW.source_file_id AND d.state IN ('prepared','approved','applied'));
END;

-- Keep independent guards small enough for D1's expression-depth limit (100).
CREATE TRIGGER hrm_closeout_dossier_policy_review BEFORE UPDATE OF state ON hrm_closeout_dossiers
WHEN NEW.state IN ('approved','applied') AND NOT EXISTS(
 SELECT 1 FROM hrm_closeout_policy_versions p
 JOIN hrm_legal_template_versions v ON v.id=p.source_version_id
 JOIN hrm_legal_templates t ON t.id=v.template_id
 JOIN hrm_legal_files f ON f.id=v.source_file_id
 WHERE p.id=NEW.policy_id AND p.state='active' AND t.document_type='policy'
 AND p.source_checksum=v.source_checksum AND p.legal_entity=v.legal_entity
 AND v.state IN ('reviewed','active','retired') AND v.reviewed_by IS NOT NULL AND v.reviewed_by!=v.created_by
 AND f.kind='docx_source' AND f.template_id=v.template_id AND f.state='reviewed' AND f.checksum=p.source_checksum
 AND f.reviewed_by IS NOT NULL AND f.reviewed_by!=f.uploaded_by AND f.object_deleted_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM hrm_file_deletion_requests x WHERE x.source_table='hrm_legal_files' AND x.source_file_id=f.id AND x.state IN ('pending_review','approved','deleting','retryable','completed'))
 AND p.effective_from<=date('now','+7 hours') AND p.effective_until>=date('now','+7 hours')
) BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_invalid'); END;
CREATE TRIGGER hrm_closeout_dossier_checklist_review BEFORE UPDATE OF state ON hrm_closeout_dossiers
WHEN NEW.state IN ('approved','applied') AND (
 json_array_length(NEW.checks_json)!=(SELECT json_array_length(checklist_json) FROM hrm_closeout_policy_versions WHERE id=NEW.policy_id)
 OR json_array_length(NEW.checks_json)!=(SELECT COUNT(DISTINCT json_extract(value,'$.key')) FROM json_each(NEW.checks_json))
 OR EXISTS(SELECT 1 FROM json_each(NEW.checks_json) answer
  LEFT JOIN json_each((SELECT checklist_json FROM hrm_closeout_policy_versions WHERE id=NEW.policy_id)) required
   ON json_extract(answer.value,'$.key')=json_extract(required.value,'$.key')
  WHERE required.key IS NULL
  OR json_type(answer.value,'$.outcome') IS NOT 'text'
  OR NOT(json_extract(answer.value,'$.outcome')='verified' OR json_extract(answer.value,'$.outcome')='not_applicable' AND json_extract(required.value,'$.allow_not_applicable')=1)
  OR json_type(answer.value,'$.reason') IS NOT 'text'
  OR length(trim(json_extract(answer.value,'$.reason'))) NOT BETWEEN 1 AND 1000
  OR json_type(answer.value,'$.file_ids') IS NOT 'array'
  OR json_array_length(json_extract(answer.value,'$.file_ids')) NOT BETWEEN 1 AND 5)
) BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_invalid'); END;
CREATE TRIGGER hrm_closeout_dossier_check_files_review BEFORE UPDATE OF state ON hrm_closeout_dossiers
WHEN NEW.state IN ('approved','applied') AND EXISTS(
 SELECT 1 FROM json_each(NEW.checks_json) answer JOIN json_each(answer.value,'$.file_ids') ref
 LEFT JOIN hrm_closeout_dossier_files link ON link.dossier_id=NEW.id AND link.file_id=ref.value
 LEFT JOIN hrm_closeout_files proof ON proof.id=link.file_id
 WHERE ref.type!='text' OR link.file_id IS NULL OR proof.id IS NULL
 OR proof.case_id!=NEW.case_id OR proof.state!='reviewed' OR proof.checksum!=link.checksum
 OR proof.reviewed_by IS NULL OR proof.reviewed_by=proof.uploaded_by
 OR proof.object_deleted_at IS NOT NULL OR proof.disposition_state NOT IN ('none','rejected','blocked')
) BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_invalid'); END;
CREATE TRIGGER hrm_closeout_dossier_exemption_review BEFORE UPDATE OF state ON hrm_closeout_dossiers
WHEN NEW.state IN ('approved','applied')
AND NOT EXISTS(SELECT 1 FROM hrm_payroll_run_people rp WHERE rp.employment_id=NEW.employment_id)
AND (
 NOT EXISTS(SELECT 1 FROM hrm_closeout_policy_versions p WHERE p.id=NEW.policy_id AND p.allow_no_payroll=1 AND length(trim(p.no_payroll_instructions))>0)
 OR json_array_length(NEW.no_payroll_evidence_json)<1
 OR EXISTS(SELECT 1 FROM json_each(NEW.no_payroll_evidence_json) ref WHERE ref.type!='text' OR NOT EXISTS(
  SELECT 1 FROM hrm_closeout_dossier_files link JOIN hrm_closeout_files proof ON proof.id=link.file_id WHERE link.dossier_id=NEW.id AND link.file_id=ref.value AND proof.case_id=NEW.case_id AND proof.state='reviewed' AND proof.checksum=link.checksum AND proof.object_deleted_at IS NULL AND proof.disposition_state IN ('none','rejected','blocked')))
) BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_invalid'); END;


CREATE TRIGGER hrm_closeout_file_uploaded_event AFTER INSERT ON hrm_closeout_files BEGIN
 INSERT INTO hrm_closeout_events(case_id,event_type,detail_json,actor_id,created_at) VALUES(NEW.case_id,'file_uploaded',json_object('file_id',NEW.id,'state',NEW.state,'checksum',NEW.checksum),NEW.uploaded_by,NEW.created_at);
END;
CREATE TRIGGER hrm_closeout_file_reviewed_event AFTER UPDATE OF state ON hrm_closeout_files WHEN NEW.state!=OLD.state BEGIN
 INSERT INTO hrm_closeout_events(case_id,event_type,detail_json,actor_id,created_at) VALUES(NEW.case_id,'file_reviewed',json_object('file_id',NEW.id,'previous_state',OLD.state,'state',NEW.state,'reason',NEW.review_reason),NEW.actor_id,NEW.updated_at);
END;
CREATE TRIGGER hrm_closeout_dossier_prepared_event AFTER INSERT ON hrm_closeout_dossiers BEGIN
 INSERT INTO hrm_closeout_events(case_id,dossier_id,event_type,detail_json,actor_id,created_at) VALUES(NEW.case_id,NEW.id,'prepared',json_object('policy_id',NEW.policy_id,'source_revision',NEW.source_revision,'basis_checksum',NEW.basis_checksum),NEW.prepared_by,NEW.prepared_at);
END;
CREATE TRIGGER hrm_closeout_dossier_decision_event AFTER UPDATE OF state ON hrm_closeout_dossiers WHEN NEW.state!=OLD.state AND NEW.state IN ('approved','rejected','applied') BEGIN
 INSERT INTO hrm_closeout_events(case_id,dossier_id,event_type,detail_json,actor_id,created_at) VALUES(NEW.case_id,NEW.id,NEW.state,json_object('previous_state',OLD.state,'reason',NEW.review_reason,'source_revision',NEW.source_revision,'basis_checksum',NEW.basis_checksum),NEW.actor_id,NEW.updated_at);
END;

CREATE TRIGGER hrm_closeout_watch_change_requests_insert AFTER INSERT ON hrm_change_requests WHEN NEW.kind IN ('identity','bank','tax','dependent') BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id) SELECT c.id,'hrm_change_requests',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.person_id=NEW.person_id;
END;

CREATE TRIGGER hrm_closeout_watch_change_requests_update AFTER UPDATE ON hrm_change_requests WHEN NEW.kind IN ('identity','bank','tax','dependent') BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id) SELECT c.id,'hrm_change_requests',NEW.id,NEW.actor_id FROM hrm_offboarding_cases c WHERE c.person_id=NEW.person_id;
END;

CREATE TRIGGER hrm_closeout_watch_change_requests_delete AFTER DELETE ON hrm_change_requests WHEN OLD.kind IN ('identity','bank','tax','dependent') BEGIN
 INSERT INTO hrm_closeout_source_events(case_id,source_kind,source_id,source_actor_id) SELECT c.id,'hrm_change_requests',OLD.id,OLD.actor_id FROM hrm_offboarding_cases c WHERE c.person_id=OLD.person_id;
END;

-- An existing person-wide legal hold covers new confidential evidence too.
-- No retention period or automatic erasure rule is supplied here.
CREATE TRIGGER hrm_closeout_file_inherits_person_hold AFTER INSERT ON hrm_closeout_files
WHEN NEW.legal_hold=0 AND EXISTS(SELECT 1 FROM hrm_legal_holds h JOIN hrm_offboarding_cases c ON c.person_id=h.person_id WHERE c.id=NEW.case_id AND h.scope_kind='person' AND h.category='*' AND h.state='active') BEGIN
 UPDATE hrm_closeout_files SET legal_hold=1,version=version+1 WHERE id=NEW.id;
END;
CREATE TRIGGER hrm_closeout_person_hold_placed AFTER INSERT ON hrm_legal_holds
WHEN NEW.scope_kind='person' AND NEW.category='*' AND NEW.state='active' BEGIN
 UPDATE hrm_closeout_files SET legal_hold=1,version=version+1,actor_id=NEW.placed_by,updated_at=NEW.placed_at WHERE legal_hold=0 AND case_id IN (SELECT id FROM hrm_offboarding_cases WHERE person_id=NEW.person_id);
END;
CREATE TRIGGER hrm_closeout_person_hold_released AFTER UPDATE OF state ON hrm_legal_holds
WHEN NEW.scope_kind='person' AND NEW.category='*' AND OLD.state='active' AND NEW.state='released' BEGIN
 UPDATE hrm_closeout_files SET legal_hold=0,version=version+1,actor_id=NEW.released_by,updated_at=NEW.released_at
 WHERE legal_hold=1 AND case_id IN (SELECT id FROM hrm_offboarding_cases WHERE person_id=NEW.person_id)
 AND NOT EXISTS(SELECT 1 FROM hrm_legal_holds h WHERE h.person_id=NEW.person_id AND h.scope_kind='person' AND h.category='*' AND h.state='active');
END;
CREATE TRIGGER hrm_closeout_file_hold_cannot_be_cleared BEFORE UPDATE OF legal_hold ON hrm_closeout_files
WHEN NEW.legal_hold=0 AND EXISTS(SELECT 1 FROM hrm_legal_holds h JOIN hrm_offboarding_cases c ON c.person_id=h.person_id WHERE c.id=NEW.case_id AND h.scope_kind='person' AND h.category='*' AND h.state='active') BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_held'); END;
CREATE TRIGGER hrm_closeout_file_disposition_hold_guard BEFORE UPDATE OF object_deleted_at,disposition_state ON hrm_closeout_files
WHEN (NEW.object_deleted_at IS NOT OLD.object_deleted_at AND NEW.object_deleted_at IS NOT NULL OR NEW.disposition_state IN ('pending_review','approved','deleting','completed'))
AND (NEW.legal_hold=1 OR EXISTS(SELECT 1 FROM hrm_legal_holds h JOIN hrm_offboarding_cases c ON c.person_id=h.person_id WHERE c.id=NEW.case_id AND h.scope_kind='person' AND h.category='*' AND h.state='active')) BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_held'); END;

CREATE INDEX hrm_closeout_payroll_employment ON hrm_payroll_run_people(employment_id,run_id);
CREATE INDEX hrm_closeout_events_case ON hrm_closeout_events(case_id,id);
CREATE INDEX hrm_closeout_file_dossiers ON hrm_closeout_dossier_files(file_id,dossier_id);

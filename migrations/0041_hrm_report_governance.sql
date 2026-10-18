-- Explicit report policies and preservation. No policy, duration, owner or hold is seeded.
ALTER TABLE hrm_report_snapshots ADD COLUMN scheduled_for TEXT;
CREATE TABLE hrm_report_policy_versions (
 id TEXT PRIMARY KEY,policy_ref TEXT NOT NULL UNIQUE,
 legal_entity TEXT NOT NULL,class_code TEXT NOT NULL CHECK(length(class_code) BETWEEN 1 AND 48),
 capture_kind TEXT NOT NULL CHECK(capture_kind IN ('manual','daily','weekly','monthly')),
 department TEXT,title_en TEXT NOT NULL,title_vi TEXT NOT NULL,purpose TEXT NOT NULL,jurisdiction TEXT NOT NULL,
 source_version_id TEXT REFERENCES hrm_legal_template_versions(id),source_checksum TEXT,
 owner_user_id TEXT NOT NULL,retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 36500),
 effective_from TEXT NOT NULL,effective_until TEXT NOT NULL CHECK(effective_until>=effective_from),
 version_number INTEGER NOT NULL CHECK(version_number>0),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','reviewed','active','retired','rejected')),
 created_by TEXT NOT NULL,created_at TEXT NOT NULL,reviewed_by TEXT,reviewed_at TEXT,review_reason TEXT,
 activated_by TEXT,activated_at TEXT,version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),actor_id TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(legal_entity,class_code,capture_kind,department,version_number),
 CHECK((state='draft' AND reviewed_by IS NULL) OR (state IN ('reviewed','active','retired','rejected') AND reviewed_by IS NOT NULL AND reviewed_by!=created_by AND reviewed_at IS NOT NULL)),
 CHECK(state NOT IN ('reviewed','active','retired') OR (source_version_id IS NOT NULL AND length(source_checksum)=64)),
 CHECK(state NOT IN ('active','retired') OR (activated_by IS NOT NULL AND activated_by!=created_by AND activated_at IS NOT NULL))
);
CREATE UNIQUE INDEX hrm_report_policy_version_number ON hrm_report_policy_versions(legal_entity,class_code,capture_kind,COALESCE(department,''),version_number);
CREATE UNIQUE INDEX hrm_report_policy_one_active ON hrm_report_policy_versions(legal_entity,class_code,capture_kind,COALESCE(department,'')) WHERE state='active';
CREATE TABLE hrm_report_schedule_policies (
 schedule_id TEXT PRIMARY KEY REFERENCES hrm_report_schedules(id),
 policy_id TEXT NOT NULL REFERENCES hrm_report_policy_versions(id)
);
CREATE TABLE hrm_report_snapshot_policies (
 snapshot_id TEXT PRIMARY KEY REFERENCES hrm_report_snapshots(id),
 policy_id TEXT NOT NULL REFERENCES hrm_report_policy_versions(id),
 capture_started_at TEXT NOT NULL,capture_completed_at TEXT NOT NULL CHECK(capture_completed_at>=capture_started_at),scheduled_for TEXT
);
CREATE TABLE hrm_report_holds (
 id TEXT PRIMARY KEY,hold_ref TEXT NOT NULL UNIQUE,legal_entity TEXT NOT NULL,
 scope_kind TEXT NOT NULL CHECK(scope_kind IN ('entity','class','snapshot','schedule')),
 class_code TEXT,snapshot_id TEXT REFERENCES hrm_report_snapshots(id),schedule_id TEXT REFERENCES hrm_report_schedules(id),
 period TEXT CHECK(period IS NULL OR length(period)=7),
 department_mode TEXT NOT NULL CHECK(department_mode IN ('all','exact')),department TEXT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','released')),
 placed_by TEXT NOT NULL,placed_at TEXT NOT NULL,released_by TEXT,released_at TEXT,release_reason TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK((scope_kind='entity' AND class_code IS NULL AND snapshot_id IS NULL AND schedule_id IS NULL) OR
       (scope_kind='class' AND class_code IS NOT NULL AND snapshot_id IS NULL AND schedule_id IS NULL) OR
       (scope_kind='snapshot' AND snapshot_id IS NOT NULL AND class_code IS NULL AND schedule_id IS NULL) OR
       (scope_kind='schedule' AND schedule_id IS NOT NULL AND class_code IS NULL AND snapshot_id IS NULL)),
 CHECK(department_mode!='all' OR department IS NULL),
 CHECK((state='active' AND released_by IS NULL AND released_at IS NULL AND release_reason IS NULL) OR
       (state='released' AND released_by IS NOT NULL AND released_by!=placed_by AND released_at IS NOT NULL AND length(release_reason)>0))
);
CREATE INDEX hrm_report_holds_scope ON hrm_report_holds(legal_entity,state,scope_kind);
CREATE TABLE hrm_report_governance_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,target_ref TEXT NOT NULL,event_type TEXT NOT NULL,
 detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),actor_id TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE TABLE hrm_report_held_access (
 id INTEGER PRIMARY KEY AUTOINCREMENT,snapshot_id TEXT NOT NULL REFERENCES hrm_report_snapshots(id),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),actor_id TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE VIEW hrm_report_snapshot_hold_matches AS
 SELECT s.id AS snapshot_id,h.id AS hold_id FROM hrm_report_snapshots s
 LEFT JOIN hrm_report_snapshot_policies b ON b.snapshot_id=s.id LEFT JOIN hrm_report_policy_versions p ON p.id=b.policy_id
 JOIN hrm_report_holds h ON h.legal_entity=s.legal_entity AND h.state='active'
 WHERE (h.scope_kind='entity' OR (h.scope_kind='class' AND h.class_code=p.class_code) OR (h.scope_kind='snapshot' AND h.snapshot_id=s.id) OR (h.scope_kind='schedule' AND h.schedule_id=s.schedule_id))
  AND (h.period IS NULL OR h.period=s.period) AND (h.department_mode='all' OR h.department IS s.department);

CREATE TRIGGER hrm_report_policy_definition_guard BEFORE UPDATE ON hrm_report_policy_versions BEGIN
 SELECT CASE WHEN NEW.id!=OLD.id OR NEW.policy_ref!=OLD.policy_ref OR NEW.legal_entity!=OLD.legal_entity OR NEW.class_code!=OLD.class_code OR NEW.capture_kind!=OLD.capture_kind OR NEW.department IS NOT OLD.department OR NEW.title_en!=OLD.title_en OR NEW.title_vi!=OLD.title_vi OR NEW.purpose!=OLD.purpose OR NEW.jurisdiction!=OLD.jurisdiction OR NEW.source_version_id IS NOT OLD.source_version_id OR NEW.source_checksum IS NOT OLD.source_checksum OR NEW.owner_user_id!=OLD.owner_user_id OR NEW.retention_days!=OLD.retention_days OR NEW.effective_from!=OLD.effective_from OR NEW.effective_until!=OLD.effective_until OR NEW.version_number!=OLD.version_number OR NEW.created_by!=OLD.created_by OR NEW.created_at!=OLD.created_at OR NEW.version!=OLD.version+1 THEN RAISE(ABORT,'immutable_history') END;
 SELECT CASE WHEN NOT ((OLD.state='draft' AND NEW.state IN ('reviewed','rejected')) OR (OLD.state='reviewed' AND NEW.state='active') OR (OLD.state='active' AND NEW.state='retired')) THEN RAISE(ABORT,'immutable_history') END;
 SELECT CASE WHEN OLD.state!='draft' AND (NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.review_reason IS NOT OLD.review_reason) THEN RAISE(ABORT,'immutable_history') END;
 SELECT CASE WHEN OLD.state='active' AND (NEW.activated_by IS NOT OLD.activated_by OR NEW.activated_at IS NOT OLD.activated_at) THEN RAISE(ABORT,'immutable_history') END;
END;
CREATE TRIGGER hrm_report_policy_no_delete BEFORE DELETE ON hrm_report_policy_versions BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_policy_withdrawn AFTER UPDATE OF state ON hrm_report_policy_versions WHEN OLD.state='active' AND NEW.state='retired' BEGIN
 UPDATE hrm_report_schedules SET state='paused',version=version+1,updated_by=NEW.actor_id,updated_at=NEW.updated_at,actor_id=NEW.actor_id WHERE state='active' AND id IN (SELECT schedule_id FROM hrm_report_schedule_policies WHERE policy_id=OLD.id);
END;
CREATE TRIGGER hrm_report_governed_schedule_insert BEFORE INSERT ON hrm_report_schedules BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hrm_report_policy_versions p WHERE NEW.retention_basis='policy:'||p.policy_ref AND p.state='active' AND p.legal_entity=NEW.legal_entity AND p.capture_kind=NEW.cadence AND p.retention_days=NEW.retention_days AND (p.department IS NULL OR p.department IS NEW.department) AND date(NEW.created_at,'+7 hours') BETWEEN p.effective_from AND p.effective_until) THEN RAISE(ABORT,'hrm_report_policy_required') END;
END;
CREATE TRIGGER hrm_report_schedule_policy_bound AFTER INSERT ON hrm_report_schedules BEGIN
 INSERT INTO hrm_report_schedule_policies(schedule_id,policy_id) SELECT NEW.id,id FROM hrm_report_policy_versions WHERE NEW.retention_basis='policy:'||policy_ref;
END;
CREATE TRIGGER hrm_report_governed_schedule_resume BEFORE UPDATE OF state ON hrm_report_schedules WHEN NEW.state='active' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hrm_report_schedule_policies b JOIN hrm_report_policy_versions p ON p.id=b.policy_id WHERE b.schedule_id=OLD.id AND p.state='active' AND p.legal_entity=NEW.legal_entity AND date(NEW.updated_at,'+7 hours') BETWEEN p.effective_from AND p.effective_until) THEN RAISE(ABORT,'hrm_report_policy_required') END;
END;
CREATE TRIGGER hrm_report_governed_snapshot_insert BEFORE INSERT ON hrm_report_snapshots BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hrm_report_policy_versions p WHERE NEW.retention_basis='policy:'||p.policy_ref AND p.state='active' AND p.legal_entity=NEW.legal_entity AND p.retention_days=NEW.retention_days AND (p.department IS NULL OR p.department IS NEW.department)
  AND date(NEW.created_at,'+7 hours') BETWEEN p.effective_from AND p.effective_until AND NEW.generated_at<=NEW.created_at AND p.activated_at<=NEW.generated_at
  AND NEW.expires_on=date(NEW.created_at,'+7 hours','+'||p.retention_days||' days')
  AND ((NEW.source='manual' AND p.capture_kind='manual' AND NEW.scheduled_for IS NULL) OR (NEW.source='scheduled' AND NEW.scheduled_for IS NOT NULL AND date(NEW.scheduled_for,'+7 hours')=NEW.schedule_day AND NEW.scheduled_for<=NEW.generated_at AND EXISTS(SELECT 1 FROM hrm_report_schedule_policies b JOIN hrm_report_schedules schedule ON schedule.id=b.schedule_id WHERE b.schedule_id=NEW.schedule_id AND b.policy_id=p.id AND schedule.cadence=p.capture_kind AND schedule.department IS NEW.department AND schedule.legal_entity=NEW.legal_entity AND schedule.state='active')))) THEN RAISE(ABORT,'hrm_report_policy_required') END;
END;
CREATE TRIGGER hrm_report_snapshot_policy_bound AFTER INSERT ON hrm_report_snapshots BEGIN
 INSERT INTO hrm_report_snapshot_policies(snapshot_id,policy_id,capture_started_at,capture_completed_at,scheduled_for) SELECT NEW.id,id,NEW.generated_at,NEW.created_at,NEW.scheduled_for FROM hrm_report_policy_versions WHERE NEW.retention_basis='policy:'||policy_ref;
END;
CREATE TRIGGER hrm_report_snapshot_governance_expiry BEFORE UPDATE ON hrm_report_snapshots BEGIN
 SELECT CASE WHEN NEW.scheduled_for IS NOT OLD.scheduled_for THEN RAISE(ABORT,'immutable_history') END;
 SELECT CASE WHEN OLD.state='active' AND NEW.state='expired' AND (NOT EXISTS(SELECT 1 FROM hrm_report_snapshot_policies WHERE snapshot_id=OLD.id) OR EXISTS(SELECT 1 FROM hrm_report_snapshot_hold_matches WHERE snapshot_id=OLD.id) OR date(NEW.expired_at,'+7 hours') IS NULL OR date(NEW.expired_at,'+7 hours')<=OLD.expires_on) THEN RAISE(ABORT,'hrm_report_snapshot_preserved') END;
END;
CREATE TRIGGER hrm_report_exact_hold_guard BEFORE INSERT ON hrm_report_holds WHEN NEW.scope_kind IN ('snapshot','schedule') BEGIN
 SELECT CASE WHEN (NEW.scope_kind='snapshot' AND NOT EXISTS(SELECT 1 FROM hrm_report_snapshots WHERE id=NEW.snapshot_id AND legal_entity=NEW.legal_entity AND state='active' AND (NEW.period IS NULL OR period=NEW.period) AND (NEW.department_mode='all' OR department IS NEW.department))) OR (NEW.scope_kind='schedule' AND NOT EXISTS(SELECT 1 FROM hrm_report_schedules WHERE id=NEW.schedule_id AND legal_entity=NEW.legal_entity AND (NEW.department_mode='all' OR department IS NEW.department))) THEN RAISE(ABORT,'hrm_report_hold_target_unavailable') END;
END;
CREATE TRIGGER hrm_report_hold_release_guard BEFORE UPDATE ON hrm_report_holds BEGIN
 SELECT CASE WHEN OLD.state!='active' OR NEW.state!='released' OR NEW.version!=OLD.version+1 OR NEW.id!=OLD.id OR NEW.hold_ref!=OLD.hold_ref OR NEW.legal_entity!=OLD.legal_entity OR NEW.scope_kind!=OLD.scope_kind OR NEW.class_code IS NOT OLD.class_code OR NEW.snapshot_id IS NOT OLD.snapshot_id OR NEW.schedule_id IS NOT OLD.schedule_id OR NEW.period IS NOT OLD.period OR NEW.department_mode!=OLD.department_mode OR NEW.department IS NOT OLD.department OR NEW.reason!=OLD.reason OR NEW.placed_by!=OLD.placed_by OR NEW.placed_at!=OLD.placed_at THEN RAISE(ABORT,'immutable_history') END;
END;
CREATE TRIGGER hrm_report_hold_no_delete BEFORE DELETE ON hrm_report_holds BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_schedule_binding_no_update BEFORE UPDATE ON hrm_report_schedule_policies BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_schedule_binding_no_delete BEFORE DELETE ON hrm_report_schedule_policies BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_snapshot_binding_no_update BEFORE UPDATE ON hrm_report_snapshot_policies BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_snapshot_binding_no_delete BEFORE DELETE ON hrm_report_snapshot_policies BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_governance_event_no_update BEFORE UPDATE ON hrm_report_governance_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_governance_event_no_delete BEFORE DELETE ON hrm_report_governance_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_held_access_no_update BEFORE UPDATE ON hrm_report_held_access BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_report_held_access_no_delete BEFORE DELETE ON hrm_report_held_access BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

-- A policy cannot enter the approved state by bypassing its independent review.
CREATE TRIGGER hrm_report_policy_initial_draft BEFORE INSERT ON hrm_report_policy_versions BEGIN
 SELECT CASE WHEN NEW.state!='draft' OR NEW.version!=1 OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.activated_by IS NOT NULL OR NEW.activated_at IS NOT NULL THEN RAISE(ABORT,'hrm_report_policy_review_required') END;
 SELECT CASE WHEN date(NEW.effective_from,'+0 days') IS NOT NEW.effective_from OR date(NEW.effective_until,'+0 days') IS NOT NEW.effective_until OR NEW.effective_until<NEW.effective_from THEN RAISE(ABORT,'hrm_report_policy_date_invalid') END;
END;
CREATE TRIGGER hrm_report_policy_reviewed_source BEFORE UPDATE OF state ON hrm_report_policy_versions WHEN NEW.state IN ('reviewed','active') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hrm_legal_template_versions v JOIN hrm_legal_files f ON f.id=v.source_file_id
  WHERE v.id=NEW.source_version_id AND v.legal_entity=NEW.legal_entity AND v.source_checksum=NEW.source_checksum
    AND v.state IN ('reviewed','active','retired') AND v.reviewed_by IS NOT NULL AND v.reviewed_by!=v.created_by
    AND f.state='reviewed' AND f.kind='docx_source' AND f.checksum=v.source_checksum AND f.object_deleted_at IS NULL)
  THEN RAISE(ABORT,'hrm_report_policy_source_required') END;
END;
CREATE TRIGGER hrm_report_schedule_binding_matches BEFORE INSERT ON hrm_report_schedule_policies BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hrm_report_schedules s JOIN hrm_report_policy_versions p ON s.retention_basis='policy:'||p.policy_ref WHERE s.id=NEW.schedule_id AND p.id=NEW.policy_id AND p.legal_entity=s.legal_entity) THEN RAISE(ABORT,'hrm_report_policy_binding_invalid') END;
END;
CREATE TRIGGER hrm_report_snapshot_binding_matches BEFORE INSERT ON hrm_report_snapshot_policies BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hrm_report_snapshots s JOIN hrm_report_policy_versions p ON s.retention_basis='policy:'||p.policy_ref WHERE s.id=NEW.snapshot_id AND p.id=NEW.policy_id AND p.legal_entity=s.legal_entity AND NEW.capture_started_at=s.generated_at AND NEW.capture_completed_at=s.created_at AND NEW.scheduled_for IS s.scheduled_for) THEN RAISE(ABORT,'hrm_report_policy_binding_invalid') END;
END;

-- Includes versions withdrawn implicitly during replacement, not just the new version.
CREATE TRIGGER hrm_report_policy_state_audited AFTER UPDATE OF state ON hrm_report_policy_versions WHEN OLD.state!=NEW.state BEGIN
 INSERT INTO hrm_report_governance_events(target_ref,event_type,detail_json,actor_id,created_at)
 VALUES(NEW.policy_ref,'policy_state_changed',json_object('from',OLD.state,'to',NEW.state,'version',NEW.version),NEW.actor_id,NEW.updated_at);
 INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at)
 VALUES(NEW.actor_id,'hrm_report_policy_state_changed',NEW.policy_ref,json_object('from',OLD.state,'to',NEW.state,'version',NEW.version),NEW.updated_at);
END;

-- Saved HRM reports contain aggregate counts only. Retention is explicit per
-- snapshot or schedule; no duration or schedule is seeded by this migration.
CREATE TABLE hrm_report_schedules (
  id TEXT PRIMARY KEY,
  schedule_ref TEXT NOT NULL UNIQUE,
  legal_entity TEXT NOT NULL CHECK(length(trim(legal_entity)) BETWEEN 1 AND 100),
  department TEXT,
  cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekly','monthly')),
  retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 36500),
  retention_basis TEXT NOT NULL CHECK(length(trim(retention_basis)) BETWEEN 1 AND 1000),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','paused','retired')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  actor_id TEXT NOT NULL
);
CREATE INDEX hrm_report_schedules_active ON hrm_report_schedules(legal_entity,state,cadence,created_at);
CREATE UNIQUE INDEX hrm_report_schedule_one_active_filter ON hrm_report_schedules(legal_entity,cadence,COALESCE(department,'')) WHERE state='active';

CREATE TABLE hrm_report_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_ref TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK(source IN ('manual','scheduled')),
  schedule_id TEXT REFERENCES hrm_report_schedules(id),
  schedule_day TEXT CHECK(schedule_day IS NULL OR length(schedule_day)=10),
  legal_entity TEXT NOT NULL CHECK(length(trim(legal_entity)) BETWEEN 1 AND 100),
  period TEXT NOT NULL CHECK(length(period)=7),
  department TEXT,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  snapshot_checksum TEXT CHECK(snapshot_checksum IS NULL OR length(snapshot_checksum)=64),
  generated_at TEXT NOT NULL,
  retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 36500),
  retention_basis TEXT NOT NULL CHECK(length(trim(retention_basis)) BETWEEN 1 AND 1000),
  expires_on TEXT NOT NULL CHECK(length(expires_on)=10),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','expired')),
  expired_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  UNIQUE(schedule_id,schedule_day),
  CHECK((source='manual' AND schedule_id IS NULL AND schedule_day IS NULL) OR
        (source='scheduled' AND schedule_id IS NOT NULL AND schedule_day IS NOT NULL)),
  CHECK((state='active' AND expired_at IS NULL AND snapshot_json!='{}' AND snapshot_checksum IS NOT NULL) OR
        (state='expired' AND expired_at IS NOT NULL AND snapshot_json='{}' AND snapshot_checksum IS NULL))
);
CREATE INDEX hrm_report_snapshots_entity ON hrm_report_snapshots(legal_entity,state,generated_at DESC);
CREATE INDEX hrm_report_snapshots_expiry ON hrm_report_snapshots(state,expires_on,id);

CREATE TABLE hrm_report_snapshot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES hrm_report_snapshots(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('created','expired')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_report_snapshot_events_order ON hrm_report_snapshot_events(snapshot_id,created_at,id);

CREATE TABLE hrm_report_schedule_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id TEXT NOT NULL REFERENCES hrm_report_schedules(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('created','paused','resumed','retired','run_failed','run_completed')),
  scheduled_on TEXT CHECK(scheduled_on IS NULL OR length(scheduled_on)=10),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(schedule_id,scheduled_on,event_type)
);
CREATE INDEX hrm_report_schedule_events_order ON hrm_report_schedule_events(schedule_id,created_at DESC,id DESC);

CREATE TRIGGER hrm_report_schedule_definition_immutable
BEFORE UPDATE ON hrm_report_schedules
WHEN OLD.id!=NEW.id OR OLD.schedule_ref!=NEW.schedule_ref OR OLD.legal_entity!=NEW.legal_entity
  OR OLD.department IS NOT NEW.department OR OLD.cadence!=NEW.cadence
  OR OLD.retention_days!=NEW.retention_days OR OLD.retention_basis!=NEW.retention_basis
  OR OLD.created_by!=NEW.created_by OR OLD.created_at!=NEW.created_at
  OR NEW.version!=OLD.version+1 OR NOT ((OLD.state='active' AND NEW.state IN ('paused','retired')) OR (OLD.state='paused' AND NEW.state IN ('active','retired')))
BEGIN SELECT RAISE(ABORT,'immutable_hrm_report_schedule_definition'); END;
CREATE TRIGGER hrm_report_schedule_no_delete BEFORE DELETE ON hrm_report_schedules BEGIN
  SELECT RAISE(ABORT,'immutable_hrm_report_schedule');
END;
CREATE TRIGGER hrm_report_schedule_created AFTER INSERT ON hrm_report_schedules BEGIN
  INSERT INTO hrm_report_schedule_events(schedule_id,event_type,detail_json,actor_id,created_at)
  VALUES(NEW.id,'created',json_object('cadence',NEW.cadence,'department',NEW.department,'retention_days',NEW.retention_days),NEW.created_by,NEW.created_at);
  INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at)
  VALUES(NEW.created_by,'hrm_report_schedule_created',NEW.schedule_ref,json_object('legal_entity',NEW.legal_entity,'cadence',NEW.cadence,'department',NEW.department,'retention_days',NEW.retention_days),NEW.created_at);
END;
CREATE TRIGGER hrm_report_schedule_state_changed AFTER UPDATE OF state ON hrm_report_schedules
WHEN OLD.state!=NEW.state BEGIN
  INSERT INTO hrm_report_schedule_events(schedule_id,event_type,detail_json,actor_id,created_at)
  VALUES(NEW.id,CASE NEW.state WHEN 'paused' THEN 'paused' WHEN 'retired' THEN 'retired' ELSE 'resumed' END,json_object('version',NEW.version),NEW.actor_id,NEW.updated_at);
  INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at)
  VALUES(NEW.actor_id,CASE NEW.state WHEN 'paused' THEN 'hrm_report_schedule_paused' WHEN 'retired' THEN 'hrm_report_schedule_retired' ELSE 'hrm_report_schedule_resumed' END,NEW.schedule_ref,json_object('version',NEW.version),NEW.updated_at);
END;

CREATE TRIGGER hrm_report_schedule_event_no_update BEFORE UPDATE ON hrm_report_schedule_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_report_schedule_event_no_delete BEFORE DELETE ON hrm_report_schedule_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_report_snapshot_event_no_update BEFORE UPDATE ON hrm_report_snapshot_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;
CREATE TRIGGER hrm_report_snapshot_event_no_delete BEFORE DELETE ON hrm_report_snapshot_events BEGIN
  SELECT RAISE(ABORT,'immutable_history');
END;

CREATE TRIGGER hrm_report_snapshot_expiry_only
BEFORE UPDATE ON hrm_report_snapshots
WHEN NOT (OLD.state='active' AND NEW.state='expired' AND NEW.snapshot_json='{}' AND NEW.snapshot_checksum IS NULL AND NEW.expired_at IS NOT NULL
  AND OLD.id=NEW.id AND OLD.snapshot_ref=NEW.snapshot_ref AND OLD.source=NEW.source
  AND OLD.schedule_id IS NEW.schedule_id AND OLD.schedule_day IS NEW.schedule_day
  AND OLD.legal_entity=NEW.legal_entity AND OLD.period=NEW.period AND OLD.department IS NEW.department
  AND OLD.snapshot_checksum IS NOT NULL AND OLD.generated_at=NEW.generated_at
  AND OLD.retention_days=NEW.retention_days AND OLD.retention_basis=NEW.retention_basis
  AND OLD.expires_on=NEW.expires_on AND OLD.created_by=NEW.created_by AND OLD.created_at=NEW.created_at)
BEGIN SELECT RAISE(ABORT,'immutable_hrm_report_snapshot'); END;
CREATE TRIGGER hrm_report_snapshot_no_delete BEFORE DELETE ON hrm_report_snapshots BEGIN
  SELECT RAISE(ABORT,'immutable_hrm_report_snapshot');
END;
CREATE TRIGGER hrm_report_snapshot_created AFTER INSERT ON hrm_report_snapshots BEGIN
  INSERT INTO hrm_report_snapshot_events(snapshot_id,event_type,detail_json,actor_id,created_at)
  VALUES(NEW.id,'created',json_object('source',NEW.source,'period',NEW.period,'department',NEW.department,'expires_on',NEW.expires_on),NEW.actor_id,NEW.created_at);
  INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at)
  VALUES(NEW.actor_id,CASE NEW.source WHEN 'manual' THEN 'hrm_report_snapshot_saved' ELSE 'hrm_report_scheduled_snapshot_created' END,
    NEW.snapshot_ref,json_object('legal_entity',NEW.legal_entity,'period',NEW.period,'department',NEW.department,'retention_days',NEW.retention_days),NEW.created_at);
  INSERT INTO hrm_report_schedule_events(schedule_id,event_type,scheduled_on,detail_json,actor_id,created_at)
  SELECT NEW.schedule_id,'run_completed',NEW.schedule_day,json_object('snapshot_ref',NEW.snapshot_ref,'period',NEW.period),NEW.actor_id,NEW.created_at
  WHERE NEW.source='scheduled';
END;
CREATE TRIGGER hrm_report_snapshot_expired AFTER UPDATE OF state ON hrm_report_snapshots
WHEN OLD.state='active' AND NEW.state='expired' BEGIN
  INSERT INTO hrm_report_snapshot_events(snapshot_id,event_type,detail_json,actor_id,created_at)
  VALUES(NEW.id,'expired',json_object('expires_on',NEW.expires_on,'retention_days',NEW.retention_days),NEW.actor_id,NEW.expired_at);
  INSERT INTO hrm_audit(actor_id,action,target_id,detail,created_at)
  VALUES(NEW.actor_id,'hrm_report_snapshot_expired',NEW.snapshot_ref,json_object('period',NEW.period,'expires_on',NEW.expires_on),NEW.expired_at);
END;

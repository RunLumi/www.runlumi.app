-- Controlled ATS-to-HRM transfer provenance. The source application reference
-- intentionally has no FK: ATS retention/deletion must never delete HRM data.
CREATE TABLE hrm_ats_transfers (
  id TEXT PRIMARY KEY,
  source_application_id TEXT NOT NULL UNIQUE,
  source_public_id TEXT NOT NULL,
  source_updated_at TEXT NOT NULL,
  source_status TEXT NOT NULL CHECK(source_status='hired'),
  settings_version INTEGER NOT NULL CHECK(settings_version>0),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL UNIQUE REFERENCES hrm_employments(id),
  transferred_fields_json TEXT NOT NULL CHECK(json_valid(transferred_fields_json) AND json_type(transferred_fields_json)='array'),
  actor_id TEXT NOT NULL,
  transferred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_ats_transfers_person ON hrm_ats_transfers(person_id,transferred_at DESC);

CREATE TABLE hrm_lifecycle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  person_id TEXT,
  employment_id TEXT,
  source_application_id TEXT,
  offboarding_case_id TEXT,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail)),
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_lifecycle_events_person ON hrm_lifecycle_events(person_id,created_at DESC);
CREATE INDEX hrm_lifecycle_events_target ON hrm_lifecycle_events(target_id,created_at DESC);

CREATE TRIGGER hrm_ats_transfer_created AFTER INSERT ON hrm_ats_transfers BEGIN
  INSERT INTO hrm_lifecycle_events(actor_id,action,person_id,employment_id,source_application_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'ats_candidate_transferred',NEW.person_id,NEW.employment_id,NEW.source_application_id,NEW.id,
    json_object('source_status',NEW.source_status,'source_updated_at',NEW.source_updated_at,'transferred_fields',NEW.transferred_fields_json),NEW.transferred_at);
END;
CREATE TRIGGER hrm_ats_transfer_no_update BEFORE UPDATE ON hrm_ats_transfers BEGIN
  SELECT RAISE(ABORT,'immutable_ats_transfer');
END;
CREATE TRIGGER hrm_ats_transfer_no_delete BEFORE DELETE ON hrm_ats_transfers BEGIN
  SELECT RAISE(ABORT,'immutable_ats_transfer');
END;
CREATE TRIGGER hrm_lifecycle_event_no_update BEFORE UPDATE ON hrm_lifecycle_events BEGIN
  SELECT RAISE(ABORT,'immutable_hrm_lifecycle_event');
END;
CREATE TRIGGER hrm_lifecycle_event_no_delete BEFORE DELETE ON hrm_lifecycle_events BEGIN
  SELECT RAISE(ABORT,'immutable_hrm_lifecycle_event');
END;

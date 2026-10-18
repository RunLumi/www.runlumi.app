-- Confidential financial evidence has its own file-level hold history. No policy
-- duration, employee data or production activation is introduced.
CREATE TABLE hrm_closeout_file_holds (
 id TEXT PRIMARY KEY NOT NULL,
 case_id TEXT NOT NULL REFERENCES hrm_offboarding_cases(id),
 file_id TEXT NOT NULL REFERENCES hrm_closeout_files(id),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','released')),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 1000),
 placed_by TEXT NOT NULL,
 placed_at TEXT NOT NULL,
 released_by TEXT,
 released_at TEXT,
 release_reason TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK((state='active' AND released_by IS NULL AND released_at IS NULL AND release_reason IS NULL)
 OR (state='released' AND released_by IS NOT NULL AND released_by!=placed_by AND released_at IS NOT NULL AND release_reason IS NOT NULL AND length(trim(release_reason)) BETWEEN 1 AND 1000))
);
CREATE UNIQUE INDEX hrm_closeout_file_hold_active ON hrm_closeout_file_holds(file_id) WHERE state='active';
CREATE INDEX hrm_closeout_file_hold_case ON hrm_closeout_file_holds(case_id,placed_at,id);
CREATE TRIGGER hrm_closeout_file_hold_scope BEFORE INSERT ON hrm_closeout_file_holds
WHEN NEW.state!='active' OR NEW.version!=1 OR NOT EXISTS(
 SELECT 1 FROM hrm_closeout_files f JOIN hrm_offboarding_cases c ON c.id=f.case_id JOIN hrm_people p ON p.id=c.person_id
 WHERE f.id=NEW.file_id AND f.case_id=NEW.case_id AND c.employee_user_id IS NOT NEW.placed_by AND p.user_id IS NOT NEW.placed_by
 AND f.object_deleted_at IS NULL AND f.disposition_state NOT IN ('deleting','completed')
) BEGIN SELECT RAISE(ABORT,'closeout_hold_unavailable'); END;
CREATE TRIGGER hrm_closeout_file_hold_immutable BEFORE UPDATE ON hrm_closeout_file_holds
WHEN NEW.id IS NOT OLD.id OR NEW.case_id!=OLD.case_id OR NEW.file_id!=OLD.file_id OR NEW.reason!=OLD.reason
 OR NEW.placed_by!=OLD.placed_by OR NEW.placed_at!=OLD.placed_at OR OLD.state!='active'
 OR NEW.state!='released' OR NEW.version!=OLD.version+1
 OR EXISTS(SELECT 1 FROM hrm_offboarding_cases c JOIN hrm_people p ON p.id=c.person_id WHERE c.id=NEW.case_id AND (c.employee_user_id=NEW.released_by OR p.user_id=NEW.released_by))
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_file_hold_no_delete BEFORE DELETE ON hrm_closeout_file_holds BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_closeout_file_hold_placed AFTER INSERT ON hrm_closeout_file_holds BEGIN
 UPDATE hrm_closeout_files SET legal_hold=1,version=version+1,actor_id=NEW.placed_by,updated_at=NEW.placed_at WHERE id=NEW.file_id;
 INSERT INTO hrm_lifecycle_events(actor_id,action,target_id,detail,created_at)
 VALUES(NEW.placed_by,'closeout_file_hold_placed',NEW.id,json_object('case_id',NEW.case_id,'file_id',NEW.file_id),NEW.placed_at);
END;
CREATE TRIGGER hrm_closeout_file_hold_released AFTER UPDATE ON hrm_closeout_file_holds BEGIN
 UPDATE hrm_closeout_files SET legal_hold=CASE WHEN EXISTS(
  SELECT 1 FROM hrm_legal_holds h JOIN hrm_offboarding_cases c ON c.person_id=h.person_id
  WHERE c.id=NEW.case_id AND h.scope_kind='person' AND h.category='*' AND h.state='active'
 ) THEN 1 ELSE 0 END,version=version+1,actor_id=NEW.released_by,updated_at=NEW.released_at WHERE id=NEW.file_id;
 INSERT INTO hrm_lifecycle_events(actor_id,action,target_id,detail,created_at)
 VALUES(NEW.released_by,'closeout_file_hold_released',NEW.id,json_object('case_id',NEW.case_id,'file_id',NEW.file_id,'version',NEW.version),NEW.released_at);
END;
-- Releasing one scope must preserve an overlapping scope.
DROP TRIGGER hrm_closeout_person_hold_released;
CREATE TRIGGER hrm_closeout_person_hold_released AFTER UPDATE OF state ON hrm_legal_holds
WHEN NEW.scope_kind='person' AND NEW.category='*' AND OLD.state='active' AND NEW.state='released' BEGIN
 UPDATE hrm_closeout_files SET legal_hold=0,version=version+1,actor_id=NEW.released_by,updated_at=NEW.released_at
 WHERE legal_hold=1 AND case_id IN (SELECT id FROM hrm_offboarding_cases WHERE person_id=NEW.person_id)
 AND NOT EXISTS(SELECT 1 FROM hrm_legal_holds h WHERE h.person_id=NEW.person_id AND h.scope_kind='person' AND h.category='*' AND h.state='active')
 AND NOT EXISTS(SELECT 1 FROM hrm_closeout_file_holds h WHERE h.file_id=hrm_closeout_files.id AND h.state='active');
END;
CREATE TRIGGER hrm_closeout_file_hold_flag_guard BEFORE UPDATE OF legal_hold ON hrm_closeout_files
WHEN NEW.legal_hold=0 AND EXISTS(SELECT 1 FROM hrm_closeout_file_holds h WHERE h.file_id=NEW.id AND h.state='active')
BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_held'); END;
CREATE TRIGGER hrm_closeout_file_hold_disposition_guard BEFORE UPDATE OF object_deleted_at,disposition_state ON hrm_closeout_files
WHEN (NEW.object_deleted_at IS NOT OLD.object_deleted_at AND NEW.object_deleted_at IS NOT NULL OR NEW.disposition_state IN ('pending_review','approved','deleting','completed'))
 AND EXISTS(SELECT 1 FROM hrm_closeout_file_holds h WHERE h.file_id=NEW.id AND h.state='active')
BEGIN SELECT RAISE(ABORT,'hrm_closeout_evidence_held'); END;

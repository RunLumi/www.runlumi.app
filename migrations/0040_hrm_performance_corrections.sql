-- Append-only correction lineage. Published rows and their receipts are never rewritten.
CREATE TABLE hrm_performance_corrections (
 id TEXT PRIMARY KEY,
 root_review_id TEXT NOT NULL REFERENCES hrm_performance_reviews(id),
 source_review_id TEXT NOT NULL REFERENCES hrm_performance_reviews(id),
 replacement_review_id TEXT NOT NULL UNIQUE REFERENCES hrm_performance_reviews(id),
 attempt_no INTEGER NOT NULL CHECK(attempt_no>0),
 source_revision_at_creation INTEGER NOT NULL CHECK(source_revision_at_creation>0),
 employment_revision INTEGER NOT NULL CHECK(employment_revision>0),
 source_publication_event_id INTEGER NOT NULL REFERENCES hrm_performance_events(id),
 source_publication_checksum TEXT NOT NULL CHECK(length(source_publication_checksum)=64 AND source_publication_checksum NOT GLOB '*[^0123456789abcdef]*'),
 subject_user_id TEXT NOT NULL,
 self_mode TEXT NOT NULL CHECK(self_mode IN ('carry_forward','new_submission')),
 self_origin_event_id INTEGER REFERENCES hrm_performance_events(id),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(root_review_id,attempt_no),
 CHECK(root_review_id!=replacement_review_id AND source_review_id!=replacement_review_id),
 CHECK((self_mode='carry_forward' AND self_origin_event_id IS NOT NULL) OR (self_mode='new_submission' AND self_origin_event_id IS NULL))
);
CREATE INDEX hrm_performance_correction_source ON hrm_performance_corrections(source_review_id,attempt_no DESC);
CREATE TABLE hrm_performance_correction_publications (
 correction_id TEXT PRIMARY KEY REFERENCES hrm_performance_corrections(id),
 source_event_id INTEGER NOT NULL REFERENCES hrm_performance_events(id),
 source_revision INTEGER NOT NULL CHECK(source_revision>0),
 employment_revision INTEGER NOT NULL CHECK(employment_revision>0),
 source_checksum TEXT NOT NULL CHECK(length(source_checksum)=64 AND source_checksum NOT GLOB '*[^0123456789abcdef]*'),
 approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
);
CREATE TRIGGER hrm_performance_correction_insert_guard BEFORE INSERT ON hrm_performance_corrections BEGIN
 SELECT CASE WHEN NEW.attempt_no!=(SELECT COALESCE(MAX(attempt_no),0)+1 FROM hrm_performance_corrections WHERE root_review_id=NEW.root_review_id) THEN RAISE(ABORT,'hrm_performance_correction_conflict') END;
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM hrm_performance_reviews s JOIN hrm_performance_reviews n ON n.id=NEW.replacement_review_id
  JOIN hrm_people p ON p.id=s.person_id JOIN hrm_employments employment ON employment.id=s.employment_id
  JOIN hrm_performance_events e ON e.id=NEW.source_publication_event_id AND e.review_id=s.id AND e.event_type='publish'
  WHERE s.id=NEW.source_review_id AND s.state IN ('published','responded','closed') AND s.revision=NEW.source_revision_at_creation
   AND NEW.root_review_id=COALESCE((SELECT c.root_review_id FROM hrm_performance_corrections c WHERE c.replacement_review_id=s.id),s.id)
   AND n.person_id=s.person_id AND n.employment_id=s.employment_id AND n.legal_entity=s.legal_entity
   AND n.revision=1 AND employment.person_id=s.person_id AND employment.legal_entity=s.legal_entity AND employment.version=NEW.employment_revision
   AND (employment.started_on IS NULL OR n.period_start>=employment.started_on) AND (employment.ended_on IS NULL OR n.period_end<employment.ended_on)
   AND NEW.created_by=n.created_by AND NEW.created_at=n.created_at AND NEW.created_by!=NEW.subject_user_id
   AND p.user_id=NEW.subject_user_id AND json_extract(e.snapshot_json,'$.after.employee_user_id')=NEW.subject_user_id
   AND n.reviewer_user_id!=NEW.subject_user_id
   AND ((NEW.self_mode='new_submission' AND n.state='open' AND n.self_assessment='' AND n.self_evidence='') OR
    (NEW.self_mode='carry_forward' AND n.state='self_submitted' AND n.self_assessment=s.self_assessment AND n.self_evidence=s.self_evidence
     AND EXISTS(SELECT 1 FROM hrm_performance_events o JOIN hrm_performance_reviews r ON r.id=o.review_id
      WHERE o.id=NEW.self_origin_event_id AND o.event_type='submit_self' AND o.actor_id=NEW.subject_user_id
       AND r.person_id=s.person_id AND r.employment_id=s.employment_id
       AND json_extract(o.snapshot_json,'$.after.self_assessment')=n.self_assessment AND json_extract(o.snapshot_json,'$.after.self_evidence')=n.self_evidence)))
 ) THEN RAISE(ABORT,'hrm_performance_correction_conflict') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM hrm_performance_corrections c JOIN hrm_performance_reviews r ON r.id=c.replacement_review_id WHERE c.source_review_id=NEW.source_review_id AND r.state!='cancelled') THEN RAISE(ABORT,'hrm_performance_correction_conflict') END;
END;
CREATE TRIGGER hrm_performance_correction_basis_guard BEFORE INSERT ON hrm_performance_correction_publications BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM hrm_performance_corrections c JOIN hrm_performance_reviews s ON s.id=c.source_review_id
  JOIN hrm_performance_reviews n ON n.id=c.replacement_review_id JOIN hrm_people p ON p.id=s.person_id JOIN hrm_employments employment ON employment.id=n.employment_id
  JOIN hrm_performance_events e ON e.id=NEW.source_event_id AND e.review_id=s.id AND e.revision=NEW.source_revision
  WHERE c.id=NEW.correction_id AND s.revision=NEW.source_revision AND s.state IN ('published','responded','closed')
   AND n.state='assessed' AND employment.person_id=n.person_id AND employment.legal_entity=n.legal_entity AND employment.version=NEW.employment_revision
   AND (employment.started_on IS NULL OR n.period_start>=employment.started_on) AND (employment.ended_on IS NULL OR n.period_end<employment.ended_on)
   AND p.user_id=c.subject_user_id AND NEW.approved_by!=c.subject_user_id
   AND NEW.approved_by!=n.created_by AND NEW.approved_by!=n.assessed_by
 ) THEN RAISE(ABORT,'hrm_performance_correction_conflict') END;
END;
CREATE TRIGGER hrm_performance_correction_publish_guard BEFORE UPDATE ON hrm_performance_reviews
WHEN NEW.state='published' AND OLD.state!='published' AND EXISTS(SELECT 1 FROM hrm_performance_corrections WHERE replacement_review_id=OLD.id) BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM hrm_performance_corrections c JOIN hrm_performance_correction_publications b ON b.correction_id=c.id
  JOIN hrm_performance_reviews s ON s.id=c.source_review_id JOIN hrm_people p ON p.id=s.person_id JOIN hrm_employments employment ON employment.id=OLD.employment_id
  WHERE c.replacement_review_id=OLD.id AND b.approved_by=NEW.published_by AND b.approved_at=NEW.published_at
   AND s.revision=b.source_revision AND s.state IN ('published','responded','closed') AND p.user_id=c.subject_user_id
   AND employment.version=b.employment_revision AND employment.legal_entity=OLD.legal_entity
   AND (employment.started_on IS NULL OR NEW.period_start>=employment.started_on) AND (employment.ended_on IS NULL OR NEW.period_end<employment.ended_on)
 ) THEN RAISE(ABORT,'hrm_performance_correction_conflict') END;
END;
CREATE TRIGGER hrm_performance_superseded_guard BEFORE UPDATE ON hrm_performance_reviews
WHEN EXISTS(SELECT 1 FROM hrm_performance_corrections c JOIN hrm_performance_reviews n ON n.id=c.replacement_review_id WHERE c.source_review_id=OLD.id AND n.state IN ('published','responded','closed'))
BEGIN SELECT RAISE(ABORT,'hrm_performance_review_superseded'); END;
CREATE TRIGGER hrm_performance_corrections_no_update BEFORE UPDATE ON hrm_performance_corrections BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_performance_corrections_no_delete BEFORE DELETE ON hrm_performance_corrections BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_performance_correction_basis_no_update BEFORE UPDATE ON hrm_performance_correction_publications BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_performance_correction_basis_no_delete BEFORE DELETE ON hrm_performance_correction_publications BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

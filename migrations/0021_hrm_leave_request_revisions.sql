-- Immutable history for employee/HR amendments to a pending leave request.
-- A material revision invalidates any earlier evidence review via revision_no.

ALTER TABLE hrm_leave_requests
  ADD COLUMN current_revision_no INTEGER NOT NULL DEFAULT 1 CHECK(current_revision_no > 0);
ALTER TABLE hrm_leave_evidence_links
  ADD COLUMN revision_no INTEGER NOT NULL DEFAULT 1 CHECK(revision_no > 0);

CREATE TABLE hrm_leave_request_revisions (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL REFERENCES hrm_leave_requests(id),
  revision_no INTEGER NOT NULL CHECK(revision_no > 1),
  expected_request_version INTEGER NOT NULL CHECK(expected_request_version > 0),
  prior_snapshot_json TEXT NOT NULL CHECK(json_valid(prior_snapshot_json)),
  next_snapshot_json TEXT NOT NULL CHECK(json_valid(next_snapshot_json)),
  revision_reason TEXT NOT NULL CHECK(length(trim(revision_reason)) BETWEEN 1 AND 500),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(leave_request_id,revision_no)
);
CREATE INDEX hrm_leave_revisions_request ON hrm_leave_request_revisions(leave_request_id,revision_no DESC);
CREATE TRIGGER hrm_leave_revision_insert_guard
BEFORE INSERT ON hrm_leave_request_revisions
WHEN NOT EXISTS(SELECT 1 FROM hrm_leave_requests WHERE id=NEW.leave_request_id AND version=NEW.expected_request_version AND current_revision_no+1=NEW.revision_no AND state='pending_approval')
BEGIN SELECT RAISE(ABORT,'leave_request_revision_stale'); END;
CREATE TRIGGER hrm_leave_revision_no_update BEFORE UPDATE ON hrm_leave_request_revisions BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_leave_revision_no_delete BEFORE DELETE ON hrm_leave_request_revisions BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_leave_request_revision_guard
BEFORE UPDATE OF current_revision_no ON hrm_leave_requests
WHEN NEW.current_revision_no!=OLD.current_revision_no AND NOT (
  NEW.current_revision_no=OLD.current_revision_no+1 AND
  EXISTS(SELECT 1 FROM hrm_leave_request_revisions r WHERE r.leave_request_id=NEW.id AND r.revision_no=NEW.current_revision_no AND r.expected_request_version=OLD.version)
)
BEGIN SELECT RAISE(ABORT,'leave_request_revision_missing'); END;

DROP TRIGGER hrm_leave_evidence_link_insert_guard;
CREATE TRIGGER hrm_leave_evidence_link_insert_guard
BEFORE INSERT ON hrm_leave_evidence_links
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_leave_requests r JOIN hrm_leave_policy_versions p ON p.id=r.policy_version_id
  JOIN json_each(p.rules_json) rule ON json_extract(rule.value,'$.key')=r.leave_type_key
  WHERE r.id=NEW.leave_request_id AND r.person_id=NEW.person_id AND r.state='pending_approval'
    AND r.current_revision_no=NEW.revision_no AND json_extract(rule.value,'$.evidence_required')=1
) OR NOT EXISTS(SELECT 1 FROM hrm_files f WHERE f.id=NEW.file_id AND f.person_id=NEW.person_id AND f.kind='leave_evidence' AND f.uploaded_by=NEW.uploaded_by AND f.state='quarantined')
BEGIN SELECT RAISE(ABORT,'leave_evidence_target_invalid'); END;

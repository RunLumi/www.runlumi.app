-- Bind each open asset assignment to the owning employment's offboarding task.
CREATE TABLE hrm_offboarding_asset_links (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES hrm_offboarding_tasks(id),
  assignment_id TEXT NOT NULL UNIQUE REFERENCES hrm_asset_assignments(id),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(task_id,assignment_id)
);
CREATE INDEX hrm_offboarding_asset_links_task ON hrm_offboarding_asset_links(task_id,created_at,assignment_id);

CREATE TRIGGER hrm_offboarding_asset_link_guard
BEFORE INSERT ON hrm_offboarding_asset_links
WHEN NOT EXISTS(
  SELECT 1 FROM hrm_offboarding_tasks t
  JOIN hrm_offboarding_cases c ON c.id=t.case_id
  JOIN hrm_asset_assignments a ON a.id=NEW.assignment_id
  WHERE t.id=NEW.task_id AND t.task_key='asset_return' AND t.state IN ('pending','blocked')
    AND c.state='open' AND a.person_id=c.person_id AND a.employment_id=c.employment_id
    AND a.state IN ('offered','assigned','return_requested')
)
BEGIN SELECT RAISE(ABORT,'offboarding_asset_link_target_invalid'); END;
CREATE TRIGGER hrm_offboarding_asset_link_no_update BEFORE UPDATE ON hrm_offboarding_asset_links BEGIN
  SELECT RAISE(ABORT,'immutable_offboarding_asset_link');
END;
CREATE TRIGGER hrm_offboarding_asset_link_no_delete BEFORE DELETE ON hrm_offboarding_asset_links BEGIN
  SELECT RAISE(ABORT,'immutable_offboarding_asset_link');
END;

-- Preserve and attach assignments already open when this migration is applied.
INSERT INTO hrm_offboarding_asset_links(id,task_id,assignment_id,actor_id,created_at)
SELECT 'offasset_'||lower(hex(randomblob(16))),t.id,a.id,t.actor_id,t.created_at
FROM hrm_offboarding_tasks t
JOIN hrm_offboarding_cases c ON c.id=t.case_id AND c.state='open'
JOIN hrm_asset_assignments a ON a.person_id=c.person_id AND a.employment_id=c.employment_id
WHERE t.task_key='asset_return' AND t.state IN ('pending','blocked')
  AND a.state IN ('offered','assigned','return_requested');

-- New offboarding cases seed the task first, so it can capture existing custody.
CREATE TRIGGER hrm_offboarding_asset_link_task_created
AFTER INSERT ON hrm_offboarding_tasks
WHEN NEW.task_key='asset_return' AND NEW.state IN ('pending','blocked')
BEGIN
  INSERT INTO hrm_offboarding_asset_links(id,task_id,assignment_id,actor_id,created_at)
  SELECT 'offasset_'||lower(hex(randomblob(16))),NEW.id,a.id,NEW.actor_id,NEW.created_at
  FROM hrm_offboarding_cases c
  JOIN hrm_asset_assignments a ON a.person_id=c.person_id AND a.employment_id=c.employment_id
  WHERE c.id=NEW.case_id AND c.state='open'
    AND a.state IN ('offered','assigned','return_requested');
END;

-- Also cover an assignment created after an open offboarding task exists.
CREATE TRIGGER hrm_offboarding_asset_link_assignment_created
AFTER INSERT ON hrm_asset_assignments
WHEN NEW.state IN ('offered','assigned','return_requested')
BEGIN
  INSERT INTO hrm_offboarding_asset_links(id,task_id,assignment_id,actor_id,created_at)
  SELECT 'offasset_'||lower(hex(randomblob(16))),t.id,NEW.id,NEW.actor_id,NEW.created_at
  FROM hrm_offboarding_cases c
  JOIN hrm_offboarding_tasks t ON t.case_id=c.id AND t.task_key='asset_return'
  WHERE c.id IN (SELECT id FROM hrm_offboarding_cases WHERE employment_id=NEW.employment_id AND person_id=NEW.person_id AND state='open')
    AND t.state IN ('pending','blocked');
END;

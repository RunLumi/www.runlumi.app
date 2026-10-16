-- HRM asset custody tracks offers, employee acknowledgements and verified returns.
-- No payroll deduction or external device/account provisioning is performed.
CREATE TABLE hrm_assets (
  id TEXT PRIMARY KEY,
  asset_tag TEXT NOT NULL UNIQUE CHECK(length(trim(asset_tag)) BETWEEN 2 AND 48),
  asset_type TEXT NOT NULL CHECK(asset_type IN ('computer','phone','monitor','accessory','key','other')),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 240),
  serial_number TEXT NOT NULL DEFAULT '' CHECK(length(serial_number)<=120),
  legal_entity TEXT NOT NULL CHECK(length(trim(legal_entity)) BETWEEN 1 AND 200),
  location TEXT NOT NULL DEFAULT '' CHECK(length(location)<=160),
  state TEXT NOT NULL DEFAULT 'available' CHECK(state IN ('available','offered','assigned','return_requested','inspection','retired','lost')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX hrm_assets_state ON hrm_assets(state,asset_type,asset_tag);
CREATE TRIGGER hrm_asset_identity_immutable
BEFORE UPDATE OF asset_tag,asset_type,serial_number,legal_entity,created_by,created_at ON hrm_assets
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_asset_state_guard BEFORE UPDATE OF state ON hrm_assets
WHEN NOT (OLD.state=NEW.state OR
  OLD.state='available' AND NEW.state IN ('offered','retired','lost') OR
  OLD.state='offered' AND NEW.state IN ('assigned','available') OR
  OLD.state='assigned' AND NEW.state IN ('return_requested','lost') OR
  OLD.state='return_requested' AND NEW.state IN ('assigned','available','inspection','lost') OR
  OLD.state='inspection' AND NEW.state IN ('available','retired','lost') OR
  OLD.state='lost' AND NEW.state='retired')
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_asset_no_delete BEFORE DELETE ON hrm_assets BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_asset_assignments (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES hrm_assets(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  state TEXT NOT NULL DEFAULT 'offered' CHECK(state IN ('offered','assigned','return_requested','returned','cancelled')),
  expected_return_on TEXT,
  issued_condition TEXT NOT NULL CHECK(issued_condition IN ('good','damaged')),
  return_condition TEXT CHECK(return_condition IN ('good','damaged','missing')),
  offer_reason TEXT NOT NULL CHECK(length(trim(offer_reason)) BETWEEN 1 AND 500),
  return_note TEXT NOT NULL DEFAULT '',
  offered_by TEXT NOT NULL,
  offered_at TEXT NOT NULL,
  accepted_by TEXT,
  accepted_at TEXT,
  return_requested_by TEXT,
  return_requested_at TEXT,
  employee_handover_by TEXT,
  employee_handover_at TEXT,
  returned_by TEXT,
  returned_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(accepted_by IS NULL OR accepted_by!=offered_by),
  CHECK((state IN ('assigned','return_requested','returned') AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL) OR state IN ('offered','cancelled')),
  CHECK((state='returned' AND returned_by IS NOT NULL AND returned_at IS NOT NULL AND return_condition IS NOT NULL) OR state!='returned')
);
CREATE UNIQUE INDEX hrm_asset_one_open_assignment ON hrm_asset_assignments(asset_id) WHERE state IN ('offered','assigned','return_requested');
CREATE INDEX hrm_asset_assignments_person ON hrm_asset_assignments(person_id,state,updated_at DESC);
CREATE INDEX hrm_asset_assignments_due ON hrm_asset_assignments(state,expected_return_on);
CREATE TRIGGER hrm_asset_assignment_identity_immutable
BEFORE UPDATE OF asset_id,person_id,employment_id,expected_return_on,issued_condition,offer_reason,offered_by,offered_at,created_at ON hrm_asset_assignments
BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_asset_assignment_state_guard BEFORE UPDATE OF state ON hrm_asset_assignments
WHEN NOT (OLD.state=NEW.state OR OLD.state='offered' AND NEW.state IN ('assigned','cancelled') OR OLD.state='assigned' AND NEW.state='return_requested' OR OLD.state='return_requested' AND NEW.state IN ('assigned','returned'))
BEGIN SELECT RAISE(ABORT,'invalid_transition'); END;
CREATE TRIGGER hrm_asset_assignment_no_delete BEFORE DELETE ON hrm_asset_assignments BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

CREATE TABLE hrm_asset_events (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES hrm_assets(id),
  assignment_id TEXT REFERENCES hrm_asset_assignments(id),
  person_id TEXT REFERENCES hrm_people(id),
  action TEXT NOT NULL CHECK(action IN ('registered','offered','accepted','offer_cancelled','return_requested','return_cancelled','handover_reported','returned','inspection_required','marked_lost','retired','inspection_cleared')),
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_asset_events_order ON hrm_asset_events(asset_id,created_at,id);
CREATE INDEX hrm_asset_events_person ON hrm_asset_events(person_id,created_at DESC);
CREATE TRIGGER hrm_asset_event_no_update BEFORE UPDATE ON hrm_asset_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;
CREATE TRIGGER hrm_asset_event_no_delete BEFORE DELETE ON hrm_asset_events BEGIN SELECT RAISE(ABORT,'immutable_history'); END;

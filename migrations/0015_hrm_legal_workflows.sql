-- Legal document templates/issues, timestamped acknowledgements, private evidence, and COI reviews.
-- No e-sign provider or jurisdiction-specific legal policy is enabled by this schema.

CREATE TABLE hrm_legal_templates (
  id TEXT PRIMARY KEY,
  document_key TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL CHECK(document_type IN ('policy','nda','employment_contract','contract_addendum','code_of_conduct','privacy','equipment','handover','other')),
  title_en TEXT NOT NULL,
  title_vi TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','retired')),
  current_version_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX hrm_legal_templates_state ON hrm_legal_templates(state,document_type);

CREATE TABLE hrm_legal_files (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE CHECK(object_key LIKE 'hrm/legal/%' OR object_key LIKE 'hrm/onboarding/%'),
  kind TEXT NOT NULL CHECK(kind IN ('docx_source','pdf_evidence')),
  template_id TEXT REFERENCES hrm_legal_templates(id),
  template_version_id TEXT,
  issue_id TEXT,
  coi_declaration_id TEXT REFERENCES hrm_coi_declarations(id),
  onboarding_task_id TEXT,
  person_id TEXT REFERENCES hrm_people(id),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/pdf')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 5242880),
  checksum TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('quarantined','reviewed','rejected')),
  uploaded_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((kind='docx_source' AND template_id IS NOT NULL AND issue_id IS NULL AND coi_declaration_id IS NULL AND onboarding_task_id IS NULL AND person_id IS NULL) OR
        (kind='pdf_evidence' AND person_id IS NOT NULL AND (issue_id IS NOT NULL OR coi_declaration_id IS NOT NULL OR onboarding_task_id IS NOT NULL))),
  CHECK(reviewed_by IS NULL OR reviewed_by != uploaded_by)
);
CREATE INDEX hrm_legal_files_issue ON hrm_legal_files(issue_id,state);
CREATE INDEX hrm_legal_files_person ON hrm_legal_files(person_id,kind,state);

CREATE TABLE hrm_legal_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES hrm_legal_templates(id),
  version_number INTEGER NOT NULL CHECK(version_number > 0),
  source_file_id TEXT NOT NULL REFERENCES hrm_legal_files(id),
  source_checksum TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('en','vi','bilingual')),
  legal_entity TEXT NOT NULL,
  purpose TEXT NOT NULL,
  audience_json TEXT NOT NULL CHECK(json_valid(audience_json) AND json_type(audience_json)='array'),
  requires_ack INTEGER NOT NULL DEFAULT 0 CHECK(requires_ack IN (0,1)),
  signing_mode TEXT NOT NULL CHECK(signing_mode IN ('acknowledgement','paper_scan')),
  required_parties_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(required_parties_json) AND json_type(required_parties_json)='array'),
  effective_on TEXT,
  due_days INTEGER NOT NULL DEFAULT 30 CHECK(due_days >= 0 AND due_days <= 3650),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','reviewed','active','retired','rejected')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  activated_by TEXT,
  activated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(template_id,version_number),
  UNIQUE(source_file_id),
  CHECK(reviewed_by IS NULL OR reviewed_by != created_by),
  CHECK(activated_by IS NULL OR activated_by != created_by),
  CHECK(requires_ack=0 OR signing_mode='acknowledgement')
);
CREATE INDEX hrm_legal_versions_template ON hrm_legal_template_versions(template_id,version_number DESC,state);

CREATE TABLE hrm_legal_issues (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES hrm_legal_templates(id),
  template_version_id TEXT NOT NULL REFERENCES hrm_legal_template_versions(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  issue_no INTEGER NOT NULL CHECK(issue_no > 0),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  source_checksum TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('issued','viewed','awaiting_action','completed','declined','expired','cancelled','superseded')),
  issued_by TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  due_at TEXT,
  supersedes_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(template_id,person_id,issue_no),
  UNIQUE(template_version_id,person_id)
);
CREATE INDEX hrm_legal_issues_person ON hrm_legal_issues(person_id,state,issued_at DESC);
CREATE INDEX hrm_legal_issues_due ON hrm_legal_issues(state,due_at);

CREATE TABLE hrm_legal_parties (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL REFERENCES hrm_legal_issues(id),
  party_key TEXT NOT NULL,
  party_kind TEXT NOT NULL CHECK(party_kind IN ('employee','company','other')),
  user_id TEXT,
  display_name TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','viewed','acknowledged','paper_signed_pending','paper_signed_verified','declined')),
  evidence_file_id TEXT,
  signed_at TEXT,
  declared_signed_on TEXT,
  verified_by TEXT,
  verified_at TEXT,
  review_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(issue_id,party_key),
  CHECK(verified_by IS NULL OR verified_by != user_id)
);
CREATE INDEX hrm_legal_parties_issue ON hrm_legal_parties(issue_id,state);

CREATE TABLE hrm_policy_acknowledgements (
  id TEXT PRIMARY KEY,
  issue_id TEXT NOT NULL UNIQUE REFERENCES hrm_legal_issues(id),
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  actor_id TEXT NOT NULL,
  template_version_id TEXT NOT NULL REFERENCES hrm_legal_template_versions(id),
  source_checksum TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK(actor_id != '')
);

CREATE TABLE hrm_legal_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  template_id TEXT,
  template_version_id TEXT,
  issue_id TEXT,
  person_id TEXT,
  target_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail)),
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_legal_events_target ON hrm_legal_events(target_id,created_at DESC);

CREATE TABLE hrm_coi_declarations (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES hrm_people(id),
  employment_id TEXT NOT NULL REFERENCES hrm_employments(id),
  supersedes_id TEXT REFERENCES hrm_coi_declarations(id),
  supersedes_version INTEGER,
  declaration_no INTEGER NOT NULL CHECK(declaration_no > 0),
  answers_json TEXT NOT NULL CHECK(json_valid(answers_json)),
  state TEXT NOT NULL CHECK(state IN ('draft','submitted','under_review','clarification_needed','cleared','mitigation_required','escalated','closed','superseded')),
  assigned_reviewer_id TEXT,
  submitted_by TEXT,
  submitted_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_reason TEXT,
  mitigation TEXT,
  followup_due TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(person_id,declaration_no),
  CHECK(reviewed_by IS NULL OR reviewed_by != submitted_by)
);
CREATE INDEX hrm_coi_person ON hrm_coi_declarations(person_id,created_at DESC);
CREATE INDEX hrm_coi_queue ON hrm_coi_declarations(state,assigned_reviewer_id,followup_due);
CREATE UNIQUE INDEX hrm_coi_one_replacement ON hrm_coi_declarations(supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE TABLE hrm_coi_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  declaration_id TEXT NOT NULL REFERENCES hrm_coi_declarations(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail)),
  created_at TEXT NOT NULL
);
CREATE INDEX hrm_coi_events_declaration ON hrm_coi_events(declaration_id,created_at);

CREATE TRIGGER hrm_legal_file_created AFTER INSERT ON hrm_legal_files BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,template_id,template_version_id,issue_id,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'file_uploaded',NEW.template_id,NEW.template_version_id,NEW.issue_id,NEW.person_id,NEW.id,json_object('kind',NEW.kind,'state',NEW.state,'checksum',NEW.checksum),NEW.created_at);
END;
CREATE TRIGGER hrm_legal_file_changed AFTER UPDATE ON hrm_legal_files BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,template_id,template_version_id,issue_id,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'file_'||NEW.state,NEW.template_id,NEW.template_version_id,NEW.issue_id,NEW.person_id,NEW.id,json_object('version',NEW.version,'reviewed_by',NEW.reviewed_by),NEW.updated_at);
END;
CREATE TRIGGER hrm_legal_file_content_immutable BEFORE UPDATE ON hrm_legal_files
WHEN OLD.object_key!=NEW.object_key OR OLD.kind!=NEW.kind OR OLD.template_id IS NOT NEW.template_id OR OLD.template_version_id IS NOT NEW.template_version_id OR OLD.issue_id IS NOT NEW.issue_id OR OLD.coi_declaration_id IS NOT NEW.coi_declaration_id OR OLD.onboarding_task_id IS NOT NEW.onboarding_task_id OR OLD.person_id IS NOT NEW.person_id OR OLD.original_name!=NEW.original_name OR OLD.mime_type!=NEW.mime_type OR OLD.size_bytes!=NEW.size_bytes OR OLD.checksum!=NEW.checksum OR OLD.uploaded_by!=NEW.uploaded_by OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_legal_file_content'); END;
CREATE TRIGGER hrm_legal_template_created AFTER INSERT ON hrm_legal_templates BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,template_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'template_created',NEW.id,NEW.id,json_object('document_type',NEW.document_type),NEW.created_at);
END;
CREATE TRIGGER hrm_legal_template_changed AFTER UPDATE ON hrm_legal_templates BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,template_id,target_id,detail,created_at)
  VALUES(NEW.updated_by,'template_updated',NEW.id,NEW.id,json_object('version',NEW.version,'state',NEW.state,'current_version_id',NEW.current_version_id),NEW.updated_at);
END;
CREATE TRIGGER hrm_legal_version_state_changed AFTER UPDATE ON hrm_legal_template_versions
WHEN OLD.state!=NEW.state BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,template_id,template_version_id,target_id,detail,created_at)
  VALUES(COALESCE(NEW.activated_by,NEW.reviewed_by,NEW.updated_by),'version_'||NEW.state,NEW.template_id,NEW.id,NEW.id,json_object('version_number',NEW.version_number),NEW.updated_at);
END;
CREATE TRIGGER hrm_legal_issue_created AFTER INSERT ON hrm_legal_issues BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,template_id,template_version_id,issue_id,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'document_issued',NEW.template_id,NEW.template_version_id,NEW.id,NEW.person_id,NEW.id,json_object('issue_no',NEW.issue_no,'checksum',NEW.source_checksum),NEW.issued_at);
END;
CREATE TRIGGER hrm_legal_party_created AFTER INSERT ON hrm_legal_parties BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,issue_id,person_id,target_id,detail,created_at)
  SELECT NEW.actor_id,'party_added',i.id,i.person_id,NEW.id,json_object('party_kind',NEW.party_kind,'required',NEW.required),NEW.created_at FROM hrm_legal_issues i WHERE i.id=NEW.issue_id;
END;
CREATE TRIGGER hrm_legal_party_changed AFTER UPDATE ON hrm_legal_parties BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,issue_id,person_id,target_id,detail,created_at)
  SELECT NEW.actor_id,'party_'||NEW.state,i.id,i.person_id,NEW.id,json_object('version',NEW.version,'verified_by',NEW.verified_by),NEW.updated_at FROM hrm_legal_issues i WHERE i.id=NEW.issue_id;
END;
CREATE TRIGGER hrm_legal_ack_created AFTER INSERT ON hrm_policy_acknowledgements BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,issue_id,person_id,target_id,detail,created_at)
  SELECT NEW.actor_id,'policy_acknowledged',i.id,NEW.person_id,NEW.id,json_object('template_version_id',NEW.template_version_id,'checksum',NEW.source_checksum,'acknowledged_at',NEW.acknowledged_at),NEW.created_at FROM hrm_legal_issues i WHERE i.id=NEW.issue_id;
END;
CREATE TRIGGER hrm_legal_issue_changed AFTER UPDATE ON hrm_legal_issues BEGIN
  INSERT INTO hrm_legal_events(actor_id,action,template_id,template_version_id,issue_id,person_id,target_id,detail,created_at)
  VALUES(NEW.actor_id,'document_'||NEW.state,NEW.template_id,NEW.template_version_id,NEW.id,NEW.person_id,NEW.id,json_object('version',NEW.version),NEW.updated_at);
END;
CREATE TRIGGER hrm_legal_ack_no_update BEFORE UPDATE ON hrm_policy_acknowledgements BEGIN SELECT RAISE(ABORT,'immutable_legal_acknowledgement'); END;
CREATE TRIGGER hrm_legal_ack_no_delete BEFORE DELETE ON hrm_policy_acknowledgements BEGIN SELECT RAISE(ABORT,'immutable_legal_acknowledgement'); END;
CREATE TRIGGER hrm_legal_events_no_update BEFORE UPDATE ON hrm_legal_events BEGIN SELECT RAISE(ABORT,'immutable_legal_event'); END;
CREATE TRIGGER hrm_legal_events_no_delete BEFORE DELETE ON hrm_legal_events BEGIN SELECT RAISE(ABORT,'immutable_legal_event'); END;
CREATE TRIGGER hrm_legal_version_content_immutable BEFORE UPDATE ON hrm_legal_template_versions
WHEN OLD.template_id!=NEW.template_id OR OLD.version_number!=NEW.version_number OR OLD.source_file_id!=NEW.source_file_id OR OLD.source_checksum!=NEW.source_checksum OR OLD.language!=NEW.language OR OLD.legal_entity!=NEW.legal_entity OR OLD.purpose!=NEW.purpose OR OLD.audience_json!=NEW.audience_json OR OLD.requires_ack!=NEW.requires_ack OR OLD.signing_mode!=NEW.signing_mode OR OLD.required_parties_json!=NEW.required_parties_json OR OLD.effective_on IS NOT NEW.effective_on OR OLD.due_days!=NEW.due_days OR OLD.created_by!=NEW.created_by OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_legal_version'); END;
CREATE TRIGGER hrm_legal_issue_snapshot_immutable BEFORE UPDATE ON hrm_legal_issues
WHEN OLD.template_id!=NEW.template_id OR OLD.template_version_id!=NEW.template_version_id OR OLD.person_id!=NEW.person_id OR OLD.employment_id!=NEW.employment_id OR OLD.issue_no!=NEW.issue_no OR OLD.snapshot_json!=NEW.snapshot_json OR OLD.source_checksum!=NEW.source_checksum OR OLD.issued_by!=NEW.issued_by OR OLD.issued_at!=NEW.issued_at OR OLD.due_at IS NOT NEW.due_at OR OLD.supersedes_id IS NOT NEW.supersedes_id
BEGIN SELECT RAISE(ABORT,'immutable_legal_issue_snapshot'); END;
CREATE TRIGGER hrm_coi_event_no_update BEFORE UPDATE ON hrm_coi_events BEGIN SELECT RAISE(ABORT,'immutable_coi_event'); END;
CREATE TRIGGER hrm_coi_event_no_delete BEFORE DELETE ON hrm_coi_events BEGIN SELECT RAISE(ABORT,'immutable_coi_event'); END;
CREATE TRIGGER hrm_coi_answers_immutable_after_submit BEFORE UPDATE ON hrm_coi_declarations
WHEN OLD.state!='draft' AND OLD.answers_json!=NEW.answers_json
BEGIN SELECT RAISE(ABORT,'immutable_coi_submission'); END;
CREATE TRIGGER hrm_coi_identity_immutable BEFORE UPDATE ON hrm_coi_declarations
WHEN OLD.person_id!=NEW.person_id OR OLD.employment_id!=NEW.employment_id OR OLD.supersedes_id IS NOT NEW.supersedes_id OR (OLD.state!='draft' AND OLD.supersedes_version IS NOT NEW.supersedes_version) OR OLD.declaration_no!=NEW.declaration_no OR OLD.created_at!=NEW.created_at
BEGIN SELECT RAISE(ABORT,'immutable_coi_identity'); END;
CREATE TRIGGER hrm_coi_created AFTER INSERT ON hrm_coi_declarations BEGIN
  INSERT INTO hrm_coi_events(declaration_id,actor_id,action,detail,created_at)
  VALUES(NEW.id,NEW.actor_id,'declaration_created',json_object('state',NEW.state),NEW.created_at);
END;
CREATE TRIGGER hrm_coi_changed AFTER UPDATE ON hrm_coi_declarations BEGIN
  INSERT INTO hrm_coi_events(declaration_id,actor_id,action,detail,created_at)
  VALUES(NEW.id,NEW.actor_id,'declaration_'||NEW.state,json_object('version',NEW.version,'assigned_reviewer_id',NEW.assigned_reviewer_id,'reviewed_by',NEW.reviewed_by,'review_reason',NEW.review_reason,'mitigation',NEW.mitigation,'followup_due',NEW.followup_due,'supersedes_id',NEW.supersedes_id,'supersedes_version',NEW.supersedes_version),NEW.updated_at);
END;

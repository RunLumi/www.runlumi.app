-- Metadata only. Bytes live under the dedicated crm-files/ R2 namespace.
CREATE TABLE crm_files (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES crm_files(id),
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
  kind TEXT NOT NULL CHECK(kind IN ('folder','file')),
  object_key TEXT UNIQUE,
  size INTEGER NOT NULL DEFAULT 0 CHECK(size >= 0),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','team','people','internet','inherit')),
  recipients TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(recipients)),
  public_token TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  last_actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK(parent_id IS NOT NULL OR visibility <> 'inherit'),
  CHECK((kind = 'folder' AND object_key IS NULL) OR (kind = 'file' AND object_key LIKE 'crm-files/%'))
);
CREATE INDEX crm_files_parent ON crm_files(parent_id, deleted_at);
CREATE TABLE crm_file_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER crm_file_created AFTER INSERT ON crm_files BEGIN
  INSERT INTO crm_file_audit(item_id,actor_id,action,detail,created_at)
  VALUES(NEW.id,NEW.last_actor,'created',json_object('name',NEW.name,'visibility',NEW.visibility),NEW.updated_at);
END;
CREATE TRIGGER crm_file_updated AFTER UPDATE ON crm_files BEGIN
  INSERT INTO crm_file_audit(item_id,actor_id,action,detail,created_at)
  VALUES(NEW.id,NEW.last_actor,CASE WHEN NEW.deleted_at IS NOT NULL THEN 'deleted' ELSE 'updated' END,
    json_object('before_name',OLD.name,'name',NEW.name,'before_visibility',OLD.visibility,'visibility',NEW.visibility,'before_recipients',OLD.recipients,'recipients',NEW.recipients),NEW.updated_at);
END;

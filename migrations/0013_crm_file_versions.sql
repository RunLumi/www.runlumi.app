-- Immutable version bytes, with tombstones for explicit deletion only.
CREATE TABLE crm_file_versions (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES crm_files(id),
  number INTEGER NOT NULL CHECK(number > 0),
  object_key TEXT NOT NULL UNIQUE CHECK(object_key LIKE 'crm-files/%'),
  name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size > 0),
  uploader_id TEXT NOT NULL,
  uploader_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by TEXT,
  UNIQUE(file_id, number)
);
CREATE INDEX crm_file_versions_file ON crm_file_versions(file_id, deleted_at, number);
INSERT INTO crm_file_versions(id,file_id,number,object_key,name,size,uploader_id,uploader_name,created_at)
SELECT id,id,1,object_key,name,size,owner_id,'',created_at FROM crm_files WHERE kind = 'file' AND deleted_at IS NULL;
CREATE TRIGGER crm_file_initial_version AFTER INSERT ON crm_files WHEN NEW.kind = 'file' BEGIN
  INSERT INTO crm_file_versions(id,file_id,number,object_key,name,size,uploader_id,uploader_name,created_at)
  VALUES(NEW.id,NEW.id,1,NEW.object_key,NEW.name,NEW.size,NEW.owner_id,'',NEW.created_at);
END;
CREATE TRIGGER crm_file_version_added AFTER INSERT ON crm_file_versions
WHEN NEW.object_key <> (SELECT object_key FROM crm_files WHERE id = NEW.file_id) BEGIN
  UPDATE crm_files SET object_key = NEW.object_key, size = NEW.size, updated_at = NEW.created_at,
    last_actor = NEW.uploader_id, version = version + 1 WHERE id = NEW.file_id;
  INSERT INTO crm_file_audit(item_id,actor_id,action,detail,created_at)
  VALUES(NEW.file_id,NEW.uploader_id,'version_uploaded',json_object('version_id',NEW.id,'number',NEW.number),NEW.created_at);
END;
CREATE TRIGGER crm_file_version_deleted AFTER UPDATE OF deleted_at ON crm_file_versions
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
  UPDATE crm_files SET
    object_key = COALESCE((SELECT object_key FROM crm_file_versions WHERE file_id = NEW.file_id AND deleted_at IS NULL ORDER BY number DESC LIMIT 1), object_key),
    size = COALESCE((SELECT size FROM crm_file_versions WHERE file_id = NEW.file_id AND deleted_at IS NULL ORDER BY number DESC LIMIT 1), size),
    deleted_at = CASE WHEN EXISTS (SELECT 1 FROM crm_file_versions WHERE file_id = NEW.file_id AND deleted_at IS NULL) THEN deleted_at ELSE NEW.deleted_at END,
    updated_at = NEW.deleted_at, last_actor = NEW.deleted_by, version = version + 1
    WHERE id = NEW.file_id;
  INSERT INTO crm_file_audit(item_id,actor_id,action,detail,created_at)
  VALUES(NEW.file_id,NEW.deleted_by,'version_deleted',json_object('version_id',NEW.id,'number',NEW.number),NEW.deleted_at);
END;

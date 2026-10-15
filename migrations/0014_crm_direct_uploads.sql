CREATE TABLE crm_file_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  parent_id TEXT,
  expected_version INTEGER,
  name TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 20971520),
  object_key TEXT NOT NULL UNIQUE CHECK(object_key LIKE 'crm-files/direct/%'),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','complete','expired'))
);
CREATE INDEX crm_file_uploads_owner ON crm_file_uploads(user_id,created_at);
CREATE INDEX crm_file_uploads_expiry ON crm_file_uploads(state,expires_at);

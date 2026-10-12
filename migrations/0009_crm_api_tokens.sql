-- Personal API tokens for the CRM API and MCP server. Only a SHA-256 hash of
-- each token is stored; the secret is shown once, at creation. A token acts
-- as its EmDash user with that user's current CRM permissions, never more.

CREATE TABLE crm_api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT
);
CREATE INDEX crm_api_tokens_user ON crm_api_tokens(user_id);

-- Fixed one-minute windows per token for rate limiting.
CREATE TABLE crm_api_rate (
  token_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (token_id, window_start)
);

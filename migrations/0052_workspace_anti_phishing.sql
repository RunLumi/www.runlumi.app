-- Personal anti-phishing codes and admin-granted passkey recovery windows
-- (redesign workstream 4, decision R-08). Additive only.

-- One code per person, set by that person. Printed at the top of every email
-- this app sends them. Not an authentication secret.
CREATE TABLE workspace_anti_phishing (
  user_id TEXT PRIMARY KEY,
  code TEXT NOT NULL CHECK (length(code) BETWEEN 4 AND 20),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- When someone has lost every passkey, an admin (never the person) opens a
-- 24-hour window in which that person may add a new passkey without
-- verifying an old one. Used once; the grant and its use are audited.
CREATE TABLE workspace_passkey_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX workspace_passkey_resets_user ON workspace_passkey_resets(user_id, expires_at DESC);

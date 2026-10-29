-- Workspace security (redesign workstream 4). Additive only.
--
-- workspace_audit becomes the single, append-only security log that admins
-- review: access changes, passkey checks and step-up, exports, token and
-- notification changes and agent (MCP) calls. Existing rows keep their
-- values; the new columns default to what those rows were (web access
-- changes that succeeded).
ALTER TABLE workspace_audit ADD COLUMN module TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE workspace_audit ADD COLUMN outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'failed'));
ALTER TABLE workspace_audit ADD COLUMN via TEXT NOT NULL DEFAULT 'web' CHECK (via IN ('web', 'api', 'mcp', 'system'));
UPDATE workspace_audit SET module = 'hiring' WHERE action = 'candidates_purged';
CREATE INDEX workspace_audit_created ON workspace_audit(created_at DESC, id DESC);
CREATE INDEX workspace_audit_actor ON workspace_audit(actor_id, created_at DESC);

-- Nobody edits or deletes an audit event, including the owner.
CREATE TRIGGER workspace_audit_no_update BEFORE UPDATE ON workspace_audit
BEGIN SELECT RAISE(ABORT, 'workspace_audit is append-only'); END;
CREATE TRIGGER workspace_audit_no_delete BEFORE DELETE ON workspace_audit
BEGIN SELECT RAISE(ABORT, 'workspace_audit is append-only'); END;

-- Workspace roles: one allowlist of EmDash users for every private module
-- (Hiring, CRM) plus explicit role grants. EmDash remains the only identity
-- store; EmDash admins (role 50) are Workspace admins and need no grant.
-- See docs/workspace/README.md for the role → permission matrix.

CREATE TABLE workspace_members (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workspace_roles (
  user_id TEXT NOT NULL REFERENCES workspace_members(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('hr', 'sales_manager', 'sales_executive', 'finance', 'fulfillment')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);
CREATE INDEX workspace_roles_role ON workspace_roles(role);

-- Who granted, changed or revoked access, and when.
CREATE TABLE workspace_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX workspace_audit_target ON workspace_audit(target_user_id, created_at DESC);

-- Carry existing CRM access over unchanged: every CRM member becomes a
-- workspace member with the Sales Executive role; finance and fulfillment
-- capabilities become roles. crm_members/crm_capabilities stay for recovery
-- but are no longer read.
INSERT INTO workspace_members (user_id, enabled, granted_by, created_at, updated_at)
SELECT user_id, enabled, granted_by, updated_at, updated_at FROM crm_members;
INSERT INTO workspace_roles (user_id, role, granted_by, granted_at)
SELECT user_id, 'sales_executive', granted_by, updated_at FROM crm_members;
INSERT INTO workspace_roles (user_id, role, granted_by, granted_at)
SELECT user_id, capability, granted_by, granted_at FROM crm_capabilities;

-- Hiring history records who acted, not a generic "Admin".
ALTER TABLE application_notes ADD COLUMN author_id TEXT;
ALTER TABLE application_events ADD COLUMN actor_id TEXT;

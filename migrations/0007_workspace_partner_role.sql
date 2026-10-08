-- Adds the Partner (Cộng tác viên) role: freelance sellers who work their own
-- opportunities or refer businesses to the team. SQLite cannot alter a CHECK
-- constraint, so workspace_roles is rebuilt with every existing row kept.

CREATE TABLE workspace_roles_next (
  user_id TEXT NOT NULL REFERENCES workspace_members(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('hr', 'sales_manager', 'sales_executive', 'partner', 'finance', 'fulfillment')),
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);
INSERT INTO workspace_roles_next (user_id, role, granted_by, granted_at)
SELECT user_id, role, granted_by, granted_at FROM workspace_roles;
DROP TABLE workspace_roles;
ALTER TABLE workspace_roles_next RENAME TO workspace_roles;
CREATE INDEX workspace_roles_role ON workspace_roles(role);

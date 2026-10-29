-- AI agent (MCP) module access set by admins (redesign workstream 4,
-- decision R-10). One row per module; a missing row means the default
-- (CRM read and write as today, Workspace read). Hiring, HRM and Finance are
-- not agent modules: AGENTS.md keeps tokens away from hiring, the HRM spec
-- requires its own token and scope, and Finance is session-only. Additive.
CREATE TABLE workspace_agent_modules (
  module TEXT PRIMARY KEY CHECK (module IN ('crm', 'workspace')),
  level TEXT NOT NULL CHECK (level IN ('off', 'read', 'write')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

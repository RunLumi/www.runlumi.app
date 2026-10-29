# ADR-0003: Admin users table, member child screens and a read-only roles route

- **Status:** Accepted, 2026-10-29 (workstream 1)
- **Context:**
  - R-03 asks for full-width tables whose rows open child screens.
  - The old users page edited every member's roles inline in one long list.
  - Integration suites post grants to `/workspace/users`.

## Decision

- **Users table.** `/workspace/users` is a filterable, searchable table. It still accepts the `grant` and `update` POSTs it accepted before, so existing callers and tests keep working.
- **Child screens.**
  - `/workspace/users/<emdash-user-id>` shows one person and edits their roles.
  - `/workspace/users/new` grants access by EmDash email.
  - All three use one handler (`handleAccessPost`), which checks `users.manage`, same origin and `saveMember`.
- **Roles route.** `/workspace/roles` is a read-only permission matrix. The middleware guards it with `users.manage`, like `/workspace/users`. The page also checks the permission itself.
- **Unknown IDs.** An unknown user ID answers 404. A denied role answers 403 before any data is read.

## Consequences

- One server path changes access, and `workspace_audit` stays complete.
- The roles matrix is generated from `ROLE_PERMISSIONS`, so it cannot drift from the code.

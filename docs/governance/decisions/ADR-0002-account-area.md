# ADR-0002: Personal settings live at /workspace/account, outside the module tabs

- **Status:** Accepted, 2026-10-29 (workstream 1)
- **Context:** R-06 puts personal settings under "Tài khoản của tôi", never in Admin. Every member needs this area, whatever their roles.

## Decision

- **Location.** `accountModule` in `nav.ts`:
  - path `/workspace/account`, with a `/vi` peer;
  - permission `workspace.access`.
  - It is reached from the account menu. It is not in `modules`, so `visibleModules` and the module tabs are unchanged.
- **Data.** The profile page reads only the signed-in person:
  - their EmDash `users` row;
  - their EmDash `credentials` (passkeys);
  - their `workspace_members` row;
  - a count of their own active `crm_api_tokens`.
  - It never takes a user ID from the request.
- **Editing.** The page edits nothing. Name, email and passkeys stay in EmDash.
- **rd4 pages.** Workstream 4 adds its Security and Notifications pages as further `accountModule.links`.

## Consequences

- No new tables and no second identity store.
- If EmDash removes the `credentials` table, the page shows "not available" instead of a false zero.

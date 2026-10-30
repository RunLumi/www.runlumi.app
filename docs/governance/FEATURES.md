# Feature list per module

Status words are defined in [README.md](README.md#rules). Each row links to the evidence; this file does not repeat it.

Snapshot: 2026-10-29, written by workstream 1 of the redesign. Round 2 rows added 2026-10-30 (ui1).
- Rows marked *In redesign* are being rebuilt on the redesign branches. They are not released until the founder merges PR #116.

## Shell and Overview

| Feature | Status | Evidence |
|---|---|---|
| One shell for every private page; EN/VI peers | Live; new design *In redesign* (rd1) | `src/layouts/WorkspaceShell.astro`, `tests/integration/workspace.integration.test.mjs` |
| Module tabs, with a launcher below 1024 px | *In redesign* (rd1) | `src/lib/workspace/nav.ts`, `tests/workspace-roles.test.ts` |
| Grouped, labelled menus (R-05) for CRM, HRM, Finance and Admin | *In redesign* (rd1) | `tests/workspace-roles.test.ts` ("grouped menus") |
| Shared components: frozen-column table, breadcrumbs, equal-height panel rows | *In redesign* (rd1) | [docs/workspace/UI.md](../workspace/UI.md) |
| Overview figures per module, each linking to its list | Live; new design *In redesign* (rd1) | `src/lib/workspace/pages.ts` (`homePage`) |
| Workspace-wide search | *In redesign* (ui1) | Story UI1-S3. Searches only what the person may already list, through the module scope functions. Board: Search |
| Notification bell in the header and the notices page | *In redesign* (ui1) | Story UI1-S4. Lists the person's existing in-app notices (HRM service requests). Board: Notifications |

### Round 2: board parity (workstream ui1)

Brief: [UI-PARITY.md](../redesign/UI-PARITY.md). Each screen is done only with its parity folder in `docs/redesign/parity/<Board>/`.

| Screen or part | Board | Status | Story |
|---|---|---|---|
| Global header: logo, search, create, help, bell, avatar menu | TopNav | *In redesign* (ui1) | UI1-S1 |
| App nav bar with launcher, app label and page tabs | TopNav, AppLauncher | *In redesign* (ui1) | UI1-S1, UI1-S2 |
| Side navigation for Quản trị and modules with grouped menus | SetupNav | *In redesign* (ui1) | UI1-S1 |
| Shared kit: list-view header, button group, list toolbar, sheet, dialog, record frame (highlights, path, tabs, related list), form grid | Leads, LeadRecord, NewEvent (patterns) | *In redesign* (ui1) | UI1-S7 |
| Tổng quan (`/workspace`) on the kit | none (kit patterns) | *In redesign* (ui1) | UI1-S5 |
| Search results (`/workspace/search`) | Search | *In redesign* (ui1) | UI1-S3 |
| Notices (`/workspace/inbox`) and the bell | Notifications | *In redesign* (ui1) | UI1-S4 |
| Tài khoản của tôi › Hồ sơ | AccountProfile | *In redesign* (ui1) | UI1-S6 |
| Tài khoản của tôi › Thông báo (read-only: what reaches you and why) | SetupNotifications | *In redesign* (ui1) | UI1-S6 |
| `scripts/parity-shots.mjs` | all | *In redesign* (ui1) | UI1-S7 |

## Tài khoản của tôi (My account)

| Feature | Status | Evidence |
|---|---|---|
| Profile from EmDash identity, with roles, modules, passkeys and AI agent tokens | *In redesign* (rd1) | `src/components/workspace/WorkspaceAccount.astro`, integration test "my account" |
| Mandatory passkey, anti-phishing code, step-up | *In redesign* (rd4) | `claude/rd4-security` handoff |
| Personal notification settings | Read-only view *In redesign* (ui1); editable channels, quiet hours, digest and reminders Not planned (no back end; founder decision) | Story UI1-S6 |

## Quản trị (Admin)

| Feature | Status | Evidence |
|---|---|---|
| Grant, change and revoke Workspace roles for existing EmDash accounts; audited | Live | `src/lib/workspace/members.ts`, `tests/integration/workspace.integration.test.mjs` |
| Users table → member child screen; grant screen; read-only roles matrix | *In redesign* (rd1) | integration test "admin screens" |
| Audit log review with filters and step-up CSV export | *In redesign* (rd4) | `claude/rd4-security` handoff |
| Notification rules; Slack, Discord and Teams destinations | *In redesign* (rd4) | `claude/rd4-security` handoff |
| Org MCP module grants | *In redesign* (rd4) | `claude/rd4-security` handoff |

## Tuyển dụng (Hiring)

| Feature | Status | Evidence |
|---|---|---|
| Public careers pages, EN/VI, usable without JavaScript | Live | [docs/workspace/README.md §1](../workspace/README.md) |
| Roles, tests, candidates, notes, interviews, scorecards, export, private files | Live; new design *In redesign* (rd2) | `tests/integration/workspace.integration.test.mjs` |
| 60-day retention runs, confirmed by HR and audited | Live | same |
| Per-role hiring managers; calendar invitations | Planned (not scheduled) | [docs/workspace/README.md §1](../workspace/README.md) |

## CRM

| Feature | Status | Evidence |
|---|---|---|
| Opportunities, companies, contacts, playbooks, offers, quotes, ledger, commission, fulfillment, referrals | Live | [docs/crm/README.md](../crm/README.md), `tests/integration/crm.integration.test.mjs` |
| Personal-token API and MCP | Live | [docs/crm/API.md](../crm/API.md), `tests/integration/api.integration.test.mjs` |
| Lark team notifications | Live | AGENTS.md (Collaborator CRM contract) |
| Leads and Lead conversion, Kanban, calendar, record pages, reports (Salesforce model) | *In redesign* (rd3) | `claude/rd3-crm` handoff |

## HRM

| Feature | Status | Evidence |
|---|---|---|
| Employee records, self-service, legal/COI, onboarding/offboarding, time and leave, payroll, services, assets, benefits, performance, training, reports | Built (gated) | [docs/specs/hrm/STATUS.md](../specs/hrm/STATUS.md). The production gate is closed until `HRM_LIVE_ENABLED` and the reviewed settings agree. |
| New design for all `/hrm/*` | *In redesign* (rd2) | `claude/rd2-modules` handoff |

## Tài chính (Finance)

| Feature | Status | Evidence |
|---|---|---|
| Plans, actuals, close, statements, imports/exports, audit (System Super Admin only) | Built (gated) | [docs/specs/finance/STATUS.md](../specs/finance/STATUS.md). The owner must set up the book; `FINANCE_LIVE_ENABLED` is required. |
| New design for all `/finance/*` | *In redesign* (rd2) | `claude/rd2-modules` handoff |

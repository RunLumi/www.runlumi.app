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

### CRM list screens: board parity (round 2, workstream 2)

Brief: [UI-PARITY.md](../redesign/UI-PARITY.md). Stories: [USER-STORIES.md § CRM list screens](USER-STORIES.md#crm-list-screens-round-2-workstream-2). Proof: `docs/redesign/parity/<Board>/` and the `claude/ui2-crm-lists` handoff.

| Screen (board) | Route (EN and `/vi` peer) | Status |
|---|---|---|
| Lead list view (Leads) | `/crm/leads` | *In redesign* (ui2) |
| Lead Kanban (LeadsKanban) | `/crm/leads?view=board` | *In redesign* (ui2) |
| Opportunity Kanban (Main, KanbanDrag) | `/crm/pipeline?view=board` | *In redesign* (ui2) |
| Close dialog (CloseDialog, right-hand dialog only) | `/crm/[id]?close=won\|lost` | *In redesign* (drawn in ui3's OpportunityView; parity after ui3 merges) |
| Opportunity table (DealsTable) | `/crm/pipeline?view=table` | *In redesign* (ui2) |
| Calendar month and week (Calendar, CalendarWeek) | `/crm/calendar`, `?view=week` | *In redesign* (ui2) |
| New event sheet (NewEvent) | `/crm/calendar?new=1` | *In redesign* (ui2) |
| Tasks list and detail (Tasks) | `/crm/tasks` (new route over existing tasks) | *In redesign* (ui2) |
| Companies list view (Accounts) | `/crm/accounts` | *In redesign* (ui2) |
| Contacts list view (Contacts) | `/crm/contacts` | *In redesign* (ui2) |
| CRM Today (Home); sales dashboard moved to Reports | `/crm`, `/crm/reports` | *In redesign* (ui2) |
| Phone Kanban and calendar (MobileKanban, MobileCalendar) | the same routes at 390 px | *In redesign* (ui2) |
| Create Lead, opportunity, event and task in sheets | `?new=1` on Leads, Pipeline, Calendar, Tasks | *In redesign* (ui2) |
| Kanban settings dialog (left half of CloseDialog), bulk actions bar (DealsTable), Import, campaigns, setting a sales target (Home), recently viewed records (no view log; Home shows recently edited) | — | Not planned in this round: no feature exists behind them ("no other new features") |

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

## Round 2, workstream 4 (`claude/ui4-security`): passkey readiness, security and admin screens

Board parity per [UI-PARITY.md](../redesign/UI-PARITY.md). Stories: [USER-STORIES.md § Round 2 security and admin](USER-STORIES.md#round-2-security-and-admin-ui4). Evidence: `tests/integration/security.integration.test.mjs` (run with `WORKSPACE_PASSKEY_REQUIRED=true`), `docs/redesign/parity/<Board>/` and the ui4 handoff.

| Feature (screen) | Board | Status | Evidence |
|---|---|---|---|
| R-08 enforcement on in production (`WORKSPACE_PASSKEY_REQUIRED="true"`), with the rollout in docs/workspace/security.md | — | *In redesign* (ui4) | `infra/workspace.manifest.mjs`, `tests/iac.test.ts`, security IT "first visit" |
| Workspace sign-in page: email, passkey sign-in through EmDash, sign-in link for people without a passkey yet, "lost your passkey" link, anti-phishing note; the passkey sign-in also counts as the session's Workspace passkey check (no second prompt) | SignIn, MobileSignIn | *In redesign* (ui4) | security IT "sign-in" |
| First-passkey enrolment: three-step header (email verified, create passkey, anti-phishing code), create card, created card with rename and "Next: set your code" | PasskeyEnrol | *In redesign* (ui4) | security IT "first visit" |
| Anti-phishing code setup: step 3, code card, email preview with the code band | AntiPhishing | *In redesign* (ui4) | security IT "first visit" |
| Step-up dialog: title for the action, how long since the last check, the passkey to use, footer Cancel / Verify | StepUp | *In redesign* (ui4) | security IT "step-up" |
| Recovery: the person's page (what happens, in order, with their real state) and the admin's confirmation dialog (identity confirmed, reason) | Recovery | *In redesign* (ui4) | security IT "recovery" |
| My account › Security: passkeys table with rename and remove (remove needs step-up), anti-phishing code panel (masked, show, change in a sheet), this session, own AI agent tokens; mobile grouped list | SetupSecurity, MobileSecurity | *In redesign* (ui4) | security IT "account security" |
| Admin › Security: policy rows (fixed values, enforcement state), members without a second passkey, single-admin warning, recovery windows | OrgSecurity | *In redesign* (ui4) | security IT "admin screens" |
| Admin › AI agents: module levels as segmented controls, never-available modules, connected agents table with frozen Member/Agent columns and revoke | OrgAgents | *In redesign* (ui4) | security IT "AI agents" |
| Connect an AI agent (consent page for creating a personal MCP token) | AgentConsent | *In redesign* (ui4) | security IT "AI agents" |
| Notification rules list (quick filters, failure banner, frozen name column) and rule editor (numbered sections, preview column) | NotificationRules, NotificationRuleEdit | *In redesign* (ui4) | security IT "notification rules" |
| Webhooks list (quick filters, failure banner, table) and webhook record (config, events, delivery log) | Webhooks, WebhookDetail | *In redesign* (ui4) | security IT "notification rules" |
| Audit log (quick filters, filter row, table with frozen Time/Who, CSV behind step-up) and audit event record | AuditLog, AuditEvent | *In redesign* (ui4) | security IT "audit review" |
| Members (list-view header, quick filters, frozen name column) and member record (highlights, passkey warning, info, roles, passkeys, agents, activity) | MembersTeams, MemberDetail | *In redesign* (ui4) | workspace IT "admin screens" |
| Roles and permissions matrix (read-only, grouped, Có / Của mình / Không) | Roles | *In redesign* (ui4) | workspace IT "admin screens" |
| Board items with no back end: sign-in sessions list and "sign out other sessions", departments, groups, invitations, two-admin recovery, reminders, "send test", webhook signing keys, agent write confirmation and OAuth connection | — | Not planned in this redesign | ui4 handoff § Differences |

## Round 2, workstream 3 (`claude/ui3-crm-records`): records, CRM setup, Tuyển dụng, HRM, Tài chính

Board parity per [UI-PARITY.md](../redesign/UI-PARITY.md). Stories: [USER-STORIES.md § Round 2 records and setup](USER-STORIES.md#round-2-records-and-setup-ui3). Evidence: `docs/redesign/parity/<Board>/` and the ui3 handoff.

| Feature (screen) | Board | Status | Evidence |
|---|---|---|---|
| Lead record: highlights header, button group, status path with guidance, Activity/Details tabs, related column; edit, assign and disqualify in sheets | LeadRecord | *In redesign* (ui3) | IT 11b; `docs/redesign/parity/LeadRecord/` |
| Lead conversion dialog: Company / Contact / Opportunity sections, each "create new" or "use existing", owner and duplicate hints | LeadConvert | *In redesign* (ui3) | IT 11b; `docs/redesign/parity/LeadConvert/` |
| Converted summary: three result cards and "Back to Leads / Open opportunity" | LeadConverted | *In redesign* (ui3) | IT 11b; `docs/redesign/parity/LeadConverted/` |
| Opportunity record: highlights, playbook path with key fields and guidance, Related/Details tabs, related lists (contacts, quotes, tasks, money, delivery), Activity column; edits in sheets | DealRecord | *In redesign* (ui3) | IT 2–9, 15; `docs/redesign/parity/DealRecord/` |
| Company record: highlights, Related/Details tabs, related lists (contacts, opportunities), Activity column | AccountRecord | *In redesign* (ui3) | IT 6–8, 17; `docs/redesign/parity/AccountRecord/` |
| Contact record on the same record frame (no board; follows AccountRecord) | AccountRecord (pattern) | *In redesign* (ui3) | IT 17 |
| CRM setup: grouped setup menu and one page frame for playbooks, lead statuses, offers, commission, fulfillment, assignment, referrals, reports | Settings | *In redesign* (ui3) | IT 11b, 13, 14; `docs/redesign/parity/Settings/` |
| Tuyển dụng, HRM, Tài chính on the round-2 shell and kit (list-view header, record frame, sheets); no boards | — | *In redesign* (ui3) | `workspace`, `hrm-p1/p3/p4/p5`, `finance` integration scopes; `docs/redesign/parity/{Hiring,HRM,Finance}/` |

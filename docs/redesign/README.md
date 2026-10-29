# Lumi Workspace redesign: scope, decisions and workstreams

> These are the founder's decisions from 2026-10-29. Four cloud agents build them in parallel, and all of their work lands in one draft PR into `main`.
> - Read [AGENTS.md](../../AGENTS.md) first. It wins on any conflict.
> - Then read [docs/workspace/README.md](../workspace/README.md), [docs/crm/README.md](../crm/README.md) and [DESIGN.md](../../DESIGN.md).

## Release rule (read first)

- **A merge to `main` is a production release.** Cloudflare Workers Builds deploys `main`.
- All work goes into the draft PR whose head is `claude/loving-pasteur-z7ly65`.
- Only the founder merges that PR.
- Migrations are additive only.
- Nobody deploys, runs remote D1 migrations, or touches production data or secrets.

## Scope

The founder asked for four things:
1. Redo the interface of the existing Workspace (Tổng quan, Tuyển dụng, CRM, HRM, Tài chính, Quản trị).
2. Integrate a new CRM built on the Salesforce interaction model into the existing CRM.
3. Reorganize governance.
4. Add the security and integration features below.

No other new features.

| # | Workstream | Branch | Builds |
|---|---|---|---|
| 1 | Shell, Tổng quan, Quản trị, governance | `claude/rd1-shell` | <ul><li>Redesign `WorkspaceShell` and `src/lib/workspace/nav.ts`: module tabs, grouped and labelled menus, a new header.</li><li>Shared components for the UI rules below: full-width table with frozen leading columns, child screen with breadcrumbs, equal-height panel row.</li><li>Redesign `/workspace` and `/workspace/users`.</li><li>Add a "Tài khoản của tôi" page built from EmDash identity.</li><li>Vietnamese wording pass, keeping EN/VI peers.</li><li>Port the governance in [Governance](#governance) into `docs/`.</li></ul> |
| 2 | Tuyển dụng, HRM, Tài chính: same behaviour, new design | `claude/rd2-modules` | <ul><li>`/admin/jobs` (roles and candidates), all `/hrm/*` including `/hrm/me/*`, all `/finance/*`.</li><li>Interface only: no change to permissions, data, workflows or the HRM/Finance gates.</li></ul> |
| 3 | New CRM on the Salesforce model, integrated into the existing CRM | `claude/rd3-crm` | <ul><li>Lead object and Lead conversion, joined to referrals (`crm.refer`) and the signed local.runlumi.app intake.</li><li>Opportunity Kanban with won/lost drop zones and a keyboard alternative, plus a table with frozen columns.</li><li>A path built from the existing versioned playbook stages.</li><li>Calendar (month and week) for tasks and activity.</li><li>Record pages for opportunity, company and contact with breadcrumbs; Today; Reports.</li><li>Redesigned commission, fulfillment, playbooks, offers and assignment.</li><li>Every rule in the CRM contract of AGENTS.md is kept: ownership, append-only ledger, versioned playbooks, Lark rules, API/MCP limits.</li></ul> |
| 4 | Security and integrations | `claude/rd4-security` | <ul><li>Passkey required for Workspace access through EmDash, which already supports passkeys.</li><li>A personal anti-phishing code shown in every email this app sends.</li><li>Step-up re-verification before sensitive actions (exports, deletes, access changes, token creation).</li><li>Audit log review for admins over `workspace_audit` and the Finance audit history, with filters, a child screen and a CSV export behind step-up.</li><li>Notification rules with internal recipients (role, person, record owner), and new Slack/Discord/Microsoft Teams destinations next to Lark.</li><li>Extend the personal-token MCP from CRM to other modules, with admin-granted module access. Hiring candidate data, payments, ledger, commission and HRM personal data stay excluded, as the contract requires.</li><li>IaC manifest that generates `wrangler.jsonc`, with a staging environment.</li></ul> |

## Decisions

| ID | Status | Decision |
|---|---|---|
| R-01 | Decided | Business labels (stages, statuses, sources, reasons) are org data, never code. CRM stages come from versioned playbooks. |
| R-02 | Decided | Full Vietnamese. English only for terms without a clear Vietnamese meaning (Lead, Pipeline, Kanban, Passkey, MCP, Webhook, AI agent, CSV, API, Zalo OA). Use the app's existing terms ("Công ty", "Cơ hội", "Liên hệ"). |
| R-03 | Decided | Tables fill the content area. A row opens a child screen with breadcrumbs. With horizontal scroll, the leading important columns are frozen. |
| R-04 | Decided | Panels on the same row have equal height. |
| R-05 | Decided | Menus are grouped and labelled. A group label never looks like a menu item. |
| R-06 | Decided | Personal settings live under "Tài khoản của tôi", not in admin settings. |
| R-07 | Decided | Wording has no hype or filler. It states what the feature does. |
| R-08 | Decided | Passkey and anti-phishing code are mandatory for every user, with no opt-out. |
| R-09 | Decided | Recipients of email and webhook notifications are configurable by department, role, user or record relationship. All recipients are internal. |
| R-10 | Decided | Each employee connects their own AI agent through MCP. Admins grant modules. Calls are audited. |
| R-11 | Decided | Admins have an audit log review area. |
| R-12 | Assumed | IaC keeps today's production names (`runlumi`, `lumi-jobs`, `lumi-content`, `lumi-job-files`). The new staging environment uses `lumi-workspace-*-staging` in APAC. Renaming production resources and splitting D1 per module is a separate migration the founder runs. |
| R-13 | Assumed | The app stays on `runlumi.app`. A move to `workspace.runlumi.app` needs a founder decision. |
| R-14 | Decided | Native apps, billing, data migration and deploys are out of scope. |

## Design source

- Approved boards: [boards/](boards/), one `*.dc.html` per screen, plus `lumi.css`. The live canvas is https://claude.ai/artifact/AtYLCW7KqTmgHNeou3azks.
  - CRM: Leads, LeadsKanban, LeadRecord, LeadConvert, LeadConverted, Main, KanbanDrag, CloseDialog, DealsTable, DealsTimeline, Forecast, Calendar, CalendarWeek, NewEvent, Tasks, DealRecord, Accounts, AccountRecord, Contacts, Home, Settings, Import, Approvals, ApprovalDetail, MobileKanban, MobileCalendar.
  - Security and admin: SignIn, PasskeyEnrol, AntiPhishing, StepUp, Recovery, MobileSignIn, OrgSecurity, OrgAgents, AgentConsent, NotificationRules, NotificationRuleEdit, Webhooks, WebhookDetail, AuditLog, AuditEvent, MembersTeams, MemberDetail, Roles, MobileSecurity.
  - Shell and account: TopNav, AppLauncher, Search, Notifications, AccountProfile, SetupSecurity, SetupNotifications, SetupNav.
- The boards were drawn before the target app was identified.
  - Read them for layout, interaction and the UI rules above.
  - Take module names, navigation, roles and terminology from this app (`nav.ts`, `roles.ts`, the CRM docs), not from the boards. For example, the boards' "Đối tác" is this app's "Công ty". Sample data on boards is illustrative.
  - Where a board conflicts with AGENTS.md or DESIGN.md, the repository contract wins. Record the gap in your handoff.
- Never copy board HTML or `lumi.css` into the app. Rebuild with the app's own Astro components and design tokens.
- Tuyển dụng, HRM and Tài chính have no boards. Apply the UI rules and the shell to their existing pages.

## Governance

Workstream 1 ports the foundation into `docs/` and keeps it current as the work lands:
- a feature list per module, with status;
- non-functional requirements with targets and proof;
- user stories per Workspace role, with acceptance criteria and the forbidden case;
- agent memory: the decisions above, open questions and lessons;
- decision records for structural choices.

The repository's existing contracts stay authoritative: AGENTS.md, `docs/workspace`, `docs/crm`, and `docs/specs/{hrm,finance}`.

## Rules for every workstream

1. Read AGENTS.md, this file, and the docs your area points to before editing.
2. **Gates.** Run `npm run lint`, `npm test`, `npm run db:migrate:local`, `npm run test:integration` (scoped where a scope exists) and `npm run build`. Report any gate you did not run as open.
   - Review at 320–430 px and 1280 px, in both locales, with keyboard focus.
   - Every private page keeps its `/vi` peer and renders inside `WorkspaceShell`.
3. **Permissions, never role names, on every server route and query.** Add allowed and denied tests for each new route.
4. **Shared files change only in small, separate commits:** `src/lib/workspace/nav.ts`, `src/lib/workspace/roles.ts`, `src/middleware.ts`, `src/worker.ts`, `wrangler.jsonc`, `package.json`/`package-lock.json`, `migrations/`, `docs/redesign/`.
   - Number new migrations after the highest number on the integration branch at merge time.
5. **Dependencies:**
   - Workstream 1 pushes the shared components early.
   - Workstream 4 pushes step-up early.
   - The others merge those branches when they are ready. Until then they mark "step-up pending (rd4)" in their handoff. Never fake it.
6. **Unified PR.** After each finished slice with green gates:
   1. Push your branch.
   2. Merge `origin/claude/loving-pasteur-z7ly65` into it, rerun the gates and push.
   3. Check out `claude/loving-pasteur-z7ly65`, run `git merge --no-ff <your branch>` and push. If rejected, fetch and retry.
   - Never force-push, rebase, push to `main`, open another PR or deploy.
7. **Handoff.** When finished or blocked, write `docs/redesign/handoff/<your-branch-name>.md`. Include:
   - what was built;
   - the gates run, with an output summary;
   - what is open;
   - the decisions needed from the founder.

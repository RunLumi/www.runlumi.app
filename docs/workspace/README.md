# Lumi Workspace: roles, navigation and modules

Lumi Workspace is the private side of runlumi.app. It has Hiring and CRM, with an HRM module whose production gate remains off until the owner-approved configuration and deployment switch are ready:
- **Hiring:** an applicant tracking system (ATS) at `/admin/jobs`.
- **CRM:** at `/crm`.

Both share one identity (EmDash), one role model and one navigation shell. Every route has a Vietnamese peer under `/vi`.

**HRM / Quản trị nhân sự:** [HRM specification](../specs/hrm/README.md) is the product contract. The server-rendered bilingual employee/profile module is in implementation; it remains unavailable in production until `HRM_LIVE_ENABLED` and the owner-reviewed policy configuration are both enabled. HRM role grants are separate from Hiring and CRM. The P1 implementation checkpoint is [STATUS.md](../specs/hrm/STATUS.md).

**HRM:** [Đặc tả HRM](../specs/hrm/README.md) là hợp đồng sản phẩm. Phân hệ hồ sơ song ngữ phía máy chủ đang được triển khai; production vẫn đóng cho đến khi `HRM_LIVE_ENABLED` và cấu hình chính sách do owner rà soát cùng được bật. Quyền HRM cấp riêng với Hiring và CRM. Tiến độ P1 ở [STATUS.md](../specs/hrm/STATUS.md).

**HRM job descriptions:** the internal [role catalogue](../specs/hrm/JOB-DESCRIPTIONS.md) includes a draft COO – Head of Sales & Operations description at `/hrm/job-descriptions`. It requires `hrm.records.manage`; while HRM is closed, only configuration-capable users may read it. A business title creates no Workspace permissions or public vacancy.

**Mô tả công việc trong HRM:** [danh mục nội bộ](../specs/hrm/JOB-DESCRIPTIONS.vi.md) có bản nháp COO – Head of Sales & Operations tại `/vi/hrm/job-descriptions`. Cần quyền `hrm.records.manage`; khi HRM đóng, chỉ người có quyền cấu hình được đọc. Chức danh không tự cấp quyền Workspace hoặc mở tin tuyển dụng.

**Finance:** the [Finance specification](../specs/finance/README.md) accompanies the implemented System-Super-Admin-only module for monthly financial plans, actuals and management reports in D1. Its 11 pages have EN/VI peers. The existing CRM Finance role does not grant access. Financial pages become available after the deployment switch and protected book setup are enabled; follow the verified release state in [Finance status](../specs/finance/STATUS.md).

**Finance:** [Đặc tả Finance](../specs/finance/README.vi.md) đi cùng module đã triển khai, chỉ System Super Admin được truy cập, gồm kế hoạch, số thực tế và báo cáo quản trị theo tháng lưu vào D1. Module có 11 trang với bản EN/VI tương ứng. Role Finance hiện có trong CRM không được vào module này. Các trang số liệu mở sau khi bật cờ triển khai và hoàn tất thiết lập sổ được bảo vệ; theo dõi bằng chứng phát hành tại [Trạng thái Finance](../specs/finance/STATUS.md).

## 1. Research findings (2026-10-08)

| Area | Before | Now |
|---|---|---|
| Access | Hiring required the EmDash admin role. The CRM had its own allowlist (`crm_members`) plus two capabilities. There was no HR role, and a sales manager had to be a full admin. | One allowlist (`workspace_members`) plus combinable roles (`workspace_roles`). One permission map: `src/lib/workspace/roles.ts`. |
| Navigation | Two unrelated headers. The hiring header linked to an English-only CRM members page. The CRM header mixed sales pages with admin and hiring links. | One `WorkspaceShell`. Row 1 switches modules (Overview · Hiring · CRM · Admin). Row 2 lists the pages of the current module. Only entries the person may open are shown. |
| Hiring language | English only | Every hiring desk page has an EN and a VI peer. Forms return to the language they came from. |
| Hiring audit | Notes and history were stored as "Admin" | The real EmDash user's name and ID are stored (`author_id`, `actor_id`). |
| Destructive actions | A JavaScript `confirm()` (deletes went through without confirmation when JavaScript was off) | A required checkbox, enforced on the server. |
| Hiring filters | `onchange` JavaScript | A plain *Apply* button. Stage counts sit above the queue. |
| Hiring API checks | Middleware only | Middleware, plus a per-endpoint permission check (manage, delete, export). |
| Access changes | No record | `workspace_audit` records who granted, changed or revoked access. |

| Interviews | None | Each application has scheduled interviews, by stage, in Vietnam time, with a status (scheduled, done, cancelled, no-show). The desk sends no invitations. |
| Evaluation | Free-text notes only | Scorecards, one per person per interview: four criteria on a 1–4 scale (no neutral middle), a recommendation and required evidence. Colleagues' scorecards stay hidden until you submit your own, so reviews stay independent. |
| Retention | Delete one application at a time | **Policy (owner, 2026-10-08): 60 days.** Rejected or withdrawn applications are kept for 60 days after their last update, then deleted with their files, interviews and scorecards. The Overview shows HR how many are due. HR confirms each run (at most 200 per run) and every run is audited. A cutoff inside the 60 days is refused. Candidates see the policy in the consent text. |
| Public careers pages | English only | `/jobs` and `/vi/jobs` are peers; the application form returns to the candidate's language. Role content is published in the language HR writes it in. |

Remaining gaps, not built:
- Per-role hiring managers who see only the roles they own.
- Calendar invitations.
- Automatic deletion: HR runs it. A scheduled job can be added later around `RETENTION_DAYS` in `src/lib/hiring/interviews.ts`.

## 2. Roles

**System Super Admin is the EmDash admin (role 50).** It holds every permission and is never stored in Workspace tables. HRM Admin is a separate grant for HRM configuration and operations; it cannot manage Workspace accounts or enter ATS/CRM unless separately granted another role. Payroll Officer can read and prepare payroll runs and handle payroll inquiries, but cannot approve, publish, confirm payment, read identity/bank/tax records, or see another employee's payslip. HRM Admin and System Super Admin may review, approve and publish; the preparer cannot approve their own run. All grantable roles are assigned to existing EmDash accounts on **Admin → Users** (`/workspace/users`, each person on `/workspace/users/<id>`; the permission matrix is on `/workspace/roles`) and can be combined. Nobody can edit their own access; the System Super Admin controls grants, while HRM Admin controls the HRM business module.

| Permission | System Super Admin | HR (ATS) | Employee | People Manager | HRM Officer | HRM Admin | Payroll Officer | Sales Manager | Sales Executive | Partner | Finance | Fulfillment |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :--: | :-: | :-: | :-: | :-: | :-: |
| `workspace.access` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `users.manage` | ✓ |  |  |  |  |  |  |  |  |  |  |  |
| `hiring.access` | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |
| `hiring.jobs.manage` | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |
| `hiring.applications.manage` | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |
| `hiring.applications.delete` | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |
| `hiring.export` | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |
| `crm.access` | ✓ |  |  |  |  |  |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| `crm.refer` | ✓ |  |  |  |  |  |  | ✓ | ✓ | ✓ |  |  |
| `crm.payments.report` | ✓ |  |  |  |  |  |  | ✓ | ✓ |  |  |  |
| `crm.team` | ✓ |  |  |  |  |  |  | ✓ |  |  |  |  |
| `crm.configure` | ✓ |  |  |  |  |  |  |  |  |  |  |  |
| `crm.finance` | ✓ |  |  |  |  |  |  |  |  |  | ✓ |  |
| `crm.fulfillment` | ✓ |  |  |  |  |  |  |  |  |  |  | ✓ |
| `hrm.access` | ✓ |  | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `hrm.profile.self` | ✓ |  | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| `hrm.team.read` | ✓ |  |  | ✓ |  | ✓ |  |  |  |  |  |  |
| `hrm.records.manage` | ✓ |  |  |  | ✓ | ✓ |  |  |  |  |  |  |
| `hrm.identity.read` | ✓ |  |  |  | ✓ | ✓ |  |  |  |  |  |  |
| `hrm.bank.read` | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| `hrm.tax.read` | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| `hrm.files.review` | ✓ |  |  |  | ✓ | ✓ |  |  |  |  |  |  |
| `hrm.audit.read` | ✓ |  |  |  | ✓ | ✓ |  |  |  |  |  |  |
| `hrm.configure` | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |

| hrm.payroll.read | ✓ |  |  |  |  | ✓ | ✓ |  |  |  |  |  |
| hrm.payroll.configure | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| hrm.payroll.prepare | ✓ |  |  |  |  | ✓ | ✓ |  |  |  |  |  |
| hrm.payroll.review | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| hrm.payroll.approve | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| hrm.payroll.publish | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| hrm.payroll.payment.confirm | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| hrm.payroll.self | ✓ |  | ✓ |  |  |  |  |  |  |  |  |  |
| hrm.payroll.dispute | ✓ |  | ✓ |  |  |  |  |  |  |  |  |  |
| hrm.payroll.dispute.manage | ✓ |  |  |  |  | ✓ | ✓ |  |  |  |  |  |
| hrm.compensation.read | ✓ |  |  |  |  | ✓ | ✓ |  |  |  |  |  |
| hrm.compensation.manage | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| hrm.compensation.review | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| hrm.services.self | ✓ |  | ✓ |  |  |  |  |  |  |  |  |  |
| hrm.services.manage | ✓ |  |  |  | ✓ | ✓ |  |  |  |  |  |  |
| hrm.notifications.read | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |  |  |  |
**Invariants**
- **ATS HR and CRM roles remain separate from HRM.** Granting HR (ATS), Finance, Sales Manager or Partner does not grant HRM. HRM Officers and HRM Admins do not automatically enter Hiring or CRM. The System Super Admin is EmDash role 50.
- **HRM profile and payroll scope are field-specific.** Employees see their own profile, issued payslips and service requests; People Managers see current direct reports’ work details; HRM Officer and HRM Admin capabilities determine private identity, banking, tax and HR request access. Payroll Officer can read/prepare only payroll records and inquiries. Sensitive HR requests never enter the manager queue; in-app notifications contain a generic event and internal link, not request text. Every query and private endpoint enforces scope. HRM Admin can approve within HRM, but cannot self-approve a request, file or payroll run. Production remains fail-closed until owner-reviewed configuration and deployment switch are ready.
- **Revoking access** — or disabling the EmDash account — takes effect on the next request. The person's records stay, and admins reassign them.
- **Self-service is blocked.** Nobody can change their own access.
- **Admins are not grantable.** EmDash admins cannot be granted Workspace roles; they already hold every permission.
- **Sales Managers cannot credit themselves.** They see only their own commission, never the simulation. They cannot set referral credit, and cannot assign an unattributed deal or enquiry to themselves, since that would make them the credited seller.
- **Only Admins lift do-not-contact.**
- **Partners (Cộng tác viên) are outside staff.** They work their own opportunities and refer businesses on *CRM → Referrals*. A referral starts unassigned, with the partner recorded as referrer; a Sales Manager assigns it on *Operations*. After that the partner sees only the stage and outcome, never notes, contacts or money. Partners cannot report payments: customers pay Lumi directly and staff record it. Their commission needs seller terms (full-cycle or referral) declared on *Commission*; the users page flags partners without them.

Migrations `0007_workspace_partner_role.sql`, `0014_hrm_records.sql`, `0024_hrm_payroll.sql` and `0025_hrm_employee_services.sql` rebuild `workspace_roles` where needed to add Partner, HRM and Payroll roles while preserving existing grants. `0014` adds versioned people/employment periods, private record metadata, approvals, checksummed file metadata, idempotency, and immutable history/audit. `0024` adds the prepare-only Payroll Officer capability, versioned policy/run snapshots, exact integer line inputs, immutable issued payslips, inquiry history and payment-confirmation references. `0025` adds private HR service requests and a retryable in-app notification outbox; it sends no CRM Lark or external messages. HRM files use the `hrm/` prefix in the private `FILES` bucket; the production feature gate is off unless `HRM_LIVE_ENABLED=true` and reviewed policy configuration is ready.

Migration `0005_workspace_roles.sql` carries existing access over unchanged:
- every `crm_members` row becomes a Workspace member with the **Sales Executive** role, keeping its enabled flag;
- each `crm_capabilities` row becomes the **Finance** or **Fulfillment** role.

The old tables are kept for recovery and are no longer read.

## 3. Navigation (information architecture)

```text
Overview            /workspace                 figures per module the person can open; each figure links to its list
Hiring              /admin/jobs                tabs: Roles · Candidates
CRM                 /crm                       grouped sidebar (Pages disclosure below 1024px):
  Selling                                      Today · Leads · Pipeline (list, board, table) · Calendar · New opportunity · Referrals (refer)
  Customers                                    Companies · Contacts
  Results                                      Reports · Commission · Business model (team)
  Operations                                   Fulfillment (fulfillment or team) · Assignment and cohorts (team)
  Setup                                        Playbooks · Lead statuses · Offers and prices (configure)
  Guides and tools                             Sales process · Files · Connect an AI agent
HRM                 /hrm                       grouped sidebar; every entry permission-gated:
  My HR (Của tôi)                              My overview · My profile · documents · COI · onboarding · attendance · leave · payslips · HR requests · assets · benefits · reviews · training · Notifications
  People operations                            People · Job descriptions · Onboarding plans · Offboarding · Schedules · Leave · Payroll · HR service desk · Assets · Benefits · Performance · Training
  Policies and compliance                      Policies and documents · COI review · Retention and legal holds · Report policies and holds
  Reports and settings                         Reports · Settings
Finance             /finance                   grouped sidebar: Review · Monthly work · Statements · Controls
Admin               /workspace/users           grouped sidebar: People and access → Users (table → /workspace/users/<id>, /workspace/users/new) · Roles and permissions (/workspace/roles)
My account          /workspace/account         from the account menu, not a module tab: Profile (workstream 4 adds Security and Notifications)
```

The whole map lives in `src/lib/workspace/nav.ts`; each entry declares the permission it needs, its group and its icon. In a module with groups every link must name one (a unit test enforces it). Icons are one owned set in `src/components/workspace/NavIcon.astro` (1.75px line glyphs, DESIGN.md §10); a new page gets its own distinct glyph. Groups with nothing the person may open are hidden. Shared screen components (frozen-column tables, breadcrumbs, equal-height panels, grouped menus) are described in [UI.md](UI.md). The middleware (`src/middleware.ts`) uses the same permission names:
- a person who reaches a URL they cannot use gets a bilingual 403 page with a link back to the Workspace;
- an API call gets a plain 403;
- anyone not signed in goes to the EmDash sign-in page.

## 4. Extending

- **Add a role.** In `src/lib/workspace/roles.ts`:
  - add it to `roles`, give it labels and a description, and list its permissions in `ROLE_PERMISSIONS`;
  - add a migration that recreates the `workspace_roles` CHECK constraint with the new value;
  - the users page and the role matrix pick it up automatically.
- **Add a permission.** Add it to `permissions` and to the roles that need it. Check it with `locals.workspace.can(...)` on the server: in page loaders, in API endpoints, and in the middleware `areas` list for whole route trees.
- **Add a module.** Choose a route root and add it to the middleware `areas` list with its permission. Add a `NavModule` with its pages in `nav.ts`, then render the pages inside `WorkspaceShell` with `module="<key>"`. Give every page a `/vi` peer. Add an Overview card in `src/lib/workspace/pages.ts`.
- **Split a role later.** For example, a hiring manager who sees only the roles they own: add a permission such as `hiring.own` and scope the queries by job owner, the same way the CRM scopes by opportunity owner.

## 5. Verification

The following ran against a local Worker with D1 and real EmDash sessions:

- `tests/workspace-roles.test.ts`: the permission map, the database constraint, and navigation visibility.
- `tests/integration/workspace.integration.test.mjs`:
  - grants and audit;
  - navigation per role;
  - 200/403 per role and module;
  - manager versus executive scope;
  - the bilingual hiring desk, with real actors and confirmed deletes;
  - revoke and restore;
  - partners: referral with consent, the manager's referral queue and assignment, status-only follow-up, no payment reporting.
- `tests/integration/crm.integration.test.mjs`: all CRM acceptance blocks, re-run on top of the new roles.

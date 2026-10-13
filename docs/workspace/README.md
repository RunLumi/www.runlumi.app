# Lumi Workspace: roles, navigation and modules

Lumi Workspace is the private side of runlumi.app. Today it has two modules:
- **Hiring:** an applicant tracking system (ATS) at `/admin/jobs`.
- **CRM:** at `/crm`.

Both share one identity (EmDash), one role model and one navigation shell. Every route has a Vietnamese peer under `/vi`.

**Planned module:** [HRM — employee records and self-service](../specs/hrm/README.md) specifies profiles, dependents, private identity files, contracts, NDA/COI acknowledgements and signatures, working time, leave and payslips. It is a proposal, not an implemented module; its permissions must be granted separately from Hiring and CRM.

**Phân hệ dự kiến:** [HRM — quản trị nhân sự và cổng nhân viên](../specs/hrm/README.md) đặc tả hồ sơ, người phụ thuộc, giấy tờ định danh riêng tư, hợp đồng, ký/xác nhận NDA và COI, công, phép và phiếu lương. Chưa triển khai; quyền HRM được cấp riêng với Hiring và CRM.

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

**EmDash admin (role 50) is the Workspace Admin.** It holds every permission and is never stored in the Workspace tables. The other roles are granted on **Admin → Users and roles** (`/workspace/users`) and can be combined.

| Permission | Admin | HR | Sales Manager | Sales Executive | Partner | Finance | Fulfillment |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `workspace.access` (Overview) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `users.manage` (users and roles) | ✓ | | | | | | |
| `hiring.access` (roles, candidates, private files) | ✓ | ✓ | | | | | |
| `hiring.jobs.manage` | ✓ | ✓ | | | | | |
| `hiring.applications.manage` (stage, notes) | ✓ | ✓ | | | | | |
| `hiring.applications.delete` | ✓ | ✓ | | | | | |
| `hiring.export` (CSV) | ✓ | ✓ | | | | | |
| `crm.access` (own opportunities) | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `crm.refer` (refer a business to the team, follow its status) | ✓ | | ✓ | ✓ | ✓ | | |
| `crm.payments.report` (report a payment received, pending confirmation) | ✓ | | ✓ | ✓ | | | |
| `crm.team` (every opportunity, assignment, inbound and referral queues, cohorts) | ✓ | | ✓ | | | | |
| `crm.configure` (playbooks, offers, commission policy, seller terms) | ✓ | | | | | | |
| `crm.finance` (confirm payments, refunds, voids, payouts) | ✓ | | | | | ✓ | |
| `crm.fulfillment` (delivery, owner approval, launch checks) | ✓ | | | | | | ✓ |

**Invariants**
- **CRM roles never open candidate records or files.** HR never opens the CRM.
- **Revoking access** — or disabling the EmDash account — takes effect on the next request. The person's records stay, and admins reassign them.
- **Self-service is blocked.** Nobody can change their own access.
- **Admins are not grantable.** EmDash admins cannot be granted Workspace roles; they already hold every permission.
- **Sales Managers cannot credit themselves.** They see only their own commission, never the simulation. They cannot set referral credit, and cannot assign an unattributed deal or enquiry to themselves, since that would make them the credited seller.
- **Only Admins lift do-not-contact.**
- **Partners (Cộng tác viên) are outside staff.** They work their own opportunities and refer businesses on *CRM → Referrals*. A referral starts unassigned, with the partner recorded as referrer; a Sales Manager assigns it on *Operations*. After that the partner sees only the stage and outcome, never notes, contacts or money. Partners cannot report payments: customers pay Lumi directly and staff record it. Their commission needs seller terms (full-cycle or referral) declared on *Commission*; the users page flags partners without them.

Migration `0007_workspace_partner_role.sql` rebuilds `workspace_roles` so its CHECK constraint accepts `partner`; existing rows are copied unchanged.

Migration `0005_workspace_roles.sql` carries existing access over unchanged:
- every `crm_members` row becomes a Workspace member with the **Sales Executive** role, keeping its enabled flag;
- each `crm_capabilities` row becomes the **Finance** or **Fulfillment** role.

The old tables are kept for recovery and are no longer read.

## 3. Navigation (information architecture)

```text
Overview            /workspace                 counts per module the person can open
Hiring              /admin/jobs                Roles · Candidates
CRM                 /crm                       grouped sidebar (Menu disclosure below 1024px):
  Selling                                      Today · Pipeline · New opportunity · Referrals (refer)
  Customers                                    Companies · Contacts
  Results                                      Reports · Commission
  Operations                                   Fulfillment (fulfillment or team) · Assignment and cohorts (team)
  Setup                                        Playbooks · Offers and prices (configure)
  Guides and tools                             Sales process · Connect an AI agent
Admin               /workspace/users           Users and roles
```

The whole map lives in `src/lib/workspace/nav.ts`; each entry declares the permission it needs, its group and its icon. Icons are one owned set in `src/components/workspace/NavIcon.astro` (1.75px line glyphs, DESIGN.md §10); a new page gets its own distinct glyph. Groups with nothing the person may open are hidden. The middleware (`src/middleware.ts`) uses the same permission names:
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

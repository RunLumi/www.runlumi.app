# Handoff: workstream 3 — CRM on the Salesforce model (`claude/rd3-crm`)

Date: 2026-10-29. Scope: row 3 of [../README.md](../README.md). Every CRM contract rule in AGENTS.md is kept. Contract details and evidence are in [docs/crm/README.md § Leads, board, table and calendar](../../crm/README.md#leads-board-table-and-calendar-workspace-redesign-workstream-3-2026-10-29).

## What was built

| Area | What exists now | Routes (EN and `/vi` peers, all inside `WorkspaceShell`) |
|---|---|---|
| Lead object | `crm_lead_records` (migration `0052`, additive). Lead statuses and disqualification reasons are versioned org data (`crm-lead-process@N` in `crm_policies`, R-01). A lead is read-only once converted (database trigger) and is never deleted. | `/crm/leads` (list with frozen columns, or Kanban by status), `/crm/leads/[id]`, `/crm/leads/[id]/converted`, `/crm/admin/leads` (statuses, `crm.configure`) |
| Joined to referrals and intake | Referrals (`crm.refer`, consent required) and signed `local.runlumi.app` enquiries now create **unassigned leads** instead of opportunities. Referrers follow the lead status, then the opportunity stage, on *Referrals*, and never see notes, contacts or money. `/api/intake/local` keeps the same HTTP contract (201/200/409/422). Earlier queued enquiries and referrals are still listed on *Assignment* until handled. | `/crm/referrals`, `/crm/admin` (lead queue first) |
| Lead conversion | The owner or the team converts an assigned lead into a new or existing company and contact. The choices are limited to records the person may edit, and duplicate hints come from phone, email and name. Conversion opens an opportunity at the first stage of the chosen playbook. Owner = seller = the lead's owner. The source and the referrer are carried over. Do-not-contact or refused consent stops the conversion. It is versioned and idempotent. | `/crm/leads/[id]?convert=1` |
| Opportunity Kanban | Columns are the open stages of one playbook, with totals of known values; unknown values are counted separately. Won/lost drop zones appear only while a card is dragged, and they open the close dialog. Every card has a keyboard and no-JS **Move to** control. A drop goes through the requirement-checked, versioned stage move, and a refused drop names what is missing. | `/crm/pipeline?playbook=…&view=board` |
| Table | Full width, with the row number and name frozen. Inline, versioned one-cell edits of value, win probability, next step and due date. A stale edit is refused (409) and nothing is overwritten. | `/crm/pipeline?view=table` |
| Path and close dialog | The record page shows the playbook stages as a path built from data, plus breadcrumbs. The close dialog offers only won/lost stages, and lost needs a reason. Won ≠ paid. | `/crm/[id]`, `/crm/[id]?close=won\|lost` |
| Calendar | Month and week, in Vietnam time, Monday first, with an agenda on phones. Shows tasks, the next steps of opportunities and leads, and, if switched on, recorded activity (the kind only, no note text). A new event creates a task with the record's checks, do-not-contact included. It sends nothing to customers. | `/crm/calendar` |
| Records | Companies and contacts are now full-width tables. New contact record page. Breadcrumbs on the opportunity, company, contact, lead and admin pages. | `/crm/accounts`, `/crm/accounts/[id]`, `/crm/contacts`, `/crm/contacts/[id]` |
| Today and Reports | Today lists the person's leads that are due or have no next step. The team sees the lead queue count. Reports gain *Leads by source*: the conversion share is computed over decided leads only. The Lark morning digest adds "Lead chờ phân công". | `/crm`, `/crm/reports` |
| Lark | Lead cards (inbound, referred, created, assigned, status, note excerpt, disqualified, converted). They carry company, status, source and owner only, and never phone, email or need. | — |

Navigation (`nav.ts`, in separate commits): *Bán hàng* gains **Lead** and **Lịch**, and *Cấu hình* gains **Trạng thái Lead** (`crm.configure`). Each has its own glyph. No permission or role was added or changed in `roles.ts`. Every new route checks CRM membership, the existing ownership scopes and, for settings, `crm.configure`.

## Gates

Run on this branch. Synthetic data only, local Worker and D1 only.

| Gate | Result |
|---|---|
| `npm run lint` | ok (check-src) |
| `npm test` | 417 pass, 0 fail. This includes new `tests/crm-leads.test.ts` and `tests/crm-calendar.test.ts`, which run against real SQLite with every migration applied (`tests/fixtures/d1-sqlite.ts`). |
| `npm run db:migrate:local` | applied 0001–0050 and `0052_crm_lead_records.sql` |
| `RUNLUMI_INTEGRATION_SCOPE=crm npm run test:integration` | 18 pass, 0 fail. New blocks: 11 (rewritten for leads), 11b, 15, 16 and 17, with allowed and denied cases for every new route. |
| Scoped regressions (before merging the integration branch) | workspace 10/10, directory 7/7, api 7/7, dashboard 5/5, files 6/6, sales-process 12/12, business-model 5/5 |
| Full `npm run test:integration` after merging `claude/loving-pasteur-z7ly65` (18bec37) | FULL_RESULT |
| `npm run build` | passed before the merge; after the merge: BUILD_RESULT |
| Visual review | Playwright against a local Worker with synthetic data. 17 pages (VI, plus EN for the board, Leads and Calendar) × 320, 430 and 1280 px: every page returns 200 with no page-level horizontal overflow, after one fix (hidden table labels widened phone pages on the table, assignment and lead-settings pages). With the keyboard, Tab reaches each card's "Move to" control on the board. Reduced motion: the board has no animation, and the drag script adds none. Measured contrast: not re-measured; only existing crm.css tokens are used. |

## Open

- **Phones: long filter form above the board.** On 320–430 px the pipeline filters push the board below the fold. It works, but a collapsible filter panel would help.

- **Step-up (rd4).** Not needed by this workstream's actions. Lead conversion, stage moves, inline edits and calendar events are none of exports, deletes, access changes or token creation. If the founder wants step-up on conversion, it becomes a follow-up once `claude/rd4-security` lands.
- **Shared components (rd1).** See "Merge with workstream 1" below.
- **API/MCP.** Leads are not exposed through `/api/crm/v1` or `/api/crm/mcp`. Adding them needs a decision (see below) and the API.md limits.
- **Sources are still code.** Source channels (`field_visit`, `referral`, …) and contact roles are still code lists, as before. R-01 says sources are org data. Moving them to versioned data is a separate change that touches the API, reports and commission.
- **Not built from the boards:** Forecast, DealsTimeline, Import, Approvals/ApprovalDetail, Settings (Kanban settings), and campaign actions ("Thêm vào chiến dịch"). These either need features the founder excluded ("no other new features") or need decisions. Bulk owner and stage changes from the table were not built.
- **Commission, fulfillment, playbooks, offers, assignment.** They have breadcrumbs, the lead queue table and a link to the Lead settings. Their forms and calculations are unchanged, and a deeper layout redesign of these pages is still open.
- **Migration number.** `claude/rd4-security` also adds a `0051_*`, so this branch uses `0052_crm_lead_records.sql`. Whoever merges later keeps numbering after the highest number on the integration branch.

## Decisions needed from the founder

1. **Referrals and website enquiries become leads.** Today they arrive as unassigned leads and become opportunities only on conversion. Pipeline counts, "new opportunities" in the digest and the cohort counts therefore start at conversion, not at receipt. Confirm, or ask for them to stay as opportunities.
2. **Lead statuses v1** are taken from the boards: *Đã tiếp nhận* (target 24 h), *Đã liên hệ được*, *Hẹn liên hệ lại*. Reasons: *Không phù hợp*, *Không phản hồi*, *Trùng lặp*, *Spam hoặc gửi nhầm*, *Từ chối được liên hệ*. Change them on *Cấu hình → Trạng thái Lead* if needed.
3. **Lost needs a reason** in the new close dialog. The older stage form on the record page still accepts a lost move without a reason, as before. Should a reason be enforced on every lost move, API included?
4. **Leads in the API/MCP:** yes or no.

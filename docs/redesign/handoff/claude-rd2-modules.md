# Handoff: workstream 2 — Tuyển dụng, HRM, Tài chính (`claude/rd2-modules`)

Status: **interface slice finished; open items below.** Interface only. No change to permissions, routes, forms, API calls, data, workflows, the `HRM_LIVE_ENABLED` / `FINANCE_LIVE_ENABLED` gates or candidate privacy. The public `/jobs` flow is untouched and still works without JavaScript.

## What was built

| Area | Change | UI rule |
|---|---|---|
| Hiring `/admin/jobs` | The Roles list is a full-width table (role, status, applications, to review, team, location, public path). The role column stays frozen and opens the role. The "New role" form sits below the table. | R-03, R-07 |
| Hiring `/admin/jobs/applications` | The Candidates list is a full-width table (candidate, stage, role, applied, email, reference). The candidate column stays frozen and opens the application. Stage counts, filters, export and retention are unchanged. | R-03, R-07 |
| Hiring role and application screens | Breadcrumbs (Tuyển dụng › Vị trí › role; Tuyển dụng › Ứng viên › name) in the shared `PageHeader`. Stage and status actions sit in the header actions. | R-03 |
| Every `/hrm/*` page, including `/hrm/me/*` | `HrmPage` renders the shared `PageHeader`. Its breadcrumbs come from the HRM nav map: the deepest menu entry containing the URL is the parent, so a person, case, declaration or document links back to its list. | R-03 |
| HRM navigation | Grouped sidebar. rd1 owns `nav.ts`; its groups are kept. This branch only changes the Vietnamese labels (see below). | R-05 |
| Every `/finance/*` page | Breadcrumbs (Tài chính › menu group › page). The eyebrow states only the access rule. The overview description says what the page shows. | R-03, R-07 |
| Existing HRM and Finance tables and panels | `src/styles/modules.css` freezes the leading column of every `.crm-table` / `.fn-table` while it scrolls sideways. Panels in one `.crm-grid` / `.fn-layout` row share a height; stacked columns keep their natural height. | R-03, R-04 |
| Vietnamese wording (R-02) | A reviewed glossary was applied to about 150 plain Vietnamese strings in HRM: payroll → bảng lương, onboarding → hội nhập, offboarding → nghỉ việc, legal hold → tạm giữ pháp lý, snapshot → bản chốt, COI → xung đột lợi ích, checklist → danh mục kiểm tra, policy → chính sách, owner → chủ sở hữu, file → tệp, metadata → siêu dữ liệu. Finance: Finance → Tài chính, P&L → lãi lỗ. Hiring: slug → đường dẫn (slug), bài test → bài kiểm tra, portfolio → hồ sơ năng lực. English copy, codes and error keys are unchanged. | R-02 |

Shared components come from workstream 1 (`components/workspace/ui`: `PageHeader`, `Breadcrumbs`, `DataTable`). `claude/rd1-shell` is merged into this branch. The temporary module components were removed.

## Gates (results are in the PR/merge commit message for the tested revision)

See "Gate results" at the end of this file.

## Open

- **Step-up.** `claude/rd4-security` (not yet in the integration branch) wires step-up itself into the hiring CSV export, the application, role and question deletes, the retention purge, the Finance report export and the HRM report, snapshot and self exports. This branch adds no step-up of its own and fakes none. The buttons stay plain links and forms, so rd4's 303 to the passkey page works unchanged. `git merge-tree` shows this branch merges into rd4 without conflicts.
- **Step-up pending (rd4) for HRM deletes.** rd4 notes that HRM deletes (file erasure, retention and disposition execution) are not wired. Wiring step-up there changes those workflows, so it is outside this interface-only workstream. Assign it to rd4 or a follow-up.
- **HRM body layouts stay as they were.** Many HRM screens still show records as `crm-list` rows inside sheets rather than full-width tables. Converting about 40 HRM components to `DataTable` is a larger change. It belongs in later slices, one module desk at a time, with each slice's browser QA.
- **Raw status codes.** Some HRM cells show stored codes such as `active`. Localizing them belongs with R-01 (labels as org data).
- **Glossary terms the founder should confirm** (see decisions).
- The boards include no Hiring, HRM or Finance screens. The rules and the shell were applied instead.

## Decisions needed from the founder

1. Confirm the Vietnamese terms: *bảng lương* (payroll), *hội nhập* (onboarding), *nghỉ việc* (offboarding), *tạm giữ pháp lý* (legal hold), *bản chốt* (report or payslip snapshot), *chủ sở hữu* (owner). Each is one find-and-replace if you prefer another term.
2. Whether COI should stay spelled out as *xung đột lợi ích* in Vietnamese menus, or use "COI" as an accepted abbreviation.

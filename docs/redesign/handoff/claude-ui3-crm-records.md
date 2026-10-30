# Handoff: workstream 3, round 2 (records, CRM setup, Tuyển dụng, HRM, Tài chính)

- **Branch:** `claude/ui3-crm-records` (from `claude/loving-pasteur-z7ly65` at `e4f9703`)
- **Brief:** [UI-PARITY.md](../UI-PARITY.md). Spec commit: `6d1c6a0` (FEATURES rows, USER-STORIES "Round 2 records and setup").
- **Date:** 2026-10-30

## Round 2

### Screens done, with their parity folder

Every folder in `docs/redesign/parity/` has `board-1440.png` (where a board exists) and `app-vi-1440.png`, `app-en-1440.png`, `app-vi-390.png` (with a prefix where one folder holds several pages). Local Worker, synthetic TEST data, signed in as the dev-bypass admin. No page scrolls sideways at 390 px.

| Screen | Board | Parity folder | Matches | Differs, and why |
|---|---|---|---|---|
| Lead record | LeadRecord | `LeadRecord/` | Highlights panel (icon, breadcrumbs, eyebrow, name, button group with overflow, five highlight fields); status path with "complete and move on" button; key fields and guidance under the path; Activity/Details tabs; related column with duplicate alert and source list | No call/Zalo/campaign buttons or files list: the Lead object has notes only, and the CRM never messages customers. Guidance is written from the lead process (target hours), not free text the org writes |
| Lead conversion | LeadConvert | `LeadConvert/` | Centred dialog; Company, Contact, Opportunity sections each with "Tạo mới · HOẶC · Chọn có sẵn"; duplicate badges; owner line; Hủy / Chuyển đổi footer | Opportunity has "create new" only (conversion always opens a new opportunity, unchanged behaviour). No "lead status after conversion" picker: converted is a fixed state |
| Converted summary | LeadConverted | `LeadConverted/` | Check mark, title, three result cards marked "existing record used" or "created", Về Leads / Xem trên Kanban / Mở cơ hội | Rendered as its own page, not over a dimmed board with a Kanban preview |
| Opportunity record | DealRecord | `DealRecord/` | Highlights with stage, payment and delivery badges; button group (Sửa, Tạo báo giá, Đổi người phụ trách, Đóng cơ hội, more); playbook path with a guarded next-stage button; key fields and guidance; Related/Details tabs with related lists (contacts, tasks, quotes and money, delivery, related opportunities, time and cost); Activity column | Quotes, ledger and delivery keep their existing compact disclosures inside their related lists (finance-only actions). Highlights show "next step · due" (the app has no expected close date) |
| Company record | AccountRecord | `AccountRecord/` | Highlights; Tạo liên hệ / Tạo cơ hội / Sửa / Đổi người quản lý; Related/Details tabs; contacts related list; full-width opportunity table with a frozen name column; side column | Side column lists upcoming next steps from the company's open opportunities: the account has no activity stream of its own. No files or quotes lists (not account-level data here). "Đối tác" is "Công ty" |
| Contact record | AccountRecord (pattern) | `AccountRecord/contact-*` | Same frame; company in breadcrumbs and highlights; opportunities table | No board |
| CRM setup | Settings | `Settings/` (playbooks), `Settings/lead-statuses-*` | Icon header with eyebrow "Cấu hình CRM", short title, playbook selector and buttons; info note; stage table (label, API key, system type, milestone, entry requirements, skippable); fields and checklist panels side by side; lead statuses and reasons as two equal panels | ui1's shell puts CRM setup pages under the app bar's "Thêm" menu, so there is no left setup nav on CRM setup pages. No drag reordering, probability or forecast group columns: those settings do not exist. Editing is versioned, so it opens a dialog that saves a new version instead of inline cell edits |
| Offers, commission, fulfillment, assignment, referrals, reports | Settings (pattern) | not shot separately | Same setup frame and panel style | Offer editor is a dialog; other pages keep their sections and disclosures |
| Tuyển dụng | — | `Hiring/` (list, record, form) | Object header with count line and button group; "Tạo vị trí mới" opens a sheet; the role record shows its content read-only and "Sửa" opens a sheet | Candidate list and record keep their bodies on the new header |
| HRM | — | `HRM/` (list, record, form) | One object header for every `/hrm/*` page (icon from the menu, eyebrow "HRM · group", breadcrumbs); panels in the board style | Page bodies unchanged: the forms are policy- and audit-heavy, so they were not moved into sheets in this round |
| Tài chính | — | `Finance/` (list, record, form) | Object header (eyebrow "Tài chính · group · Chỉ System Super Admin", info note, export actions); toolbar and panels below | Page bodies unchanged |

### Kit

Built on ui1's kit (`origin/claude/ui1-shell` `a54e7ce`, merged in `f8646ff`; migration `65e2f71`): `RecordHeader`, `ButtonGroup` (with the ▾ menu), `Path`, `RecordTabs`, `RelatedList`, `Sheet`/`Dialog` (forms through `action` and the `foot` slot), `ListHeader`, `DataTable`. My first record kit was removed. Kept in `src/components/workspace/record/`, because ui1's kit has no equivalent (reported to ui1 and the integrator for adoption):
- `PathPanel` — `ui/Path` inside a panel, with key fields and guidance in two columns below;
- `Feed` — activity rows (icon, title, time, meta);
- `SetupFrame` — the Settings-board header on the kit's classes plus the blue info note.

`src/styles/record.css` holds only those, the conversion sections, the result cards and the module panel style. Gaps met in `ui/RelatedList`: no actions slot (header link via `href`/`hrefLabel` instead), no full-width option (wrapped in `.rec-wide`), `empty` works only with `items`.

### Behaviour

Unchanged: every form keeps its intent, field names, version and request key; routes and permissions are untouched. Two read-only route additions: the converted summary reads `created_at` to say "created" vs "existing", plus value and owner name; the company route adds stage names for its table. `OppTasks` lost its inline "add task" form, which moved to `OppTaskForm` in a sheet.

### Gates (on `9dac053`, after merging `origin/claude/loving-pasteur-z7ly65`, already up to date)

| Gate | Result |
|---|---|
| `npm run lint` | pass (602 source files) |
| `npm test` | 453 pass, 0 fail |
| `npm run db:migrate:local` | pass (to 0056) |
| `npm run build` | 0 errors, 0 warnings; build complete |
| Integration `crm` | 18/18 |
| Integration `workspace` | 12/12 |
| Integration `finance` | 9/9 |
| Integration `hrm-p1`, `hrm-p3`, `hrm-p4`, `hrm-p5`, `security`, `api` | see below |

### Open

- Board folders were shot with `scripts/parity-shots.mjs --base … --persist …` on my local Worker. The contact, lead-statuses and Tuyển dụng/HRM/Tài chính shots (no boards, several pages per folder) were taken with an equivalent Playwright script at the same widths, because the script writes one page per board folder.
- Path labels on long playbooks (10 stages) are clipped at the chevron edges; that is ui1's `Path` styling.
- HRM and Finance page bodies keep their inline forms; only the frame changed.
- Keyboard and reduced-motion review: focus rings on new buttons/tabs/sheet close were added; a full focus walk was not recorded.
- Sheets opened with `:target` do not move focus into the sheet beyond the browser's own fragment focus.

### Founder decisions

None needed. Board items that would need new features (calls, Zalo, campaigns, forecast groups, lead files) were left out, as listed above.

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
| CRM setup | Settings | `Settings/` (playbooks), `Settings/lead-statuses-*` | Icon header with eyebrow "Cấu hình CRM", short title, playbook selector and buttons; info note; stage table (label, API key, system type, milestone, entry requirements, skippable); fields and checklist panels side by side; lead statuses and reasons as two equal panels | Setup pages (playbooks, offers, lead statuses, assignment, commission, fulfillment) sit in a setup area with a left navigation in the board's group style, listing only existing pages the person may open (third pass, `4342bcf`). The board's Data and Users groups (custom fields, list views, import, permission sets, approvals) have no pages here and are not shown. No drag reordering, probability or forecast group columns: those settings do not exist. Editing is versioned, so it opens a dialog that saves a new version instead of inline cell edits |
| Offers, commission, fulfillment, assignment, referrals, reports | Settings (pattern) | not shot separately | Same setup frame and panel style | Offer editor is a dialog; other pages keep their sections and disclosures |
| Tuyển dụng | — | `Hiring/` (list, record, form, candidates) | Object header with count line and button group; "Tạo vị trí mới" opens a sheet; the role record shows its content read-only and "Sửa" opens a sheet | Candidates: one list-view header with the role/stage filters in its toolbar, stage counts as chips and the frozen table inside. The candidate record keeps its panels at kit scale |
| HRM | — | `HRM/` (list = job descriptions, people, record = job description, form = new person) | Kit `RecordHeader` on every `/hrm/*` page (icon from the menu, eyebrow "HRM · group", breadcrumbs), with optional header actions, meta line and `ListToolbar`. Second pass (`c9be53f`): every panel, heading (16/15 px), button (36 px), field (40 px), notice, row and table at the kit scale; intro lines and action rows left below the header become an info note or toolbar panel; People is a frozen `DataTable` with toolbar search; job descriptions lost their 30 px titles, thick top border and free paragraphs | Other HRM lists keep their row layout (`crm-list`) at kit scale rather than becoming tables; long policy forms stay inline in panels (not sheets) |
| Tài chính | — | `Finance/` (list = overview, record = plans, form = settings) | Kit `RecordHeader` with the info note, scope line and report selection inside the header panel (as its meta line and toolbar); KPI tiles as an equal-height row; section panels and headings at the kit scale; footnote as an info note | Form bodies keep their fields inline in panels |

### Kit

Built on ui1's kit (`origin/claude/ui1-shell` `a54e7ce`, merged in `f8646ff`; migration `65e2f71`): `RecordHeader`, `ButtonGroup` (with the ▾ menu), `Path`, `RecordTabs`, `RelatedList`, `Sheet`/`Dialog` (forms through `action` and the `foot` slot), `ListHeader`, `DataTable`. My first record kit was removed. Kept in `src/components/workspace/record/`, because ui1's kit has no equivalent (reported to ui1 and the integrator for adoption):
- `PathPanel` — `ui/Path` inside a panel, with key fields and guidance in two columns below;
- `Feed` — activity rows (icon, title, time, meta);
- `SetupFrame` — the Settings-board header on the kit's classes plus the blue info note.

`src/styles/record.css` holds only those, the conversion sections, the result cards and the module panel style. Gaps met in `ui/RelatedList`: no actions slot (header link via `href`/`hrefLabel` instead), no full-width option (wrapped in `.rec-wide`), `empty` works only with `items`.

### Behaviour

Unchanged: every form keeps its intent, field names, version and request key; routes and permissions are untouched. Two read-only route additions: the converted summary reads `created_at` to say "created" vs "existing", plus value and owner name; the company route adds stage names for its table. `OppTasks` lost its inline "add task" form, which moved to `OppTaskForm` in a sheet.

### Third pass (`4342bcf`, after founder feedback via the integrator)

- CRM setup area with a left setup navigation (board groups), compact stage table with requirement and skip chips, fields folded into a disclosure.
- Activity rails on Lead, opportunity and company: typed actions (call, message, meeting, note, task, time) and a feed grouped by month in Vietnam time (`src/lib/crm/feed.ts`, `tests/crm-feed.test.ts`). Typed logs are notes with a prefilled prefix; no new data is stored.
- Company rail: activity of the company's opportunities that the person works on (owner, or the team), the same events their opportunity pages show. Read-only route addition in `routes/account.ts`.
- Fix: on the opportunity record, tasks and sales history show to editors only, as before round 2 (the first round-2 version showed them to read-only finance/fulfillment viewers).
- Gates on `fd892bd`: unit 460/460; build 0 errors; integration crm 19/19, workspace 15/15, directory 7/7, dashboard 5/5. HRM, finance, security and api were not rerun (no files they use changed).

### Gates (second pass)

On `11f2301` (`c9be53f` + `origin/claude/loving-pasteur-z7ly65`): unit 459/459; build 0 errors; integration workspace 15/15, finance 9/9, crm 19/19, hrm-p1, hrm-p3, hrm-p4 and hrm-p5 pass (each as its own scope).

### Gates

Final run on `8694388`: `claude/ui3-crm-records` after merging ui1's kit (`cd0d414`) and `origin/claude/loving-pasteur-z7ly65` (which already holds ui2). Run locally in the cloud container, one integration scope at a time.

| Gate | Result |
|---|---|
| `npm run lint` | pass (625 source files) |
| `npm test` | 459 pass, 0 fail. One earlier run on `a7af37e` had 1 failure that did not reproduce on rerun (the test name was not captured); reported as a possible flake |
| `npm run db:migrate:local` | pass (no migrations to apply; up to 0056) |
| `npm run build` | 0 errors, 0 warnings; build complete |
| Integration `crm` | 19/19 |
| Integration `workspace` | 15/15 |
| Integration `finance` | 9/9 |
| Integration `hrm-p1` | pass |
| Integration `security`, `api`, `hrm-p3`, `hrm-p4`, `hrm-p5` | pass on `a7af37e` (12/12, 7/7, pass, pass, pass); not rerun after the last two commits, which only swap my record components for ui1's copies of them and touch no HRM, security or API code |

### Open

- Board folders were shot with `scripts/parity-shots.mjs --base … --persist …` on my local Worker. The contact, lead-statuses and Tuyển dụng/HRM/Tài chính shots (no boards, several pages per folder) were taken with an equivalent Playwright script at the same widths, because the script writes one page per board folder.
- Path labels on long playbooks (10 stages) are clipped at the chevron edges; that is ui1's `Path` styling.
- HRM and Finance page bodies keep their inline forms; only the frame changed.
- Keyboard and reduced-motion review: focus rings on new buttons/tabs/sheet close were added; a full focus walk was not recorded.
- Sheets opened with `:target` do not move focus into the sheet beyond the browser's own fragment focus.

### Founder decisions

None needed. Board items that would need new features (calls, Zalo, campaigns, forecast groups, lead files) were left out, as listed above.

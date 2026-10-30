# Handoff: round 2, workstream 2 — CRM list screens (`claude/ui2-crm-lists`)

Date: 2026-10-30. Brief: [UI-PARITY.md](../UI-PARITY.md). Spec: [FEATURES.md](../../governance/FEATURES.md) § CRM list screens and [USER-STORIES.md](../../governance/USER-STORIES.md) § CRM list screens (committed first, `af5e5a9`).

## Round 2

### Screens done, with their parity folder

Every screen renders inside the round-2 shell and uses ui1's kit (`ListHeader`, `ButtonGroup`, `ListToolbar` with its filter pop-over, `Sheet`, `Dialog`, `ObjectIcon`, `NavIcon` glyphs), merged from `origin/claude/ui1-shell` @a54e7ce and @cd0d414. ui2 keeps no kit components of its own. No page title, lede, separate filter card or inline create form remains on these screens. Parity shots: `docs/redesign/parity/<Board>/` (board 1440, app vi/en 1440, app vi 390; all under 400 KB), signed in as the local dev-bypass System Super Admin on a local Worker with TEST data.

| Board | Route | Matches | Differs, and why |
|---|---|---|---|
| Leads | `/crm/leads` | List-view header (icon, "Lead", list name + selector: Lead đang mở / đã chuyển đổi / không tiếp tục / Tất cả), count line, button group (*Tạo*, *Đổi người phụ trách* for people who may assign — it opens the lead queue — and ▾ Trạng thái Lead for `crm.configure`), search-in-list, view switch, filter pop-over, refresh; dense table, # and Tên frozen; scroll hint | No row checkboxes, *Nhập* or *Thêm vào chiến dịch*: no import, campaign or bulk feature exists. Email column dropped (phone stays). |
| LeadsKanban | `/crm/leads?view=board` | Chevron headers "Status (n)", "N Lead" totals and target hint on one line, grey lanes, cards (name, ⌄ menu button top right, company, need, source, owner initials, age, warning rail and badge), drop bar (Chuyển đổi / Không tiếp tục) only while dragging | The ⌄ menu holds the no-JS "Chuyển sang" form (contract) plus Chuyển đổi, Không tiếp tục and Mở Lead. |
| Main | `/crm/pipeline?view=board` | Header "Đang mở · <playbook>" with the playbook selector; chevron headers "Stage (n)"; one-line totals (known value left, "Xác suất <weighted>" right); cards with the ⌄ menu button top right (move form, Đóng cơ hội…, Tạo lịch hẹn, Mở cơ hội), company, value, next-step due, owner initials, days in stage, probability or warning badge, warning rail | "Ngày chốt dự kiến" is the next-step due date: opportunities have no expected-close field. No hover warning pop-over (the warning shows on the card). The keyboard hint stays for screen readers and shows only while dragging, as drawn. |
| KanbanDrag | same | "Đang kéo" status line, dashed target lane with the dark chevron, faded source card, won/lost drop bar from the playbook's closing stages | The app shot sets the drag state in the page; a pointer drag cannot be held by the script. |
| CloseDialog | `/crm/[id]?close=won\|lost` | — | **Not in this branch.** ui3's new `OpportunityView` draws the close dialog with its `Sheet dialog`; I left `OppStage`/`OpportunityView` untouched to avoid a conflict. Take the CloseDialog shots after ui3 merges. The left "Cài đặt Kanban" dialog is not built (no Kanban settings feature). |
| DealsTable | `/crm/pipeline?view=table` | Header, *Tạo*, count line, toolbar, full-width table (# and Tên cơ hội frozen), one-cell versioned edits (save button appears on hover/focus; Enter saves), hint row | No selection bar or "Giá trị theo giai đoạn" chart (no bulk feature). |
| Calendar | `/crm/calendar` | Header (period arrows, Hôm nay, Tuần/Tháng, refresh, *Tạo lịch hẹn*), left rail (mini month, "Lịch của tôi" legend, recorded-activity toggle, note), month grid with coloured items and "+N mục khác" | No *Ngày* or *Danh sách* views, no "Lịch của người khác" (managers already see the team; per-person calendars are not a feature). Dragging items to another day is not built. |
| CalendarWeek | `?view=week` | Day headers with today's circle, all-day row, 07:00–20:00 time grid, now line | Items sit in their hour row (no duration: tasks have a start time only). |
| NewEvent | `/crm/calendar#new-event` | Centred dialog: tip, "Thông tin lịch hẹn", Chủ đề, Ngày, Giờ, Liên quan đến, Loại, Ghi chú, Hủy/Lưu | No end time, all-day box, owner, place or guests: an event is a CRM task (one due date and time); the CRM sends no invitations. "Lưu và tạo tiếp" not built. |
| Tasks | `/crm/tasks` (new) | Left list panel (header, *Tạo công việc*, count line, groups Quá hạn / Hôm nay / Sắp tới / Chưa có hạn, selected row tinted), right detail (badge, title, *Đánh dấu hoàn tất*, *Mở cơ hội*, two-column fields) and a complete form | Fields are the task's real fields (no priority or reminder). Completing needs an outcome, as on the record. |
| Accounts | `/crm/accounts` | Header ("Công ty", list selector for the team: tất cả / tôi quản lý / chưa có người quản lý), *Tạo* sheet, search, refresh, filter, full-width table with frozen # and name | "Công ty", not "Đối tác" (app term). No type or phone column (not stored); address shown instead. No *Nhập*. |
| Contacts | `/crm/contacts` | Same pattern; *Tạo* sheet with the contact form | No *Nhập*. |
| Home | `/crm` | No header card. Main column: "Kết quả kinh doanh quý · Qn/yyyy" (Thắng, Đang mở xác suất ≥ 70%, Chỉ tiêu [chưa đặt]) with the cumulative won line, Hôm nay marker and dashed won + strong-open line; Lịch hẹn hôm nay + Công việc hôm nay (checkbox rows with date chips) at equal height; "Cơ hội có giá trị lớn nhất của tôi". Right rail: Cảnh báo (icon, title, sub-line, one action each) and "Bạn sửa gần đây" | No *Đặt chỉ tiêu* (no targets feature). "Xem gần đây" becomes "Bạn sửa gần đây": the CRM keeps no view log, so it lists the person's latest edited records. The checkbox opens the task's complete form (an outcome is required). The sales dashboard moved to *Báo cáo*. On phones the chart scales down with its labels. |
| MobileKanban | board at 390 px | Stage strip with counts that scrolls sideways, one column at a time with the next one peeking, stage total above the cards | Header is the kit's list header, not the board's compact back/search/board icons. No bottom action sheet; the card's "Chuyển sang" menu does the move. |
| MobileCalendar | calendar at 390 px | Agenda by day, time column, colour bar, today marked | No week strip above the agenda. |

Create Lead, opportunity, event and task open in sheets (Leads `#new-lead`, Pipeline `?new=1#new-opp`, Calendar `#new-event`, Tasks `#new-task`; Companies and Contacts too). They open with no script (`:target` or server state) and re-open with the typed values on 422. `/crm/new` stays as a page (the + menu's "Cơ hội" link) with the same form.

### Behaviour

Unchanged except where a story says so:
- New route `/crm/tasks` (+ `/vi`): a read view over open tasks, scoped like the pipeline (`opportunityScope`); create and complete load the opportunity and call the same `createTask`/`updateTask` with `requireEdit`. Nav: *Công việc* tab under Bán hàng (`crm.access`, separate commit). Integration test 18 (outsider 403; another seller cannot see, create or complete — 404; the team sees all; outcome required).
- Pipeline accepts the `create` intent for its sheet: the same function as `/crm/new` (`createOpportunity`).
- Today adds `largest`: the person's own open opportunities with a known value (read-only, `owner_id = actor`).
- Ownership scopes, versioned moves (`data-card`, `data-move`, `select[data-move-to]`), the close-dialog rules, Lark rules and keyboard/no-JS "Move to" are kept; `src/scripts/crm-board.ts` is unchanged.

### Gates

Run on `claude/ui2-crm-lists` with ui1's kit merged (@cd0d414). Synthetic data, local Worker and D1 only.

| Gate | Result |
|---|---|
| `npm run lint` | ok (check-src, 624 files) |
| `npm test` | 459 pass, 0 fail |
| `npm run db:migrate:local` | ok (0001–0056 applied; "No migrations to apply" on rerun). This branch adds no migration. |
| `npm run build` | ok (`astro check` 0 errors, build complete) |
| `RUNLUMI_INTEGRATION_SCOPE=crm npm run test:integration` | 19 pass, 0 fail on head `57cd035` (adds test 18, Tasks); also 19/19 before the kit merge |
| `RUNLUMI_INTEGRATION_SCOPE=workspace npm run test:integration` | 15 pass, 0 fail on head `57cd035`. On ui1 @a54e7ce alone it failed 3 of 15 (search, bell, my notifications), reproduced on a clean worktree; ui1's @cd0d414 fixed them. |
| After the founder-review fixes (Home rebuild, dashboard to Reports, Kanban ⌄ menu, Leads reassign), merged with the integration branch @cf61511 | lint ok; `npm test` 461/0 (adds `tests/crm-home.test.ts`); build ok; integration crm 19/19, workspace 15/15, dashboard 5/5 (suite now reads `/crm/reports`) |
| Other scopes (hrm*, finance, security, directory, api, files, sales-process, business-model) | **Not run** on this branch: no file they cover changed except the shell's nav entry. Open. |
| Phone and overflow | The parity run measured no page-level horizontal overflow at 390 and 1440 px on every screen. 320 px not measured. |

### Open items

- **CloseDialog parity** depends on ui3's `OpportunityView` (see table).
- Leads list shows duplicates if the same person is entered twice (lead creation does not refuse duplicate phones); unchanged behaviour, visible in the TEST data.
- Measured contrast and a JavaScript-off browser pass of the new screens were not run (NFR-04, NFR-08 stay open).

### Founder decisions

- Confirm the board features left out above (imports, campaigns, bulk actions, Kanban settings, sales targets, per-person calendars, event end time and guests). Each would be a new feature.
- *Công việc* as its own CRM tab (Tasks board). It lists the same tasks the record pages and calendar already show.

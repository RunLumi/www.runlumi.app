# Handoff: round 2, workstream 2 — CRM list screens (`claude/ui2-crm-lists`)

Date: 2026-10-30. Brief: [UI-PARITY.md](../UI-PARITY.md). Spec: [FEATURES.md](../../governance/FEATURES.md) § CRM list screens and [USER-STORIES.md](../../governance/USER-STORIES.md) § CRM list screens (committed first, `af5e5a9`).

## Round 2

### Screens done, with their parity folder

Every screen renders inside the round-2 shell and uses ui1's kit (`ListHeader`, `ButtonGroup`, `ListToolbar`, `Sheet`, `Dialog`, `ObjectIcon`, merged from `origin/claude/ui1-shell` @a54e7ce). No page title, lede, separate filter card or inline create form remains on these screens. Parity shots: `docs/redesign/parity/<Board>/` (board 1440, app vi/en 1440, app vi 390; all under 400 KB), signed in as the local dev-bypass System Super Admin on a local Worker with TEST data.

| Board | Route | Matches | Differs, and why |
|---|---|---|---|
| Leads | `/crm/leads` | List-view header (icon, "Lead", list name + selector: Lead đang mở / đã chuyển đổi / không tiếp tục / Tất cả), count line, button group (*Tạo*, ▾ Trạng thái Lead for `crm.configure`), search-in-list, view switch, refresh, filter pop-over; dense table, # and Tên frozen; scroll hint | No row checkboxes, *Nhập*, *Thêm vào chiến dịch* or bulk *Đổi người phụ trách*: no import, campaign or bulk feature exists. Email column dropped (the table never showed it; phone stays). |
| LeadsKanban | `/crm/leads?view=board` | Chevron columns by Lead status with counts, "N Lead" totals and target hint, grey lanes, cards (name, company, need, source, owner initials, age, warning rail and badge), drop bar (Chuyển đổi / Không tiếp tục) only while dragging | Card ▾ menu is a `<details>` "Chuyển sang" with the no-JS move form (contract). |
| Main | `/crm/pipeline?view=board` | Header "Đang mở · <playbook>" with the playbook selector; chevron stage columns, total of known values and the probability-weighted total; cards (company, value, next-step due, owner initials, days in stage, probability or warning badge, warning rail) | "Ngày chốt dự kiến" is the next-step due date: opportunities have no expected-close field. No hover warning pop-over (the warning shows on the card). |
| KanbanDrag | same | "Đang kéo" status line, dashed target lane with the dark chevron, faded source card, won/lost drop bar from the playbook's closing stages | The app shot sets the drag state in the page; a pointer drag cannot be held by the script. |
| CloseDialog | `/crm/[id]?close=won\|lost` | — | **Not in this branch.** ui3's new `OpportunityView` draws the close dialog with its `Sheet dialog`; I left `OppStage`/`OpportunityView` untouched to avoid a conflict. Take the CloseDialog shots after ui3 merges. The left "Cài đặt Kanban" dialog is not built (no Kanban settings feature). |
| DealsTable | `/crm/pipeline?view=table` | Header, *Tạo*, count line, toolbar, full-width table (# and Tên cơ hội frozen), one-cell versioned edits (save button appears on hover/focus; Enter saves), hint row | No selection bar or "Giá trị theo giai đoạn" chart (no bulk feature). |
| Calendar | `/crm/calendar` | Header (period arrows, Hôm nay, Tuần/Tháng, refresh, *Tạo lịch hẹn*), left rail (mini month, "Lịch của tôi" legend, recorded-activity toggle, note), month grid with coloured items and "+N mục khác" | No *Ngày* or *Danh sách* views, no "Lịch của người khác" (managers already see the team; per-person calendars are not a feature). Dragging items to another day is not built. |
| CalendarWeek | `?view=week` | Day headers with today's circle, all-day row, 07:00–20:00 time grid, now line | Items sit in their hour row (no duration: tasks have a start time only). |
| NewEvent | `/crm/calendar#new-event` | Centred dialog: tip, "Thông tin lịch hẹn", Chủ đề, Ngày, Giờ, Liên quan đến, Loại, Ghi chú, Hủy/Lưu | No end time, all-day box, owner, place or guests: an event is a CRM task (one due date and time); the CRM sends no invitations. "Lưu và tạo tiếp" not built. |
| Tasks | `/crm/tasks` (new) | Left list panel (header, *Tạo công việc*, count line, groups Quá hạn / Hôm nay / Sắp tới / Chưa có hạn, selected row tinted), right detail (badge, title, *Đánh dấu hoàn tất*, *Mở cơ hội*, two-column fields) and a complete form | Fields are the task's real fields (no priority or reminder). Completing needs an outcome, as on the record. |
| Accounts | `/crm/accounts` | Header ("Công ty", list selector for the team: tất cả / tôi quản lý / chưa có người quản lý), *Tạo* sheet, search, refresh, filter, full-width table with frozen # and name | "Công ty", not "Đối tác" (app term). No type or phone column (not stored); address shown instead. No *Nhập*. |
| Contacts | `/crm/contacts` | Same pattern; *Tạo* sheet with the contact form | No *Nhập*. |
| Home | `/crm` | Compact header with create actions; Lịch hẹn hôm nay + Công việc hôm nay side by side at equal height (R-04); "Cơ hội có giá trị lớn nhất của tôi"; right rail: Cảnh báo with an action each, Lead cần liên hệ, Lịch 7 ngày tới, gia hạn/credit | The quarterly target chart and *Đặt chỉ tiêu* are not built (no targets feature); the existing sales dashboard sits there instead. "Xem gần đây" not built (no recent-items source). |
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

See the gate results at the end of this file (filled in after the run).

### Open items

- **CloseDialog parity** depends on ui3's `OpportunityView` (see table).
- **Kit gaps** reported to the integrator for ui1: NavIcon lacks refresh, filter, left/right, warn and grip glyphs (kept in `src/components/crm/Glyph.astro`), and `ListToolbar` has no filter pop-over (kept in `src/components/crm/ListFilters.astro`). Move both into the kit, then delete the two CRM files.
- Leads list shows duplicates if the same person is entered twice (lead creation does not refuse duplicate phones); unchanged behaviour, visible in the TEST data.
- Measured contrast and a JavaScript-off browser pass of the new screens were not run (NFR-04, NFR-08 stay open).

### Founder decisions

- Confirm the board features left out above (imports, campaigns, bulk actions, Kanban settings, sales targets, per-person calendars, event end time and guests). Each would be a new feature.
- *Công việc* as its own CRM tab (Tasks board). It lists the same tasks the record pages and calendar already show.

# User stories per Workspace role

Roles and permissions come from `src/lib/workspace/roles.ts` and [docs/workspace/README.md §2](../workspace/README.md#2-roles). Each story has acceptance criteria and a **forbidden case**. Every forbidden case names its denied test, or is marked **Open**.

## Everyone with Workspace access

- **Story.** As a member, I open *Tài khoản của tôi* and see who I am, which roles I hold, what they allow, my passkeys and my AI agent tokens.
  - **Accept.**
    - `/workspace/account` and `/vi/workspace/account` answer 200.
    - Identity comes from EmDash.
    - Token counts come from D1.
    - Nothing on the page is sample data.
  - **Forbidden.**
    - Seeing anyone else's identity.
    - A person with no role reaching the page.
    - *Test:* integration "my account: everyone with access sees only their own identity".
- **Story.** As a member, the module tabs show only the modules I may open.
  - **Accept.** The tabs and the launcher list the same modules, and every link answers 200.
  - **Forbidden.**
    - A tab that leads to 403.
    - *Test:* integration "navigation shows only modules and pages each role may open"; unit "navigation lists only modules…".

## System Super Admin (EmDash role 50)

- **Story.** I open the users table, filter or search it, and open a person's child screen. There I see their identity, roles, modules, passkey count, active tokens and access history.
  - **Accept.**
    - The table keeps the name column in place during horizontal scroll.
    - The breadcrumbs lead back to the table.
    - Saving returns to the same child screen and writes `workspace_audit`.
  - **Forbidden.**
    - Changing my own access.
    - Granting a role to another EmDash admin.
    - *Test:* unit tests on `saveMember` (`self`, `already_admin`) through the integration grant flow; a self-change on the child screen is **Open** as a dedicated test.
- **Story.** I read the roles matrix to see which role holds which permission.
  - **Forbidden.**
    - Editing permissions from the browser. The matrix is read-only, and roles change only in code and migrations.

## HR (ATS)

- **Story.** I manage roles, tests, candidates, interviews and scorecards, and I run the 60-day retention.
  - **Forbidden.**
    - Any CRM page.
    - Admin pages, including `/workspace/users/<id>` and `/workspace/roles`.
    - *Test:* integration "admin screens…" and "each role reaches only its modules".

## Sales Manager

- **Story.** I see every opportunity and reassign them. I assign referrals and enquiries.
  - **Forbidden.**
    - Hiring.
    - Playbook and offer configuration.
    - Assigning an unattributed deal to myself.
    - *Test:* integration "each role reaches only its modules"; CRM suite.

## Sales Executive

- **Story.** I work the opportunities assigned to me and report payments for confirmation.
  - **Forbidden.**
    - Another owner's records (they answer as not found).
    - CRM operations pages.
    - *Test:* integration "sales manager works the whole team; sales executive only their own".

## Partner (Cộng tác viên)

- **Story.** I refer a business, with consent, and then follow only its stage and outcome.
  - **Forbidden.**
    - Payments, notes, contacts or money on referred deals.
    - Operations pages.
    - *Test:* integration "partners refer businesses, follow status only, and never record payments".

## Finance (CRM role)

- **Story.** I confirm payments, refunds and corrections, and record commission payouts.
  - **Forbidden.**
    - The Finance module (`/finance`). It is System Super Admin only.
    - *Test:* `tests/finance-access-http.test.ts`.

## Fulfillment

- **Story.** I run delivery after the sale: handoff, owner approval, launch checks.
  - **Forbidden.**
    - Commission configuration and team assignment.
    - *Test:* CRM suite.

## Employee, People Manager, HRM Officer, HRM Admin, Payroll Officer

- **Story.** Each acts within the HRM scope in [docs/specs/hrm/README.md](../specs/hrm/README.md). The menu shows my own pages under *Của tôi* and HR work under the other groups.
  - **Forbidden.**
    - Hiring or CRM without a separate grant.
    - HRM Admin managing Workspace users.
    - Anyone approving their own submission.
    - *Test:* `tests/integration/hrm.integration.test.mjs`; unit "grouped menus" (an employee sees only *Của tôi*).

## CRM list screens (round 2, workstream 2)

Brief: [UI-PARITY.md](../redesign/UI-PARITY.md). Boards: `docs/redesign/boards/<Board>.dc.html`. Every story below keeps the CRM contract in AGENTS.md: ownership scopes, versioned moves, the close-dialog rules, the Lark rules, and "Move to" without JavaScript. Behaviour does not change unless a story says so.

**Shared acceptance for every list screen** (Leads, Accounts, Contacts, DealsTable, Main):
- The page opens on the **list-view header**, inside one white panel: object icon, object eyebrow (Lead, Cơ hội, Công ty, Liên hệ), list name with a list selector (a `<details>` menu of the lists that exist for that object), the **count line** ("9 mục · Sắp xếp theo … · Lọc theo …") and, on the right, the **action button group**. Below the header line: **search-in-list** and the **icon toolbar** (filter, view switch, refresh).
- There is no marketing H1, no lede paragraph, no separate filter card and no inline create form under the list. Filters sit in a filter popover from the toolbar.
- "Tạo" opens a **sheet** (`?new=1`), which works without JavaScript; invalid input re-renders the sheet open with status 422 and the typed values.
- Tables fill the width and freeze the row number and the name column (R-03). A name opens the record page with breadcrumbs.
- Words come from the app (`nav.ts`, CRM docs): "Công ty", never "Đối tác". No `{{…}}` or "Dữ liệu minh họa" ever appears.
- Empty states say what to do next.

- **Story (Leads).** As a seller, I open *Lead* and see my open leads as a dense list view, search them, switch to Kanban, and create a Lead from a sheet.
  - **Accept.** Leads board regions: list-view header with "Lead đang mở" and the list selector (Đang mở, Đã chuyển đổi, Không tiếp tục, Tất cả); button group *Tạo* (and *Đổi người phụ trách* only where `crm.team` already allows assignment on the lead page); count line; search; toolbar. Columns: #, Tên (frozen), Chức danh, Công ty, Điện thoại, Nguồn Lead, Trạng thái Lead, Nhu cầu, Người phụ trách, Tạo lúc.
  - **Forbidden.** Another seller's leads in the list or the count; a lead created by a Partner shown to a seller who does not own it. *Test:* integration "11b" (other seller's lead is 404, finance has no lead access).
- **Story (LeadsKanban).** As a seller, I see my open leads as columns by Lead status, drag a card to another status, or drop it on *Chuyển đổi* / *Không tiếp tục*, and I can do the same by keyboard with "Move to".
  - **Accept.** LeadsKanban board regions: list-view header; chevron column headers with the count; cards with name, company, source, owner, age and the target-time warning rail; drop bar appears only while dragging. Each card keeps its `data-card` and its "Move to" `<select data-move-to>`.
  - **Forbidden.** Moving someone else's lead; a stale move overwriting a newer status. *Test:* integration "11b" (other seller's move 404, stale move 409).
- **Story (Main, KanbanDrag).** As a seller, I work one playbook's open stages as a Kanban: chevron stage headers, per-stage total of known values (unknown counted separately), cards with company, value, expected close, owner initials and days in stage, a warning rail for no upcoming activity or overdue tasks. While dragging, the status line says "Đang kéo …" and the won/lost drop bar appears at the bottom; a drop opens the close dialog.
  - **Accept.** Main and KanbanDrag regions as above; the playbook is chosen from the list selector; *Tạo* opens the opportunity sheet.
  - **Forbidden.** Others' cards on a seller's board; a drop that skips a stage requirement. *Test:* integration "15" (others' cards absent, 404 move, 422 "Missing:").
- **Story (CloseDialog).** As a seller, closing an opportunity opens a centred dialog: the closing stages as radio cards (won in green, lost in red), lost needs a reason, a cancel action that keeps the current stage, and "Lưu và đóng cơ hội".
  - **Accept.** CloseDialog right-hand dialog. The left-hand "Cài đặt Kanban" dialog is not built (no Kanban settings feature).
  - **Forbidden.** Closing with a non-closing stage; lost without a reason; someone else's opportunity. *Test:* integration "15" (422 cases) and "2" (404 across owners).
- **Story (DealsTable).** As a seller, I see opportunities as a full-width table with the row number and name frozen, and edit value, probability, next step and due date in place.
  - **Accept.** DealsTable regions: list-view header, button group *Tạo*, count line, toolbar, table, scroll hint. The selection bulk bar and "Giá trị theo giai đoạn" chart are not built (no bulk feature).
  - **Forbidden.** A stale cell edit; editing a field outside the list; another owner's row. *Test:* integration "15" (409, 422, 404).
- **Story (Calendar, CalendarWeek, NewEvent).** As a seller, I see my tasks, next steps and (optionally) activity in a month grid or a week time grid, with a left rail (mini month and the "Lịch của tôi" toggles), a header with previous/next/today and a Ngày/Tuần/Tháng switch, and *Tạo lịch hẹn* opens the new-event sheet.
  - **Accept.** Calendar and CalendarWeek regions; NewEvent sheet fields: Chủ đề, ngày, giờ, liên quan đến (my opportunities), loại, ghi chú. "Lịch của người khác" is not built (team calendars are not a feature; managers already see the team's items).
  - **Forbidden.** Another seller's tasks shown; scheduling on someone else's opportunity. *Test:* integration "16" (others' tasks absent, 404).
- **Story (Tasks).** As a seller, I open *Công việc* and see my open tasks grouped by Quá hạn, Hôm nay, Sắp tới and Chưa có hạn; selecting one shows its detail on the right (Chủ đề, Hạn, Loại, Liên quan đến, Liên hệ, Người phụ trách, Ghi chú) with *Đánh dấu hoàn tất* and *Mở cơ hội*. *Tạo công việc* opens a sheet.
  - **Accept.** Tasks board regions: left list panel with header, count line and groups; right detail panel with the highlights grid. Completing a task uses the same checked `task_update` as the record page (an outcome is required).
  - **Forbidden.** Seeing or completing a task on another owner's opportunity; a person without `crm.access`. *Test:* integration "18. tasks list" (outsider 403, other seller cannot see or complete, 404).
- **Story (Accounts, Contacts).** As a seller, I see the companies and contacts I manage as list views with frozen leading columns, search them, and open the record.
  - **Accept.** Accounts and Contacts board regions (list-view header with the list selector, button group, count line, search, toolbar, table, scroll hint). "Nhập" (Import) is not built.
  - **Forbidden.** Companies or contacts outside my scope. *Test:* integration "17" (other seller's contact 404); `directory` scope.
- **Story (Home).** As a seller, *Hôm nay* shows my day as the Home board: a left column with today's appointments and today's tasks side by side (equal height, R-04), my largest open opportunities, and the sales dashboard; a right rail with warnings (overdue, missing next step, leads to contact, blocked delivery, team queue for managers).
  - **Accept.** Home board regions. The quarterly target chart is not built (no targets feature); the existing dashboard figures stay.
  - **Forbidden.** Another seller's leads or tasks on my Today. *Test:* integration "17" (another seller's lead absent from Today).
- **Story (MobileKanban, MobileCalendar).** On a phone (390 px), the Kanban shows one stage at a time with a horizontally scrolling chevron strip and the stage total, and the calendar shows an agenda by day; no horizontal page scroll.
  - **Forbidden.** Page-level horizontal overflow at 320–430 px. *Test:* the parity run measures `scrollWidth − clientWidth` (handoff).

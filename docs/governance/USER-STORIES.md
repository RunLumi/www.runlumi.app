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

## Round 2 security and admin (ui4)

Boards live in [docs/redesign/boards/](../redesign/boards/); region names below are the boards'. All tests run with `WORKSPACE_PASSKEY_REQUIRED=true`. Placeholders and sample data from the boards never appear; terms come from the app. Board items without a back end are listed as not built in FEATURES.md and are never drawn as working controls.

- **Story (every Workspace role: HR, Sales Manager, Sales Executive, Partner, Finance, Fulfillment, Employee and the HRM roles, and System Super Admin).** As someone with no passkey yet, I sign in through EmDash, create my first passkey, set my anti-phishing code and land on the page I asked for.
  - **Accept (SignIn, PasskeyEnrol, AntiPhishing).**
    - A signed-out visit to a private page redirects to `/workspace/sign-in?next=…` (EN/VI): brand, title, one-line explanation, work email field, *Sign in with passkey*, *No passkey yet? Email me a sign-in link*, *Lost your passkey?* link, and the anti-phishing note at the bottom. Signing in goes through EmDash's own endpoints; there is no second password or cookie.
    - The first private page then shows the enrol screen: a three-step header (email verified ✓, create passkey, anti-phishing code), the create card with *Create a passkey on this device*, and after creation the created card (name, created at, rename, *Next: set your anti-phishing code*). Creating it is EmDash's own registration and counts as this session's passkey check.
    - Step 3 shows the code card and the email preview with the code band; saving goes to the page first asked for.
    - Every role in roles.ts completes this path to its own module.
  - **Forbidden.** Reaching any private page or API before the passkey check (303 / 401 `passkey_required`); reaching a page before the code (303 to setup); a code that is the person's name or email; a person outside the Workspace using these pages. *Test:* security IT "first visit: every role…", "R-08 gate".
- **Story (every role).** On later sessions I sign in with my passkey once.
  - **Accept (SignIn, MobileSignIn).** A passkey sign-in on the sign-in page needs user verification and marks this session's Workspace check, so I am not asked again. A sign-in by email link still asks for one passkey check (the verify screen). At 390 px the card fills the width.
  - **Forbidden.** A sign-in assertion without user verification counting as the Workspace check; a check marked for another user ID. *Test:* security IT "sign-in".
- **Story (every role).** Before a sensitive action I verify again.
  - **Accept (StepUp).** The step-up screen is a dialog: title *Verify again to …*, how long ago my last check was against the 5-minute limit, the passkey to use (my last-used one), *Cancel* and *Verify with passkey*. Afterwards I return to the page that asked.
  - **Forbidden.** An export, delete, access change, token creation or passkey removal without a check from the last 5 minutes. *Test:* security IT "access changes…", "token creation…", "account security".
- **Story (every role; System Super Admin for the window).** When I lose every passkey, an admin restores access.
  - **Accept (Recovery).** `/workspace/recovery` explains the steps in order (ask an admin; they confirm who you are; they open a 24-hour window and send an EmDash sign-in link; you create a new passkey). Signed in with an open window, the steps show my real state. The admin opens the window from the member's row in a dialog with *I met or video-called this person* (required) and a reason; it is audited, used once, and never for oneself.
  - **Forbidden.** Adding a passkey without the first-passkey, step-up or window exception; opening a window for oneself; a non-admin opening one. *Test:* security IT "recovery".
- **Story (every role).** I manage my own passkeys and code in *Tài khoản của tôi › Bảo mật*.
  - **Accept (SetupSecurity, MobileSecurity).** Breadcrumbs *Tài khoản của tôi › Bảo mật*; Passkey table (name, type, created, last used) with *Add passkey*, *Rename* and *Remove*; the note that one passkey must remain; the code panel (masked, *Show code*, *Change code* in a sheet); *This session* (when it was verified, sign out); my AI agent tokens with a link to manage them. At 390 px each panel becomes a grouped list. Works for every role, not only admins; the EmDash admin page is no longer linked.
  - **Forbidden.** Renaming or removing someone else's passkey (404 from EmDash); removing my last passkey; removing without step-up. *Test:* security IT "account security".
- **Story (System Super Admin).** I review the organisation's security, agents, notifications, webhooks, audit log, members and roles.
  - **Accept.**
    - *OrgSecurity:* breadcrumbs *Quản trị › Bảo mật*; attention panels (members without a second passkey as a table; only one System Super Admin); policy sections *Sign-in*, *Step-up*, *Recovery* with the real values and *Fixed* / *Required* badges; enforcement state of the switch.
    - *OrgAgents:* module rows with *Off / Read / Read and write* segmented controls and the agents using each and denials in 7 days; the never-available modules (Hiring, HRM, Finance and money data); the connected agents table with Member and Agent frozen and *Revoke*.
    - *AgentConsent:* the page an employee uses to connect an agent: what the agent receives per module (asked vs granted), what they still confirm, connection details, *Cancel* / *Allow with passkey*.
    - *NotificationRules / NotificationRuleEdit:* list-view header with *Create rule*, quick filters (All, Enabled, Delivery errors, Disabled), a failure banner, a full-width table with the name frozen; the editor with breadcrumbs, status and *Save rule*, numbered sections (event, conditions, channels, recipients) and a preview column.
    - *Webhooks / WebhookDetail:* quick filters by status and platform, failure banner, table with the name frozen; *Create Webhook* opens a sheet; the record has breadcrumbs, status, *Pause/Resume* and *Remove*, a configuration panel, the rules that send to it, and the delivery log.
    - *AuditLog / AuditEvent:* header with *Export CSV* (step-up), quick filters, a filter row (time, who, module, kind, outcome), table with Time and Who frozen; the event record with who, how, the changed fields and the request ID.
    - *MembersTeams / MemberDetail / Roles:* members list with *View roles* and *Add member* (sheet), quick filters (all, missing a second passkey, recovery open, has an AI agent), frozen name column; the member record with highlights (roles, modules, passkeys, code), warning when only one passkey, roles and permissions, passkeys, agents, recent activity; the roles matrix grouped by module with *Yes / Own / No*.
  - **Forbidden.** Any of these pages or their POSTs for a role without `users.manage` (403); changing one's own access; saving without step-up. *Test:* security IT "admin security screens…", workspace IT "admin screens".

## Round 2: board parity, workstream ui1 (shell, kit, Overview, account, search, bell)

Brief: [UI-PARITY.md](../redesign/UI-PARITY.md). "Board" names the file in `docs/redesign/boards/`; its regions are listed in the order they must appear. Every screen keeps its `/vi` peer, and its proof is `docs/redesign/parity/<Board>/`. Words come from `nav.ts` and `roles.ts`, never the boards' sample data.

- **UI1-S1 · Global header and app nav (board TopNav, SetupNav).** As any member, every private page shows me the same two bars, so I always know where I am and how to move.
  - **Accept.**
    - Row 1 (white, 1px rule, about 52 px): logo mark and "Lumi Workspace" left; the search field centred (up to 560 px); then create (+), help (?), bell, and my initials avatar on the right.
    - Row 2, the app nav bar (white, about 52 px): the 9-dot launcher button, the app label (module name), then page tabs with a 3 px blue underline on the current page.
    - Modules with many pages (CRM) show their main pages as tabs and the rest in a "More" menu with labelled groups (R-05). Quản trị, HRM and Tài chính show a side navigation drawn like SetupNav (section title, labelled groups, items with icons, current item tinted).
    - Create (+) lists only create actions I may take, each linking to an existing create screen. Help lists only guides I may open. The avatar menu shows my name, email, Tài khoản của tôi pages, language switch and sign out.
    - It all works without client script (links, GET forms, `<details>`); a 320 px screen has no horizontal page scroll.
  - **Forbidden.** A tab, launcher tile, create action or help link that answers 403 or 404 for me.
    - *Test:* integration "navigation shows only modules and pages each role may open" (existing, kept); unit "create actions and help links follow permissions" (`tests/workspace-roles.test.ts`).
- **UI1-S2 · App launcher (board AppLauncher).** As a member, the launcher shows the modules I may open as tiles (icon, name, the pages it holds), with the current one outlined.
  - **Accept.** Opens from the 9-dot button; a dialog-like panel titled "Ứng dụng" / "Apps" with a three-column tile grid at 1440 px, one column at 390 px. No "recent items" (no source; recorded as a board gap).
  - **Forbidden.** A tile for a module I may not open. *Test:* the same navigation tests (the launcher is the `ws-modules` nav).
- **UI1-S3 · Search (board Search).** As a member, I type in the header search and get results grouped by object (Cơ hội, Công ty, Liên hệ, Lead, Người dùng), with a filter list by object type and counts on the left.
  - **Accept.**
    - `/workspace/search?q=` and `/vi/workspace/search?q=` answer 200 for anyone with `workspace.access`.
    - CRM results come from the existing list functions (`listOpportunities`, `listAccounts`, `listContacts`, `listLeads`) with my CRM actor, so the same ownership scopes apply. Workspace members appear only with `users.manage`.
    - Each group shows at most 5 rows and a "Xem tất cả" link to the module's own list filtered by the same text. Each row links to its record page.
    - A query shorter than 2 characters shows how to search, not results. Nothing on the page is sample data.
  - **Forbidden.**
    - A Sales Executive finding another owner's opportunity, company or contact; HR (no CRM) getting any CRM group; a non-admin getting members.
    - *Test:* integration "search returns only what each person may list".
- **UI1-S4 · Bell and notices (board Notifications).** As a member who receives in-app notices (today: HRM service-request notices, `hrm.notifications.read` while HRM is live), the bell shows my unread count and opens my notices.
  - **Accept.**
    - The bell appears only when I have a notice source. `/workspace/inbox` (and `/vi`) shows the panel header ("Thông báo", unread count, "Đánh dấu tất cả đã đọc", "Cài đặt thông báo của tôi"), tabs Tất cả / Chưa đọc, then items with icon, title, time, body, "Bạn nhận vì: …" and an unread dot.
    - Marking read uses the existing HRM function (versioned, audited). Empty states say what will arrive here.
  - **Forbidden.**
    - Seeing or marking another person's notice; a person without a notice source getting a bell.
    - *Test:* integration "notices: the bell and inbox show only my own notices".
- **UI1-S5 · Tổng quan.** As a member, `/workspace` opens on the kit: a list-view style header (object icon, "Tổng quan", my name and roles, actions), then equal-height module panels whose figures link to their lists (R-04).
  - **Accept.** No large marketing H1 or lede paragraph; figures are the existing `homePage` figures. **Forbidden.** A panel for a module I may not open. *Test:* integration "navigation shows only modules…" (home cards follow `visibleModules`).
- **UI1-S6 · Tài khoản của tôi (boards AccountProfile, SetupNotifications).** As a member, I see my profile and what notifications reach me.
  - **Accept.**
    - Hồ sơ: header panel with breadcrumbs, large initials avatar, name, "email · roles · thành viên từ …"; a "Thông tin cá nhân" form grid (read-only: identity lives in EmDash, each field says where it is changed); "Ngôn ngữ và khu vực" (language from the URL, time zone Asia/Ho_Chi_Minh, date format dd/mm/yyyy); "Thiết lập khác của tài khoản" cards for Bảo mật (real passkey count, anti-phishing code set or not, active AI agent tokens) and Thông báo; my roles and modules stay on the page.
    - Thông báo (`/workspace/account/notifications`): header with breadcrumbs and an explanation; the "Kênh nhận theo loại sự kiện" table lists only what really reaches me: HRM service-request notices (in-app) and each enabled notification rule that names me, my role, Super Admins (if I am one) or record owners, with its email state. No toggles, quiet hours, digest or reminders: there is no back end for them (founder decision recorded).
  - **Forbidden.** Seeing anyone else's profile, rules that do not name me, or editing anything here. *Test:* integration "my account: everyone with access sees only their own identity" (extended to the notifications page).
- **UI1-S7 · Kit and parity proof.** As a workstream, I build list, record and create screens from shared components that match the boards, and I prove parity with one script.
  - **Accept.** `src/components/workspace/ui/` has `ListHeader` (object icon, eyebrow, list name with selector, meta line, button group, toolbar slot), `ButtonGroup`, `ListToolbar`, `Sheet` and `Dialog` (open by `:target` or server state, close link, Escape), `RecordHeader` (crumbs, highlights row), `Path`, `RecordTabs`, `RelatedList`, `FormGrid`/`Field`. `node scripts/parity-shots.mjs <Board> --path /workspace/...` writes `board-1440.png`, `app-vi-1440.png`, `app-en-1440.png`, `app-vi-390.png`, each under 400 KB.
  - **Forbidden.** Copying board HTML or `lumi.css` into the app; placeholders (`{{…}}`, "Dữ liệu minh họa") in app output. *Test:* unit "kit output has no board placeholders" (`tests/workspace-ui.test.ts`), plus `npm run lint`.

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

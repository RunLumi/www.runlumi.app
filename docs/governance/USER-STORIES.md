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

## Round 2 records and setup (ui3)

Boards live in [docs/redesign/boards/](../redesign/boards/). Region names below are the boards' own. Behaviour, permissions and ownership are unchanged; these stories change layout only. Sample data and placeholders from the boards never appear. Terms come from the app ("Công ty", not "Đối tác").

- **Story (Sales Executive, Sales Manager).** As the owner of a Lead, I open its record and see who it is, where it stands and what to do next, without scrolling past forms.
  - **Accept (LeadRecord).**
    - Highlights panel: object icon, breadcrumbs *CRM › Lead › name*, eyebrow "Lead", the name as H1, and a button group on the right (*Chuyển đổi*, *Sửa*, *Đổi người phụ trách* for the team, overflow for *Không tiếp tục*). Below it a row of highlight fields: job title, company, phone, source, owner.
    - Path panel: the Lead process statuses of the lead's version as chevrons (done, current, upcoming), a "Mark status complete" button that moves to the next status through the same versioned `lead_status` write, key fields (need, next step, due) and guidance.
    - Two columns: left has tabs *Hoạt động* (note composer, then the activity feed) and *Chi tiết* (all fields read-only); right is *Liên quan* (duplicate hints, source and consent, referrer).
    - Edit, assign and disqualify open in a sheet (`?sheet=edit|assign|disqualify`, no client JavaScript required). The page has no long inline form.
  - **Forbidden.** Another seller's lead (404); finance with no lead access (404); a note on a converted lead (403); assigning without `crm.team`. *Test:* IT 11b.
- **Story (Lead owner or team).** I convert a Lead in one dialog.
  - **Accept (LeadConvert).** A modal dialog over the record (`?convert=1`): title *Chuyển Lead thành cơ hội: name · company*; three bordered sections *Công ty*, *Liên hệ*, *Cơ hội*, each with "Tạo mới" and "Chọn … có sẵn" side by side separated by "HOẶC"; duplicate count badges; owner line and a footer with *Hủy* and *Chuyển đổi*. Only companies and contacts in my scope are listed.
  - **Forbidden.** Converting another owner's lead (404); converting an unassigned lead; a second conversion (redirects to the summary, creates nothing). *Test:* IT 11b.
- **Story (Lead owner or team).** After converting I see what was created and go on.
  - **Accept (LeadConverted).** A centred result dialog: check mark, *Đã chuyển Lead thành cơ hội*, then three cards (Company, Contact, Opportunity) each labelled "used existing" or "created", and footer buttons *Về Leads*, *Xem trên Kanban*, *Mở cơ hội*.
  - **Forbidden.** The summary before conversion (303 to the lead); another seller (404). *Test:* IT 11b.
- **Story (Sales roles, finance, fulfillment within their scope).** I open an opportunity record and work it.
  - **Accept (DealRecord).** Highlights (Công ty, expected close, value or "Unknown", owner, playbook) with a button group (*Sửa*, *Tạo báo giá*, *Đổi người phụ trách* for the team, close); the playbook path with key fields and guidance; left tabs *Liên quan* (related lists: contacts, quotes, money, delivery, tasks, linked opportunities) and *Chi tiết*; right column *Hoạt động* (composer and feed). Edits, quotes, payments and closing open in sheets or dialogs.
  - **Forbidden.** Another owner's opportunity (404); a collaborator confirming payments; a partner seeing money, notes or contacts on a referred deal. *Test:* IT 2, 9, workspace "partners refer…".
- **Story (Sales roles).** I open a company or contact record.
  - **Accept (AccountRecord).** Highlights (type, phone, area, owner, open value), button group (*Tạo liên hệ*, *Tạo cơ hội*, *Sửa*); left tabs *Liên quan* (Contacts and Opportunities related lists, full-width opportunity table) and *Chi tiết*; right column *Hoạt động*. Contact records use the same frame with the company in breadcrumbs.
  - **Forbidden.** Another owner's company or contact (404); editing a contact with stale version (409). *Test:* IT 2, 17.
- **Story (Admin with `crm.configure`; Finance and Fulfillment for their pages).** I configure the CRM from one setup area.
  - **Accept (Settings).** A left setup menu in labelled groups (Cơ hội: playbooks, offers; Lead: lead statuses, assignment, referrals; Tiền: commission; Vận hành: fulfillment; Báo cáo: reports), showing only pages I may open. Each page has an icon header with eyebrow *Thiết lập CRM*, a title and a button group; tables full width; new versions open in a sheet; an info note explains that labels are org data and versions never rewrite deals.
  - **Forbidden.** A Sales Executive saving lead process or playbooks (403); commission estimates to collaborators before approval. *Test:* IT 11b, 13, 14.
- **Story (HR; HRM roles; System Super Admin).** Tuyển dụng, HRM and Tài chính pages use the same list-view header, record frame and sheets as CRM.
  - **Accept.** Lists: object icon, title, count line, button group; create opens a sheet. Records: highlights with breadcrumbs. No large marketing H1. Every gate, permission and audit stays.
  - **Forbidden.** HR reaching CRM; HRM Admin managing users; anyone but Super Admin entering Finance. *Test:* workspace "each role reaches only its modules"; `tests/finance-access-http.test.ts`; HRM P1.

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

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

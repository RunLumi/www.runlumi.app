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

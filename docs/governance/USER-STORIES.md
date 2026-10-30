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

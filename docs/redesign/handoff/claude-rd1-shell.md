# Handoff: workstream 1, shell, Tổng quan, Quản trị, governance

- **Branch:** `claude/rd1-shell`
- **Merged into:** `claude/loving-pasteur-z7ly65` (draft PR #116) with `git merge --no-ff`
- **Date:** 2026-10-29

## What was built

1. **Shared components for R-03 to R-05.** These were pushed first so workstreams 2 and 3 could merge them.
   - The components are in `src/components/workspace/ui/`: `DataTable`, `PageHeader`, `Breadcrumbs`, `PanelRow`, `Panel`, `FactRow` and `GroupedMenu`.
   - `DataTable` freezes leading columns, has a focusable scroll region and a scroll hint.
   - `PageHeader`/`Breadcrumbs` are for child screens, `PanelRow`/`Panel`/`FactRow` give equal-height rows, and `GroupedMenu` gives menus whose group labels never look like items.
   - Styles: `src/styles/workspace.css`, loaded by `WorkspaceShell`.
   - Usage: [docs/workspace/UI.md](../../workspace/UI.md). Commit `cfb3a30`.
2. **WorkspaceShell and nav.**
   - **Row 1:** brand and module tabs. Below 1024 px the tabs become a `<details>` launcher that lists each module with one line about what it holds. The row also has the language switch and an account menu (initials, name, roles, *Tài khoản của tôi*, sign out).
   - **Row 2:** the current module, then its page tabs, or a grouped sidebar for grouped modules (CRM, HRM, Finance, Admin). On narrow screens the sidebar becomes a "Trang" disclosure.
   - **No client script.** The glass header has opaque and reduced-transparency fallbacks (DESIGN.md §8.4).
   - **`nav.ts`:**
     - HRM's 30 pages now sit in 4 labelled groups.
     - Admin has a group with *Người dùng* and *Vai trò và quyền*.
     - `accountModule` is personal settings (R-06). It is not a module tab.
     - New icons: `apps`, `account`, `security`.
   - Commits `cb9325d` (middleware guard for `/workspace/roles`, `users.manage`), `b93e7bd` (nav) and `e040462` (shell and pages).
3. **Tổng quan.** Equal-height module panels. Every figure links to the list it counts, and every panel has an "Open module" foot. The Finance setup panel is kept. Roles now link to *Tài khoản của tôi*.
4. **Quản trị.**
   - `/workspace/users` is a full-width table with a frozen name column. It shows roles, modules, passkey count (EmDash `credentials`), active AI agent tokens (`crm_api_tokens`), status and the partner seller-terms flag. It has quick filters (links) and a GET search. Below the table is a panel of the 10 most recent access changes.
   - **Rows open child screens** at `/workspace/users/<id>`. Each has breadcrumbs, a fact row, EmDash identity, the modules the person can open, a role form grouped by module, revoke or restore, and the person's access history.
   - **Grant screen** at `/workspace/users/new`.
   - **Read-only matrix** at `/workspace/roles`, generated from `ROLE_PERMISSIONS`.
   - **One write path.** All writes go through `saveMember` (via `handleAccessPost`) and `workspace_audit`. `/workspace/users` still accepts the existing `grant` and `update` POSTs.
5. **Tài khoản của tôi.** `/workspace/account` (with its `/vi` peer) shows only the signed-in person:
   - EmDash name, email and creation date, and Workspace access since;
   - language and time zone;
   - roles with descriptions, and the modules they open;
   - their passkeys from EmDash `credentials`, with a link to EmDash's passkey page;
   - their active CRM token count, with a link to `/crm/api`.
   - There is no sample data, and the page edits nothing.
6. **Vietnamese wording.**
   - The new screens are written in plain Vietnamese with EN peers.
   - Role labels and descriptions in `roles.ts`: *Quản lý trực tiếp*, *Phụ trách tính lương*, *Nhân sự tuyển dụng (HR)*; English filler words removed (commit with "copy(workspace)").
7. **Governance** in [docs/governance/](../../governance/README.md):
   - `FEATURES.md` (per module, with status and evidence);
   - `NFR.md` (targets and proof);
   - `USER-STORIES.md` (per role, with acceptance criteria and the forbidden case);
   - `MEMORY.md` (decisions, open questions, lessons);
   - ADR-0001 to ADR-0003.
   - [docs/workspace/README.md §3](../../workspace/README.md) was updated for the new information architecture.

## Gates

See the "Gate results" section below for the final run on the merged head.

- **Unit and integration tests.** New tests:
  - unit tests in `tests/workspace-roles.test.ts`: every grouped link has a group; an employee sees only "Của tôi"; account visibility; Admin is never visible to non-admins;
  - integration "admin screens…" (allowed and denied for `/workspace/users/<id>`, `/new` and `/workspace/roles` in both locales; a denied POST changes nothing; 404 for an unknown ID; 422 in Vietnamese);
  - integration "my account…" (own identity only; HR without CRM; no role gives 403).
- **Browser review** with local Playwright (Chromium) on the synthetic integration database:
  - **Widths and locales.** 1280, 390 and 320 px, EN and VI, for Overview, Users, the member screen, Grant, Roles, Account, and the CRM, HRM and Hiring shells.
  - **Overflow.** `scrollWidth − clientWidth` was 0 on every page after the fix that contains hidden cell labels. Before that fix, the roles page overflowed by 603 px.
  - **Keyboard.** The focus walk on `/vi/workspace/users` runs: skip link → brand → module tabs → language → account menu → module name → menu items → page actions.

## Open

- **Step-up (rd4).** Step-up is pending. Role changes on the member screen and the grant screen should require step-up once rd4 lands. Mark them "step-up pending (rd4)" until then; nothing is faked.
- **Security and notification pages (rd4).** *Tài khoản của tôi* shows no anti-phishing code or step-up state yet. rd4 adds its pages as `accountModule.links` in `nav.ts`.
- **EmDash passkey link.** The account page links to `/_emdash/admin/settings/security`. It has not been checked that EmDash users below role 50 can open that page (MEMORY.md, open question 4).
- **Wording in modules owned by rd2 and rd3.** Nav labels for HRM and CRM pages were not changed, to keep them identical to page titles that rd2 and rd3 own. Suggested replacements (R-02):
  - "Payroll và phiếu lương" → "Bảng lương và phiếu lương"
  - "Kế hoạch onboarding" → "Kế hoạch hội nhập"
  - "Offboarding" → "Nghỉ việc"
  - "Lưu trữ và legal hold" → "Lưu trữ và tạm giữ hồ sơ"
  - "Chính sách và hold báo cáo" → "Chính sách và tạm giữ báo cáo"
  - "Khai báo COI của tôi" → "Khai báo xung đột lợi ích"
  - "Yêu cầu HR của tôi" → "Yêu cầu nhân sự của tôi"
  - "Yêu cầu dịch vụ HR" → "Xử lý yêu cầu nhân sự"
  - "Phân công và cohort" → "Phân công và đợt thử nghiệm"
  - Change each label in `nav.ts` together with the page title, in one small commit.
- **Not built.**
  - Workspace-wide search and a header notification bell. The boards show them, but no back end exists, and they would be new features (MEMORY.md, open questions 1–2).
  - A measured contrast audit, and a review with JavaScript off. Both are recorded as Open in `NFR.md`.

## Board gaps (the repository contract wins)

- **Users.** The boards' teams, departments, invitations and bulk actions do not exist in this app. Membership is an allowlist of existing EmDash accounts, so nothing invites or creates logins. These were left out.
- **Roles.** The boards' "one role per member" and editable roles conflict with this app's combinable roles, defined in code. The matrix is read-only.
- **Profile.** The boards' editable profile fields (title, phone, department) have no source of truth here. Identity stays in EmDash.

## Decisions needed from the founder

1. Should Workspace get a cross-module search and notification inbox? Each is a feature with its own permission design.
2. Should the account menu show EmDash avatar photos?
3. Confirm the Vietnamese replacements above, so rd2 and rd3 can apply them.

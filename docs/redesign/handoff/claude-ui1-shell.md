# Handoff: workstream ui1, shell, kit, Overview, account, search and bell (round 2)

- **Branch:** `claude/ui1-shell`, from `claude/loving-pasteur-z7ly65` at `e4f9703`
- **Brief:** [UI-PARITY.md](../UI-PARITY.md). Spec commit `2a776fd` (feature rows and stories UI1-S1 to UI1-S7).
- **Date:** 2026-10-30

## Round 2

### What was built

| Commit | What |
|---|---|
| `2a776fd` | Spec: FEATURES rows and stories UI1-S1..S7 with board-based acceptance criteria, forbidden cases and their denied tests. |
| `f6a4b6b` | `nav.ts` (shared file, own commit): `tab` links and the "More" menu for CRM, `layout: "side"` for HRM, Finance and Admin, `createActions`/`visibleCreateActions`, `helpLinks`, `appBar`, My account › Notifications. Header icons. |
| `3b3d379` | The shell and the kit (pushed first and sent to the integrator). `WorkspaceShell`: global header and app nav bar with the launcher; side navigation. Kit in `src/components/workspace/ui/`: `ListHeader`, `ButtonGroup`, `ListToolbar`, `ObjectIcon`, `RecordHeader`, `Path`, `RecordTabs`, `RelatedList`, `Sheet`, `Dialog`, `FormGrid`, `FormField`; `GroupedMenu` side variant; `PageHeader`, panels and tables at board density. `scripts/parity-shots.mjs`. Usage in [docs/workspace/UI.md](../../workspace/UI.md). |
| `a54e7ce` | Tổng quan, Tài khoản của tôi › Hồ sơ and › Thông báo, `/workspace/search`, `/workspace/inbox` and the bell, with unit and integration tests. |
| `40326e1`, `b8dbd23`, `bfb79c3`, `994ea93` | Governance (NFR-04, MEMORY), test precision, launcher CSS fix, parity screenshots. |
| `fe47ec1`, `cd0d414` | One kit for everyone, at the integrator's request: toolbar and card glyphs (from ui2's interim Glyph), the ListToolbar filter pop-over (from ui2's ListFilters), RelatedList actions/wide/foot/empty, Sheet `wide`/`enctype`, and ui3's PathPanel, Feed and SetupFrame moved into `ui/`. ui2 and ui3 were sent the old→new mapping; ui2 already switched (`57cd035`). |
| `f38ceb8` | Merge of `origin/claude/loving-pasteur-z7ly65` at `e16f004` (ui2's CRM lists). |

### Screens and parity

Each folder holds `board-1440.png`, `app-vi-1440.png`, `app-en-1440.png` and `app-vi-390.png`, taken with `node scripts/parity-shots.mjs` on an isolated local Worker with TEST data (signed in as a TEST member with Sales Manager + Employee, except SetupNav: the dev-bypass System Super Admin). The board PNGs are rendered with the boards' own template logic, so most `{{…}}` show the board's sample data.

| Board | App route | Parity folder | Matches | Differs, and why |
|---|---|---|---|---|
| TopNav | every private page (shot: `/workspace`) | [parity/TopNav](../parity/TopNav/) | Row 1: white bar, "L" mark + "Lumi Workspace", centred search (560 px), +, ?, bell with red count, initials avatar. Row 2: 9-dot launcher, app label, tabs with 3 px blue underline. Sizes from the board (52 px rows, 36 px controls, 14 px tabs). | Tabs and labels come from `nav.ts` (R-01/R-02): CRM shows Hôm nay, Lead, Cơ hội, Lịch, Công ty, Liên hệ, Báo cáo and a "Thêm" menu with the other CRM pages; the board's Công việc, Dự báo and Duyệt do not exist or are excluded. + and ? appear only when the person has a create action or a guide; the bell only with a notice source. The language switch lives in the avatar menu. Overview has no tabs. |
| AppLauncher | launcher on every page (shot: `/crm`, opened) | [parity/AppLauncher](../parity/AppLauncher/) | Panel titled "Ứng dụng", filter field, "Ứng dụng" eyebrow, 3-column tiles (object square, bold name, the pages it holds), current module outlined in 2 px blue, scrim. | Tiles show module icons, not letters. Only modules the person may open. No "Mục dùng gần đây" (no source of recent items) and no Lumi HQ note. It opens as a panel under the 9-dot button (a `<details>`, no script); the filter appears only with script. One column at 390 px. |
| Search | `/workspace/search?q=` | [parity/Search](../parity/Search/) | Header panel ("Kết quả tìm kiếm", "“q” · N kết quả"), left "Loại dữ liệu" filter with counts and "Chỉ hiện bản ghi bạn có quyền xem.", one related list per object with icon, count and rows (title link + meta). | Object types are the app's: Cơ hội, Công ty, Liên hệ, Lead, and Người dùng for `users.manage`. No projects, tasks, messages or mail (they do not exist). "Xem tất cả" opens the module's own list filtered by the same text and appears only when there are more than 5. No "Dữ liệu minh họa" badge. |
| Notifications | `/workspace/inbox` | [parity/Notifications](../parity/Notifications/) | One panel: bell object square, "Thông báo", "N chưa đọc", "Đánh dấu tất cả đã đọc", "Cài đặt thông báo của tôi"; tabs; rows with object square, title link, time, "Bạn nhận vì: …", the unread dot and blue rail. | Tabs are Tất cả and Chưa đọc · N; the board's "Cần tôi xử lý" and "Bảo mật" have no source. Notices are HRM service-request notices only, and they carry no body line: HRM keeps request contents out of notices by design. The unread dot is the "mark as read" button. |
| SetupNav | side navigation of Quản trị, HRM, Tài chính (shot: `/workspace/users`) | [parity/SetupNav](../parity/SetupNav/) | White side panel: filter field, section title with dark icon square, small uppercase group labels with a rule (R-05), items with icons, current item tinted blue. Below 1024 px it becomes a page menu in the app bar. | One section per module instead of the board's "Tổ chức" / "Cài đặt ứng dụng" split. Items are the module's real pages; the board's Email & Tên miền, Ứng dụng, Nguồn kết nối and Chương trình giới thiệu do not exist here. The page content (Users table) is workstream 4's MembersTeams board. |
| AccountProfile | `/workspace/account` | [parity/AccountProfile](../parity/AccountProfile/) | Header panel with crumbs, 72 px avatar, name, "email · roles · thành viên từ …"; split "Thông tin cá nhân" (2-column form grid) and "Ngôn ngữ và khu vực"; "Thiết lập khác của tài khoản" with three cards (Bảo mật with real counts, Thông báo, leaving). | Identity lives in EmDash, so fields are read-only with "Do Siêu quản trị đổi trong EmDash" and there is no "Lưu thay đổi"; no "Đổi ảnh đại diện" (avatar photos are an open question). No title, phone or department fields (no source of truth). Roles, modules and AI agent tokens stay on the page below the board's regions (story requirement since round 1). |
| SetupNotifications | `/workspace/account/notifications` | [parity/SetupNotifications](../parity/SetupNotifications/) | Header panel with crumbs, title and explanation; "Kênh nhận theo loại sự kiện" table with Email and "Trong ứng dụng" state switches, the "Bắt buộc, không tắt được" badge and notes; the email address line with the anti-phishing code. | **Read-only.** Rows are what really reaches the person: HRM in-app notices and each enabled email rule that names them, their role, Super Admins or record owners, with the reason. No save button, toggles, quiet hours, daily digest or date reminders: there is no back end for them (founder decision below). |
| (no board) Tổng quan | `/workspace` | in [parity/TopNav](../parity/TopNav/) app shots | List-view header (object square, "Tổng quan", greeting, roles line, create actions as a button group), equal-height module panels (R-04) whose figures link to their lists. | No board exists; the big round-1 H1 and lede are gone. |

### Gates

Two full runs, each integration scope on its own fresh local Worker and D1 (`scripts/run-integration.mjs`, `WORKSPACE_PASSKEY_REQUIRED=true`).

| Gate | `994ea93` (ui1 complete, base `e4f9703`) | `f38ceb8` (after merging `origin/claude/loving-pasteur-z7ly65` at `e16f004`, which includes ui2) |
|---|---|---|
| `npm run lint` | ok (616 files) | ok (624 files) |
| `npm test` | 459 pass, 0 fail | 459 pass, 0 fail |
| `npm run db:migrate:local` | ok (to 0056) | ok (to 0056) |
| `npm run build` (astro check + build) | 0 errors, 0 warnings; build complete | 0 errors; build complete |
| Integration workspace | 15/15 (includes the 3 new UI1 tests) | 15/15 |
| Integration security | 12/12 | 12/12 |
| Integration crm | 18/18 | 19/19 |
| Integration directory | 7/7 | 7/7 |
| Integration api | 7/7 | 7/7 |
| Integration dashboard | 5/5 | 5/5 |
| Integration files | 6/6 | 6/6 |
| Integration sales-process | 12/12 | 12/12 |
| Integration business-model | 5/5 | 5/5 |
| Integration finance | 9/9 | 9/9 |
| Integration HRM P1, P3, P4, P5 (separate scopes) | each pass | not rerun: the merge brought only CRM list changes (ui2) and the kit additions in `fe47ec1`/`cd0d414`, which no HRM page uses |
| Integration hrm-journey | not run (known container flake in `hrm-recovery-drill.mjs`, see round 1) | not run |

- The kit additions `fe47ec1` and `cd0d414` were also checked on their own before pushing: `astro check` 0 errors, lint ok, `tests/workspace-shell.test.ts` + `tests/workspace-roles.test.ts` 14/14, and the workspace scope 15/15 from a clean worktree (no `.dev.vars`, fresh persist dir).
- ui2, ui3 and ui4 reported 3 workspace failures on `a54e7ce`. They were assertion-scope bugs in the new tests (the search box echoes the query, dev mode inlines CSS containing `.ws-bell`, the shell has its own forms), fixed in `b8dbd23` before any merge into the integration branch.

Browser review (Playwright, local Worker, TEST data):
- **Overflow:** `scrollWidth − clientWidth` = 0 at 320, 390 and 1280 px, EN and VI, on `/workspace`, `/workspace/account`, `/workspace/account/notifications`, `/workspace/inbox`, `/workspace/search?q=TEST`, `/workspace/users`, `/crm`, `/crm/leads`, `/hrm`, `/admin/jobs`, `/finance/settings`; all answered 200.
- **Keyboard:** on `/vi/crm` Tab runs skip link → brand → search → Tạo mới → Hướng dẫn → Thông báo → avatar → launcher → app label → tabs, each with a 2 px focus ring. Escape closes the launcher; a sheet opened by `#id` focuses its `autofocus` field and Escape closes it.
- **Kit check:** a throwaway page (not committed) rendered ListHeader + ButtonGroup + ListToolbar + DataTable, RecordHeader with highlights, Path, RecordTabs, RelatedList, Sheet with FormGrid and Dialog; all matched the Leads, LeadRecord and NewEvent patterns.
- **Not run:** a review with JavaScript turned off, and a measured contrast audit (both stay Open in NFR.md).

### Open

1. **Other screens still carry round-1 scaffolds.** The shell and the 24 px title now apply everywhere, but list and record bodies (CRM, Hiring, HRM, Finance, Admin) are rebuilt by workstreams 2, 3 and 4 with the kit. The CRM Today page in the AppLauncher shot is the old page under the new shell.
2. **Create links.** The + menu links to `/crm/leads#new-lead`, `/crm/referrals#new-h` and `/admin/jobs#new-h`, today's anchors. When workstreams 2 and 3 move those forms into a `Sheet`, they keep the id or change the path in `createActions` in the same commit.
3. **`crm.css` round-1 shell rules** (`.ws-modules a`, `.ws-pages a`, `.ws-frame`) are still there and are overridden by `.ws`-prefixed rules. Removing them is a separate clean-up once no page uses the old shell markup.
4. **The bell counts queued HRM notices too.** HRM delivers its outbox when the inbox is listed; the count includes queued notices so the number does not jump after opening.

### Decisions needed from the founder

1. **Personal notification settings** (SetupNotifications board): build per-event channel switches, quiet hours, a daily digest and date reminders? Each needs a preferences table and changes to rule delivery and HRM notices. Until then the page is read-only.
2. **Avatar photos**: show EmDash `avatar_id` photos in the header and on the profile (still open from round 1)?
3. **Search scope**: add HRM people or hiring candidates to search? Both need their own permission design; today search covers CRM records and, for admins, people with access.
4. **Recent items in the launcher**: the board shows "Mục dùng gần đây". That needs a per-person history of opened records (a new table). Build it?

## Round 1

Workstream 1's round-1 handoff is [claude-rd1-shell.md](claude-rd1-shell.md).

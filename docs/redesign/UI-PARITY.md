# UI parity with the approved boards (round 2)

> The founder's request, 2026-10-30: rebuild the interface to match the approved boards, and make passkey and anti-phishing ready.
> Round 1 (PR #116, released 2026-10-29) shipped the features but kept the old page layouts. The founder reviewed production and found the interface unchanged. This round fixes that.
> Read [AGENTS.md](../../AGENTS.md), [README.md](README.md) (decisions R-01 to R-14 still hold) and [docs/governance/](../governance/README.md) first.

## Release rule

- A merge to `main` is a production release. All work goes into the draft PR whose head is `claude/loving-pasteur-z7ly65`.
- The founder sees the parity screenshots (below) before anything is merged to `main`.
- Migrations are additive only. Nobody deploys, runs remote D1 migrations, or touches production data or secrets.

## What went wrong in round 1 (do not repeat)

1. Screens were "rebuilt" inside the old page scaffold: a large marketing-style H1 and paragraph, a separate filter card, an inline create form under the list. The boards show none of that.
2. Nobody compared a screen with its board before merging.
3. Behaviour was coded without a feature row and user stories with acceptance criteria.

## The parity standard

A screen is done only when all of these hold:

1. **Layout matches the board.** Same regions in the same order and proportions: header, list-view header, action button group, list toolbar, table or board, side panels, sheets and dialogs. Density, spacing, type sizes and colours follow `docs/redesign/boards/lumi.css`, which already uses the Lumi tokens (`#F4F0E8` page, `#006093` accent, `#172033` text, Geist). Port its values into the app's styles; never link or copy `lumi.css` or board HTML.
2. **Patterns match the board.**
   - List screens use the list-view header: object icon, object label, list name with a selector, item count line, the action button group on the right, then search-in-list and the icon toolbar.
   - Create and edit open a **sheet or dialog**, never an inline form under the list.
   - Rows open a record page with breadcrumbs (R-03). Record pages have the highlights header, the path where the board shows one, and tabs or related lists as drawn.
   - Tables fill the width and freeze the leading columns (R-03). Panels on one row have equal height (R-04). Group labels never look like menu items (R-05).
3. **Data and words are the app's.** Terms from `nav.ts`, `roles.ts` and the CRM docs ("Công ty", not the boards' "Đối tác"). Real data only; empty states say what to do next. Board placeholders (`{{...}}`, "Dữ liệu minh họa") never appear in the app.
4. **Behaviour is unchanged unless a story says so.** Permissions, ownership scopes, versioning, audits and the HRM/Finance/CRM contracts in AGENTS.md stay as they are. Existing integration tests keep passing; update a selector only in the same commit that renames it.
5. **Proof: the parity screenshots.** For every screen, commit `docs/redesign/parity/<Board>/` with:
   - `board-1440.png`: the board rendered at 1440 px (the static board shows `{{...}}` placeholders; that is expected);
   - `app-vi-1440.png`, `app-en-1440.png`, `app-vi-390.png`: the app at those widths, signed in on the local Worker with realistic synthetic data (TEST names, never real people);
   - a line in your handoff: what matches, what differs and why.
   Use `node scripts/parity-shots.mjs` (workstream 1 adds it). Keep each PNG under 400 KB.

## Spec first (AGENTS rule: FDD, then stories, then code)

Before any screen code, each workstream commits, in one small docs commit:
- a row per screen in `docs/governance/FEATURES.md` (status *In redesign (ui#)*);
- a user story per screen in `docs/governance/USER-STORIES.md`, with **acceptance criteria that name the board and its regions**, the forbidden case and its denied test.
Code commits cite the story. Rows become *Live* only after the founder merges.

## Workstreams

| # | Branch | Boards | Also |
|---|---|---|---|
| 1 | `claude/ui1-shell` | TopNav, AppLauncher, Search, Notifications, SetupNav, AccountProfile, SetupNotifications | The shared kit every other workstream uses: global header (logo, search, create, help, bell, avatar menu), app nav bar with the launcher, list-view header, button group, list toolbar, sheet and dialog, record page frame (highlights, path, tabs, related list), form grid. `scripts/parity-shots.mjs`. Overview (`/workspace`). **Push the kit first, within your first slice**, and tell the integrator. |
| 2 | `claude/ui2-crm-lists` | Leads, LeadsKanban, Main, KanbanDrag, CloseDialog, DealsTable, Calendar, CalendarWeek, NewEvent, Tasks, Accounts, Contacts, Home, MobileKanban, MobileCalendar | CRM Today (Home board). Create Lead, opportunity, event and task open in sheets. |
| 3 | `claude/ui3-crm-records` | LeadRecord, LeadConvert, LeadConverted, DealRecord, AccountRecord, Settings | Contact record, CRM setup pages (playbooks, lead statuses, offers, commission, fulfillment, assignment, referrals, reports), and Tuyển dụng, HRM and Tài chính moved onto the new shell and kit (they have no boards: apply the same list, record and sheet patterns). |
| 4 | `claude/ui4-security` | SignIn, MobileSignIn, PasskeyEnrol, AntiPhishing, StepUp, Recovery, SetupSecurity, MobileSecurity, OrgSecurity, OrgAgents, AgentConsent, NotificationRules, NotificationRuleEdit, Webhooks, WebhookDetail, AuditLog, AuditEvent, MembersTeams, MemberDetail, Roles | **Passkey and anti-phishing ready (founder, 2026-10-30):** the enrol, verify, code, step-up and recovery flows work end to end for a person with no passkey yet, and production ships `WORKSPACE_PASSKEY_REQUIRED="true"` (manifest + generator, separate commit). Prove with integration tests that, with the switch on, a member with no passkey can sign in, enrol a first passkey, set a code and reach their module, and that an admin can open a recovery window for someone who lost theirs. |

Not built (excluded features, unchanged): Forecast, DealsTimeline, Import, Approvals, ApprovalDetail.

Search and the bell (TopNav board): build them only as real features. Search covers what the person may already list (CRM records within their ownership scopes, Workspace members for `users.manage`), through the existing scope functions, with allowed and denied tests. The bell lists the person's existing in-app notices. No placeholder results.

## Dependencies

- Workstreams 2, 3 and 4 write their spec commit first, then build against the kit once workstream 1 pushes it (fetch and merge `origin/claude/ui1-shell`). Until then, build the screen body only.
- Shared files change only in small separate commits: `src/lib/workspace/nav.ts`, `roles.ts`, `src/middleware.ts`, `wrangler.jsonc`, `infra/`, `package.json`/lockfile, `migrations/`, `docs/governance/*`, `docs/redesign/*`.

## Gates and merging

1. Gates on your branch after merging `origin/claude/loving-pasteur-z7ly65`: `npm run lint`, `npm test`, `npm run db:migrate:local`, `npm run build`, and the integration scopes you touch (`RUNLUMI_INTEGRATION_SCOPE=<scope> npm run test:integration`; run HRM phases as separate scopes). Report any gate you did not run as open.
2. Parity screenshots committed for every screen you finished.
3. `git checkout claude/loving-pasteur-z7ly65 && git merge --no-ff <your branch>` and push; on rejection fetch and retry. Never force-push, rebase, push to `main`, open another PR or deploy.
4. Handoff: `docs/redesign/handoff/<branch>.md` (round 2 section): screens done with their parity folder, gates with output, open items, founder decisions.

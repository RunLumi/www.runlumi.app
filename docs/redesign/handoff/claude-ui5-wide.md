# Handoff: workstream ui5, wide screens and founder-reported shell bugs (round 3)

- **Branch:** `claude/ui5-wide`, from `origin/main` at `9541d5a` (round 2 live)
- **Brief:** the integrator's round-3 request (2026-10-30) and the founder's production screenshots. Spec commit `cb5a2df` (feature rows and stories UI5-S1..S5 in [FEATURES.md](../../governance/FEATURES.md) and [USER-STORIES.md](../../governance/USER-STORIES.md#round-3-wide-screens-and-shell-fixes-ui5)).
- **Date:** 2026-10-30
- **Not done here:** no PR, no merge to `main`, no deploy. Behaviour, permissions and form field names are unchanged; no migration.

## What was built

| Commit | Story | What |
|---|---|---|
| `cb5a2df` | all | Spec: FEATURES rows and stories UI5-S1..S5 with acceptance criteria, forbidden cases and their checks. |
| `401d6c6` | UI5-S4 | Feed: the time follows the meta line instead of a fixed column, so titles use the width. Stage changes, skipped stages and playbook changes read as the playbook's stage labels in the current locale (`Mới → Đủ điều kiện tiếp cận`, `New → Qualified to approach`); an unknown key stays the key. Opportunity and company feeds. The opportunity route reads playbook versions once (it read them twice). Unit `tests/crm-activity.test.ts`. |
| `11202dd` | UI5-S1, S3, S5 | `scripts/parity-shots.mjs`: `--widths`, `--out`, `--no-board`, `--check` (page sideways scroll, `.ws-side` wider than its column, any `.ws-bg` past its container; exit 1), `--no-shots`. |
| `fecf3ae` | UI5-S1, S2, S3, S5 | Wide screens, launcher, ButtonGroup, side-nav and path overflow (below). |
| `532abee` | UI5-S1, S2 | Screenshots in `docs/redesign/parity/wide/` and the refreshed `docs/redesign/parity/AppLauncher/`. |
| (docs) | all | `docs/workspace/UI.md` kit notes; NFR-05 proof and new NFR-13; this handoff. |

### 1. Wide screens (UI5-S1)

- `.ws-page`, `.ws-frame` and `.ws-foot` grow to `--ws-max: 2560px` (was 1440 px). Gutters `--ws-gut`: 24 px, 32 px from 1800 px, 40 px from 2400 px. The two header rows use the same gutters and line up with the page once it stops growing.
- From 2400 px the body is zoomed by `--ws-z` = 1.125 (1.25 from 3200 px), so type and spacing scale together; every stylesheet uses px, so a root font size would not have scaled anything. Chromium's `zoom` also scales `vh`/`vw`, so the viewport limits (side nav, launcher, dialog, body min-height, calendar cells) divide by `--ws-z`; a browser that does not scale them only gets a slightly shorter limit.
- Already fluid and kept: panel rows (`auto-fit`, 300 px), tables (`width: 100%`), Kanban columns (`minmax(252px, 1fr)`), sheets (560/720 px).
- Record pages: related lists pack densely (`grid-auto-flow: row dense`), so half-width lists sit side by side around full-width ones (four across at 3840 px instead of half-empty rows). The activity rail grows from 340 px up to 480 px (24 % of the row).
- Calendar month cells grow with tall screens: `clamp(132px, (viewport height − 360 px) / 5, 220px)`; at 900 px tall it stays 132 px.
- 1280 and 1440 px: the variables equal the old values (24 px gutters; a 1440 px cap equals the viewport), and the rail's 24 % is under its 340 px minimum, so those layouts are as before.

### 2. Founder bugs

| Bug | Cause | Fix |
|---|---|---|
| a. Launcher tiles list every page | Tiles printed `visibleLinks(...)` joined with "·" | One equal tile per app (`grid-auto-rows: 1fr`): icon, name, one line from `launcherBlurbs` (ellipsis as a safety net). The filter keeps a tile when its name, line or any of its pages match, and shows a separate "Trang / Pages" list of matching pages (module › page, only pages the person may open, from `launcherPages`) only while it has text. Without script the tiles work and the filter stays hidden. |
| b. Activity actions overflow the rail | A bare `.ws-bg` (no wrap) with four small buttons, about 370 px in Vietnamese, in a rail about 300 px wide | `ButtonGroup` wraps (`flex-wrap`, `max-width: 100%`) and has `collapse`: those actions are buttons from 400 px of container width (container query) and items in the ⌄ menu below it. The rail shows Ghi cuộc gọi · Tạo công việc · ⌄ (Ghi chú, Ghi thời gian) when narrow, all four from 400 px (from about 1920 px wide windows). Same links, same sheets. |
| c. Feed titles in a narrow column | `.ws-feed-t` was a flex row with the time as a `nowrap` column | Time on the meta line. |
| d. Raw stage keys | `activitySummary` printed `body.from → body.to` | Stage labels from the playbook version (see `401d6c6`). |
| e. Side-nav horizontal scrollbar | The side-nav filter `<input>` keeps its intrinsic width (about 195 px) as its min-content width; the field became 245 px, the nav 263 px in a 260 px column | `width: 0` + `flex: 1` on inputs in search fields (global search, side-nav and launcher filters, list search). The fix removes the cause; no `overflow-x: hidden`. |
| (found by `--check`) Opportunity record scrolled sideways at 320/390 px (784 px) | The Path's visually hidden "done/to do" labels (`.crm-sr`, absolute) escaped the path's own scroller, which had no positioned ancestor | `position: relative` on `.ws-path`. |

Side nav checked in Quản trị (`/workspace/users`, `/workspace/audit`), HRM (`/hrm`, `/hrm/people`) and Tài chính (`/finance`, `/finance/settings`). CRM setup (`/crm/admin/playbooks`) uses the CRM tabs layout with its own setup menu, also checked.

## Verification

### Overflow check (the automated check for UI5-S1, S3, S5)

`node scripts/parity-shots.mjs <14 pages> --no-board --widths 320,390,1280,1440,1920,2560,3840 --check --no-shots` on a local Worker with TEST data (dev-bypass System Super Admin, a synthetic Finance book, a stage change and a note on one opportunity):

- Before the fixes: 11 problems (the opportunity Activity group past its container at every width; the page scrolling sideways at 390–2560 px).
- After: `--check: no overflow` on Overview, CRM Today, Leads, opportunity Kanban, calendar, an opportunity record, audit log, HRM people, Finance overview, CRM setup (playbooks), Users, HRM home, Finance settings and Companies, at all seven widths.
- The AppLauncher run (`--as sales_manager,employee`) also passed `--check` at 1440 and 390 px.

### Screenshots

`docs/redesign/parity/wide/<Page>/app-vi-{1920,2560,3840}.png` (Vietnamese, the first screen; 2560 and 3840 are scaled to 1920 px wide; all under 400 KB):
Overview, CrmToday, Leads, Kanban, Calendar, Opportunity, AuditLog, HrmPeople, Finance. AppLauncher: `docs/redesign/parity/AppLauncher/app-{vi,en}-1440.png`, `app-vi-390.png`.

What they show: at 2560 and 3840 px the header, page and footer use the width up to 2560 px; tables and the Kanban fill it; the record shows four related lists in one row and all four activity actions; the side navigation has no scrollbar.

### Gates

Run on `fecf3ae`+docs (code unchanged after), each integration scope on its own fresh local Worker and D1 (`scripts/run-integration.mjs`).

| Gate | Result |
|---|---|
| `npm run lint` | ok (646 source files) |
| `npm test` | 468 pass, 0 fail (9 new: `tests/crm-activity.test.ts`, launcher test in `tests/workspace-shell.test.ts`) |
| `npm run build` (astro check + build) | 0 errors, 0 warnings; build complete |
| Integration workspace | 15/15 |
| Integration crm | 19/19 |
| Integration finance | 9/9 |
| Integration security | 19/19 |
| Integration HRM phases | not run (no HRM file touched) |

## Open

1. **Other browsers.** The zoom step and the overflow check were verified in Chromium (Playwright 153). Firefox (126+) and Safari support `zoom`; how they scale `vh` inside it was not measured, and the worst case is a shorter side-nav or dialog limit above 2400 px.
2. **No real 4K monitor review.** Widths were emulated; the scale factors (1.125/1.25) are a judgement. A founder look on the 32" screen may want a different step.
3. **Not run:** HRM integration phases (no HRM file changed), JavaScript-off review of the launcher (the filter is script-only by design; tiles are links), measured contrast (NFR-08 stays open).
4. Pre-existing and left alone: the focused search fields draw the input's own focus ring inside the field's ring.

## Decisions needed

None blocking. Possible follow-ups for the founder: the zoom steps above 2400 px, and whether the activity rail should keep Ghi chú visible on narrow rails (today it moves into ⌄ with Ghi thời gian).

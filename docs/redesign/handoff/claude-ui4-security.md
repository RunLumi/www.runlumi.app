# Handoff: round 2, workstream 4 (`claude/ui4-security`)

Brief: [UI-PARITY.md](../UI-PARITY.md). Spec: [FEATURES.md § Round 2, workstream 4](../../governance/FEATURES.md) and [USER-STORIES.md § Round 2 security and admin](../../governance/USER-STORIES.md). Contract: [docs/workspace/security.md](../../workspace/security.md).

Status on 2026-10-30: Part A and Part B built; gates below. Nothing here is released until the founder merges the draft PR.

## Part A: passkey and anti-phishing ready

**Production now ships `WORKSPACE_PASSKEY_REQUIRED="true"`** (`infra/workspace.manifest.mjs`, then `wrangler.jsonc` regenerated in its own commit; staging stays `"false"`). The rollout table (what each person sees on the first visit) is in [security.md § Rollout](../../workspace/security.md#rollout-what-each-person-sees-on-the-first-visit-after-release).

| Path | How it works now | Proof (security IT, switch on) |
|---|---|---|
| Signed out | Private pages redirect to `/workspace/sign-in?next=…` (public, EN/VI). Sign-in is EmDash's own passkey or sign-in-link endpoint; no new credential or cookie. | "sign-in: signed-out visitors…" |
| First visit, no passkey | Verify page shows step 2 (create passkey). EmDash's real `/passkey/register/*` stores it. A guarded registration with user verification in the attestation counts as the session check, so step 3 (code) follows, then the page asked for. | "first visit: every role and every EmDash role below admin…" (11 roles × EmDash roles 10–40, real registration with a synthetic "none" attestation) |
| Denied on first visit | Pages 303 / APIs 401 before the check; code required before any page; a code equal to one's name refused; a second browser session cannot add another passkey; CMS-only accounts get 403. | "first visit, denied…" |
| Later sessions | A passkey sign-in through EmDash whose assertion carries user verification (flag read from the authenticator data EmDash just verified; credential must belong to the signed-in user) marks the session check: **no double prompt** (round-1 open item 4 closed). A presence-only assertion does not count. | "sign-in…" |
| Step-up | Dialog layout; still 5 minutes; now also before removing a passkey. | existing tests + "account security…" |
| Own passkeys, every role | My account › Security renames and removes through EmDash's `/_emdash/api/auth/passkey/:id`, which only needs a session (verified in EmDash 0.38 source: no role check) and acts on one's own passkeys. Removal needs step-up (middleware) and is audited (`passkey_removed`); EmDash keeps the last one. The `/_emdash/admin/settings/security` link is gone (its SPA page shows for every role, but we no longer depend on it). | "account security: every role renames and removes…" |
| Recovery | `/workspace/recovery` shows the steps and, signed in, the person's own state. The admin opens the window from Admin › Security in a dialog that requires "I met or video-called…" plus a reason; never for oneself; used once; the new passkey is the session check. | "recovery: someone who lost every passkey…", "adding a passkey in EmDash needs an existing one…" |

## Part B: screens and parity folders

Every folder is `docs/redesign/parity/<Board>/` with `board-1440.png`, `app-vi-1440.png`, `app-en-1440.png`, `app-vi-390.png` (synthetic TEST data on the local Worker). Shots were taken by `scripts/parity-shots.mjs` (workstream 1) against a local Worker; the signed-out, first-visit and step-up states were captured with sessions in those states.

| Board | Route | Matches | Differs, and why |
|---|---|---|---|
| SignIn, MobileSignIn | `/workspace/sign-in` | Card, brand, email, primary passkey button, secondary button, recovery link, anti-phishing note; full width at 390 px | The board's illustrated OS dialog is the browser's own. "Use a phone (QR)" is the browser's choice inside the same passkey prompt, so the secondary button is "Email me a sign-in link" (needs an EmDash email provider; otherwise it says to ask an admin). |
| PasskeyEnrol | `/workspace/verify?reason=session` (no passkey) | Brand, three-step header, create card with device panel, created card with rename and "Next" | Inside the Workspace shell (AGENTS.md: every private page renders in WorkspaceShell); the board shows a bare page. |
| AntiPhishing | `/workspace/account/security?setup=1` | Step 3, code card, email preview with the code band, warning line | Same shell note. |
| StepUp | `/workspace/verify?reason=step_up` | Dialog title per action, last-check age, the passkey to use, Cancel / Verify | A page drawn as a dialog over a dimmed area (no client modal), so it also works when a form POST redirects there. |
| Recovery | `/workspace/security?recover=<id>` (admin), `/workspace/recovery` (person, `app-*-person.png`) | Admin dialog: facts, identity checkbox, reason, Cancel / Open; person: steps with Done / Now / Then | **One admin**, not two (round-1 decision 3 still open). No "request" button for the person: they contact an admin. Other sessions are not signed out (EmDash keeps sessions; not listable). |
| SetupSecurity, MobileSecurity | `/workspace/account/security` | Crumbs, passkey table with Add / Rename / Remove, the "keep one" note, code panel with Show / Change (sheet), session panel, AI agents panel; grouped lists at 390 px | Sessions: only "this session" (EmDash cannot list others). The mobile bottom tab bar belongs to the shell (ui1). |
| OrgSecurity | `/workspace/security` | Crumbs, attention tables (second passkey, single admin), policy sections Sign-in / Step-up / Recovery with Fixed / Required badges | No "Save policy": every value is fixed in code. No allowed-passkey-type switches, no "send reminder", no "choose second admin" (System Super Admin is EmDash role 50). |
| OrgAgents | `/workspace/agents` | Module rows with Off / Read / Read and write segmented controls, never-available panel, connected agents with Member and Agent frozen, revoke | No departments column, no bulk select, no OAuth address (personal bearer tokens). The board's "always needs a person's confirmation" panel is replaced by what agents can never reach: a write-confirmation flow does not exist. |
| AgentConsent | `/workspace/account/agents/connect` | Agent ↔ Lumi header, "agent receives" table (asked vs granted under the org levels), what stays with you, connection details, Cancel / Allow with passkey | Creates the existing personal CRM token (CRM members only, 403 otherwise) and shows the secret once; no OAuth callback or device line. |
| NotificationRules | `/workspace/notifications` | Header with Create rule, quick filters (All, On, Delivery errors, Off), failure banner, search, table with the name frozen | — |
| NotificationRuleEdit | `/workspace/notifications/<id>` | Crumbs, status line, Turn off / Save in the header, numbered sections, preview column | No "3. Remind before" (no date-based reminders) and no "Send test"; the preview describes the message structure instead of a fake record. |
| Webhooks | `/workspace/webhooks` | Header, quick filters by status and platform, failure banner, search, table with the name frozen; Create Webhook opens a sheet | No "custom URL" platform (not supported). |
| WebhookDetail | `/workspace/webhooks/<id>` | Crumbs, status, Pause/Resume and Remove, failure banner, configuration, rules that send here, delivery log with All / Failed | No signing-key panel (Slack/Discord/Teams incoming webhooks have none), no resend, no URL edit. |
| AuditLog | `/workspace/audit` | Header with Export CSV (lock), quick filters, filter row, table with Time and Who frozen, Kind column | — |
| AuditEvent | `/workspace/audit/<id>` | Title, meta with outcome, who panel, changes as before/after when the event records them, same-person timeline, event ID | No IP or device (not recorded). |
| MembersTeams | `/workspace/users` | Header with View roles / Add member, quick filters incl. missing second passkey and has AI agent, search, frozen name column | Members only: no groups, departments or invitations tabs (no model). No bulk actions or member CSV. |
| MemberDetail | `/workspace/users/<id>` | Highlights row, single-passkey warning, information, roles and permissions, passkeys (no credential IDs), AI agents, recent activity, change roles | Admins cannot remove someone's passkey (only the person; EmDash 0.38). No sessions panel. |
| Roles | `/workspace/roles` | Header, role list, grouped matrix with Yes / Own / No and * for step-up | Read-only: no Create or Copy role (roles live in code). |

Shared files changed in their own commits: `src/middleware.ts`, `infra/workspace.manifest.mjs`, `wrangler.jsonc`, `docs/governance/*`. No migration. Screens are built on the round-2 kit (`RecordHeader`, `DataTable`, `Sheet`, `Dialog`, `FormGrid`/`FormField`, `ListToolbar`, `ws-btn`, `ws-badge`, `ws-chips`); `src/styles/workspace-security.css` holds screen layout only.

## Gates

Run on `ae7e104` (ui4 + `origin/claude/loving-pasteur-z7ly65` @e16f004, which contains ui1 @cd0d414 and ui2), integration with `WORKSPACE_PASSKEY_REQUIRED=true`:

| Gate | Result |
|---|---|
| `npm run lint` | ok (641 source files) |
| `npm test` | 462 pass, 0 fail |
| `npm run db:migrate:local` | ok (no new migration) |
| `npm run build` | ok, `astro check` 0 errors |
| Integration: security | 19/19 |
| Integration: workspace | 15/15 (after ui1's b8dbd23) |
| Integration: crm, api, finance, files, directory, dashboard, sales-process, business-model | 19, 7, 9, 6, 7, 5, 12, 5: all pass |
| Integration: HRM P1, P3, P4 (separate scopes) | pass |
| Integration: HRM P5 | first run: test 4 failed on `SQLITE_BUSY` (the local D1 file locked while the test's wrangler CLI read it; no assertion failed); one re-run: see P5_RERUN |
| Integration: hrm-journey | not run (round-1 note: known container flake) |
| Parity screenshots | 20 boards, each under 400 KB |

## Open items and founder decisions

1. **Email provider.** Sign-in links and notification email need an EmDash email provider. Without one, a person with no passkey signs in through an admin's invite or recovery link.
2. **Two-admin recovery** (boards) versus one admin with identity confirmation (built).
3. **Board items without a back end** (FEATURES.md "Not planned"): session list and "sign out other sessions", departments, groups, invitations, reminders, send test, signing keys, agent write confirmation, OAuth MCP.
4. **ui1 tests** 7–9 in the workspace scope failed on the first merge; ui1 fixed them in b8dbd23 and the scope now passes 15/15.
5. **Kit follow-up.** ui4 screens use the kit's headers, tables, sheets, dialogs, fields, toolbar, buttons, badges and quick filters. `workspace-security.css` keeps screen layout only (auth card, steps, policy rows, email preview, timeline, panels). The step-up "dialog" is a page drawn as a dialog, not the kit `Dialog`, so it works as a redirect target.

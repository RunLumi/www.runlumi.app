# Handoff: workstream 4, security and integrations (`claude/rd4-security`)

Status on 2026-10-29: done. All six slices built, reviewed (pre-release review found no blocker; its two defects are fixed in e3e6942), and merged into `claude/loving-pasteur-z7ly65`. Gate results and open items are below. Contract reference: [docs/workspace/security.md](../../workspace/security.md).

## What was built

| # | Slice | Result |
|---|---|---|
| 1 | Step-up re-verification | `stepUpGuard` / `requireStepUp` (`src/lib/workspace/step-up.ts`, `passkey.ts`). The person touches one of their own EmDash passkeys, with user verification required. It is valid for 5 minutes and stored in the EmDash session, bound to the user ID. `/workspace/verify` (EN/VI) and `/api/workspace/passkey/{options,verify}`. Every attempt is audited.<br>Wired into: access changes (rd1's `handleAccessPost`), CRM token creation, hiring CSV export, application/role/question delete and retention purge, Finance report export, HRM report, snapshot and self exports, audit CSV, and every admin security screen below. |
| 2 | Passkey for Workspace access, anti-phishing code | The middleware and the Finance boundary require a passkey check in the current session (12 h) on every private page and API: pages get a 303, APIs a 401 `passkey_required`.<br>Every page then requires the person's own anti-phishing code (Tài khoản của tôi › Bảo mật, `/workspace/account/security`).<br>`src/lib/workspace/email.ts` composes every app email with the code as its first line, and composes nothing without a code.<br>Adding a passkey through EmDash needs step-up, except the account's first passkey or inside a 24 h admin recovery window (Admin › Bảo mật).<br>Admin › Bảo mật lists passkey, second-passkey and code coverage per member. |
| 3 | Audit log review | Admin › Nhật ký kiểm toán (`/workspace/audit`, EN/VI): `workspace_audit`, plus the Finance audit history when Finance is ready (export chunks excluded).<br>Quick filters, plus filters for person, module, outcome, source, dates and text, with cursor paging. Full-width `DataTable` with Time and Who frozen; each row opens the event child screen with breadcrumbs.<br>The CSV export (≤5,000 rows) needs step-up and is itself audited. `workspace_audit` is now append-only by trigger. |
| 4 | Notification rules, Slack/Discord/Teams | Admin › Quy tắc thông báo and Admin › Webhook (list and child screens, EN/VI).<br>Rules: CRM events, safe conditions (playbook, minimum value, outcome), email recipients (record owner, Super Admins, roles, people) and webhooks. Each recipient gets only records their own CRM access shows. Rules are versioned and audited.<br>Webhooks: URLs are validated per platform, sealed with AES-GCM using `WORKSPACE_WEBHOOK_KEY`, and shown masked. Content is the Lark card, so every Lark privacy rule holds, with mentions disabled. Delivery runs on the existing 10-minute cron, each target is claimed once, and 10 failures in a row pause the webhook.<br>The existing Lark bot is unchanged. |
| 5 | MCP beyond CRM | Admin › AI agent: per-module levels (CRM off/read/write, Workspace off/read) are enforced on REST and MCP at every call, and `tools/list` is filtered to match.<br>New Workspace module tool `workspace_my_access`. Every tool call is audited (`agent_tool_called`, via `mcp`/`api`, outcome, token, never arguments).<br>Admins see every token with its calls and refusals over 7 days, and can revoke behind step-up. |
| 6 | IaC | `infra/workspace.manifest.mjs` → `scripts/generate-wrangler.mjs` (`--check`, `--plan`). Production section is byte-identical to before.<br>`env.staging`: `lumi-workspace-app-staging`, `lumi-workspace-{jobs,content}-staging` D1 and `lumi-workspace-{files,blog-media}-staging` R2, all APAC. It has no routes and no crons, Finance and HRM are off, and D1 IDs are placeholders. `tests/iac.test.ts` covers it. |

Migrations (additive): `0051_workspace_security` (audit columns and append-only triggers), `0052_workspace_anti_phishing` (codes, recovery windows), `0053_workspace_notifications`, `0054_workspace_agent_modules`. Renumber them if another branch lands 0051+ first.

Shared files changed in their own commits: `package.json`/lock (declare `@emdash-cms/auth@0.38.0`, already installed transitively), `migrations/`, `src/middleware.ts`, `src/lib/workspace/nav.ts`, `src/worker.ts`, `wrangler.jsonc`. `origin/claude/rd1-shell` was merged in; its `handleAccessPost` now carries the step-up guard.

## For workstreams 2 and 3

- Step-up is ready. Merge `origin/claude/rd4-security` and call `stepUpGuard(context)` after the permission and origin checks (see [security.md](../../workspace/security.md#using-step-up-in-your-route-workstreams-2-and-3)).
- Integration sessions pass the passkey and code gates automatically, through `tests/integration/helpers.mjs`. `rawGet`/`rawPost` skip that, so a test can assert a denial.
- HRM deletes and CRM deletes other than those listed above are **not** wired yet. Wire them in your area, or leave a "step-up pending" note.

## Gates (run on e3e6942, which contains rd1–rd3 through cca4cb9; only rd1's handoff doc was added since)

Integration ran with `WORKSPACE_PASSKEY_REQUIRED=true` in the test Worker (production ships `"false"`).

| Gate | Result |
|---|---|
| `npm run lint` | ok (593 source files) |
| `npm test` | 453 pass, 0 fail |
| `npm run db:migrate:local` | 0051–0056 applied (0055 is rd3's) |
| `npm run build` | ok, `astro check` 0 errors |
| Integration: security (rd4) | 12/12 |
| Integration: crm, workspace, api, finance, files, directory, dashboard, sales-process, business-model | 18, 12, 7, 9, 6, 7, 5, 12, 5: all pass |
| Integration: HRM P1, P3, P4 (separate scopes) | pass |
| Integration: HRM P5 | passed on the rd1+rd2 head (enforcement off at the time); rerun with enforcement on was still running at merge time |
| Integration: hrm-journey | not rerun; the integrator reports `hrm-recovery-drill.mjs:279` as a known container flake that passes on GitHub |
| Visual review | 10 screens × 360 px and 1280 px (EN/VI): no horizontal overflow, visible keyboard focus (Playwright, synthetic data) |

## Open

1. **HRM.** The P4 `close_run` failure was pre-existing and date-dependent; the integrator fixed it in 18bec37. A single full `hrm` scope can exceed the runner's 30-minute cap on this container, so the phases ran as separate scopes.
2. **Email delivery.** The app sends no email, and no EmDash email provider is configured in `astro.config.mjs`. Rules record email as `email_not_configured`. EmDash's own system emails (magic link, invite, recovery) bypass plugin hooks, so they cannot carry the code without an EmDash change.
3. **Recovery uses one admin, not two.** The boards ask for two admins. The Workspace often has one System Super Admin, so one admin plus an EmDash recovery link is implemented. EmDash 0.38 cannot delete another person's passkeys.
4. **Double prompt at sign-in.** EmDash does not record the sign-in method, so a passkey sign-in is asked once more by the Workspace, once per session.
5. **Not built from the boards:** department recipients (no department model outside HRM data), "send test" for webhooks, re-sending failed deliveries from the UI, editing a webhook URL (remove and add instead), "remind members" on the security page, agent write-confirmation flow (AgentConsent), OAuth MCP connection, and per-person module grants (levels are organisation-wide).
6. **Staging** cannot deploy until the founder creates its resources (`node scripts/generate-wrangler.mjs --plan`) and pastes the D1 IDs. The Cloudflare adapter's `SESSION` KV binding for staging is unverified.

## Release safety (integrator request, 2026-10-29)

**From release, step-up is always on:** a person without an EmDash passkey must add one at `/workspace/verify` or **My account › Security** before exports, deletes, access changes or API token creation. Failed passkey checks are limited to 10 per person per 15 minutes (`429`), and nothing more is audited while limited.

R-08 enforcement ships **off** behind `WORKSPACE_PASSKEY_REQUIRED` (production and staging `"false"`), so merging cannot lock anyone out. With it off: no session passkey check, no code gate, no EmDash registration guard. Step-up, the audit log, notification rules, agent levels and the account security page still work. Turning it on is documented in [security.md](../../workspace/security.md#deployment-switch-workspace_passkey_required).

## Decisions needed from the founder

1. **Email provider** for notification email (and whether EmDash should send its own mail through it). Until then, rules deliver by webhook only.
2. **`WORKSPACE_WEBHOOK_KEY`.** Set it as a Worker secret (≥32 random characters) to enable Slack, Discord and Teams. It is optional; preflight does not require it.
3. **Recovery with two admins**, or keep one admin plus a reason, as built.
4. **HRM and hiring for agents.** AGENTS.md forbids tokens reaching hiring, and the HRM spec requires a separate HRM token and scope. Both stay excluded. Building an HRM agent token is a separate decision.
5. **Session length.** 12 h is assumed (the board says "chưa chốt").
6. **When to turn on R-08 enforcement** (`WORKSPACE_PASSKEY_REQUIRED="true"`). Admin › Security shows who still lacks a passkey or code. Until then, R-08 is built but not enforced.

# Workspace security: passkeys, step-up and the audit log

Owner: redesign workstream 4 (`claude/rd4-security`). Decisions R-08 to R-12 in
[docs/redesign/README.md](../redesign/README.md) apply. AGENTS.md wins on any
conflict.

## What EmDash provides (verified against `emdash@0.38.0`)

| Capability | EmDash 0.38 | Used here |
|---|---|---|
| Sign-in methods | Passkey (`/_emdash/api/auth/passkey/*`), magic link, invite, OAuth (GitHub/Google when configured), dev bypass (local only) | EmDash stays the only sign-in. |
| Passkey storage | `credentials` table in `CONTENT_DB` (SEC1 public key, COSE algorithm, signature counter, transports, name, `last_used_at`) | Read for verification; counter and `last_used_at` updated exactly as EmDash's adapter does. |
| Add a passkey | `POST /_emdash/api/auth/passkey/register/{options,verify}` for any signed-in user, `X-EmDash-Request: 1` header, maximum per user enforced by EmDash | The Workspace passkey page calls these endpoints, so the passkey is EmDash's. |
| Sign-in method in the session | **Not recorded.** The session holds only `{ user: { id } }`. | The Workspace therefore asks for its own passkey check once per session (below). |
| Passkey library | `@emdash-cms/auth/passkey` (`generateAuthenticationOptions`, `verifyAuthenticationResponse`) | Same library, user verification required. |
| Admin recovery | `POST /_emdash/api/admin/users/:id/send-recovery` emails a sign-in link | See "Recovery" below. |

No password, second login, or app-owned cookie is added. The Workspace keeps
two facts in the existing EmDash (Astro) session, each bound to the user ID:
the time of the last Workspace passkey check and the credential used.

## Rules

1. **Workspace passkey check (R-08).** Every private Workspace page and API
   (`/workspace`, `/admin/jobs`, `/crm`, `/hrm`, `/finance`, `/api/admin`,
   `/api/hrm`, `/api/finance`) requires one passkey check in the current
   EmDash session, at most 12 hours old. Pages redirect to
   `/workspace/verify?reason=session`; APIs answer `401 {"error":{"code":"passkey_required"}}`.
   A person with no passkey adds one on that page first. There is no opt-out.
   Because EmDash does not record how the session signed in, a passkey sign-in
   is asked once more by the Workspace (once per session).
2. **Anti-phishing code (R-08).** After the passkey check, every page needs the
   person's own code (Tài khoản của tôi › Bảo mật, `/workspace/account/security`).
   4–20 letters, numbers and spaces; not their name or email. Changing it needs
   step-up. The audit log records that it changed, never the value.
3. **Step-up.** Exports, deletions, access changes and API token creation need
   a passkey check from the last **5 minutes**. Failed attempts are audited.
4. **Audit.** Every passkey check (success or failure), access change, export
   and agent call is a row in the append-only `workspace_audit` table.

## Using step-up in your route (workstreams 2 and 3)

Server guard, after the permission and same-origin checks and before reading
data or the form:

```ts
import { stepUpGuard } from "../lib/workspace/step-up";

const stepUp = await stepUpGuard(context);          // APIContext or { session, locals, request, url }
if (stepUp) return stepUp;                          // 303 to /workspace/verify, or 403 JSON for fetch()
```

In an Astro page loader use `stepUpGuard({ session: Astro.session, locals: Astro.locals, request: Astro.request, url: Astro.url }, { vi, next: Astro.url.pathname })`.
Inside CRM `handlePost` handlers call `await requireStepUp(astro.session, ctx.actor.id)`;
`handlePost` turns the thrown `StepUpRequiredError` into the redirect.

A browser navigation returns to the page that started the action (same-site
`Referer`, else `next`) after verifying; the person submits again. A `fetch()`
caller (Accept or Content-Type `application/json`) receives
`403 {"ok":false,"error":{"code":"step_up_required","verify":"/workspace/verify?..."}}`.

To show the state before submitting, `stepUpRemaining(Astro.session, user.id)`
returns the seconds left (0 = a check will be asked for).

Wired today: `/workspace/users` (grant, update, revoke), CRM token creation
(`/crm/api`), hiring CSV export, application delete, retention purge, role
and question delete, Finance report export, HRM report, snapshot and personal
data exports.

## Tests

`tests/support/synthetic-passkey.mjs` is a P-256 authenticator that signs real
assertions. Integration sessions (`tests/integration/helpers.mjs`) register it
in EmDash's `credentials` table on first use and run the real
options/verify ceremony whenever the server asks for a passkey check, then
retry the same request with the same `request_key`. `rawGet`/`rawPost` skip
the retry so a test can assert the denial itself.

## Adding passkeys and recovery

- For Workspace people (members, including revoked ones, and System Super
  Admins), the middleware guards EmDash's `/_emdash/api/auth/passkey/register/*`:
  - the first passkey of an account is allowed (trust comes from the EmDash
    sign-in, as in EmDash itself);
  - another passkey needs step-up with an existing one;
  - or a 24-hour recovery window an admin opened on **Admin › Security**
    (never for oneself, reason required, used once, audited).
- Every passkey added is audited (`passkey_added`).
- Recovery: the admin confirms who the person is, opens the window, then sends
  an EmDash recovery sign-in link (EmDash admin › Users). EmDash 0.38 cannot
  delete another person's passkeys, and there is no SMS or emailed code.
- People outside the Workspace (CMS-only accounts) are left to EmDash.

## Email and the anti-phishing code

- This app itself sends no email today, and `astro.config.mjs` configures no
  EmDash email provider, so EmDash's own system emails (magic link, invite,
  recovery) are not sent in production either. EmDash system emails skip
  plugin hooks, so they could not carry the code without an EmDash change.
- `src/lib/workspace/email.ts` is the only way this app composes email: the
  recipient's code is the first line, text is plain, links stay on
  runlumi.app, and no code means no email.
- Notification rules use it. Until an email provider is chosen (founder
  decision), email deliveries are recorded as `email_not_configured`.

## Notification rules and webhooks (R-09)

- **Admin › Notification rules**: CRM events (the same kinds the Lark bot
  announces), safe conditions (playbook, minimum expected value, outcome),
  channels (email, webhooks) and internal recipients (record owner, System
  Super Admins, roles, people). Each recipient gets only records their own CRM
  access shows. Versioned (stale edits refused), audited, step-up to save.
- **Admin › Webhooks**: Slack, Discord and Microsoft Teams (Workflows or
  Office 365 connector) incoming webhooks, next to the built-in Lark bot
  (unchanged, configured by Worker secrets).
  - URLs are validated per platform, sealed with AES-GCM using the
    `WORKSPACE_WEBHOOK_KEY` Worker secret (≥32 characters, optional) and shown
    only as a hint. Without the key nothing can be added or sent.
  - Content is the Lark card (`src/lib/crm/lark/cards.ts`): no contact phone
    numbers or emails, free text excerpted and masked, discovery values never
    sent; mentions disabled on every platform.
  - Delivery runs on the existing ten-minute cron, each (rule, event, target)
    is claimed once, and ten failures in a row pause the webhook.
- Department-based recipients are not offered: the Workspace has no
  department model outside HRM employment data.

## AI agents (R-10)

See [docs/crm/API.md §5](../crm/API.md). Admins set per-module levels on
**Admin › AI agents**; every call is audited.

## Audit log review (R-11)

**Admin › Audit log** (`/workspace/audit`, users.manage) lists `workspace_audit`
and, when Finance is set up, the Finance audit history (export chunks
excluded), newest first, with quick filters, person, module, outcome, source,
dates and text. A row opens the event. CSV export (`/api/workspace/audit/export.csv`,
up to 5,000 rows, formulas neutralised) needs step-up and is itself audited.
`workspace_audit` is append-only by trigger from migration 0051.

## Infrastructure manifest (R-12)

`infra/workspace.manifest.mjs` → `node scripts/generate-wrangler.mjs` writes
`wrangler.jsonc`; `--check` fails when it is out of date (unit-tested);
`--plan` prints, never runs, the staging provisioning commands. Production
names and IDs are unchanged. `env.staging` uses `lumi-workspace-*-staging`
resources in APAC, `workers_dev` only, no routes, no crons, Finance and HRM
off, and placeholder D1 IDs until the founder creates the databases.

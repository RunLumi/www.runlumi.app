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

1. **Workspace passkey check (R-08, slice 2).** Every private Workspace page and API
   (`/workspace`, `/admin/jobs`, `/crm`, `/hrm`, `/finance`, `/api/admin`,
   `/api/hrm`, `/api/finance`) requires one passkey check in the current
   EmDash session, at most 12 hours old. Pages redirect to
   `/workspace/verify?reason=session`; APIs answer `401 {"error":{"code":"passkey_required"}}`.
   A person with no passkey adds one on that page first. There is no opt-out.
2. **Step-up.** Exports, deletions, access changes and API token creation need
   a passkey check from the last **5 minutes**. Failed attempts are audited.
3. **Audit.** Every passkey check (success or failure), access change, export
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

## Recovery

EmDash 0.38 lets an admin email a recovery sign-in link but not remove another
person's passkeys. See the handoff for the recovery decision the founder needs
to make.

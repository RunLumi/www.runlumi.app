# CRM runbook: migration, release, recovery

Keep this short and runnable. Never paste secret values into a terminal argument, a file in the repository, a PR body or a log. Pipe them through stdin.

## 1. Configuration

| Where | Name | Purpose |
|---|---|---|
| Worker `runlumi` secret | `CRM_INTAKE_SECRET` | HMAC key for `POST /api/intake/local` (≥32 chars). The endpoint returns 503 if it is missing. |
| Pages project `lumi-local` secret | `CRM_INTAKE_SECRET` | The same value, used to sign forwarded enquiries |
| Pages project `lumi-local` secret | `CRM_INTAKE_URL` | `https://runlumi.app/api/intake/local` (allowlisted origins only) |

Generate the secret once and set it on both sides without echoing it:

```bash
umask 077; openssl rand -hex 32 > /tmp/crm-intake.key
./node_modules/.bin/wrangler secret put CRM_INTAKE_SECRET < /tmp/crm-intake.key
(cd ../local.runlumi && ./node_modules/.bin/wrangler pages secret put CRM_INTAKE_SECRET --project-name lumi-local < /tmp/crm-intake.key)
printf '%s' 'https://runlumi.app/api/intake/local' | (cd ../local.runlumi && ./node_modules/.bin/wrangler pages secret put CRM_INTAKE_URL --project-name lumi-local)
rm -P /tmp/crm-intake.key
```

To rotate, repeat with a new value. Enquiries sent while only one side has the new value are not stored in the CRM, but Discord still receives them, marked "CRM: NOT stored". Rotate when traffic is quiet.

## 2. Migration `0003_crm_sales.sql`

The migration is additive. It creates the new tables, seeds the versioned playbooks, offers and gate policy, and copies `crm_leads` into the new model. It does not modify or drop `crm_leads` or `crm_activities`.

Before applying it in production:

```bash
./node_modules/.bin/wrangler d1 export lumi-jobs --remote --output backups/lumi-jobs-$(date +%Y%m%d-%H%M).sql
./node_modules/.bin/wrangler d1 execute lumi-jobs --remote --command "SELECT COUNT(*) FROM crm_leads; SELECT COUNT(*) FROM crm_activities"
```

`backups/` is git-ignored. Store the export privately; it contains personal data.

Apply the migration, then verify counts and preservation:

```bash
npm run db:migrate
./node_modules/.bin/wrangler d1 execute lumi-jobs --remote --command "SELECT (SELECT COUNT(*) FROM crm_leads) leads, (SELECT COUNT(*) FROM crm_opportunities WHERE needs_review = 1) migrated, (SELECT COUNT(*) FROM crm_ledger) ledger, (SELECT COUNT(*) FROM crm_playbooks) playbooks, (SELECT COUNT(*) FROM crm_offers) offers"
```

Expected results:

- `migrated` equals `leads`;
- `ledger` is 0 right after migration;
- there are 4 playbooks and 5 offers.

Local proof uses synthetic legacy rows in an isolated directory:

```bash
D=$(mktemp -d); W=./node_modules/.bin/wrangler
for f in 0001_jobs_ats 0002_crm; do $W d1 execute lumi-jobs --local --persist-to $D --file migrations/$f.sql; done
# insert synthetic crm_leads / crm_activities rows, then:
$W d1 execute lumi-jobs --local --persist-to $D --file migrations/0003_crm_sales.sql
```

**Recovery.** The new tables are independent of the 0002 tables. Choose the step that fits:

- **Code defect.** Roll the Worker back with `wrangler rollback <previous-version-id>`. The previous build's `/crm` reads only `crm_leads`, which still exists. CRM data entered after the migration stays in the new tables and comes back with a redeploy.
- **Unusable migration result.** Restore from the export taken above, into a new database or after confirming nothing new needs to be kept. Never drop tables that hold new records without exporting them first.

### Migration `0004_crm_commission.sql`

The migration is additive:
- it adds `crm_opportunities.referrer_id`;
- it creates `crm_seller_terms` and `crm_commission_payouts`;
- it seeds `local-commission@1` with status `proposed`.

Nothing becomes payable until an admin saves an approved version on `/crm/commission`. Take a backup and apply it in the same way as 0003.

## 3. Local gates

Use Node ≥22.18. On Node 22.14, prefix the test commands with `NODE_OPTIONS=--experimental-strip-types`.

```bash
npm run lint
npm test
npm run db:migrate:local
npm run build
git diff --check
```

Integration run against a real local Worker, D1 and EmDash:

```bash
export LUMI_PERSIST_TO=$(mktemp -d)
./node_modules/.bin/wrangler d1 migrations apply lumi-jobs --local --persist-to $LUMI_PERSIST_TO
printf 'CRM_INTAKE_SECRET=%s\n' local-test-secret-not-for-production-0123456789 > .dev.vars
./node_modules/.bin/astro dev --port 4391 &   # same LUMI_PERSIST_TO
npm run test:integration
```

The tests sign in through EmDash's development login and real magic links (captured by `/_emdash/api/dev/emails`). They create synthetic `TEST` users and records only in the isolated directory, and refuse to run against non-local URLs.

## 4. Intake release (two repositories)

1. Deploy the CRM first (§6) with `CRM_INTAKE_SECRET` set. Check that `POST /api/intake/local` without a signature returns 401/403, not 503.
2. Set `CRM_INTAKE_SECRET` and `CRM_INTAKE_URL` on Pages project `lumi-local`.
3. Merge the local.runlumi adapter PR. Its release workflow deploys `main`. Confirm the deployment and that `/` and `/en/` are served.
4. The first real enquiry appears in **CRM → Admin → Website enquiries**. Do not send a synthetic production enquiry unless the user asks; it would create a CRM record and a Discord notification.

Adapter behaviour:

- Success means the CRM confirmed storage **or** Discord confirmed delivery.
- The CRM call retries once on network errors, 429 or 5xx, with the same idempotency key.
- A repeated identical submission on the same day is acknowledged without a second Discord message.
- If neither side confirms, the form reports failure.

## 5. Browser review checklist

- Widths 320, 390–430, 1280 and ≥1440, in both locales. Switching locale keeps the same record and filters.
- No horizontal page scroll; wide tables scroll inside their sheet.
- Keyboard: skip link, visible focus, every action is a native form control.
- Reduced motion: no animation.
- No JavaScript: every flow is a server-rendered form. CRM pages ship no client scripts. EmDash's content toolbar is hidden on CRM pages.

## 6. Production release record

Release on 2026-10-07 (Asia/Ho_Chi_Minh).

| Item | Value |
|---|---|
| CRM PR / merge SHA | RunLumi/www.runlumi.app#27 → `423c961`. Head `b90df7a` passed hosted CI (lint, test, local migration, build). |
| Backup before migration | `backups/lumi-jobs-pre-0003.sql` (private, git-ignored) |
| Migration applied | `0003_crm_sales.sql` remote. Afterwards: 4 playbooks, 5 offers, 1 policy, 0 legacy leads to migrate, 0 ledger rows, ATS applications unchanged (6) |
| Worker version | `5048364f-8d3c-4e85-a596-9a8e81d977e0` (`npm run deploy` from `423c961`; preflight confirmed `CRM_INTAKE_SECRET`) |
| local.runlumi PR / merge SHA / deployment | RunLumi/local.runlumi#71 → `437e7da`. "Deploy production" run 37579543784 succeeded. Pages deployment `16798958-a1c3-4320-b35c-3acb8aeca982`. |
| Verified in production (no session) | `/`, `/jobs`, `local.runlumi.app/`, `/en/` and `/nganh/garage/` return 200. `/crm`, `/vi/crm`, `/crm/admin`, `/admin/crm` and `/crm/<id>` redirect (303) to EmDash sign-in. `POST /api/intake/local` returns 403 for an unknown source and 401 for a bad signature (not 503, so the secret is present); `GET` returns 405. The local.runlumi enquiry endpoint still rejects invalid fields (400). |
| Not yet verified in production | Authenticated CRM flows: EmDash sign-in needs a passkey or email link held by the user. No synthetic enquiry, customer or transaction was created in production. |

## 7. Workspace roles migration (`0005_workspace_roles.sql`)

The migration is additive:
- it creates `workspace_members`, `workspace_roles` and `workspace_audit`;
- it copies every `crm_members` row into the Sales Executive role, keeping the enabled flag;
- it turns `crm_capabilities` rows into the Finance and Fulfillment roles;
- it adds `author_id` and `actor_id` to the hiring notes and events.

`crm_members` and `crm_capabilities` are left untouched and are no longer read.

Back up before applying:

```bash
./node_modules/.bin/wrangler d1 export lumi-jobs --remote --output backups/lumi-jobs-pre-0005.sql
```

Verify after applying:

```bash
./node_modules/.bin/wrangler d1 execute lumi-jobs --remote --command "SELECT (SELECT COUNT(*) FROM crm_members) old, (SELECT COUNT(*) FROM workspace_members) new, (SELECT COUNT(*) FROM workspace_roles) roles"
```

`new` must equal `old`. HR staff need the HR role granted on `/workspace/users`; before this change, hiring required the EmDash admin role.

### Release record: Workspace roles (2026-10-08)

| Item | Value |
|---|---|
| PR / merge SHA | RunLumi/www.runlumi.app#31 → `e236272`. Hosted CI did not start (Actions budget). The same gates ran locally on head `58cc522`: lint, 55 unit tests, local migration, build, plus 6/6 Workspace and 14/14 CRM integration blocks on a real Worker, D1 and EmDash. |
| Backup | `backups/lumi-jobs-pre-0005.sql` (private, git-ignored) |
| Migration | `0005_workspace_roles.sql` applied to the remote database: 0 CRM members → 0 Workspace members (none existed yet); 9 applications unchanged |
| Worker version | `11b36e6c-f37f-448d-93ac-ddc87270ce8b` at 100% (`npm run deploy` from `e236272`) |
| Verified without a session | `/` and `/jobs` return 200. `/workspace`, `/workspace/users`, `/admin/jobs`, `/admin/jobs/applications`, `/crm`, `/crm/commission`, `/admin/crm` and their `/vi` peers redirect (303) to EmDash sign-in. Hiring APIs return 401. Intake rejects an unknown source. New routes returned 404 for under a minute while the version propagated, then served correctly. |
| Pending (needs the owner's EmDash session) | Sign in as Admin, grant roles on `/vi/workspace/users`, then check the navigation and hiring desk with a real HR account and a real sales account |


## 8. Hiring interviews migration (`0006_hiring_interviews.sql`)

The migration is additive. It creates `application_interviews` and `application_scorecards`, and both are deleted together with their application. Back up first with `wrangler d1 export … --output backups/lumi-jobs-pre-0006.sql`, then run `npm run db:migrate`. No existing rows change.

### Release record: hiring interviews, scorecards, retention, bilingual careers (2026-10-08)

| Item | Value |
|---|---|
| PR / merge SHA | RunLumi/www.runlumi.app#33 → `ec73674`. Hosted CI did not start (Actions budget). Local gates passed: lint, 60 unit tests, local migration, build, plus 8/8 Workspace and 14/14 CRM integration blocks. |
| Backup / migration | `backups/lumi-jobs-pre-0006.sql`; `0006_hiring_interviews.sql` applied remotely, with 9 applications unchanged |
| Worker version | `75772476-2a19-4ce7-9576-d66608b534d8` at 100% |
| Verified without a session | `/jobs` and `/vi/jobs` return 200; the Vietnamese copy and `hreflang` are present. Private pages redirect to sign-in. The interview, scorecard and purge APIs return 401. |
| Pending (owner) | Invite HR and sales staff in EmDash, grant roles on `/vi/workspace/users`, and check the signed-in pages with real accounts |

## 9. Partner role migration (`0007_workspace_partner_role.sql`)

The migration rebuilds `workspace_roles` (SQLite cannot alter a CHECK constraint) so it accepts `partner`. Existing role rows are copied unchanged and the `workspace_roles_role` index is recreated. No CRM or hiring table changes.

```bash
./node_modules/.bin/wrangler d1 export lumi-jobs --remote --output backups/lumi-jobs-pre-0007.sql
./node_modules/.bin/wrangler d1 execute lumi-jobs --remote --command "SELECT COUNT(*) AS roles FROM workspace_roles"
npm run db:migrate
./node_modules/.bin/wrangler d1 execute lumi-jobs --remote --command "SELECT COUNT(*) AS roles FROM workspace_roles; SELECT sql FROM sqlite_master WHERE name = 'workspace_roles'"
```

The role count must be unchanged and the stored CHECK must list `partner`.

## 10. Companies, contacts and API migrations (`0008`, `0009`)

- `0008_crm_directory_owners.sql` adds `owner_id` to `crm_accounts` and `crm_contacts`, with indexes. It backfills each row from the latest owned opportunity (for a contact: the opportunity naming it, else the company's), so current owners keep seeing what they see today. Rows without an owned opportunity stay unassigned (`NULL`), and the team assigns them on the company page.
- `0009_crm_api_tokens.sql` creates `crm_api_tokens` (hashes only) and `crm_api_rate`.

Both are additive. Back up, apply and verify:

```bash
./node_modules/.bin/wrangler d1 export lumi-jobs --remote --output backups/lumi-jobs-pre-0008.sql
npm run db:migrate
./node_modules/.bin/wrangler d1 execute lumi-jobs --remote --command "SELECT (SELECT COUNT(*) FROM crm_accounts) accounts, (SELECT COUNT(*) FROM crm_accounts WHERE owner_id IS NULL) unassigned_accounts, (SELECT COUNT(*) FROM crm_contacts WHERE owner_id IS NULL) unassigned_contacts, (SELECT COUNT(*) FROM crm_api_tokens) tokens"
```

`tokens` is 0 after the migration. To stop all API access at once in an incident, run `UPDATE crm_api_tokens SET revoked_at = <now>, revoked_by = 'incident' WHERE revoked_at IS NULL`, then tell users to create new tokens.

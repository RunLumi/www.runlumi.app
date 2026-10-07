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

| Item | Value |
|---|---|
| CRM PR / merge SHA | _filled at release_ |
| Worker version | _filled at release_ |
| Migration applied | _filled at release_ |
| local.runlumi PR / merge SHA / deployment | _filled at release_ |
| Verified | _filled at release_ |

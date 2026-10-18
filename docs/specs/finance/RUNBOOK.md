# Finance operations runbook

[Tiếng Việt](RUNBOOK.vi.md) · [Overview](README.md)

## Initial setup

Open `/finance/settings` with an active System Super Admin session. Confirm entity/scope, currency/precision, fiscal start, timezone, first reporting month and management recognition policy. Choose the earliest month intended for backfill before creating any plan, actual period or import. No real entity, account or amount is seeded.

Register cash accounts with their active month boundaries. Review line labels, cost behavior and explicit segment coordinates. Shared amounts can remain `unallocated`; do not enter an extra total that duplicates child coordinates. Cash floor and material-variance thresholds may remain unset until policy is decided. Enable the book when configuration is ready. Both the book and `FINANCE_LIVE_ENABLED=true` are required for operational access; only protected setup/configuration remains available while disabled.

The fiscal calendar, timezone and first reporting month cannot change once a plan, actual period or import exists. Complete yearly line/segment definitions before entering facts; draft facts already block definition edits, and publishing any plan or closing a month freezes the definitions. V1 rejects actual months before `firstPeriod`; changing a historical cutover requires a separately reviewed migration. A midyear first year is explicitly partial.

## Plan and monthly operation

1. Create a budget for the fiscal starting year. Enter twelve months of applicable P&L/direct cash inputs, opening cash and restricted closing cash. Use explicit zero for known no activity and explained N/A only where allowed.
2. Review annual allocation or month-copy previews before applying. Annual allocation accepts exact nonnegative decimal weights and preserves the signed total. Cloning creates a separate draft. Publish the original budget as the immutable baseline once all twelve months of plan inputs are complete; the fiscal year does not need to have ended.
3. Open an actual draft for an elapsed/current local month. Enter source-as-of, scope and P&L/cash/aging/position evidence. Save partial work as needed.
4. Enter closing bank observations at exact month end, and cutover opening observations at the first day. Negative balances require borrowing classification and an explicit financing movement. Do not deduct the overdraft twice from eligible cash.
5. Reconcile direct cash to observed balances, gross AR/AP aging to controls, assets to liabilities plus equity, and equity movements to profit and evidenced adjustments. Opening equity requires its own reference even when explicitly zero. Each nonzero noncash/other equity movement also requires its own reference.
6. Save, review checks, and close only after the month ends in the book timezone. A close freezes values, explanations, definitions, policy, roster, sources and prior-revision references.

Money input uses major currency units without grouping separators; the API uses integer-minor-unit strings. Blank never becomes zero. Rejected forms retain submitted input. A version conflict requires reloading and reviewing the concurrent change before submitting again.

Forecasts pin a contiguous closed actual prefix and project remaining months. Missing or stale actual sources cannot be replaced by copied plan facts. Scenarios and forecasts never overwrite the original budget.

## CSV and reports

Download the intended template, fill its amounts or remove unused blank rows, then paste UTF-8 CSV or use the optional file picker. Columns are `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note`. Preview differences before committing a month.

Limits: 256 KiB CSV, 2,400 rows, twelve months of one fiscal year, 200 facts/month, and 512 KiB for the complete serialized writable month including observations/sources. A rejected monthly write leaves no partial facts, operation or audit. Only the same preview's successful preceding plan commit may advance its remaining expected versions; external edits require re-preview. Discard removes pending staging while retaining committed evidence.

Exports use POST and a saved immutable snapshot. Identical operation-key retries reproduce the original CSV after restatements, provided current authority and readiness still pass. Text is protected against spreadsheet formulas; numeric cells preserve signed exact amounts. Export snapshots are bounded at 16 MiB and 24 insert groups. Oversize requests fail explicitly; reports are not truncated. See [Data model](DATA-MODEL.md).

## Corrections and historical comparisons

Reopen a closed month with a reason. A new draft is created; the old revision stays immutable. Amend, reconcile and close again. The authoritative pointer changes atomically. Reconcile dependent later months chronologically and create a new forecast when their pinned sources become stale.

YTD uses the same contiguous closed prefix for actuals and plan. It stops at the first missing, reopened, unreconciled or stale month and never restarts after a gap. Flows sum, balances use endpoints and margins are recomputed. Select a monthly range for a draft or historical revision. Append cause/action/review annotations without editing frozen input explanations; these notes do not send messages or assign another person.

## Release, recovery and verification

[CI](../../../.github/workflows/ci.yml) runs policy checks, unit tests, local migrations, full Worker integration and build. Focused Finance verification is `npm run test:integration:finance`; full regression is `npm run test:integration`. Set `FINANCE_BROWSER_BINARY` to local Chrome for 320/430/1280/1920px, no-JavaScript, reduced-motion, keyboard-focus and accessibility checks. `FINANCE_BROWSER_ARTIFACTS` selects the screenshot directory. The integration recovery case takes a consistent native SQLite online backup of disposable local D1, restores it to a separate local D1 database, and compares content hashes, history, foreign keys and immutable guards. This is local recovery evidence; it does not exercise production D1 Time Travel or SQL export/restore.

The existing [release script](../../../scripts/release.mjs) preflights production, captures a D1 Time Travel bookmark before pending migrations, applies additive migrations and deploys tagged main. Follow that pipeline. The Finance migration contains no sample or real financial data.

If rollout fails, keep operational Finance disabled, inspect release logs and fix forward. Prefer a known-good Worker rollback for an application regression. Do not drop tables or delete history. A D1 restore affects the shared `lumi-jobs` database, including Hiring, CRM and HRM: review the bookmark, affected interval and all module writes with the authorized operator, then rehearse on an isolated copy before any production restore. This runbook does not authorize automatic restore or purge. See Cloudflare's [Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/).

After deployment check anonymous page/API denials and private/no-store headers. Use the owner's real Super Admin session to verify setup; do not create a synthetic production book as a test. Before real use, assign source ownership, retention/disposition policy and backup responsibility. Monitor unresolved reconciliations, missing months, stale chains, failed imports and audit activity. Finance adds no scheduled purge, payments, external messages or automatic CRM/HRM extraction.

# Finance data model

[Vietnamese](DATA-MODEL.vi.md) · [Finance overview](README.md) · [Financial rules](FINANCIAL-RULES.md) · [Architecture](ARCHITECTURE.md)

**Status: proposed requirements, not an implemented schema.** Names below describe responsibilities and constraints; they are not executable migrations. Finance uses the existing `DB` binding (`lumi-jobs`) with separate `finance_*` tables. EmDash remains the identity source. No customer, employee, payment or payroll records are copied automatically.

## 1. Book, period and measurement boundaries

V1 has one management book for one legal entity and one base currency. VND, precision zero, is the proposed initial configuration. Confirm entity, currency, fiscal-year start and reporting timezone before entering values. Currency and precision become immutable after the first value. Calendar changes cannot remap stored periods; a changed calendar requires a separately reviewed transition.

The canonical period is a validated `YYYY-MM`, not a UTC timestamp or a locale-dependent month label. The fiscal-year label and month ordinal follow the book's frozen calendar. Event timestamps use UTC; business periods use the configured calendar.

Reject future-month actual entry and imports. Current-month actuals may be saved as visibly partial drafts; closing is permitted only after that month has ended in the book's timezone. Expectations belong in plans/forecasts. Historical entry follows the explicit opening-balance cutover and continuity rules.

Maintain distinct bases for P&L, external cash flows, position snapshots and AR/AP aging. A revenue input never creates a cash receipt automatically. A position is a stock at month end, not a monthly flow. [Financial rules](FINANCIAL-RULES.md) owns classification and reconciliation formulas.

Each plan and actual revision pins a published definition set: line codes, input/derived classification, basis, sign convention and supported calculation identifiers. A fiscal year's semantic set freezes when its baseline is published or its first month closes. V1 rejects incompatible comparisons and offers no automatic remapping. A new fiscal year can clone/update definitions; historical reclassification requires a separately reviewed mapping design.

## 2. Conceptual tables

All identifiers are opaque; all facts belong to the same configured book. These 14 tables are a sizing guide, not a requirement to reproduce every column literally.

| Table | Responsibility and essential constraints |
| --- | --- |
| `finance_books` | Singleton book, entity label, base currency/precision, fiscal start, timezone, settings version. Lock measurement settings after use. |
| `finance_definition_sets` | Draft/published semantic versions, calculation-contract version and expected line × segment × effective-month input manifest. Published definitions are immutable. |
| `finance_lines` | Composite key `(definition_set_id, line_code)`; statement/control basis, input/derived kind, stock/flow behavior, historical label, applicability/N/A rule and fixed calculation identifier. No executable formulas. |
| `finance_segments` | Stable segment codes and active dates; one optional P&L dimension. Reserve non-null `unallocated` and `all` codes. Archive referenced segments. |
| `finance_periods` | Unique `(book_id, period)`; optimistic version, authoritative closed revision pointer and optional working revision pointer. Pointers must belong to this period/book. |
| `finance_plan_versions` | Budget/forecast/scenario, year/horizon, draft/published state, version, definitions, assumptions, source-plan/actual manifest and reporting-settings snapshot. At most one official baseline per fiscal year. |
| `finance_plan_values` | Unique `(plan_version_id, period, line_code, segment_code)`; amount/status, persisted note, evidence and source-operation reference. Parent fixes book, currency and definitions. |
| `finance_actual_revisions` | Period-local draft/closed revision, version, definitions, source/opening references, close/reopen actor/reason; frozen block/source, scope, roster and reporting-settings manifests. |
| `finance_actual_values` | Unique `(actual_revision_id, line_code, segment_code)`; typed P&L/cash/position/aging/control inputs, status, persisted note, evidence and source-operation reference. |
| `finance_cash_accounts` | Stable account code, base currency, active dates and display label. No bank credentials or banking integration. Referenced accounts cannot be deleted. |
| `finance_balance_observations` | Unique `(actual_revision_id, account_id, observation_kind)` for opening/closing observations; source amount, cash/borrowing classification, restricted portion, evidence reference and source-as-of date. |
| `finance_import_batches` | Target, versioned bounded preview manifest, source-as-of/block evidence context, content hash, expected versions and per-month receipts. No raw file or binary storage. |
| `finance_write_operations` | Unique scoped idempotency key, canonical request hash, actor, target, result version and bounded replay result. Written atomically with the business change. |
| `finance_audit_events` | Append-only actor/time/action/target/before-after/reason/operation trail; contextual review annotations pin revisions, period and line/metric/segment. Same Finance access boundary. |

Prefer explicit parent/composite foreign keys over duplicate independent `book_id`, period or definition fields that can disagree. If denormalization is needed, enforce equality through constraints or the atomic write guard. Do not foreign-key actors into a different EmDash database: retain stable actor IDs and a minimal historical label.

## 3. Fact grain and completeness

For P&L inputs, `unallocated` means an amount has no chosen segment; named segments partition the same total. `all` is reserved for unsegmented statement bases or derived totals. Never store a P&L grand total alongside its segment inputs and then sum both. Cross-segment movement is one atomic operation.

The pinned input manifest specifies allowed/required line × segment × effective-month coordinates. Each P&L line defaults to requiring only `unallocated`; a deliberate split activates the listed coordinates for that line/month. Do not generate the Cartesian product of every line and every segment. Manifest changes follow the frozen fiscal-year definition policy. Proposed v1 setup limits are **200 writable fact coordinates per month**, across all families including controls, and **20 active cash accounts**. Cash observations are separate: at most 20 closing observations plus 20 initial-opening observations at cutover. Validate these bounds during setup, manual writes and CSV preview.

Represent three cases explicitly:

- **Missing:** no fact, or an explicit incomplete field; never converted to zero by storage or reports.
- **Entered:** an integer amount, including an intentionally entered zero.
- **Not applicable:** a permitted input with a null amount and a non-empty explanation.

N/A is allowed only by the pinned line rule. Core reconciliation inputs, required account observations and opening controls cannot be made N/A to obtain a complete month. No activity is an entered zero. Persist a bounded plain-text note for N/A, negative entered amounts and Other-category inputs; keep explanations separate from source references.

`NOT NULL` applies to natural-key fields, including segment. SQLite treats nulls as distinct in unique constraints, so a nullable segment would allow duplicate apparent totals. An amount constraint must distinguish entered and not-applicable states explicitly; a `CHECK` alone does not imply `NOT NULL`. [SQLite table constraints](https://www.sqlite.org/lang_createtable.html)

Derived rows have no writable facts. Totals, margins, variances and available cash are calculated from their inputs. Seeded categories are suggestions before use, not evidence about Lumi's accounts. A referenced code cannot acquire a different meaning. Archive rather than remove it; historical labels remain pinned. A versioned current-display alias must not change historical reports or exports.

Seed `Other revenue`, `Other direct cost` and `Other operating expense` so genuinely new midyear activity can be entered in its correct statement section with a required explanation, using `unallocated` when necessary. This is a usability escape, not permission to invent definitions during import or silently reclassify historical amounts.

AR/AP aging uses mutually exclusive buckets and source control totals. AR buckets reconcile to **gross AR**; a separate allowance input derives **net AR** for assets (`100 gross − 10 allowance = 90 net`). Do not count gross and net AR as separate assets. AP supplier advances are prepayment assets, not negative aging buckets. Position cash reconciles to account observations. Working-capital expected collections/payments display the same forecast-cash facts used by Cash flow, never a second posting.

Typed **control inputs** live in the existing value tables and are excluded from ordinary P&L, external-cash and position-total aggregation:

- `forecast.restricted_cash` is a monthly closing-stock control for available cash/runway; it is not another asset or payment.
- `equity.opening` and cutover opening-position controls are point-in-time sources. They are never summed as monthly movements.
- Cash owner contributions/distributions reference the existing financing-cash facts once. Evidenced `equity.noncash_contributions`, `equity.noncash_distributions` and `equity.other_movements` supply the remaining equity bridge. They do not create cash flows. Equity change is not inferred from total financing cash.

Each control has a fixed calculation role, source and aggregation rule. This remains monthly summary data, without an invoice ledger or general ledger.

## 4. Versions, closing and restatements

Plan publication freezes values, input notes, assumptions, definitions, source revisions and reporting-settings snapshot. The fiscal year's official budget baseline cannot be overwritten or replaced by a forecast. Forecasts/scenarios clone to new IDs. Reports pin baseline/forecast/actual IDs, source context, calculation version and all non-amount inputs affecting the result, including cash floor, restriction assumptions and applicable settings. Store frozen values or resolvable immutable versions; reading today's settings must not change an old report.

A period can have an initial working draft, a closed authoritative revision, or both a prior closed revision and a new working restatement. Derive that state consistently from revision state and pointers. Saving requires the working pointer and expected version still to match.

Full closing requires the P&L, cash, aging and position blocks, all their applicable required inputs and every mandatory reconciliation. Partial-block progress is never `closed`. Closing freezes the draft, records the event, advances the authoritative pointer and clears the working pointer atomically. Snapshot the required coordinates, block applicability, segment scope/labels, active cash-account roster, source-as-of dates, block evidence/scope and reporting settings/calculation/cash-floor context. Future configuration changes cannot rewrite past completeness.

Reopening requires a reason and creates a new draft copied from the closed revision; it never unlocks that row. A reclose supersedes the authoritative pointer while retaining the old snapshot. Post-close commentary is an append-only audit annotation with `baseline_id`, `actual_revision_id`, period, line/metric, segment and bounded cause/next-action/review text. It does not mutate frozen fact notes; a correction to the financial inputs uses a new working revision.

The initial opening cash cutover needs source evidence. Subsequent openings point to the prior authoritative close and retain the amount/source revision used. Each active cash account needs a closing observation, even when zero. Require `0 ≤ restricted ≤ eligible cash`; available cash is derived. Retain negative bank observations and classify borrowing explicitly before close. An overdraft is a separate liability, not negative cash silently included in runway.

Reconcile total opening cash plus external cash movements to observed closing cash. Internal transfers between included accounts cancel and never become external inflow/outflow. If an earlier month is restated, dependent closed months retain their original opening sources and become visibly stale for current reconciliation. Reopen/reclose the affected chain explicitly; suppress a reconciled badge and runway based on that stale chain.

## 5. Exact money and database constraints

Store money as integer minor units. Accept canonical decimal strings, apply the fixed currency precision exactly and reject excess precision; never use floating-point multiplication to convert input. Use exact integer/rational arithmetic and a documented rounding rule when a calculation produces fractional minor units.

D1 stores signed 64-bit integers, but its Workers API does not currently support binding `BigInt`; JavaScript numbers are only safe through `9,007,199,254,740,991`. Validate stored values, intermediates, aggregates and returned results against the supported range. A safe input does not make a sum safe. Internally exact arithmetic may use `BigInt`; convert only after range validation, and use decimal strings at JSON money boundaries. [D1 type conversion](https://developers.cloudflare.com/d1/worker-api/)

Do not replace integer aggregation with SQLite `total()` to avoid overflow: it returns floating point. Integer `sum()` can overflow its 64-bit range; a result can also exceed JavaScript's safe range before reaching SQLite's limit. Aggregate exact integers in the application or return SQL aggregates as text before numeric conversion, checking both limits. Checking an already rounded JavaScript result is too late. [SQLite aggregate behavior](https://www.sqlite.org/lang_aggfunc.html)

Use `STRICT` tables where supported, plus `CHECK`, `UNIQUE`, `NOT NULL` and foreign keys for legal states, valid periods, nonnegative revisions and valid lineage. D1 enforces foreign keys; deferred constraints only defer checking until the transaction ends. They do not disable integrity or cascading deletes. [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/) · [STRICT tables](https://www.sqlite.org/stricttables.html)

## 6. Atomic writes and imports

The atomic unit includes business facts, parent version/pointers, audit and idempotency result. Authentication supplies the actor server-side. Every mutation guards expected version, current working/draft state, period, book, definition set and allowed line kinds inside the same transaction.

Annual split/copy actions may build a draft in bounded chunks. Publication is one atomic, version-guarded transition only after the complete version passes validation. Readers never mistake a partially populated draft for a published plan.

D1 `batch()` rolls back a sequence when a statement fails. However, `UPDATE ... WHERE version = expected` affecting zero rows is successful SQL; a subsequent unconditional audit or sibling write can still commit. Checking `meta.changes` after the batch cannot undo that commit. Require a tested SQL guard that raises a constraint error on failed preconditions, or an equivalent design where all dependent writes are necessarily coupled to the successful mutation. The implementation spike must prove this behavior. [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) · [SQLite zero-row updates](https://www.sqlite.org/lang_update.html)

Recheck current authentication, Super Admin authority and readiness **before** any replay lookup or response. Then an idempotency key scoped to actor/book/action/target returns its original result for the same canonical payload; changed content is a conflict. Replay precedes fresh mutation-state/version checks, so an authorized retry of a committed save can still obtain its receipt after the month closes. Hash the expected version, normalized values, notes and source context. Retain committed import identifiers/content-target fingerprints to detect reimport with a new key. Replacement requires a preview, never additive guessing.

CSV is a bounded alternative to manual fact entry; cash-account observations remain manual. Columns are `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note`. Imported `value_state` accepts only `entered` or `not_applicable`; entered zero is explicit zero. Required notes follow §3. The preview form supplies `source_as_of` and reporting-scope/block-evidence context for each affected month/block; persist this alongside the normalized preview and committed revision. The server-selected target is authoritative. Reject unknown codes, incompatible definitions, mixed currencies, duplicate coordinates, disallowed N/A and derived rows.

Proposed file limits are 256 KiB UTF-8, 2,400 rows/file, 200 rows/month and 12 months within one fiscal year. Preview pins normalized data, hash, `manifest.version` and expected target versions. Each confirmed commit applies one selected month atomically. A conflict requires re-preview; earlier committed months remain committed and visible. No atomicity claim spans several month commits.

A multi-month plan import shares a global `plan.version`. Its own successful month commit atomically records the receipt, increments the plan/manifest versions and advances pending months' expected plan version **only across that manifest's known preceding commit**. This advances guards only; reviewed amounts, notes, source context and their content hash stay unchanged. External edits, another manifest or an unexplained version change require re-preview; never simply replace a stale expected version with the latest. Actual-month targets retain independent revision/period versions. Concurrent commits also guard `manifest.version`, preventing double advancement.

Unspecified cells remain unchanged. A separate clear action changes a working-draft value to missing with before/after audit; it never deletes source history or closed data. Discard/expiry affects only uncommitted preview payload. Preserve committed month receipts, content-target fingerprints, source references and operation/audit links even when the remaining months are discarded. These records are not orphaned preview garbage.

Validate these caps in the implementation spike. D1 currently allows 100 bound parameters per statement and applies limits to each statement inside a batch; invocation query limits also apply. Batching or splitting statements must never silently split the month's transaction. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

## 7. Reads, indexing and recovery

V1 finance reads use the primary. If read replication is introduced, preserve read-after-write with a session/bookmark and use primary freshness for close/reopen decisions. A D1 session provides sequential consistency, not a transaction spanning browser requests. Construct a report from one coherent read unit with pinned source revisions; do not mix totals from separate moving snapshots. [D1 sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession)

Index actual revisions by period/state; facts by parent revision and line/segment; plan values by version/period; observations by revision/account; audit by target/time; imports by status/created time. Unique keys support concurrency and deduplication. Paginate audit/history and bound report horizons. Archive referenced definitions/accounts/plans; forbid cascade deletion of closed facts, audit or published baselines.

Database recovery and record retention are separate. D1 Time Travel provides 30 days on Paid or 7 days on Free; restoring overwrites the database in place, including other modules in this shared binding. It is not long-term financial retention. Define retention by record category, purpose and approved obligations, including audit and exports; do not invent a statutory duration. A longer-lived backup/export process needs its own protected destination, access policy and restore rehearsal. [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) · [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

Before rollout: verify existing binding and migration head, use additive tables/indexes, validate foreign keys, seed only configuration, exercise conflict/close/import/overflow recovery with synthetic data, record a restore point and rehearse recovery in an isolated database. No production migration or restore is authorized by this documentation task. Finance data and audit must never enter public fixtures, repository examples or the CRM notification feed.

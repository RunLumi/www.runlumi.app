# Finance — delivery and acceptance

[Tiếng Việt](DELIVERY.vi.md) · [Index](README.md) · **PROPOSED — runtime not implemented** · 2026-10-18

## 1. Requirement traceability

These identifiers are stable acceptance requirements. Financial calculation rules use `FIN-Rxx` in [Financial rules](FINANCIAL-RULES.md); implementation evidence belongs in [Status](STATUS.md). A document or passing application build does not establish that a Finance runtime test passed.

| ID | Required behavior | Controlling specification | Acceptance evidence required later |
|---|---|---|---|
| FIN-01 | Only active System Super Admin can read/write Finance | Architecture §§3–5 | All-role and combined-role negative tests, both locales, direct API/export/audit access |
| FIN-02 | One identity, shared Workspace shell, hidden unauthorized navigation | Architecture §§1–4 | EmDash session, safe login return path, no unauthorized overview query or serialized data |
| FIN-03 | D1 persists facts, settings, versions and audit | Data model | Local D1 migrations, reload/restart persistence, FK/uniqueness and archive tests |
| FIN-04 | Complete important page set in EN/VI | Product §2 | All 11 routes with real shared loaders, correct filters and empty/error states |
| FIN-05 | Twelve-month financial plan and exact annual allocation | Product §3B; FIN-R06 | Non-January fiscal year, copy/preview, rounding remainder and frozen baseline tests |
| FIN-06 | Monthly actual entry with missing/zero/N/A distinction | Product §3C; FIN-R02–03 | Round-trip each state; no false complete totals; explicit zero review |
| FIN-07 | Correct monthly/quarter/YTD plan comparison | FIN-R03, FIN-R08 | Same-period set; zero/negative targets; margins; partial month exclusion |
| FIN-08 | Distinct revenue recognition, expense and cash inputs | FIN-R01, FIN-R04, FIN-R09 | Prepayment, loan, capex, payroll and internal-transfer fixtures |
| FIN-09 | Cash, aging, position and continuity reconcile | FIN-R09–12 | Zero unexplained stored-unit differences; missing evidence blocks close |
| FIN-10 | Published budgets/closed actuals immutable | FIN-R06, FIN-R13; Data model | Rejected direct writes; preserved old versions; attributed restatement |
| FIN-11 | Forecast/scenario separate from baseline | Product §3D; FIN-R07, FIN-R10 | Pinned cutoff/actual versions, no hidden budget fallback, stale forecast detection |
| FIN-12 | Shared revenue/cost facts and explicit overhead | FIN-R05 | No double-counted costs or editable derived rows; allocation sum preserved |
| FIN-13 | Bounded imports with preview and idempotency | Architecture §§5–6; Data model | Duplicate/wrong-scope/conflicting CSV rejected; atomic month; retry receipts |
| FIN-14 | Exact money, correct period keys and versioned definitions | FIN-R02, FIN-R06; Data model | Precision, overflow, locale and fiscal-boundary cases; no historical reclassification |
| FIN-15 | Every financial mutation has durable actor/reason/history | Architecture §§3,6; Data model | Audit/write/idempotency commit or roll back together; no deletion of history |
| FIN-16 | Private, reproducible exports and cache policy | Architecture §§4–5; Product §4 | Same pinned report values; formula-safe text; no-store on success/errors/redirects |
| FIN-17 | Independent from CRM/HRM and their broader audiences | Architecture §7 | No CRM token/MCP/Lark leaks; no bypass of disabled HRM; existing role tests unchanged |
| FIN-18 | Useful and maintainable operation | Product §5; this document | Keyboard/mobile/locale checks, bounded query evidence, backup/restore rehearsal |

## 2. Delivery stages

| Stage | Deliverable | Exit condition |
|---|---|---|
| F0 — this task | Bilingual requirements, current-source findings, proposed data/API model and acceptance plan | All documents agree; cross-links work; independent review complete; documentation PR available; no application change |
| F1 — secure monthly workflow | Additive D1 model, non-grantable Finance permissions, protected setup, manual plan/actual forms, basic P&L/cash/position checks, baseline freeze, one monthly close and a minimal reproducible CSV export | One synthetic book/year/month completes end-to-end and persists after reload; FIN-01/02/03/06/08/09/10/14/15/16/17 pass for this slice; feature remains disabled by default |
| F2 — complete v1 | All 11 polished views, exact plan helpers, variance, revenue/cost drill-downs, aging/position, forecasts/scenarios, CSV preview/commit, exports and audit filters | FIN-01–18 pass on the same candidate revision; no placeholder pages or fabricated totals; EN/VI parity |
| F3 — production readiness | Confirm reporting setup/policy, authorized opening balances, recovery/runbook, migration rehearsal, access and build verification | Owner accepts the concrete release and activation scope; required gates pass; documented monitoring and recovery owner |
| Later — separately scoped | Reviewed CRM/HRM adapters, transaction-level reconciliation, weekly cash forecast, FX/consolidation or accounting integration | A demonstrated need and reliable source mapping justify each extension; existing boundaries still hold |

Do not label F1 as full Finance delivery. Conversely, do not make a usable monthly workflow depend on unrequested integrations. An implementation PR should identify its exact stage, delivered requirement IDs and missing coverage.

## 3. Adversarial acceptance matrix

Use synthetic fixtures in local Worker/D1 with real test EmDash sessions. Do not access production financial, applicant, employee or customer records to demonstrate correctness.

| Case | Expected result |
|---|---|
| Anonymous/expired/disabled identity; demoted but active Super Admin | Anonymous/expired/disabled identity gets page login or API 401; a demoted active identity gets 403; no financial body and an already-open tab cannot continue writing |
| CRM Finance, Sales Manager, HRM Admin, Payroll Officer, all grantable roles combined | Finance page/API/export/audit denied; no menu, overview query or cached financial values |
| Super Admin's CRM bearer token or MCP call | Cannot authenticate a Finance request |
| Forged book/period/revision, unexpected fields, cross-origin or opaque Origin | Denied or validated error before financial mutation; no unsafe redirect |
| Two tabs save the same version | One succeeds; the other receives a conflict; no lost update or orphan audit event |
| Save races with close/reopen | Transactional state/version guard decides the winner; no write enters an immutable revision |
| Conditional update matches zero rows | Whole associated domain/audit/idempotency transaction fails, rather than committing unrelated statements |
| Retry after connection drops after commit | Current authority/readiness checked first; same key/payload returns original receipt even after the month later closes; revoked user cannot replay; changed payload with same key conflicts |
| SQL failure on a middle import row | No row from that month becomes authoritative; prior successful months remain identified in the manifest |
| Import January and February into the same annual plan | January advances parent/manifest versions for its own remaining preview; February succeeds without an external edit; an unrelated edit requires re-preview |
| Commit January, then discard pending February | January receipt, fingerprint, operation and provenance remain; only uncommitted February staging is discarded |
| Other, negative correction and permitted N/A rows | Required explanations persist through preview/save/reload/export; missing notes or unsupported N/A reject the month |
| New line/currency/definition in import; duplicate rows | Validation rejects; no implicit definition creation or currency conversion |
| Missing February expense; current/future actual month | Missing February prevents complete totals. On October 18 in the book timezone, October drafts are allowed, November actuals rejected and October close blocked until local month-end |
| Midyear cutover or a gap inside the year | Complete YTD never restarts after the gap; partial comparison names its range; missing earlier months are not replaced by budget; reconciled cutover cash can anchor a forecast |
| Two revenue segments but shared payroll only in Unallocated | Required coordinates follow the pinned applicability map, not a Cartesian product; no fabricated zero cells and no double-counted payroll |
| Baseline absent or explicit zero; negative profit target | Correct “No comparison”, “Unbudgeted” or signed improvement; no divide-by-zero or misleading achievement ratio |
| Asset purchase, loan draw, annual customer prepayment | Cash and P&L follow separate classifications; examples in FIN-R09 and the fixture table reproduce exactly |
| Cash/aging/equity mismatch of one stored unit | Close blocked; no automatic balancing plug or hidden tolerance |
| Gross AR 100, allowance 10, net AR 90 | Aging reconciles to gross AR 100; assets include net AR 90; supplier advances stay in prepayments rather than negative AP buckets |
| Expected collection 100 shown in Working Capital and Cash Flow | Both views reference one forecast fact; operating receipts include 100, never 200 |
| Opening cash 5, operating payment 15, bank balance −10 | Explicit borrowing draw 10 bridges eligible cash to 0 and debt to 10; no clamping, missing financing or duplicate draw |
| Restate an earlier closed month | Old revision/export unchanged; current dependencies flagged until reconciled; stale forecasts remain visibly stale |
| Fiscal year crosses December; leap-year February; browser locale changes | Same canonical period keys and numeric values; correct fiscal ordering |
| Integer boundary and many individually safe values whose sum overflows | Reject or use exact checked arithmetic; no silent precision loss |
| Frozen taxonomy, archived line and unexpected new activity | History unchanged; Other/Unallocated plus explanation available; no reclassification by CSV |
| Derived subtotal, stock annual total, margin annual total | Subtotals not editable; stocks use endpoint; ratios recompute from their components |
| Export with formula-like note; successful/error/redirect responses | Text neutralized; original financial amount preserved; private/no-store headers in every path |
| Change cash floor or retire an account after a report export | Reproduce the report with its original settings, included roster, input revisions and conclusions; current-view policy changes are labeled separately |
| HRM disabled; new Finance event generated | Manual Finance still works; no HRM bypass; no Finance payload in Lark/CRM/MCP/HRM notifications |
| Fresh database and unavailable D1 | Empty setup state or safe error; never sample revenue, success-on-failure, or public fallback data |

Negative bank balances need the explicit cash/borrowing handling in Financial rules; they cannot be silently discarded. Frozen budgets with incompatible definitions cannot be silently compared. Test these domain failures in addition to happy-path arithmetic.

## 4. Usability and acceptance thresholds

**Correctness gates:** zero unauthorized reads/writes in the access matrix; zero unexplained reconciliation differences at close; no lost update or duplicate committed import; all displayed totals agree with their source fixture at the stored precision. Exporting the same pinned revisions produces the same financial values and semantic definitions.

**Proposed usability target:** with 50 already-prepared monthly input facts, the Super Admin can enter/import, identify validation problems, compare against the baseline and close a clean month within 15 minutes after setup. Measure this in a rehearsal; it is a product target, not an observed benefit. If the source data needs hours of reconstruction, measure that separately rather than claiming the application solved it.

Verify mobile widths 320–430px, 1280px desktop and a wide desktop, both languages, keyboard/focus, text zoom, reduced motion, empty/partial/error states and contained grid scrolling. User-visible status must not depend on color alone. A no-JavaScript form can complete essential save/close actions; enhanced grid interactions have a fallback.

Benchmark representative and maximum supported monthly writes/exports on a documented environment. Record query count, rows read/written, statement/binding limits and response timings in the implementation PR. Choose indexes from the actual query shapes. Do not claim an SLA from an unmeasured target or enlarge test scope without a concrete remaining risk.

## 5. Release and recovery

The authoritative release rules are in [AGENTS.md](../../AGENTS.md), [release script](../../scripts/release.mjs) and [CRM runbook](../crm/RUNBOOK.md). Main automatically releases production. A docs-only build result does not authorize a Finance deployment or enablement.

Before a future runtime release:

1. Re-read current main, choose the next available migration number, and preserve existing tables/grants. Do not reserve a migration number in this specification.
2. Run additive migrations on an empty database and a synthetic previous-schema database. Verify Finance constraints and unchanged ATS/CRM/HRM access and data.
3. Run the repository's required `npm run ci:verify` and scoped Finance Worker/D1 integration cases. Record exact commit, environment and outcomes; distinguish failed setup from failed product behavior.
4. Keep navigation/default feature state off until implementation and settings are ready. Protected setup must remain possible as described in Architecture; disabled HRM is not a reason to bypass its gate.
5. Rehearse recovery and confirm the backup owner, retention/disposition policy and restore expectations. D1 recovery is not the same as business-history retention.
6. Present the concrete release for the already applicable release approval, then inspect the actual deployment/build and private role behavior after activation. Do not report success merely because a PR merged.

Because `DB` is shared, whole-database Time Travel can rewind ATS/CRM/HRM as well as Finance. First contain a bad Finance release by disabling Finance access/writes and rolling back compatible application code. Prefer a reviewed forward repair; never run a whole-DB restore as if it only affects Finance. Retain invalidated revisions and provenance rather than deleting evidence. Restore operations and real data imports need their actual authorized scope.

## 6. Stop and continue conditions

Stop production activation for any access leak, unexplained financial reconciliation, unsafe money arithmetic, mixed revisions, failed migration recovery, missing reporting policy or unresolved severe defect. Keep the documentation and independent work moving; describe the specific failing gate.

Continue to later integrations only after the monthly loop is reliable and the operator demonstrates an actual burden that an adapter can reduce. If a prepared source month cannot reconcile, the next action is to identify its missing/misclassified line, not build another graph. V1 succeeds when the Super Admin can complete the real monthly loop and explain the result from its evidence.

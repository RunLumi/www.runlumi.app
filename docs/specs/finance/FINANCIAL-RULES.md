# Finance — financial rules

[Tiếng Việt](FINANCIAL-RULES.vi.md)

**Status: implemented v1 calculation contract, 2026-10-18.** Release and deployment evidence belongs in [STATUS.md](STATUS.md). Configuration defaults are starting choices, not approval of the entity's accounting policies. This module provides management planning and reporting; it has no general ledger, tax engine, or statutory reporting system. Every example is synthetic.

## 1. Reporting boundary and bases

**FIN-R01.** One management book represents one explicitly named legal entity and uses one base currency. Setup starts with VND, a January fiscal-year start, and Asia/Ho_Chi_Minh. Choose the calendar, reporting cutover and timezone before creating plans, periods or imports; currency and precision cannot change after values exist. Later changes require a separately reviewed migration. A fiscal year contains 12 real calendar months and is named by its starting calendar year: FY2026 starting in October means October 2026–September 2027. V1 has no FX conversion or consolidation.

Keep three input families distinct:

| Family | Meaning | Aggregation across months |
| --- | --- | --- |
| P&L | Recognized income and expenses | Sum flows |
| Direct cash flow | External cash receipts and payments | Sum flows |
| Financial position | Balances at month end | Use the selected closing date |

Revenue recognition follows the delivery of promised goods or services, which may differ from payment timing; see the [IFRS Foundation's IFRS 15 overview](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/). The specific recognition policy for each business line remains an owner decision. CRM accepted value, invoiced value, recognized revenue, and confirmed receipts are not interchangeable inputs.

Use the labels **management P&L**, **management cash flow**, and **financial-position snapshot**. These limited reports do not establish IFRS compliance; [IAS 1's overview](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements/) distinguishes the complete statements and requirements behind that claim.

## 2. Amounts, completeness, and periods

**FIN-R02.** Store exact signed integer minor units in D1, bounded by `−9,007,199,254,740,991` and `+9,007,199,254,740,991`. Configured precision is 0–6 decimal places; the VND default is 0. Decimal input is converted exactly, with arbitrary-precision integer intermediates for sums, allocation and materiality. Reject excess precision, grouping separators, exponent notation, alternate currencies and unsafe inputs or totals. Display rounding never changes stored values or reconciliation. Units and currency remain visible; CSV reports use exact major-currency amounts and label ratios separately as fractions.

Each fact belongs to one month, input family, stable line definition, revision, and applicable segment. Pin an expected-input manifest by line × segment × effective month. Default each P&L line to Unallocated only; deliberate splits activate specific segment cells, never a Cartesian product of every line and segment. Derived subtotals are read-only. Negative normal revenue/cost values require a correction explanation; cash direction is explicit.

**FIN-R03.** Preserve three states:

- **Missing:** no verified input; never converted to zero.
- **Explicit zero:** the operator confirmed no amount.
- **Not applicable:** an explicitly recorded applicability decision; no amount, with a reason.

Completeness counts every expected applicable coordinate, including one whose input-policy `required` flag is false. That flag never converts an absent amount to zero or makes a dependent total complete. N/A is allowed only by pinned P&L applicability, with a reason; never use it for cash observations, opening balances, or reconciliation controls. No activity means explicit zero. Missing dependencies block authoritative totals and publication/close; a draft may show known amounts with incomplete coverage. Charts preserve gaps. Copy/fill previews affected values and records an audit event; there is no automatic zero fill.

Compare the same months and reporting scope. A contiguous close chain begins at the explicit cutover month, whose opening is its start-of-month balance. V1 rejects actual entry before the configured `firstPeriod`; choose the earliest month that needs historical input during setup. Extending it after use requires a reviewed migration, not an in-app backfill switch. A midyear start remains **Since <cutover> / partial fiscal year**; never manufacture earlier zeros. Full YTD starts at the fiscal-year start and uses the same contiguous closed prefix on both sides; it never restarts after an open, restated or missing month. Segment views use book-level close eligibility for that prefix. Current-month actual drafts are allowed, future-month actual entry/import is denied, and close is allowed only after that month ends in the book's timezone. Flow values sum; stocks use the complete endpoint, and ratios are recomputed from aggregate inputs.

## 3. Profitability and cost classification

**FIN-R04.** Let `R` be recognized revenue after separately identified discounts/refunds; `C` direct costs; `O` operating expenses; `I` other operating income; `FI` finance income; `FC` finance costs; and `T` income-tax expense. Normal cost amounts are positive.

| Measure | Exact rule |
| --- | --- |
| Gross profit | `R − C` |
| Operating profit | `R − C − O + I` |
| Profit before tax | `Operating profit + FI − FC` |
| Net profit | `Profit before tax − T` |
| Gross margin | `(R − C) / R`, available only when `R > 0` |
| Operating/net margin | Respective profit divided by `R`, only when `R > 0` |

Depreciation/amortization is included exactly once in its configured expense classification. Income-tax expense and tax cash payments are separate facts. Record a consistent net/gross tax convention before input; v1 calculates no tax rates, recoverability, or filing liabilities.

**FIN-R05.** Revenue and Costs pages reuse these facts and definitions. Category seeds may cover projects, maintenance, SaaS, products, delivery payroll, subcontractors, direct hosting/AI usage, goods, marketing, shared payroll, software, rent, professional fees, depreciation, and finance costs. Seeds contain no amounts.

Cost behavior (**fixed/variable/mixed/unspecified**) is separate definition metadata, independent of assignment (**segment/unallocated**) and classification (**direct/operating**). Seeds use **unspecified**; no business cost policy is invented. A fixed delivery cost can belong to a segment. Shared overhead stays visible as unallocated; there is no automatic allocation engine. Reassignment preserves the book total and needs evidence, without a second counted copy. Segment gross profit uses assigned direct costs; any segment result excludes overhead left in Unallocated and is not fully loaded profit. A segment's profit never substitutes into the whole-book equity bridge. Do not automatically capitalize development costs or derive MRR/EBITDA from incomplete inputs.

## 4. Baselines, scenarios, and forecasts

**FIN-R06.** A published annual baseline is immutable. It contains 12 monthly P&L and direct-cash values for its applicable plan coordinates; annual flow totals are derived. Publishing forecasts or scenarios never overwrites it. Drafts may be incomplete; publication requires complete report dependencies and pinned definitions, including applicable inputs marked optional by input policy. Default plan manifests require P&L, direct cash and forecast cash controls; they do not invent future AR/AP or position snapshots.

Publishing any plan, including a scenario or forecast, or closing any actual pins the semantic definitions for that fiscal year. V1 also prevents definition edits once draft values use the set; configure its chart and segments first. Historical reports/exports retain pinned labels, classifications, formula membership and aggregation. Use seeded Other and Unallocated with explanations for unexpected activity. Configure changed definitions in an untouched year; there is no historical reclassification/mapping engine.

Annual spreading applies to an editable full-year budget/scenario flow line and exactly 12 weights. Take signed integer total `T` and nonnegative decimal rational weights with positive sum; weights support up to 18 fractional digits. Allocate `abs(T)` proportionally, floor each allocation, then give remaining minor units to the largest fractional remainders, breaking ties by earlier fiscal month; restore the sign. Reject negative/invalid weights or an all-zero sum. Equal spreading uses equal weights. Copy/fill previews replacements and copies only target-applicable coordinates; opening controls are carried separately. Remaining-month forecasts are entered directly, without spreading a full-year total over an actual prefix. Scenarios have separate assumptions without probability weighting. Growth helpers remain outside v1.

**FIN-R07.** For cutoff month `k`:

`Full-year outlook = Σ closed actuals through k + Σ selected forecast after k`.

Pin actual revisions, cutoff, baseline, forecast, settings including cash floor/materiality, applicability, account roster and calculation version. Later settings do not change a reproduced report. Missing inputs make the outlook incomplete. Reusing a budget requires an explicitly created forecast copied from that source, with its assumption identified as **Actuals + remaining budget**; there is no silent per-cell fallback. A missing/unclosed actual-prefix source stays missing even when copied plan facts exist for the month. Missing past fiscal months keep the full-year outlook incomplete. Cash forecasting may start from the verified close since cutover; an unverified or stale anchor cannot seed a healthy future cash chain. Collection/payment timing has separate assumptions. Planned closing cash derives from opening and flows, not an editable position value; P&L alone never implies a complete future balance sheet.

## 5. Variance and interpretation

**FIN-R08.** With comparable complete actual `A` and plan `P`:

- Absolute variance: `A − P`.
- Percentage variance: `(A − P) / abs(P)` when `P != 0`.
- `P = 0, A != 0`: show **Unbudgeted** and the absolute difference; no percentage.
- `P = 0, A = 0`: difference zero; percentage unavailable.
- Missing baseline cell/comparator: **No comparison / not planned**, never silently zero. Only an explicit planned zero supports the Unbudgeted calculation above.
- Margin variance: actual margin minus planned margin, in **percentage points**.

Favorability is separate: revenue/profit improvements use `A − P`; cost savings use `P − A`. Debt, financing and balances have no automatic favorable direction. Do not interpret negative-profit budgets as positive-target attainment.

Materiality is an optional owner configuration, initially unset. Set an amount threshold `M` in minor units, percentage threshold `B` in integer basis points (`100 bps = 1%`), or both. For money measures, an exception is material when **either** `abs(A−P) >= M` or, with `P != 0`, `abs(A−P) × 10000 >= B × abs(P)`. Use exact integer cross-products and inclusive boundaries. With only a percentage policy and `P=0`, materiality is unavailable; a configured amount rule still applies. Missing comparison/no configured policy returns unavailable. These thresholds do not apply to margin percentage-point differences. Reports use the selected actual revision's frozen policy, or the endpoint actual's policy for a range, falling back to the selected plan's frozen policy/current draft settings.

## 6. Cash, liquidity, and account reconciliation

**FIN-R09.** Classify external cash as operating, investing, or financing. The [IFRS Foundation's IAS 7 overview](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/) explains these families, direct receipts/payments, and reconciliation to cash balances. V1 uses an explicitly documented management classification, not an assertion of statutory presentation.

`CFO = operating receipts − operating payments`.

`CFI = investing receipts − investing payments`.

`CFF = financing receipts − financing payments`.

`Expected closing cash = opening cash + CFO + CFI + CFF`.

`Observed closing cash = Σ eligible cash-account closing balances`.

`Reconciliation difference = observed closing cash − expected closing cash`.

Observed closing cash is the source of reported actual cash; a nonzero difference remains unresolved. Cutover requires each active account's evidenced start-of-month opening; thereafter opening equals the preceding current closed revision. Use that prior revision's pinned account roster, including accounts retired afterward. Each current active account needs a closing balance, restricted portion and evidence at the calendar month-end date. Restricted cash lies between zero and eligible cash. Preserve negative bank source observations and explicitly classify them as borrowing: eligible cash is then zero and the observed borrowing must be included in position debt. An unresolved negative-cash classification blocks close; it is never silently clamped or counted as available cash.

Internal transfers net to zero and are excluded from external flow totals. Loan draws and owner capital are financing, never revenue. Principal repayments are separate from interest. Overdraft changes need the corresponding evidenced financing draw/repayment; an observation does not post that flow a second time. Asset purchases are investing payments, separate from recognized depreciation. Do not add unexplained balancing cash adjustments.

**FIN-R10.** `Unrestricted cash = eligible closing cash − restricted cash`. Forecast restrictions and the nonnegative cash floor are explicit inputs; an unset floor produces no threshold conclusion. Runway is the earliest forecast month with closing unrestricted cash **below** the floor; equality is not a breach. No breach means **No shortfall within the displayed forecast horizon**, not infinite runway. Missing, unreconciled or stale forecast dependencies suppress that conclusion. Projected negative cash/available cash is a visible funding gap, not a bank observation or automatic borrowing entry. Monthly estimates do not establish intra-month liquidity.

## 7. Working capital and financial position

**FIN-R11.** AR/AP v1 uses month-end aging snapshots, not an invoice ledger. Each includes not-yet-overdue, 1–30, 31–60, 61–90, and over-90-day overdue balances. The first bucket includes amounts due on the snapshot date. Buckets must partition the total; record the source and aging convention. Without invoice dates, the app must not invent computed aging.

Age gross trade receivables and payables on the same declared invoice/tax basis as their position controls. Reconcile AR aging to **gross AR**; enter an explicit allowance separately and derive `net AR = gross AR − allowance` for total assets. Supplier advances are separate prepayment assets, not negative AP aging. Payroll/tax-authority obligations, debt, and deferred revenue are separate from trade aging; this does not remove invoiced pass-through tax from trade balances.

Working Capital expected collections/payments reference the **same forecast-cash facts** used by Cash Flow, or remain nonnumeric notes. They neither add a second forecast posting nor post actual cash.

**FIN-R12.** Require:

- `Assets − Liabilities − Equity = 0`.
- Position cash equals observed cash-account totals.
- Position gross trade AR/AP equals the corresponding aging total; net AR is derived after allowance.
- `Closing equity = opening equity + net profit + cash contributions + noncash contributions − cash distributions − noncash distributions + explained other equity movements`.

Cash owner contributions/distributions reference their financing facts once. Opening equity and noncash/other equity movements are separate controls, not extra P&L/cash/position amounts. Cutover `equity.opening` needs its own evidence reference even for explicit zero; each nonzero noncash contribution, distribution or other equity movement also needs a specific evidence reference. Other movements need an explanation. Statement-level source references do not replace these controls. Missing evidence permits draft work but blocks close. Total CFF is not an equity movement because it also includes borrowing; noncash movements do not enter cash flow.

Opening position needs source evidence. Annual accumulated/current earnings must respect the fiscal boundary without counting profit twice. Reconciliation tolerance is zero stored minor units; any proposed nonzero tolerance needs a documented policy change. Never derive an equity plug to force balance. Arithmetic agreement does not prove source accuracy.

## 8. Close, restatement, and reproducibility

**FIN-R13.** Full monthly close requires complete P&L, cash, position, and aging blocks, applicable zeros, source references, and passing reconciliation/continuity checks. Partial block progress is never a full monthly close. A closed actual revision and its input notes are immutable. Corrections create a draft restatement with a reason; publication supersedes the current revision without deleting history. Post-close commentary is an append-only annotation linked to the revision, not an edit to frozen input notes.

A restatement identifies affected later openings and forecasts. A downstream period failing continuity is **restatement required**, not reconciled. Forecasts anchored to superseded actuals are stale and require a new validated version; they never silently acquire revised opening cash. An export receipt captures the selected state and generation clock so later data, settings, notes and stale flags do not change replayed bytes. CSV reports include exact actual/plan values, variance/favorability/materiality, pinned source policy and version references; unsupported calculation versions fail explicitly. “Closed” means completed and frozen under these checks, not audited.

## 9. Synthetic acceptance fixtures

All amounts below are arbitrary whole reporting units; production stores minor units. Unmentioned P&L/cash flows in these arithmetic fixtures are explicit zero, never production defaults.

| Fixture | Inputs | Required result |
| --- | --- | --- |
| Zero baseline | `P=0; A=12` | Difference `+12`; Unbudgeted; percentage unavailable |
| Negative baseline | Profit `P=−20; A=−10` | Difference `+10`; variance `+50%`; favorable improvement; no target-attainment ratio |
| Cost variance | Cost `P=100; A=110` | Difference `+10`, `+10%`; unfavorable overrun `10` |
| Materiality | `P=100; A=105; B=500 bps`; no amount rule | Material at the exact `5%` boundary; `A=104` is below it; `P=0` gives no percentage-only conclusion |
| Optional input | Applicable product-revenue coordinate has `required=false` but no value | Coverage and revenue remain incomplete; neither close nor plan publication may treat the blank as zero |
| Missing input | Revenue `100`; direct cost missing; expense `20` | Profit and margin unavailable; close blocked. Explicit direct cost `0` permits operating profit `80` |
| Deliberate segmentation | Two named segments; shared payroll `100` entered only in its expected Unallocated cell | Book payroll `100`; no invented missing/zero segment payroll cells and no duplicate total |
| Profit versus cash | Opening cash `50`; annual service collected `120`; recognized this month `10`; operating cost/payment `4`; loan draw `30`; capex `24` | Assuming no other P&L items: profit `6`, CFO `116`, CFI `−24`, CFF `30`, expected/observed closing cash `172` |
| Recognition assumption | Previous fixture assumes evenly delivered service over 12 months | `10/month` is the stated fixture assumption, not a universal revenue policy |
| Overdraft bridge | Opening cash `5`; operating payment `15`; bank observation `−10`; evidenced financing draw `10` | CFO `−15`, CFF `10`, eligible closing cash `0`, debt `10`; observation adds no duplicate draw |
| Gross/net AR | Gross aging/control `100`; allowance `10` | Gross reconciliation `100 = 100`; net AR in assets `90`; do not alter source aging to `90` |
| Shared cash forecast | Expected collection `100` shown in Working Capital and Cash Flow | One forecast receipt `100`, not `200` |
| Pass-through tax | Recognized revenue `100`; collected `110`, including liability `10` | Profit `100`, CFO `110`, tax liability `10`; later paying that `10` reduces cash/liability without another income-tax expense; no real tax rate is assumed |
| Exact annual split | Equal weights over 12 months; total `100`, then `−100` | First four fiscal months `9`, remaining eight `8`; negative case `−9`/`−8`; exact signed total preserved |
| Stock aggregation | January closing cash `100`; February `110` | February/YTD-end cash `110`, never `210` |
| Cash floor | Floor `20`; forecast unrestricted closings `35, 20, 19` | First breach is forecast month 3; no claim about within-month balances |
| Aging/position mismatch | AR buckets sum `40`; position AR `42` | Difference `2`; close blocked |

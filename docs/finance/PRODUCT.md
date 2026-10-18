# Finance product requirements

[Tiếng Việt](PRODUCT.vi.md) · [Index](README.md) · **PROPOSED — not implemented** · 2026-10-18

## 1. Outcome and boundaries

The Super Admin should be able to answer: What did we plan? What actually happened? Why is the difference material? How much cash is available? Which future month needs intervention? Each answer must identify its period, reporting scope, currency, source status and revision.

The first release is a **monthly management reporting workflow**, using entered monthly totals and balance observations. It does not require an invoice ledger, bank integration, payroll engine or complete accounting platform. Those systems may later supply reviewed inputs; they cannot silently determine the meaning of a number.

One installation initially has one explicitly configured management book and reporting entity/scope, one base currency and twelve calendar months per fiscal year. Keep the book identifier in the schema to avoid ambiguous records, but do not expose multi-entity consolidation or currency conversion in v1. Proposed defaults are listed in [README](README.md); they are not verified company policy.

**Access is exclusive:** all pages, inputs, downloads and reports belong to the active System Super Admin. CRM Finance, Sales Manager, HRM Admin and Payroll Officer are not Finance users. Do not make the module useful by widening its audience.

## 2. Information architecture

These are proposed routes, not currently working links. Each route has a `/vi` peer. A shared selection bar holds book, fiscal year, month/range, baseline, optional scenario/forecast and supported segment. Cash/position views do not pretend that a P&L segment filter applies to company cash or assets.

| Page EN / VI | Route | Essential content and actions |
|---|---|---|
| Overview / Tổng quan | `/finance` | Selected-month and YTD revenue, gross/operating profit, available cash, actual-versus-plan, cash-floor breach, missing-data and reconciliation alerts; links to the underlying rows. |
| Financial plan / Kế hoạch tài chính | `/finance/plans` | Year/version list; twelve-month input grid for P&L, cash and planned position where supplied; assumptions, annual allocation/copy, scenarios, frozen baseline and remaining-year forecast. |
| Monthly actuals / Số thực tế tháng | `/finance/actuals` | Period list and shared entry surface for recognized income/expenses, cash movements, balances and aging; draft, validation, CSV preview, source references, close and restatement. |
| Profit and loss / Lãi lỗ | `/finance/pnl` | Revenue to net profit; month, quarter and YTD; budget/actual/difference; same-period comparisons; margin percentage points; drill-down and explanation. |
| Cash flow / Dòng tiền | `/finance/cash-flow` | Opening/closing observed cash, operating/investing/financing movements, account observations, restricted cash, reconciliation, future cash and configured cash floor. |
| Revenue / Doanh thu | `/finance/revenue` | Recognized revenue by configured line/segment; recurring/one-off classification where explicitly defined; plan variance and direct-cost contribution. Collections remain a separate cash measure. |
| Costs / Chi phí | `/finance/costs` | Direct and operating costs, fixed/variable tags where known, payroll aggregate and cash-paid distinction, budget variance, shared/unallocated cost and explanations. |
| Working capital / Vốn lưu động | `/finance/working-capital` | Supplied month-end trade receivable/payable aging, due/overdue totals, source date, expected collection/payment assumptions and reconciliation to position. Other obligations remain separately classified. |
| Financial position / Tình hình tài chính | `/finance/position` | Month-end assets, liabilities and equity; cash/AR/AP links; balance equation and equity movement differences; complete versus incomplete status. |
| Settings / Thiết lập | `/finance/settings` | Book setup, annual definitions, cash accounts, fiscal calendar, required inputs, recognition/allocation policy notes, cash floor and variance thresholds. |
| Audit / Lịch sử | `/finance/audit` | Actor/time/reason for edits, imports, publish, close, reopen and exports; inspect before/after values and pinned revisions with filters and pagination. |

Revenue, Costs, P&L and Overview read the same underlying facts. There is one place to change a monthly input. Reports may link to that editor; they must not create a second editable copy. Exports belong to the relevant report, not a redundant new reporting subsystem.

## 3. Core workflows

### A. Set up the book

1. Confirm reporting scope, currency precision, time zone, fiscal start and first reporting month.
2. Review a starter chart and its expected input coordinates. Each P&L line initially expects only Unallocated; splitting a line activates explicitly selected segments/months, not every possible line × segment combination. Pin this applicability map, preserve documented Other lines and keep within the supported monthly input bound.
3. Supply the initial opening balances and cash observations with source/date. Historical months are entered explicitly; no seeded financial amounts.
4. Record recognition, direct/shared-cost allocation and pass-through treatment. Configure thresholds or leave alerts visibly unconfigured.

Setup can be saved incomplete. The module explains what is missing before a report can be treated as complete. The yearly semantic definitions freeze when the baseline is published or a month is closed; v1 uses Other/Unallocated with an explanation for genuinely new activity instead of reinterpreting history. See [Data model](DATA-MODEL.md).

### B. Build and freeze a monthly plan

The editor shows twelve monthly columns with annual totals for flows and end-period values for stocks. Support direct entry, copying a month, copying a prior year into a new draft, distributing an annual amount evenly/by entered weights, and cloning a version. A preview shows exactly which cells change, including remainders and existing values that would be replaced. Derived totals and ratios are read-only.

Assumptions are plain text associated with a line or version. A scenario adjusts explicit amounts or uses the deterministic annual allocation rule in FIN-R06. Growth helpers are deferred until their exact input/rounding contract is specified. Do not introduce arbitrary formulas, SQL, scripts, AI-generated numbers or a spreadsheet execution engine.

Saving a draft and publishing a baseline are distinct actions. Publication validates every required plan input and freezes the version. A single Super Admin may publish their own work; call it **Published**, not independently approved. Correcting an official plan requires an explicitly labeled revision/alternative; the original baseline remains visible and the default performance comparison is never silently reset.

### C. Enter, check and close a month

The monthly editor has sections for P&L, cash, position and working capital. Every required coordinate has an explicit amount, zero, missing state or not-applicable state permitted by its pinned definition. N/A cannot bypass cash observations, opening balances or reconciliation controls. Save incomplete drafts. Show pending edits, validation errors, evidence reference, source-as-of date, explanation and successful persistence separately; failed saves never display success. Current-month drafts are allowed; future-month actual entry/import is rejected. Close becomes eligible only after the local month has ended.

Offer CSV template download → upload → validate → preview differences → confirm one month → result receipt. Imports use stable codes, a documented decimal convention, the selected book and expected revision. Reject unknown columns/codes, duplicate coordinates, wrong currency and ambiguous numbers. Cash-account observations are entered through their structured form in v1. A multi-month file is staged and each month is committed separately with a visible receipt; failed months remain uncommitted. See exact limits and atomicity in [Data model](DATA-MODEL.md).

Close displays the missing-input list and reconciliation results, then freezes the complete current revision. Full month close requires the P&L, cash, aging and position blocks and every applicable required input/reconciliation in [Financial rules](FINANCIAL-RULES.md). A completed subsection is progress, not a closed month. It never manufactures balancing figures. Closing means the module's checks passed; it does not mean an accountant audited the books.

Reopening requires a reason and creates a new draft revision. Retain the old closed revision and its exports. Current views must show the period under revision, and dependent opening balances/forecasts must be flagged or revalidated before being represented as current closed information. A late supplier bill follows this explicit correction workflow.

### D. Compare and update the forecast

Month/quarter/YTD comparisons use the same period set, currency, compatible definitions and selected baseline. Complete YTD starts at fiscal-year start and ends at the latest contiguous closed month; a gap does not restart the interval. Draft actuals are a separate, labeled preview. Missing months do not become zero, and future budget months do not enter YTD variance. A book started midyear may show “Since reporting start” with the exact period range; complete YTD and full-year outlook remain incomplete until missing earlier actuals are supplied. Cash forecasting may still start from the latest reconciled close in the declared cutover chain.

Full-year outlook combines pinned closed actual revisions through the cutoff with an explicit remaining-month forecast. If the remaining budget is used, label that choice. No automatic fallback fills missing forecast cells. A cash forecast starts from reconciled actual cash and entered collection/payment timing. A twelve-month forward cash view may span two fiscal-year plans; show only the actually supplied horizon and mark gaps instead of claiming twelve months of coverage.

Material differences can carry a cause, next action and review note, authored by the Super Admin and pinned to baseline, actual revision, period, metric/line and segment. After close these are append-only audit annotations, not edits to frozen input explanations. This is a local note, not a task assignment or notification to another person. The overview prioritizes unresolved cash/reconciliation issues and then configured material differences. Directional color follows the metric's meaning, not simply whether the number rose.

## 4. Reporting and exports

Every report and export identifies scope, currency/unit, selected periods, generated time, baseline/version, actual revision set, forecast cutoff, completeness and unallocated costs. Pin the included line/segment/account scope, policy/settings snapshot, cash floor and calculation version too; later configuration must not change a reproduced report. Retain exact amounts even when the display is shortened to millions. Export the same filters and state the user is viewing; a draft export remains labeled draft.

V1 exports are bounded CSV and browser print views. Use server-side authorization, formula-safe text fields, safe filenames and no public object URLs. A downloaded export is not a backup of revision history. Never persist figures in localStorage, IndexedDB, public static JSON or a service worker cache.

## 5. UX and quality requirements

- Reuse `WorkspaceShell`, the repository's `DESIGN.md`, native forms/links and the existing owned icon set. Keep the monthly grid readable with a sticky row label/header and contained horizontal scrolling; it must not stretch the whole page.
- On mobile, use one-month entry and an explicit month selector. On desktop, support the twelve-column plan. Essential edit/save/close flows have a usable server-rendered form; enhanced pasting is optional.
- English/Vietnamese labels, errors, states and formats are peers. Locale changes preserve the same book/period/version; they do not reinterpret amounts or dates.
- Keyboard operation, labeled fields, associated errors, visible focus and textual favorable/adverse labels are required. A chart has a corresponding numeric table; missing points are gaps.
- No data: show setup or empty states. Incomplete data: show coverage and missing rows. Stale revision: show a conflict and preserve pending edits for review. Service unavailable: show retry guidance without exposing data or claiming a save succeeded.

## 6. Deferred scope

Keep these out of v1: multi-currency/FX, group consolidation, journal entries/double-entry GL, invoices and bank reconciliation at transaction level, statutory/tax filing, payroll calculation, automatic depreciation/recognition, automatic CRM/HRM writes or sync, MRR/ARR claims without subscription source data, AI forecasts, public sharing, scheduled report messages and transfers/payments. A future weekly cash forecast can address intra-month shortfalls; the monthly view cannot prove money is available on each payment date.

**Strongest objection:** manual totals duplicate work already done elsewhere and may be inaccurate. The cheapest validation is to run the workflow against one synthetic fixture and one authorized month prepared outside the app, measure entry effort, and reconcile the results. If reliable monthly inputs do not exist, improve their source and definitions before adding more dashboards. Acceptance and continuation thresholds are in [Delivery](DELIVERY.md).

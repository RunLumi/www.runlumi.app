# Finance — monthly planning and management reporting

[Tiếng Việt](README.vi.md) · **Finance v1 implementation** · 2026-10-18

Finance is a private Lumi Workspace module for the **active System Super Admin (EmDash role 50)**. It combines a financial plan broken down by month, monthly actual entry, comparison, reconciliation and reporting. Structured facts, immutable versions, import receipts and audit evidence are stored in the existing `DB` / `lumi-jobs` Cloudflare D1 database.

The owner first requested a complete specification, then explicitly requested moving it to `docs/specs`, implementing all features, creating a PR and merging it. This is the canonical specification directory. [Status](STATUS.md) records actual verification and release evidence; documentation alone does not establish deployment or real-data readiness.

## Documentation

| Document | Responsibility | Vietnamese |
|---|---|---|
| [Product](PRODUCT.md) | Eleven pages, workflows and UX | [Sản phẩm](PRODUCT.vi.md) |
| [Financial rules](FINANCIAL-RULES.md) | Exact amounts, completeness, variance, reconciliation and examples | [Quy tắc](FINANCIAL-RULES.vi.md) |
| [Data model](DATA-MODEL.md) | D1 grain, immutable history, transactions and limits | [Dữ liệu](DATA-MODEL.vi.md) |
| [Architecture](ARCHITECTURE.md) | Identity, routing, integration boundaries and API | [Kiến trúc](ARCHITECTURE.vi.md) |
| [Delivery](DELIVERY.md) | FIN-01–18 requirements and acceptance scenarios | [Nghiệm thu](DELIVERY.vi.md) |
| [Runbook](RUNBOOK.md) | Setup, monthly operation, corrections and recovery | [Vận hành](RUNBOOK.vi.md) |
| [Status](STATUS.md) | Completed checks and outstanding operational setup | Shared EN/VI |

Product owns scope; Financial rules owns calculations; Data model owns persistence; Architecture owns access and HTTP behavior. Resolve discrepancies explicitly. Status is an evidence record.

## Implemented routes

| Route | Purpose |
|---|---|
| `/finance` | Overview, material variance and cash outlook |
| `/finance/plans` | Twelve-month budgets, allocation/copy preview, baseline, scenarios and forecasts |
| `/finance/actuals` | Monthly sources, cash observations, reconciliation, close/reopen and history |
| `/finance/pnl` | Recognized revenue, costs, profit and recomputed margins |
| `/finance/cash-flow` | Operating/investing/financing cash flow and balance reconciliation |
| `/finance/revenue` | Revenue categories, segments and plan comparison |
| `/finance/costs` | Direct/shared costs, fixed/variable classification and variance |
| `/finance/working-capital` | Gross AR, allowance, AP, aging and collection/payment outlook |
| `/finance/position` | Assets, liabilities, equity and independent controls |
| `/finance/settings` | Entity, currency/calendar, policy, thresholds, definitions, segments and accounts |
| `/finance/audit` | Filtered change history, receipts and append-only explanations |

All eleven routes have `/vi` peers. Native server forms support operation without JavaScript. CSV import previews changes and commits each month atomically. Exports use immutable captured snapshots and support exact idempotent replay.

The existing Workspace role named **Finance** continues to mean CRM payment/commission permissions (`crm.finance`). It does not grant corporate Finance access. No grantable role combination qualifies; CRM tokens cannot authenticate this module.

## First real use

The migration creates no entity, policy, account, opening balance or sample financial facts. The deployment switch enables the code; the owner must also explicitly configure and enable a book. Until then financial navigation/cards remain hidden and financial requests fail closed. Super Admin can open `/finance/settings` from the Workspace setup link.

Confirm entity/scope, currency/precision, fiscal start, timezone, first reporting month and recognition policy. Choose the earliest month intended for backfill before freezing history. VND, January and `Asia/Ho_Chi_Minh` are editable setup suggestions. Cash-floor and material-variance thresholds start unset; cost behavior starts unspecified. Blank remains missing, and zero must be entered explicitly.

V1 is a single-entity management reporting book with manual monthly sources. Automatic CRM/HRM extraction, payments, tax filing, general-ledger posting, multi-currency and group consolidation are outside its specified scope. Finance creates no external notifications or scheduled purge.

## Code and evidence

Start with [the model](../../../src/lib/finance/model.ts), [D1 service](../../../src/lib/finance/store.ts), [access boundary](../../../src/lib/finance/access.ts), [shared pages](../../../src/components/finance/FinancePage.astro) and [Worker journey](../../../tests/integration/finance.integration.test.mjs). Initial repository analysis used [`30c75a6`](https://github.com/RunLumi/www.runlumi.app/commit/30c75a64ba1184f241a421d2591a5b5be9db6426); implementation also incorporates the subsequent HRM job-description change from main.

Main follows the existing release pipeline. Application deployment and the owner's first real book setup are separate observable events. See [Status](STATUS.md) and the [Runbook](RUNBOOK.md).

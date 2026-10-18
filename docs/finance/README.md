# Finance — monthly planning and management reporting

[Tiếng Việt](README.vi.md) · **Status: PROPOSED / NOT IMPLEMENTED** · 2026-10-18

Finance is a proposed private module in Lumi Workspace for the **System Super Admin only**. It brings a monthly financial plan, monthly actuals and meaningful comparisons into one place. This change specifies the product; it does not create routes, permissions, migrations, sample balances or production settings.

## Read the specification

| Document | What it decides | Vietnamese |
|---|---|---|
| [Product](PRODUCT.md) | Scope, 11 pages, user journeys, inputs, outputs and UX | [Sản phẩm](PRODUCT.vi.md) |
| [Financial rules](FINANCIAL-RULES.md) | Recognition versus cash, formulas, completeness, variance, reconciliation and worked examples | [Quy tắc tài chính](FINANCIAL-RULES.vi.md) |
| [Data model](DATA-MODEL.md) | D1 grain, tables, revision history, constraints, atomic writes and recovery | [Mô hình dữ liệu](DATA-MODEL.vi.md) |
| [Architecture](ARCHITECTURE.md) | Current repository evidence, permissions, integration boundaries and API contracts | [Kiến trúc](ARCHITECTURE.vi.md) |
| [Delivery and acceptance](DELIVERY.md) | Requirement IDs, phased delivery, acceptance cases, release and stop conditions | [Triển khai và nghiệm thu](DELIVERY.vi.md) |
| [Status](STATUS.md) | What is actually implemented and what has been verified | Shared EN/VI record |

Read Product → Financial rules → Architecture/Data model → Delivery. Product owns scope; Financial rules owns calculations; Data model owns persistence and transaction rules; Architecture owns access and HTTP behavior. A disagreement between documents is a defect to resolve, not permission to choose the weaker rule. Status is the evidence record, not a second roadmap.

## Confirmed request versus proposed design

**Owner request, 2026-10-18:** add a Finance module to this repository; only Super admin can view it; include the important finance pages and a plan broken down by month; allow monthly actual entry and comparison; store data in D1; analyze and document the requirements in `docs/finance` first.

| Decision | Classification | Specification |
|---|---|---|
| Documentation before implementation | Requested | This PR changes documentation only. |
| Access | Requested; mapped to existing identity | Active EmDash role 50; no other Workspace role or combination qualifies. |
| Storage | Requested; binding proposed | Structured `finance_*` tables in existing `DB` / `lumi-jobs`, not `CONTENT_DB`. |
| Reporting scope | Proposed | One management book for one explicitly named entity/scope; no implicit group consolidation. |
| Currency/calendar | Proposed defaults | VND, January fiscal start, Asia/Ho_Chi_Minh; confirmed in setup before the first value. |
| Actuals | Proposed | Manually entered monthly facts, optionally through a reviewed CSV template; no automatic CRM/HRM ingestion in v1. |
| Baseline/history | Proposed | Immutable published budget; separate forecast/scenarios; immutable closed actual revisions. |
| Finance meaning | Proposed | Internal management reporting, not a general ledger, audited accounts or tax filing system. |

The existing Workspace role named **Finance** is a CRM capability (`crm.finance`). It must not receive access to the new Finance module. Existing CRM views keep their current permissions; confidential budgets and company balances must not be added to their payloads. See [Architecture](ARCHITECTURE.md).

## Practical first release

V1 consists of Overview, Financial Plan, Monthly Actuals, P&L, Cash Flow, Revenue, Costs, Working Capital, Financial Position, Settings and Audit. These are 11 focused views over shared facts, not 11 separate data stores. All have English and Vietnamese peers.

The first useful implementation slice is one entity, one year and one closed month with a frozen baseline, reconciled cash and an export that can be reproduced. Remaining v1 views follow the same data and access rules. Completing one slice is not permission to claim the whole module is finished.

## Decisions needed before real data

| Decision to confirm | Proposed handling until confirmed |
|---|---|
| Reporting entity/scope, currency, fiscal year and first month | Setup is incomplete; do not infer the legal entity from the brand. |
| Opening cash, balances and source of monthly actuals | Empty inputs; only explicitly labeled synthetic fixtures in tests. |
| Revenue/expense recognition, direct-cost allocation, gross/net treatment of pass-through amounts | Record the management policy and supporting source; no automated recognition or tax rates. |
| Cash floor and material-variance thresholds | No numeric defaults presented as company policy; show raw differences until configured. |
| Retention, backup ownership and recovery expectations | Preserve financial history; no scheduled purge; finalize retention/disposition policy before production use. |

These questions do not block the documentation or a synthetic prototype. They do block presenting real reports as complete and correctly configured. No new external messages, payments or scheduled financial automations are authorized by this specification.

## Evidence boundary

Repository inspection is pinned to [`30c75a6`](https://github.com/RunLumi/www.runlumi.app/commit/30c75a64ba1184f241a421d2591a5b5be9db6426). Architecture links to the controlling code and records existing behavior separately from proposals. Financial rules and Data model cite relevant primary references. Proposed defaults, performance targets and synthetic examples are not statements about Lumi's actual finances.

**Completion of this task:** coherent, reviewable requirements, independently reviewed for access and financial consistency, committed on a documentation branch with a PR. Runtime delivery and production activation are separate future work. A merge to `main` triggers the existing production release pipeline; see [Delivery](DELIVERY.md).

# Finance — architecture, access and API contract

**Status:** implementation candidate; production activation and verification evidence are tracked separately in [STATUS.md](STATUS.md). **Reviewed:** 2026-10-18. **Original source baseline:** `30c75a64ba1184f241a421d2591a5b5be9db6426`. [Tiếng Việt](ARCHITECTURE.vi.md).

This document describes the Finance implementation in the working branch and its required security boundaries. The original baseline had no corporate Finance module; the source files linked below now implement it. Repository code is not proof of a live deployment or completed acceptance gate. Read [product requirements](PRODUCT.md), [financial rules](FINANCIAL-RULES.md) and [data model](DATA-MODEL.md) together. Defaults remain starting proposals, not verified company policy.

## 1. Repository integration

| Source | Behavior and implication |
|---|---|
| [Identity](../../../src/lib/admin-auth.ts), [Workspace permissions](../../../src/lib/workspace/roles.ts) | An active EmDash account with **role exactly 50** is System Super Admin. It is not a grantable Workspace role. Administrators receive declared capabilities. |
| [Workspace roles](../../../src/lib/workspace/roles.ts) | The existing `finance` role receives only `workspace.access`, `crm.access`, `crm.finance`. This **CRM Finance role cannot enter the new module**. |
| [Middleware](../../../src/middleware.ts), [Finance boundary](../../../src/lib/finance/access.ts), [navigation](../../../src/lib/workspace/nav.ts) | Finance has its own session/readiness boundary, a permission-filtered module and private response headers. A hidden menu is not the authorization check. |
| [Bindings](../../../wrangler.jsonc), [migration](../../../migrations/0038_finance.sql) | Finance tables use the existing `DB` binding, the shared `lumi-jobs` D1 database. `CONTENT_DB` remains EmDash identity/content storage. |
| [CRM business model](../../../src/lib/crm/routes/business-model.ts), [evidence](../../../src/lib/crm/business-evidence.ts) | Sales Managers and CRM Finance can read commercial aggregates. Its actor-free evidence loader is not a Finance authorization boundary or data source. |
| [HRM service](../../../src/lib/hrm/service.ts), [payroll](../../../src/lib/hrm/payroll.ts) | HRM's gates, issued records and version guards remain independent. Finance neither inherits HRM grants nor reads payroll data in v1. |

## 2. Module shape and source ownership

V1 has one management book, one explicitly selected legal entity and one base currency, defaulting to VND before data exists. Referenced configuration is preserved with published plans and closed revisions. There are no seeded financial amounts, executable formulas, credentials or attachment binaries in Finance records.

All eleven page roots have matching [Vietnamese SSR routes](../../../src/pages/vi/finance/) and use [FinancePage](../../../src/components/finance/FinancePage.astro) inside [WorkspaceShell](../../../src/layouts/WorkspaceShell.astro), with `module="finance"`. The [shared page loader](../../../src/lib/finance/pages.ts) supplies both locales; language changes presentation, not records or money.

| Page source / route | Responsibility |
|---|---|
| [Overview](../../../src/pages/finance/index.astro) — `/finance` | Completeness, comparison, cash floor and configured material variances |
| [Plans](../../../src/pages/finance/plans/index.astro) — `/finance/plans` | Twelve-month grid, monthly editor, allocation/copy previews, baseline, forecasts/scenarios |
| [Actuals](../../../src/pages/finance/actuals/index.astro) — `/finance/actuals` | Monthly facts, observations, sources, CSV, revision history, close/restatement |
| [P&L](../../../src/pages/finance/pnl/index.astro) — `/finance/pnl` | Monthly, quarterly, YTD and yearly income/expense comparisons |
| [Cash flow](../../../src/pages/finance/cash-flow/index.astro) — `/finance/cash-flow` | Movements, accounts, reconciliation and supplied forecast horizon |
| [Revenue](../../../src/pages/finance/revenue/index.astro) — `/finance/revenue` | Recognized revenue, segments and variance |
| [Costs](../../../src/pages/finance/costs/index.astro) — `/finance/costs` | Direct/operating costs, explicit cost behavior and payroll distinction |
| [Working capital](../../../src/pages/finance/working-capital/index.astro) — `/finance/working-capital` | AR/AP aging, overdue totals and reconciliation |
| [Position](../../../src/pages/finance/position/index.astro) — `/finance/position` | Assets, obligations, equity and continuity checks |
| [Settings](../../../src/pages/finance/settings/index.astro) — `/finance/settings` | Book, calendar, definitions, segments, accounts and thresholds |
| [Audit](../../../src/pages/finance/audit/index.astro) — `/finance/audit` | Changes, publication, close/reopen, annotations and export history |

[model.ts](../../../src/lib/finance/model.ts), [calculations.ts](../../../src/lib/finance/calculations.ts) and [reports.ts](../../../src/lib/finance/reports.ts) define shared money, completeness and report semantics. [store-types.ts](../../../src/lib/finance/store-types.ts) and [store.ts](../../../src/lib/finance/store.ts) define commands, D1 persistence and guards; [csv.ts](../../../src/lib/finance/csv.ts) and [exports.ts](../../../src/lib/finance/exports.ts) own import/export rules. UI rendering stays in [components/finance](../../../src/components/finance/), with namespaced [finance.css](../../../src/styles/finance.css).

## 3. Super Admin permission boundary

The following capabilities are declared centrally in [roles.ts](../../../src/lib/workspace/roles.ts), with **no grant in any assignable role's permission list**:

| Capability | Operation |
|---|---|
| `finance.access` | Read Finance pages and reports |
| `finance.plan.manage` | Create/edit/publish plans and create forecasts/scenarios |
| `finance.actuals.manage` | Enter actuals and commit actual imports |
| `finance.period.close` | Close a reconciled monthly revision |
| `finance.period.reopen` | Create a draft restatement with a reason |
| `finance.export` | Export authorized reports |
| `finance.configure` | Manage book, definitions and accounts |
| `finance.audit.read` | Read Finance audit history |

Services check the relevant capability and Super Admin invariant. Actor identity comes from the current EmDash session, never request fields. CRM Finance, HRM Admin, Payroll Officer and **all grantable roles combined** remain denied. An `Authorization` header is rejected even alongside a valid session: CRM bearer tokens and MCP identities are unsupported. There is no new login cookie or grantable Finance administration role.

Super Admin bypasses the Workspace member lookup. Removing a Workspace grant therefore does not revoke Super Admin; EmDash disablement/demotion must affect the next request. One authorized administrator may draft, publish and close; no two-administrator approval process is invented. HRM's independent approval rules remain intact.

## 4. Request, navigation and privacy enforcement

[Middleware](../../../src/middleware.ts) routes both locales and `/api/finance/` through [financeBoundary](../../../src/lib/finance/access.ts) before private queries. Pages, APIs and store entry points also validate authority. [Safe login redirects](../../../src/lib/admin-auth.ts) admit local Finance destinations and preserve filters without accepting external URLs. [Workspace home](../../../src/lib/workspace/pages.ts) and navigation use permission/readiness metadata; non-admin home loaders do not query financial totals.

Readiness requires the schema, a configured/enabled book with policy notes and `FINANCE_LIVE_ENABLED="true"`. Disabled Finance returns `503` after authentication and hides its module/card. All financial reads, including audit/import previews/exports, follow this rule. The setup exceptions are `/finance/settings`, its `/vi` peer, `/api/finance/settings`, and POST `/api/finance/commands`; the latter still permits only configuration commands until ready. Thus initial setup does not depend on its own completion. HRM readiness is unrelated.

Every Finance response, including errors, redirects and downloads, has `Cache-Control: private, no-store`, `nosniff`, `Referrer-Policy: same-origin`, `noindex,nofollow` and frame denial. There is no prerendered/public dataset, sitemap entry, shared financial cache, browser persistence or analytics payload. Sensitive figures and notes never enter filter URLs.

POST mutations and exports require an exact Origin match; cross-site/same-site fetch metadata and opaque or absent Origin are rejected. Origin-less clients are not supported, and no alternate CSRF-token flow exists in v1. Supported content types and bodies are bounded. GET/HEAD do not mutate financial state.

Native forms POST their current page. The loader uses the shared [HTTP parser](../../../src/lib/finance/http.ts) and store, redirects with `303` on success, and rerenders errors with submitted fields retained. Core workflows work without JavaScript; the CSV file picker only enhances a working paste form. Report exports POST their separate endpoint.

## 5. Session API and command contract

The [API catch-all](../../../src/pages/api/finance/[...path].ts) calls [api.ts](../../../src/lib/finance/api.ts). This is a bounded internal session API, not an external integration surface.

| Endpoint | Supported operation |
|---|---|
| `/api/finance/overview` | GET selected-period report view |
| `/api/finance/plans`, `/api/finance/actuals` | GET scoped versions, facts and related definitions |
| `/api/finance/reports` and `/reports/{pnl,cash-flow,revenue,costs,working-capital,position}` | GET allowlisted reports and compatible comparison selections |
| `/api/finance/settings` | GET setup/configuration |
| `/api/finance/audit`, `/api/finance/imports` | GET authorized audit or staged imports |
| `/api/finance/template` | GET exact writable CSV coordinates for selected kind/year/plan/period |
| `/api/finance/commands` | POST a validated command envelope |
| `/api/finance/exports` | POST `report.export`; private CSV with a recorded manifest |

JSON mutations use `{request_key, command:{action,...}}`; native forms use `intent`, `request_key`, `return_to` and named fields. The typed actions are `book.save`, `definition.save`, `account.save`, `plan.create`, `plan.save`, `plan.publish`, `actual.open`, `actual.save`, `actual.close`, `actual.reopen`, `import.preview`, `import.commit`, `import.discard`, `annotation.add` and `report.export`. Native `plan.preview` and `plan.copy.preview` calculate proposed changes without writing D1; applying uses `plan.save`.

Mutable targets carry `expected_version` plus period/revision versions where relevant. Unexpected fields and wrong targets are rejected. JSON money is serialized as decimal minor-unit strings; form/CSV amounts use the documented decimal currency convention. Audit uses action/actor filters and a composite `createdAt|id` cursor, at most 100 events per page. Plan and selected-month history navigation loads the latest 100 entries plus required baseline, selected, forecast and current/source revisions; these scoped additions may exceed 100. Imports expose the latest 30 batches. Financial totals are never silently truncated.

Authentication/readiness precede idempotency replay. An identical stored outcome is returned before fresh version/state validation; only a new mutation runs those guards. Successful close retries still return their receipt, while revoked users cannot replay. Changed content under the same scoped key conflicts. Current-month drafts are allowed, future actual save/import is rejected, and close waits until local month-end.

| HTTP status | Meaning in the implemented contract |
|---|---|
| `401` / page login redirect | Missing, expired or disabled identity; unsupported bearer authentication |
| `403` | Active identity lacks Finance authority, or POST fails Origin validation |
| `404` | Authorized request names an absent object/route |
| `400` | Malformed payload or domain validation, including invalid temporal/source input |
| `422` | Native-field/selection validation where explicitly raised by the HTTP layer |
| `409` | Stale version, key conflict, changed source, locked period or immutable target |
| `413` / `415` | Oversized or unsupported body |
| `503` | Module/settings/schema/database unavailable |

Errors expose safe codes, not SQL or unauthorized data. There is no separate `423` contract. Manifests pin entity/currency, periods, baseline/actual revisions, source completeness, generation time, definitions, calculation version, cash floor and variance policy. CSV neutralizes formula-like text; downloads have no public links.

## 6. Atomic persistence and imports

Exact integer arithmetic and explicit rounding follow [Financial rules](FINANCIAL-RULES.md). Guard assertions, writes, audit and idempotency outcome commit in one D1 batch. A failed conditional update must fail its transaction; checking `meta.changes` after unrelated writes committed is insufficient.

Close atomically promotes `authoritative_closed_revision_id`; reopen creates `working_revision_id` while preserving the old snapshot. Changed prior cash closes make dependent openings/forecasts stale. Later explanations append annotations pinned to revision, baseline and line/segment, never edit closed facts. Definition setup precedes financial facts; any plan publication or monthly close freezes the year's semantics. Typed restricted-cash and equity controls are excluded from unrelated totals.

CSV columns are `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note`. Only `entered|not_applicable` import; N/A, negative and Other entries require notes. Both plan and actual staging require source date/scope and references for each included block. Cash-account observations remain form-only. Blank template rows must be filled or removed; clearing is an explicit draft edit.

Bounds are 256 KiB UTF-8, 2,400 rows/file, 200 inputs/month and 12 months in one fiscal year. Preview stores a manifest without changing facts. Commit selects one whole month, checks captured versions/definitions/fingerprint and writes atomically. It can create an actual draft for a previously empty month; closed months need explicit reopen first. Plan commits atomically advance plan/manifest versions and pending expectations only for that manifest's own preceding mutation; external edits need re-preview. Actual months retain independent captured versions. Discard/expiry removes pending payload only; committed receipts and provenance survive.

## 7. Isolation, tests and release evidence

Manual Finance records are authoritative in v1. [CRM cash](../../../src/lib/crm/money.ts) is not recognized revenue, commission estimates are not payouts, and [HRM reports](../../../src/lib/hrm/reports.ts) are not payroll expense inputs. Future adapters need separately reviewed mappings. Finance writes only its own audit: no Finance payloads enter `crm_events`, `crm_notifications`, CRM business-model views, Lark, MCP, HRM notifications or public content.

Dedicated suites cover [access/HTTP](../../../tests/finance-access-http.test.ts), [calculations](../../../tests/finance-calculations.test.ts), [CSV](../../../tests/finance-csv.test.ts), [reports](../../../tests/finance-reports.test.ts), [exports](../../../tests/finance-exports.test.ts), [D1 store](../../../tests/finance-store.test.ts) and [Worker integration](../../../tests/integration/finance.integration.test.mjs). Required negative cases include role unions, demoted/disabled sessions, both locales, bearer tokens, all-status cache headers, CSRF, stale/repeated commands, immutable versions and import rollback. Source presence does not assert these gates passed; [STATUS](STATUS.md) records actual results.

The candidate migration is [0038_finance.sql](../../../migrations/0038_finance.sql), additive to shared D1. [Release](../../../scripts/release.mjs) applies migrations before deploying main; merging main is production release. Verify migration numbering against main and existing modules before release. Time Travel affects ATS/CRM/HRM too, so recovery needs a coordinated database plan. [Delivery](DELIVERY.md) defines release and operational acceptance.

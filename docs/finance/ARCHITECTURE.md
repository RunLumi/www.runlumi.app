# Finance — architecture, access and API contract

**Status:** PROPOSED; requirements only, not implemented or enabled. **Reviewed:** 2026-10-18. **Source baseline:** `30c75a64ba1184f241a421d2591a5b5be9db6426`. [Tiếng Việt](ARCHITECTURE.vi.md).

This design implements the requested Super-admin-only Finance module. Technical choices below remain proposed; this document does not authorize production activation. Read [product requirements](PRODUCT.md), [financial rules](FINANCIAL-RULES.md) and [data model](DATA-MODEL.md) together. Examples and tests use synthetic data.

## 1. What exists today

| Source | Verified behavior and implication |
|---|---|
| [Identity](../../src/lib/admin-auth.ts), [Workspace permissions](../../src/lib/workspace/roles.ts) | An active EmDash account with **role exactly 50** is System Super Admin. It is not a grantable Workspace role. Administrators receive all declared permissions. |
| [Workspace roles](../../src/lib/workspace/roles.ts) | The existing `finance` role receives only `workspace.access`, `crm.access`, `crm.finance`. This **CRM Finance role must not receive access to the new module**. |
| [Middleware](../../src/middleware.ts), [navigation](../../src/lib/workspace/nav.ts), [WorkspaceShell](../../src/layouts/WorkspaceShell.astro) | Private route trees, menus and a shared bilingual shell already exist. Finance is absent. Hiding a menu does not authorize a loader. |
| [Bindings](../../wrangler.jsonc), [environment access](../../src/lib/ats.ts) | `DB` is the shared `lumi-jobs` D1 database. `CONTENT_DB` belongs to EmDash identity/content. Structured Finance data belongs in `DB`. |
| [CRM business model](../../src/lib/crm/routes/business-model.ts), [evidence](../../src/lib/crm/business-evidence.ts) | Sales Managers and CRM Finance can read commercial aggregates. Its actor-free evidence loader is not a Finance authorization boundary. |
| [HRM service](../../src/lib/hrm/service.ts), [payroll](../../src/lib/hrm/payroll.ts) | HRM has policy/deployment gates, immutable issued records, integer money, version guards and idempotent commands. These are useful patterns, not permission shortcuts. |

The baseline contains no corporate Finance module. Repository evidence establishes code behavior, not live deployment readiness.

## 2. Module shape and ownership

The proposed first release has one financial book, one explicitly selected legal entity and one base currency, defaulting to VND before data exists. Historical configuration cannot be silently changed after records reference it. Monthly plans, frozen budgets, separate forecasts/scenarios, actual revisions and observations follow the data model.

Each route below has an equivalent `/vi` route and uses `WorkspaceShell` with `module="finance"`. Shared server loaders supply both languages; locale changes presentation, never records or money.

| Page root | Responsibility |
|---|---|
| `/finance` | Overview, completeness and exceptions |
| `/finance/plans` | Monthly plans, frozen baseline and separate forecasts/scenarios |
| `/finance/actuals` | Monthly input, revision history, close and restatement |
| `/finance/pnl` | Monthly/YTD income and expense comparisons |
| `/finance/cash-flow` | Opening cash, cash movements, closing cash and forecast |
| `/finance/revenue` | Revenue categories, dimensions and plan comparison |
| `/finance/costs` | Direct costs, operating expenses and variance |
| `/finance/working-capital` | Receivable/payable observations and aging |
| `/finance/position` | Financial-position observations and reconciliation |
| `/finance/settings` | Book, reporting calendar, definitions and dimensions |
| `/finance/audit` | Access, changes, freezes, close/reopen and exports |

Proposed services live under `src/lib/finance/`; endpoints under `src/pages/api/finance/`. Calculations, validation and read models remain server-side. Tables use `finance_*`. Do not store credentials, sessions, attachment binaries or executable formulas in Finance records. No production source import or scheduled integration ships in v1.

## 3. Super Admin permission boundary

Declare these capabilities centrally in [roles.ts](../../src/lib/workspace/roles.ts), with **no entry in any grantable role's permission list**:

| Capability | Authorized operation |
|---|---|
| `finance.access` | Read Finance pages and reports |
| `finance.plan.manage` | Create/edit plans, freeze a budget, create forecasts/scenarios |
| `finance.actuals.manage` | Enter actuals and commit actual imports |
| `finance.period.close` | Close a reconciled monthly revision |
| `finance.period.reopen` | Create a draft restatement with a reason |
| `finance.export` | Export authorized financial reports |
| `finance.configure` | Manage book configuration and definitions |
| `finance.audit.read` | Read Finance audit history |

Each service entry checks the relevant capability and the Super Admin invariant. Actor identity comes from the current EmDash session; request fields cannot supply authority. CRM Finance, HRM Admin, Payroll Officer and even **all grantable roles combined** remain denied. There is no new password, application login cookie or Finance role assignment UI.

An EmDash administrator bypasses the Workspace member lookup today. Consequently, deleting a Workspace grant does not revoke Super Admin; account disablement or demotion in EmDash must take effect on the next request. Test existing sessions after both changes.

The same authorized administrator may draft, freeze and close management records. Do not impose an invented requirement for two administrators. Every action remains attributed, versioned and auditable; HRM's separate-person approval rules remain intact within HRM.

## 4. Request, navigation and privacy enforcement

Add `/finance` and its `/vi` peer, plus `/api/finance/`, to middleware before any broad matching route. Authenticate and authorize **before queries**, including invalid IDs and unknown actions. Register the module in [nav.ts](../../src/lib/workspace/nav.ts), extend [NavIcon](../../src/components/workspace/NavIcon.astro), and add its card in [Workspace home](../../src/lib/workspace/pages.ts) behind the same permission and readiness checks. Non-admin home loaders must not fetch financial totals.

Add Finance destinations to the [safe login redirect allowlist](../../src/lib/admin-auth.ts). Preserve local-path validation and query filters without accepting external redirects. The shared shell is presentation; pages, API handlers, services, exports and attachment handlers still enforce their own boundary.

Proposed readiness requires implemented migrations, valid book settings, explicit configuration enablement and a deployment switch such as `FINANCE_LIVE_ENABLED=true`. Until then, Finance navigation/cards stay hidden and authorized financial requests return an unavailable state. Once the schema exists, protected `/finance/settings` and its configuration actions permit initial setup; otherwise settings would depend on their own completion. Authenticate before disclosing readiness. HRM readiness is independent.

All Finance responses, including errors, redirects and downloads, carry `Cache-Control: private, no-store`; use `nosniff`, a restrictive referrer policy and `noindex,nofollow`. No prerendering, public sitemap entry, shared cache, browser persistence or third-party analytics payload may contain financial records. Reuse the shell's accessibility and responsive behavior; verify wide month grids at narrow widths.

Session mutations and exports require same-origin requests, explicit supported content types and bounded bodies. The current [sameOrigin helper](../../src/lib/http.ts) accepts some missing-Origin/same-site requests; it is not sufficient evidence by itself. Proposed Finance policy checks an exact Origin match, or a verified anti-CSRF token for an explicitly supported Origin-less client. Reject cross-origin and opaque origins; CORS does not grant access. GET requests do not change financial state.

## 5. Proposed session API

These are internal browser endpoints, not an external integration API. A CRM bearer token or MCP identity never authenticates Finance, including a token owned by Super Admin. Do not register Finance tools in CRM MCP or permit arbitrary SQL, table names or field selection.

| Endpoint family | Reads and POST actions |
|---|---|
| `/api/finance/overview` | GET selected book/month overview |
| `/api/finance/plans` | GET revisions; POST `create`, `save`, `freeze`, `clone_forecast`, `clone_scenario` |
| `/api/finance/actuals` | GET working/closed revision; POST `save`, `close`, `reopen` |
| `/api/finance/reports` | GET allowlisted report, month range, baseline and revision selection |
| `/api/finance/settings` | GET configuration; POST explicit settings/definition/dimension actions |
| `/api/finance/audit` | GET filtered audit; POST `annotate` with the target's plan/actuals permission |
| `/api/finance/imports` | POST `preview`, `commit`, `discard`; GET an authorized staged preview |
| `/api/finance/exports` | POST bounded report export with a recorded manifest |

Mutable commands carry `expected_version` and a scoped `idempotency_key`; creation still needs a key. Reject unexpected fields; validate targets, periods, dimensions and filters against the book. Lists default to 25, maximum 100 rows. Imports require the target's plan/actuals capability. [DATA-MODEL.md](DATA-MODEL.md) controls bounds and key scope; never truncate totals silently.

Check current identity, permissions and readiness before replay lookup. Return an identical stored outcome before validating fresh versions/state; only new mutations run those guards. Thus a successful close can be retried after its revision became immutable, while a revoked user cannot retrieve the receipt. Same scoped key with different content returns `409`.

Current-month actual drafts are allowed. Reject future actual saves/imports; close only after that month ends in the book's timezone. Use `422` for these temporal violations.

| Status | Meaning |
|---|---|
| `401` / page login redirect | Missing, expired or disabled identity |
| `403` | Active identity lacks Finance authority |
| `404` | Authorized request names a nonexistent or wrong-book object |
| `409` | Stale version, conflicting idempotency reuse or changed source state |
| `423` | Attempt to modify a locked period or immutable frozen/closed revision |
| `422` | Field, arithmetic, completeness or reconciliation validation failed |
| `413` / `415` | Oversized or unsupported body |
| `503` | Module disabled, required schema/settings unavailable or database unavailable |

Return safe field/row error codes without SQL or unauthorized values. Report/export manifests pin entity, currency, periods, baseline/actual revisions, completeness, generation time, settings/cash-floor policy and calculation versions. Later settings cannot rewrite old report meaning. Neutralize formula-like CSV text; never create public download links.

## 6. Atomic persistence and import contract

Validate and calculate with exact integer money and explicit rounding from [FINANCIAL-RULES.md](FINANCIAL-RULES.md). Persist guard assertions, domain writes, audit and the idempotency outcome in one D1 batch. [HRM command guards](../../src/lib/hrm/service.ts) illustrate the pattern. A conditional UPDATE affecting zero rows must fail the transaction; checking `meta.changes` only after unrelated writes committed is insufficient.

Closing atomically promotes `authoritative_closed_revision_id`; reopening creates `working_revision_id` without changing the old snapshot. Forecasts never overwrite budgets. A changed prior cash close makes dependent openings stale; require explicit reconciliation. Post-close notes append audit annotations pinned to period/revision, line/segment and baseline; they do not mutate closed facts. Typed forecast-restriction and equity-movement controls follow the data model and are excluded from unrelated totals.

CSV targets one book/currency/definition set and plan or working actual revisions, at most one fiscal year. Columns: `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note`. Import states are only `entered|not_applicable`; notes are required for N/A, negative amounts and Other. The staging form supplies `source_as_of` and source scope/context; cash-account observations remain form-only. Preview shows errors, missing/zero, totals and duplicates; it writes no facts. Clearing is a separate draft action.

Each commit selects one month and atomically checks versions, locks, definitions and checksum with its writes. For annual plans, compare-and-swap guards atomically increment `plan.version` and `manifest.version`, advancing pending months' expected parent version only for this manifest's own known preceding mutation. External plan edits require re-preview. Actual-month targets retain independently captured period/revision versions. Show committed/pending/conflicted months separately; later failures never undo earlier receipts. Discard/expiry removes only uncommitted payload, preserving committed receipts/references and replay. No partial-month write or silent overwrite; apply data-model limits.

## 7. Integration isolation and release evidence

Manual Finance records are authoritative in v1. [CRM cash arithmetic](../../src/lib/crm/money.ts) is not recognized revenue; [CRM commission](../../migrations/0004_crm_commission.sql) estimates are not payouts. Future imports need explicit mapping/review. Use `finance_audit_events`; never send Finance payloads to `crm_events`, `crm_notifications`, CRM reports/business-model views, Lark, MCP, HRM notifications or public content.

[HRM reports](../../src/lib/hrm/reports.ts) contain counts, not payroll expenses. Future payroll evidence must honor HRM enablement, legal entity, currency and issued-versus-paid states, using only necessary aggregates. Direct D1 access must not bypass that gate.

Extend existing [role tests](../../tests/workspace-roles.test.ts), [auth tests](../../tests/admin-auth.test.ts) and [Worker integration patterns](../../tests/integration/workspace.integration.test.mjs). Verify every non-admin role and their union; both locales; deep links/API/export/audit; disabled/demoted sessions; CRM tokens; hidden-card query isolation; all-status cache headers; CSRF; stale/retried/concurrent commands; immutable baselines; close/reopen races and failed-import rollback. Use synthetic D1 records and inspect emitted responses/events for leaks.

[Release behavior](../../scripts/release.mjs) applies pending migrations before deploying main; main is production. Select the next migration number at implementation, keep changes additive, and verify previous modules still work. A Time Travel restore affects shared ATS/CRM/HRM data too; recovery requires a coordinated whole-database plan. Track actual evidence and remaining gates in [DELIVERY.md](DELIVERY.md). This documentation adds no routes, migrations, permissions or deployment configuration.

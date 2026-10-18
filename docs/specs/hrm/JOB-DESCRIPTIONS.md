# HRM job descriptions

[Tiếng Việt](JOB-DESCRIPTIONS.vi.md) · Added 2026-10-18

## Purpose and delivery

HRM contains an internal **Job descriptions** catalogue and one role draft:
**COO – Head of Sales & Operations**, code `LUMI-COO-001`, version `1.0`.
The role makes sales, customer delivery, cash collection and day-to-day
coordination one accountable responsibility, with explicit CEO, CTO, HR and
accounting boundaries.

| Surface | English | Vietnamese |
| --- | --- | --- |
| Catalogue | `/hrm/job-descriptions` | `/vi/hrm/job-descriptions` |
| COO description | `/hrm/job-descriptions/coo-head-of-sales-operations` | `/vi/hrm/job-descriptions/coo-head-of-sales-operations` |

The HRM navigation and overview link to the catalogue. The description includes
role purpose, responsibilities, a proposed 30/60/90-day plan, a metric scorecard,
decision rights, evidence-based candidate requirements and an assessment using
synthetic information. Its contents and table of contents render on the server
without client JavaScript. English and Vietnamese use the same schema and role
identity. Tables scroll within their own region on small screens.

## Access

The page helpers require `hrm.access` and `hrm.records.manage`. Existing
middleware still resolves the active EmDash identity, Workspace membership and
the HRM production gate before any private content renders.

| User | HRM closed | HRM live |
| --- | --- | --- |
| System Super Admin | Read | Read |
| HRM Admin | Read | Read |
| HRM Officer | Closed | Read |
| Employee / People Manager / Payroll Officer | No access | No access |
| ATS HR / CRM-only roles | No access | No access |
| Unauthenticated or revoked Workspace member | No access | No access |
| Ended employment | Existing HRM denial applies | Existing HRM denial applies |

Closed-mode navigation uses the existing `hrm.configure` exception. This lets
authorized administrators review a non-personal role template during HRM setup.
It does not open employee records, change `HRM_LIVE_ENABLED`, alter policy
readiness or grant another role access. A COO business title never creates a
software permission. Any future account receives only separately approved
Workspace grants.

Both routes accept GET and HEAD. Other methods that pass existing middleware
checks return 405 for an otherwise authorized caller, with `Allow: GET, HEAD`;
unknown role slugs return 404. Private
responses use `Cache-Control: private, no-store`. Names, candidate files, salaries
and employee records are not read to construct the catalogue.

## Content ownership

The single content source is
[`src/lib/hrm/job-description-catalog.ts`](../../../src/lib/hrm/job-description-catalog.ts).
It is a typed, allowlisted catalogue shipped with the application. There is no
browser editor, D1 migration, seed-on-read, recruitment publication, assignment
to an employee or legal acknowledgement workflow in this slice.

The user requested a section and an initial role, so repository review is enough
to maintain this version. A D1-backed editor would need its own approved scope:
separate draft/approved versions, author and reviewer history, stale-update
protection, audit events and explicit ATS publication. Do not silently convert
the catalogue into an active vacancy or an employment agreement.

For another role, add a unique slug and code, complete both locales, preserve
matching section IDs and table structures, bump the content version when
changing expectations, and update the date. Astro renders plain text; never
add executable content or raw HTML supplied by a visitor.

## COO drafting decisions

- The COO is a hands-on sales and operations leader who develops a repeatable
  motion with a small team. The description does not assume a large sales
  organization, an already proven offer or existing commercial results.
- Priorities begin with one or two approved offers and real customer feedback.
  A bounded introductory offer stays bounded; implementation work requires
  agreed scope, feasibility, capacity, acceptance criteria and commercial terms.
- Cash collected, booked contract value and earned revenue remain separate.
  Targets are agreed against the opening baseline and resources; company
  ambitions are not invented personal quotas. Margin, repeat revenue,
  receivables and delivery quality constrain growth.
- CEO approval covers strategy, headcount/budget, exceptional pricing,
  compensation, equity and commitments outside delegated authority. CTO owns
  technical feasibility and engineering decisions. Accounting confirms cash
  and maintains financial records; HR owns employment administration.
- The ramp plan and evaluation thresholds are proposals for internal review.
  Employment type, location, salary, commission, equity, budget and final
  authority need explicit agreement before recruiting or evaluation.

Source context is the repository's [product contract](../../../AGENTS.md),
[design and positioning](../../../DESIGN.md),
[CRM model](../../crm/README.md),
[commercial ledger and commission rules](../../crm/COMMISSION.md),
[Local sales process](../../Lumi_Sales_Process.en.md) and
[Solutions sales process](../../Lumi_Agents_Vaults_Sales_Process.en.md).
These sources describe product and operating rules; they are not evidence of
customers won, actual revenue or a person's approved employment terms.

## Verification and release

Focused tests cover permission boundaries, ended employment, closed/live mode,
method rejection, unknown slugs, locale parity and navigation. The HRM
integration suite exercises both rendered route pairs with synthetic EmDash
users and checks that reads do not create ATS or HRM records. Browser audit
calls cover catalogue and detail in both languages.

Run `npm run ci:verify` and the relevant HRM integration scope. Set
`HRM_BROWSER_BINARY` only to an available local Chrome binary to execute the
existing responsive/no-JavaScript/reduced-motion/keyboard audit. Record actual
results in [STATUS.md](STATUS.md) or the PR; audit code alone is not proof it ran.

Merging `main` triggers the repository's production deployment. The catalogue
does not activate the wider HRM module or announce a vacancy.

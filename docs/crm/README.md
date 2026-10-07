# Lumi internal CRM

The CRM at `/crm` and `/vi/crm` is Lumi's own sales workspace. Collaborators, founders and operations use it to run several B2B sales models in one place: Lumi Local, Lumi solution/AI-workflow sales, and renewals and expansions.

It is not an ERP, an accounting system, a bulk-messaging tool, or a CRM for Lumi Local customers. It records and coordinates work. It never sends customer messages, buys domains, publishes sites, takes payments or pays commission (it estimates commission and records payouts made elsewhere).

- User guide (Vietnamese): [HUONG-DAN.md](HUONG-DAN.md)
- Commission analysis and policy (Vietnamese): [COMMISSION.md](COMMISSION.md)
- Release, migration and recovery: [RUNBOOK.md](RUNBOOK.md)

## 1. Starting point and defects fixed

PR #26 shipped one table, `crm_leads`, with a single pipeline (`new → contacted → qualified → proposal → won/lost`). Reproduced on a local Worker with D1 and a real EmDash session, 2026-10-07:

| Defect | Reproduction | Fix |
|---|---|---|
| Creating a lead always failed | The create form posted no `stage`, so the parser rejected it. Every create redirected to `?error=invalid` and lost the input. | Quick create needs no stage; the first stage comes from the playbook. Integration test 1. |
| Errors lost the user's input and named no field | API routes redirected with `?error=invalid` | Forms post to their own page. Invalid input re-renders with status 422, the typed values, and per-field errors. |
| Server and database errors looked like bad input | A single catch-all | Responses split into 422 (input), 409 (conflict), 500 (server error, input kept), 404 and 403. |
| A conflicting edit discarded the user's change | Redirect with `?error=conflict` | 409 re-render keeps the edit, shows the latest values and carries the new version, so saving again applies it on top. |
| Double submits and retries could write twice | No idempotency | Each form carries a one-time `request_key`, stored in `crm_requests` in the same D1 batch. |
| Every note bumped the lead version | Notes caused false conflicts | Notes, tasks and money entries are appended records with no version bump. |
| Member lookup could exceed D1's 100-parameter limit | Unchunked `IN (...)` | Lookups are chunked at 90 parameters. |
| Inactive owners' leads were invisible to admins | No signal | Today and Pipeline (filter "inactive owner") list them; admins reassign them. |
| CRM admin page was English-only | `/admin/crm` | Moved to `/crm/admin` and `/vi/crm/admin`; `/admin/crm` redirects there. |
| GitHub CI could not run | The Actions budget blocks this repository's jobs ("job was not started") | Not fixable in code. Recorded as a gap, never as a pass (§7). |

## 2. Model

```text
Account (business) ─┬─ Contacts (role, consent, do-not-contact)
                    └─ Opportunities (one buying decision each)
                          ├─ playbook_id = key@version (frozen per opportunity)
                          ├─ stage history (+ skipped steps, reasons)
                          ├─ tasks / visits / meetings / time & cost
                          ├─ quotes (frozen offer snapshot) ── ledger (append-only)
                          ├─ fulfillment (handoff, checks, owner approval, acceptance)
                          └─ parent_id → upgrade / renewal / expansion
```

- **Separate attributes.** Lead source (`source_channel`, `source_detail`), referrer, seller (`seller_id`, the attribution) and current owner (`owner_id`) are separate fields. Reassigning an opportunity changes only `owner_id`.
- **Independent states.** Sales stage, payment state and delivery status change independently. Payment state is derived from the ledger; delivery status comes from the fulfillment record.
- **Unknown stays unknown.** Value, budget and need stay NULL or blank until verified. The UI says "Unknown"; it never shows 0.
- **Linked opportunities.** An upgrade, renewal or expansion is a new opportunity on the same account with a `parent_id`. The customer is never cloned.

## 3. Business assumptions and their sources

Sources: `RunLumi/local.runlumi` `PRICING.md`, `COPY.md`, `STRATEGY.md` and `docs/PILOT.md` at `origin/main` `3a6024e`. Those files were unchanged at `2a62c7d`.

| Topic | What the CRM does | Source / status |
|---|---|---|
| Trust Kit | 399.000đ, one-time | PRICING.md:10 |
| Starter | 1.990.000đ, first year | PRICING.md:11 |
| Renewal | 599.000đ/yr (RunLumi subdomain); 999.000đ/yr (one standard custom domain); premium domains quoted separately | PRICING.md:12–13, 66 |
| Upgrade credit | Full 399.000đ if the Trust Kit buyer upgrades to Starter within 30 days; customer pays 1.591.000đ | PRICING.md:17–21 |
| **30-day boundary** | The window opens on the calendar date the Trust Kit payment was received (Asia/Ho_Chi_Minh) and **includes day 30**. Paid 1 Sep → eligible through 1 Oct. | **Assumption — the sources say only "within 30 days"; please confirm.** Chosen as the customer-favourable reading, in line with "never retroactively remove earned credit" (STRATEGY.md:54) and the "Day 29–30" follow-up cadence (FIELD_PLAYBOOK.md:202). Change it by saving a new offer version with a different `credit_days`. |
| Credit anchor | Server dates only: payment date set by finance, acceptance date not earlier than the quote's entry date (admins may backdate with evidence) | Prevents backdating past the window |
| Refunds | Recorded as facts, with evidence and a reason. No refund policy is implied. | STRATEGY.md:41 says no refund guarantee without an operating policy |
| Commission | Versioned policy `local-commission`. Version 1 is a **proposal**: admins and finance see a simulation; collaborators see nothing and no payout can be recorded until an admin saves an approved version. The CRM estimates and records payouts; it never pays. | STRATEGY.md:68 says amounts are unapproved; analysis in [COMMISSION.md](COMMISSION.md) |
| Cohort gate | Cohort of 30. Continue if ≥6 paying businesses, ≥2 paid Starters, average preview time ≤5 minutes, and no manual Google management. Scale gate: CAC ≤600k, median fulfillment ≤120 min, p90 ≤240 min, positive contribution after reserve; unknown costs fail. Review trigger: 20 owner conversations with 0 Starters. | STRATEGY.md:51–56, stored as policy `local-cohort-gate@1` |
| Older thresholds | Not used | `docs/archive/STRATEGY-RESEARCH-2026-10.md` and RESEARCH-DISTRIBUTION-MODEL.md:71 are historical (STRATEGY.md:21) |
| Starter scope | Not a store, booking system or CRM. QR artwork only. No GBP management or Google credentials. No ranking or revenue promises. Alerts only where implemented. | COPY.md:13–40; shown in the frozen quote terms |
| Intake | Only enquiries to Lumi from `local.runlumi.app`. Enquiries to customers' Starter sites never reach this CRM. | COPY.md:15, 24 |

## 4. Playbooks, offers and permissions

| Playbook (`key@1`) | Stages (★ = skippable, needs a reason) | Offers |
|---|---|---|
| `local-preview` | New → Qualified to approach → Talked with owner → Preview shown★ → Deciding → Accepted / Not a fit / Not continuing | `local-starter`, `local-trust-kit` |
| `lumi-solution` | New → Contacted → Discovery → Qualified → Demo★ → Pilot★ → Proposal → Accepted / Lost / On hold | `lumi-solution` (no list price; setup, monthly, annual or project lines) |
| `local-renewal` | Pending review → Discussed → Proposed → Accepted / Not renewing / On hold | `local-renewal-subdomain`, `local-renewal-domain` |
| `legacy` (inactive) | The old stages, labelled "legacy, unverified" | none |

- **What a stage can require:** playbook fields, checklist items, or one of three built-ins: `accepted_quote`, `primary_contact`, `next_step`. Visits, owner absences, reschedules and no-shows are task outcomes, not stages.
- **What admins can configure:** stages, safe field types (`text`, `long_text`, `number`, `money`, `minutes`, `date`, `url`, `select`, `yes_no`), checklists, requirements and allowed offers. They cannot configure SQL, JavaScript or expressions.

Permissions come from Workspace roles ([docs/workspace/README.md](../workspace/README.md)). In the table below, "Collaborator" means the Sales Executive role; Sales Managers also see and assign every opportunity and run the inbound queue and cohorts.

| Capability | Collaborator | + finance | + fulfillment | EmDash admin |
|---|---|---|---|---|
| See and edit own opportunities, accounts and contacts | ✓ | ✓ | ✓ | all |
| See others' opportunities | ✗ (404) | read-only if money is recorded | read-only if handed off | ✓ |
| Report a payment (pending) | ✓ | records it confirmed | — | ✓ |
| Confirm or reject a payment; refund; void; periodic amount due | ✗ | ✓ | ✗ | ✓ |
| Delivery status, owner approval, launch checks, acceptance | ✗ | ✗ | ✓ | ✓ |
| Assign owners, members, capabilities, playbooks, offers, cohorts, inbound queue | ✗ | ✗ | ✗ | ✓ |
| ATS (`/admin/jobs`) and candidate files | ✗ | ✗ | ✗ | admin only |

Revoking CRM access, or disabling the EmDash account, takes effect on the next request. Records stay, and admins reassign them.

## 5. Data and integrity

- **Where data lives.** CRM data is in the hiring D1 database (`lumi-jobs`). EmDash identity stays in `CONTENT_DB`. No files are stored, and the CRM has no R2 use.
- **No caching.** Every CRM, admin and intake response is `Cache-Control: private, no-store`.
- **Writes.** Every write is one D1 batch that includes its audit event. Versioned edits put the version guard on every statement, and the version bump runs last, so a stale edit writes nothing.
- **One credit per source.** A partial unique index allows one credit per source payment. A void cancels an entry without deleting it.
- **Do-not-contact.** It applies to every channel and playbook. Outreach tasks are blocked, and a new record with the same phone number is refused. Anyone can set it; only an admin can lift it, with evidence.
- **Migration `0003_crm_sales.sql`.** It copies `crm_leads` into account + contact + opportunity:
  - the lead ID becomes the opportunity ID, so old links keep working;
  - owner, version, timestamps and activity are kept;
  - records go to the `legacy` playbook with `needs_review = 1`;
  - a 0 value becomes unknown;
  - "won" creates no payment;
  - `crm_leads` and `crm_activities` are left untouched.

## 6. Acceptance criteria → evidence

Integration evidence comes from `tests/integration/crm.integration.test.mjs`. It ran against a local Astro/Worker with D1 persisted in an isolated directory and real EmDash sessions (dev-bypass admin plus magic-link collaborators). Unit evidence comes from `tests/crm-core.test.ts`.

| # | Criterion | Evidence |
|---|---|---|
| 1 | EmDash login → CRM; create and validation | IT setup + IT 1 (422 keeps input, field errors, no-store, cross-origin 400) |
| 2 | A / B / admin / unassigned / disabled; no cross-access | IT 2, IT 11 (unassigned visible to admin only), last IT (revoke and disable) |
| 3 | Starter direct, no Trust Kit or pilot | IT 3 |
| 4 | Trust Kit → upgrade: 1.591.000đ, no double credit, day-30 boundary | IT 4 (retry, second upgrade, 30 vs 31 days); unit "credit" tests |
| 5 | Refund and correction keep history | IT 5; unit "ledger" tests |
| 6 | One account: Local + workflow + renewal, no clone, no leak, no double count | IT 6–8; unit cohort test |
| 7 | AI workflow discovery / demo / pilot (skipped with reason) / proposal | IT 6–8 |
| 8 | Renewal period and plan; Ops expansion as its own purchase | IT 6–8 |
| 9 | Sales, payment and fulfillment independent | IT 9 |
| 10 | Suppression blocks unsuitable contact | IT 10 |
| 11 | Intake Local → CRM: retry, idempotency, context, assignment | IT 11; the local.runlumi adapter tests; cross-repo run (RUNBOOK §4) |
| 12 | Conflict keeps data; old data survives the migration | IT 12; migration check (RUNBOOK §2) |
| 13 | Admin builds a playbook and offer in the UI; versions don't rewrite deals | IT 13 |
| 14 | Cohort and contribution correct on synthetic data | Unit cohort tests |
| 15 | EN/VI, mobile, keyboard, no JavaScript | Browser review (RUNBOOK §5); no client scripts in CRM pages |

Production verification is recorded in RUNBOOK §6.

## 7. Known gaps

- **Hosted CI.** GitHub Actions for this repository is blocked by the account's Actions budget. Hosted checks are recorded as "not run", not passed. The same gates run locally (RUNBOOK §3).
- **Authenticated production check.** EmDash sign-in needs a passkey or email link that only the user can complete. An authenticated production walk-through therefore needs a permitted account and the user present. Public routes, redirects, intake authentication and deployment versions are verified without one.
- **30-day boundary.** The inclusive day-30 rule is an assumption awaiting confirmation (§3).
- **Duplicate detection.** Admins see duplicate hints and can move an opportunity to another account. There is no automatic merge.

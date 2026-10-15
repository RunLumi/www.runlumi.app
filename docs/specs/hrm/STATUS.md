# HRM — Implementation status

Updated: 2026-10-15. The overall HRM goal is active. P1's employee/profile browser matrix passes locally on latest main `6c83cc68`; the rebased PR head still needs hosted CI. No phase has been released.

## Current state and ownership

- The user checkout at `/Volumes/SSD/www.runlumi` remains on `codex/restore-repo-privacy-todo` with unrelated untracked files `docs/hiring/recruitment-worklog.md` and `docs/security-publication-review.md`. They were not modified.
- HRM work is in the isolated clone `/private/tmp/runlumi-hrm-refresh`, branch `codex/hrm-p1-refresh`, rebased on latest main `6c83cc68`. The HRM migration sequence starts at `0014_hrm_records.sql`, after CRM's `0012` and `0013` migrations.
- PR #50 is open and remains a draft until the full phase contract passes. Read its live head and exact hosted checks before any merge; this file is not a live check feed.
- No real employee, policy, contract or payroll data was used. Production HRM remains closed. No production access grant or deployment was made.

## Owner decisions and unresolved policy

- 2026-10-13: HRM Admin and System Super Admin (EmDash role 50) may approve HRM operations; nobody may approve their own submission. HRM Admin does not receive user/role administration, ATS or CRM access.
- 2026-10-13: legal entity, policy text, category-specific retention, signing method and payroll rules are not finalized. Build configurable workflows and keep production closed until the responsible owner/reviewer configures them.
- 2026-10-13: authorized policy users upload DOCX source files. Employees and HR upload PDF evidence. An affirmative acknowledgement stores the EmDash actor, server UTC timestamp and exact issued version/checksum, and displays the confirmation time. Acknowledgement is not an electronic signature.
- Separate payroll preparer and approver identities, specialist-reviewed calculations, and jurisdiction-specific tax/insurance rules remain unresolved. The System Super Admin approval capability does not waive payroll self-approval controls.

## Phase gates

| Phase | Contract Gate | Integration Gate | Release state | Dependency / next action |
|---|---|---|---|---|
| P0 — policy and ownership | BLOCKED: core roles clarified; legal entity, purpose/legal basis, retention by category, signing method and payroll reviewers are unapproved | UNPROVEN | CLOSED by owner decision | Keep the live switch off; record approved policy owners before production activation |
| P1 — employee profile and private files | PASS for the technical P1 contract: additive schema, independent grants, EmDash link, private-file custody and EN/VI routes are implemented; retention remains configurable and production closed | PARTIAL: local Worker/D1/R2 tests cover access scope, file custody and rehire. Real Chrome now covers P1 overview, employee and reviewer access to all six profile sections, people/manager lists, create employee, work details, settings, and private-file pending/reviewed states in EN/VI at 320/430/1280px with no-JS, reduced motion, keyboard focus and no overflow. Full HRM-18 offboarding/hold scope and P2/P3 routes remain in later phases; exact hosted CI on this test head is pending. | NOT MERGED | Keep P1 draft until the P1 slice and shared HRM-18 dependency are accepted; then verify exact-head hosted CI and release state |
| P2 — legal papers and onboarding TODO | BLOCKED | BLOCKED | NOT RELEASED | Start after P1; implement DOCX issue snapshots, PDF evidence and timestamped acknowledgement, contracts/NDA/COI, onboarding workflow and lifecycle transfer |
| P3 — schedules, attendance and leave | BLOCKED | BLOCKED | NOT RELEASED | Requires reviewed calendar/shift/accrual/leave rules and locked attendance inputs |
| P4 — payroll and payslips | BLOCKED | BLOCKED | NOT RELEASED | Requires specialist-approved inputs/rules, independent preparer/approver and an independently checked parallel run |
| P5 — employee services and operations | BLOCKED | BLOCKED | NOT RELEASED | Requires prior phase gates, retention/legal-hold decisions and D1/R2 recovery evidence |

## P1 implemented scope

- Migration `0014_hrm_records.sql` adds HRM role grants and structured people, employment periods, profile/history, change-request, private-file, idempotency and audit tables without removing old role grants.
- Workspace roles remain separate for Employee, People Manager, HRM Officer and HRM Admin; System Super Admin remains EmDash role 50. HR/Finance/Sales/Partner do not gain HRM access through their old roles. Users and grants are still managed through the shared EmDash/Workspace contract.
- HR creates a record by selecting one active EmDash account; it does not auto-link by matching email. A person can have separate employment periods.
- HRM Admin can close an employment period and start a later rehire period on the same person record. A rehire preserves the prior period, checks the previous revision and new start date, requires the linked EmDash account to remain active, validates the manager, and is idempotent. It does not automatically restore revoked Workspace grants.
- For Employee-only self-service grants, middleware rechecks for a current non-ended employment period on each private HRM request; after end, HRM self-service is denied and hidden from Workspace navigation. HRM Officer/Admin and manager capabilities remain separate and still need explicit offboarding management.
- Employee self-service and scoped HR/manager views cover contact, personal, identity/CCCD, dependents, bank and tax/insurance fields. Riskier changes enter a versioned reviewer workflow; stale updates conflict. Actor, server time and audit history are retained.
- HRM file endpoints use private R2 objects under the `hrm/` namespace, signature-checked PDF/JPEG/PNG, a 5 MB cap, quarantine/review and authenticated no-store downloads. HR review is not an antivirus-scan claim.
- HRM is guarded by `HRM_LIVE_ENABLED` and reviewed settings. The production switch remains off.
- HRM page POST forms retain a bounded same-origin URL-encoded request clone before adapter consumption; oversized forms are rejected. Profile routes return mutation Responses instead of rendering them as page data.
- P2 policy-document acknowledgement, employment signing and onboarding task workflows are specified but not implemented in P1.

## Requirement-to-evidence matrix

The status is for the complete acceptance criterion in §14, not only its P1 subset.

| ID | Requirement → code/test evidence | Status |
|---|---|---|
| HRM-01 | `service.ts`, authenticated file routes; integration rejects employee A opening B's profile/file. Payslip isolation belongs to P4 and is not implemented. | UNPROVEN — P1 profile/file subset passes locally |
| HRM-02 | `workspace/roles.ts`, `middleware.ts`, `tests/hrm.test.ts`; CRM Finance/ATS HR/Partner/Sales roles are independent; legacy regressions pass. | PASS — tested scope only |
| HRM-03 | Scoped `listPeople` query and manager profile authorization; integration checks direct report scope and hides identity/bank. | PASS — tested scope only |
| HRM-04 | EmDash-backed Workspace lookup; integration revokes employee grant and verifies the next request is denied. Background-job revoke behavior awaits later phases. | UNPROVEN — request-path subset passes |
| HRM-05 | Version guard and immutable history in `service.ts`/migration 0014; integration races two changes against one bank revision and checks stale approval conflicts. | PASS — tested record workflow |
| HRM-06 | Schedule/holiday/shift calculation not implemented. | BLOCKED — P3 |
| HRM-07 | Leave accrual/hold/retry ledger not implemented. | BLOCKED — P3 |
| HRM-08 | Delegated leave approval and manager-change routing not implemented. | BLOCKED — P2/P3 |
| HRM-09 | Locked attendance/payroll correction flow not implemented. | BLOCKED — P3/P4 |
| HRM-10 | Policy/document states and timestamped issue acknowledgement are specified; P2 workflow not implemented. | BLOCKED — P2 |
| HRM-11 | Contract/NDA versioning and verified-signature callback not implemented; no provider selected. | BLOCKED — P2 |
| HRM-12 | COI disclosure/review/mitigation workflow not implemented. | BLOCKED — P2 |
| HRM-13 | Payroll calculation and independent-currency/commission inputs not implemented. | BLOCKED — P4 |
| HRM-14 | Payroll separation of duties, approval invalidation and publish idempotency not implemented. | BLOCKED — P4 |
| HRM-15 | Payslip publication versus reconciled payment evidence not implemented. | BLOCKED — P4 |
| HRM-16 | File API, MIME signature, size, quarantine, cross-user denial, unauthenticated 401, no-store download and file-review timestamp are tested in local HRM integration; MIME signature validator has unit coverage. Export remains P5. | PASS — P1 private-file checks |
| HRM-17 | ATS-to-HRM controlled transfer and independent document retention not implemented. | BLOCKED — P2 |
| HRM-18 | `startEmploymentPeriod`, the work-details rehire form and local integration preserve an ended period, create a later period, audit the actor, make retry idempotent and conflict on a second rehire. Employee-only access is denied after employment ends and returns with a new period. Manager/grant offboarding and legal-hold deletion remain incomplete. | UNPROVEN — tested self-access/rehire subset passes |
| HRM-19 | HRM notification/outbox behavior is not implemented; CRM notifications remain separate. | BLOCKED — P5 |
| HRM-20 | P1 browser matrix: Chrome verifies all P1 route families in EN/VI, all six employee and HRM Admin profile sections, HR Officer identity scope, private-file pending/review states, no-JS forms, reduced motion, keyboard focus and overflow at 320/430/1280px. P2/P3 routes and all remaining lifecycle states still need the same matrix. | PARTIAL — P1 slice passes locally; global gate remains open |
| HRM-21 | Joint D1/R2 restore and checksum reconciliation not implemented. | BLOCKED — P5 |
| HRM-22 | Versioned onboarding templates/plans/idempotent tasks not implemented. | BLOCKED — P2 |
| HRM-23 | Onboarding dependencies, signed evidence and authorized waivers not implemented. | BLOCKED — P2 |
| HRM-24 | Buddy/manager task visibility against restricted source records not implemented. | BLOCKED — P2 |
| HRM-25 | Onboarding cancellation, reassignment queue and offboarding/revocation workflow not implemented. | BLOCKED — P2 |

| Spec section | Implementation/evidence | Status |
|---|---|---|
| §1–3 identity, roles and navigation | EmDash/Workspace contract, HRM capability map, EN/VI routes; integration and role unit tests | PASS for P1 scope |
| §4–5 profile, dependents, identity and files | Migration 0014, P1 pages/services, local Worker/D1/R2 integration and selected-route Chrome matrix | PASS for implemented P1 scope |
| §6 legal papers, contracts, NDA and COI | README spec and owner DOCX/PDF direction only | BLOCKED — P2 |
| §7 onboarding/offboarding | README spec only | BLOCKED — P2 |
| §8–9 schedule, attendance and leave | README spec only | BLOCKED — P3 |
| §10 payroll/payslips | README spec only; no policy/formula assumed | BLOCKED — P4 |
| §11 employee services | README spec only | BLOCKED — P5 |
| §12 data custody/audit | P1 D1/R2, audit/revision and access controls; later lifecycle/export work remains | UNPROVEN overall |
| §13 retention, legal hold, export, backup/restore | Configurable activation prerequisite and design contract; category policy and enforcement/recovery not implemented | UNPROVEN |

## Verification log

- 2026-10-15 P1 Chrome matrix on latest main `76fb886b`: `RUNLUMI_INTEGRATION_SCOPE=hrm HRM_BROWSER_BINARY='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:integration` PASS. Synthetic Worker/D1/R2 verifies the P1 HRM scenario plus 48 CRM/Workspace/directory/API/dashboard/ATS/CRM Files regression cases. Chrome covers P1 overview, self-service and HR-reviewed views for all six profile sections, people scopes, create employee, work details, settings and identity-file pending/review states in EN/VI at 320/430/1280px with JavaScript disabled, reduced motion, keyboard focus and no horizontal overflow. Artifacts are under `/private/tmp/runlumi-hrm-p1-browser-matrix-20261015-v2`.
- After rebasing onto latest main `6c83cc68`, P1 `npm run ci:verify` passed locally on the isolated worktree: lint (229 source files), 97 unit tests, Astro check (0 errors; one pre-existing Hiring hint) and Cloudflare build.
- After rebasing onto latest main `6c83cc68`, P1 `RUNLUMI_INTEGRATION_SCOPE=hrm HRM_BROWSER_BINARY='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:integration` passed: the full P1 Chrome/Worker/D1/R2 scenario and 48 CRM/Workspace/directory/API/dashboard/ATS/CRM Files regression tests. Browser artifacts are under `/private/tmp/runlumi-hrm-p1-browser-matrix-20261015-final`.
- `npm run ci:verify`: PASS locally on the isolated clone — lint, 83 unit tests, Astro check and build. The build has an existing large-chunk warning and an unrelated Hiring unused-import hint. A local listener required sandbox escalation; no production service was contacted.
- `npm run test:integration`: PASS locally — one HRM P1 suite plus 43 CRM/Workspace/ATS/directory/API/dashboard regression tests against an isolated Astro Worker, EmDash sessions, temporary D1 and local R2. The HRM suite covers roles, closed/live gates, employee A/B scope, manager restrictions, CSRF, identity submission/review timestamps, stale bank revisions, MIME mismatch rejection, unauthenticated/cross-user file denial, quarantine, file review timestamps, no-store download, employment-end self-access denial/navigation hiding, rehire history/idempotency/access restore and explicit role revocation.
- Hosted CI: run 38443175443 PASS on PR head `72cbbc49d5c74072b72b1f1bee04269d39926f16`; all jobs passed (lint, unit, migration, integration, build).
- Hosted runs 38443912112 (head `93c8068f1db9a3cc814745fc92ce66f2361d055a`) and 38445098900 (head `278afafad781db4d82805cd0bc8d48ce6f5aeb59`) failed in the local Worker integration step with `UND_ERR_SOCKET` while requesting `/hrm`; rerunning 38443912112 reproduced it. These were status-only heads after the passing run, so no application source changed. The synthetic EmDash dev-email store had accumulated magic-link messages; its DELETE endpoint first rejected cleanup without `X-EmDash-Request`. The test helper now clears each synthetic message with the required CSRF header and the runner redacts magic-link tokens from any failure logs. This is a suspected resource cause, not yet a hosted-verified fix.
- Hosted run 38441553225 on earlier head `b10775f24766600cfed5528c336b266669303ffa` also failed with a Worker socket reset. The current source therefore still needs an exact-head hosted PASS after the test-harness cleanup.
- Migration exercise: PASS with Python SQLite applying migrations 0001–0012; pre-existing HR/Finance/Sales/Partner grants and ATS actor columns survived the 0012 role expansion, and a new HRM grant was accepted. This is migration-level evidence, separate from Worker integration.
- Remaining browser QA is UNPROVEN for P2/P3 route/state coverage and HRM-20 overall. The P1 slice has the Chrome evidence above; selected Chrome checks from earlier P2/P3 runs do not complete the global matrix.
- Local synthetic browser Worker was stopped. Its temporary D1 and `.dev.vars` were removed and verified absent.
- Hosted GitHub checks and post-merge Cloudflare deployment are separate proof layers; read their state on the final PR head before changing any gate.

## Next actions

1. After any source or status update, read the live PR #50 head and verify hosted checks on that exact SHA. Do not merge a head with pending/failed checks.
2. Complete P1's remaining HRM-18 lifecycle dependency; then refresh the exact PR head, wait for hosted CI, and merge only if the phase gate remains green.
3. Keep P0 production configuration closed until the owner approves entity, purposes, policy, category retention and signing. Continue P2/P3 route-state coverage and complete P2–P5 under their phase gates.

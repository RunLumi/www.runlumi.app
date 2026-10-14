# HRM — Implementation status

Updated: 2026-10-14. The overall HRM goal is active. P1 remains in draft PR #50. P2 legal, COI and onboarding flows are implemented in the isolated working tree; `ci:verify`, full local integrations and selected real-Chrome QA pass. ATS transfer, employment offboarding and later phases remain incomplete. No phase has been released.

## Current state and ownership

- The user checkout at `/Volumes/SSD/www.runlumi` remains on `codex/restore-repo-privacy-todo` with unrelated untracked files `docs/hiring/recruitment-worklog.md` and `docs/security-publication-review.md`. They were not modified.
- P2 work is in `/private/tmp/runlumi-hrm`, branch `codex/hrm-p2`, with an uncommitted working tree on base commit `a777fe3c9bad42255f8cbb362990677a6099bf7d`. The checkout is separate from the user's dirty checkout; local dependency files are task-local and are not committed.
- PR #50 was re-read on 2026-10-14: open draft, head `d5fa0e5bd23fe8d3b60d4492181d7fcced457033`, base `main`; the GitHub combined-status endpoint returned pending with zero status entries. Its description records CI run 38447373757 as passing on that SHA, but the current live check response does not confirm those checks. P1 remains unmerged; read exact check runs before any merge.
- No P2 PR has been created yet. No real employee, policy, contract or payroll data was used. Production HRM remains closed. No production access grant or deployment was made.

## Owner decisions and unresolved policy

- 2026-10-13: HRM Admin and System Super Admin (EmDash role 50) may approve HRM operations; nobody may approve their own submission. HRM Admin does not receive user/role administration, ATS or CRM access.
- 2026-10-13: legal entity, policy text, category-specific retention, signing method and payroll rules are not finalized. Build configurable workflows and keep production closed until the responsible owner/reviewer configures them.
- 2026-10-14: reconfirmed that users with policy-management permission upload DOCX source files, while employees and HR upload PDF evidence within the issue/COI/onboarding scope they may access. An affirmative acknowledgement stores the EmDash actor, server UTC timestamp and exact issued version/checksum, and displays the confirmation time. Acknowledgement is not an electronic signature.
- Separate payroll preparer and approver identities, specialist-reviewed calculations, and jurisdiction-specific tax/insurance rules remain unresolved. The System Super Admin approval capability does not waive payroll self-approval controls.

## Phase gates

| Phase | Contract Gate | Integration Gate | Release state | Dependency / next action |
|---|---|---|---|---|
| P0 — policy and ownership | BLOCKED: core roles clarified; legal entity, purpose/legal basis, retention by category, signing method and payroll reviewers are unapproved | UNPROVEN | CLOSED by owner decision | Keep the live switch off; record approved policy owners before production activation |
| P1 — employee profile and private files | PASS for the technical P1 contract: additive schema, independent grants, EmDash link, private-file custody and EN/VI routes are implemented; retention remains configurable and production closed | UNPROVEN: local Worker/D1/R2 tests cover employment-end self-access denial and rehire history/restore; manager/grant offboarding, legal-hold deletion and the full HRM-20 browser/accessibility checks remain unproven. Hosted run 38443175443 passed on SHA `72cbbc49d5c74072b72b1f1bee04269d39926f16`; later status-only heads encountered Worker socket failures, so the latest head still needs hosted PASS | NOT MERGED | Re-read the live head and hosted checks before merge; obtain an accessible browser runner and finish remaining HRM-18 scope; do not merge before the full gate |
| P2 — legal papers and onboarding TODO | PARTIAL: DOCX/PDF legal evidence, version snapshots, review/activation, scoped timestamped acknowledgement, COI and versioned onboarding templates/plans/tasks are implemented; ATS transfer and employment offboarding remain | PARTIAL: focused Worker/D1/R2 HRM integration passes legal, COI and onboarding flows; full regression run is in progress; browser and lifecycle-transfer gates remain | NOT RELEASED | Finish ATS-to-HRM transfer and employment offboarding/revocation; complete full regression/browser gates; keep production closed |
| P3 — schedules, attendance and leave | BLOCKED | BLOCKED | NOT RELEASED | Requires reviewed calendar/shift/accrual/leave rules and locked attendance inputs |
| P4 — payroll and payslips | BLOCKED | BLOCKED | NOT RELEASED | Requires specialist-approved inputs/rules, independent preparer/approver and an independently checked parallel run |
| P5 — employee services and operations | BLOCKED | BLOCKED | NOT RELEASED | Requires prior phase gates, retention/legal-hold decisions and D1/R2 recovery evidence |

## Implemented local scope

- Migration `0014_hrm_records.sql` adds HRM role grants and structured people, employment periods, profile/history, change-request, private-file, idempotency and audit tables without removing old role grants.
- Workspace roles remain separate for Employee, People Manager, HRM Officer and HRM Admin; System Super Admin remains EmDash role 50. HR/Finance/Sales/Partner do not gain HRM access through their old roles. Users and grants are still managed through the shared EmDash/Workspace contract.
- HR creates a record by selecting one active EmDash account; it does not auto-link by matching email. A person can have separate employment periods.
- HRM Admin can close an employment period and start a later rehire period on the same person record. A rehire preserves the prior period, checks the previous revision and new start date, requires the linked EmDash account to remain active, validates the manager, and is idempotent. It does not automatically restore revoked Workspace grants.
- For Employee-only self-service grants, middleware rechecks for a current non-ended employment period on each private HRM request; after end, HRM self-service is denied and hidden from Workspace navigation. HRM Officer/Admin and manager capabilities remain separate and still need explicit offboarding management.
- Employee self-service and scoped HR/manager views cover contact, personal, identity/CCCD, dependents, bank and tax/insurance fields. Riskier changes enter a versioned reviewer workflow; stale updates conflict. Actor, server time and audit history are retained.
- HRM file endpoints use private R2 objects under the `hrm/` namespace, signature-checked PDF/JPEG/PNG, a 5 MB cap, quarantine/review and authenticated no-store downloads. HR review is not an antivirus-scan claim.
- HRM is guarded by `HRM_LIVE_ENABLED` and reviewed settings. The production switch remains off.
- HRM page POST forms retain a bounded same-origin URL-encoded request clone before adapter consumption; oversized forms are rejected. Profile routes return mutation Responses instead of rendering them as page data.
- P2 legal slice is implemented in the local working tree: authorized HRM users upload bounded DOCX sources; another reviewer approves source files and versions; an approver activates a reviewed version; audience status is checked before issue; issue snapshots retain source checksum/version; employees can acknowledge the exact issued policy and the server stores actor/time/checksum immutably; employees and HR can upload quarantined PDF evidence to paper-signing issues; another reviewer records each required paper-signing party and server timestamp. No electronic-signature provider is configured.
- COI self-service and review pages now use EmDash identity and HRM-specific scope. Drafts capture both conflict/no-conflict declarations; assigned HRM Officer or Admin can request clarification, clear, require mitigation, escalate or close with actor/time/reason. PDF evidence is quarantined, scoped to the declaration and reviewer assignment, and cannot be self-reviewed. Amendments link to immutable prior submissions, snapshot the source revision and atomically mark the source superseded only when the new declaration is submitted. Stale source changes conflict; an unsubmitted draft can refresh its snapshot after reload/review.
- Onboarding templates are versioned and reviewed before activation; plans snapshot the selected version and applicability for one employment period. Todo supports owners/reviewers, cycle-checked dependencies, calendar-day due dates, previewed rescheduling, evidence submissions, independent review, authorized waivers, blocking, reassignment, cancellation and audit history. Employee, assigned manager/buddy and HR views are scoped; private records do not inherit onboarding visibility. Focused Worker/D1/R2 integration passed these flows. ATS-to-HRM transfer and employment offboarding/revocation remain incomplete.

## Requirement-to-evidence matrix

The status is for the complete acceptance criterion in §14, not only its P1 subset.

| ID | Requirement → code/test evidence | Status |
|---|---|---|
| HRM-01 | `service.ts`, authenticated file routes; integration rejects employee A opening B's profile/file. Payslip isolation belongs to P4 and is not implemented. | UNPROVEN — P1 profile/file subset passes locally |
| HRM-02 | `workspace/roles.ts`, `middleware.ts`, `tests/hrm.test.ts`; CRM Finance/ATS HR/Partner/Sales roles are independent; legacy regressions pass. | PASS — tested scope only |
| HRM-03 | Scoped `listPeople` query and manager profile authorization; integration checks direct report scope and hides identity/bank. | PASS — tested scope only |
| HRM-04 | EmDash-backed Workspace lookup; integration revokes employee grant and verifies the next request is denied. Background-job revoke behavior awaits later phases. | UNPROVEN — request-path subset passes |
| HRM-05 | Version guard and immutable history in `service.ts`/migration 0012; integration races two changes against one bank revision and checks stale approval conflicts. | PASS — tested record workflow |
| HRM-06 | Schedule/holiday/shift calculation not implemented. | BLOCKED — P3 |
| HRM-07 | Leave accrual/hold/retry ledger not implemented. | BLOCKED — P3 |
| HRM-08 | Delegated leave approval and manager-change routing not implemented. | BLOCKED — P2/P3 |
| HRM-09 | Locked attendance/payroll correction flow not implemented. | BLOCKED — P3/P4 |
| HRM-10 | Migration 0013 and legal pages/services issue immutable policy snapshots; integration checks cross-user access, exact-checksum acknowledgement, immutable server timestamp, retries, DOCX download and PDF review. | PASS — policy acknowledgement/evidence slice; broader browser gate remains open |
| HRM-11 | Versioned contract source and paper-scan parties are implemented; integration proves employee/HR PDF upload, independent review and server-timestamped verification. No e-sign provider/callback is configured. | UNPROVEN — paper-scan slice passes; external signature flows are intentionally not enabled |
| HRM-12 | COI pages/services and migration 0013 cover yes/no snapshot, amendments, assigned review, clarification, mitigation/follow-up, escalation/close, quarantined PDF evidence and scope. Worker/D1/R2 integration checks employee/manager/unassigned/assigned/admin access, no-conflict validation, idempotency, self-review denial, timestamps and stale-source amendment conflict. | PASS — COI workflow scope; P2 lifecycle/browser gates remain open |
| HRM-13 | Payroll calculation and independent-currency/commission inputs not implemented. | BLOCKED — P4 |
| HRM-14 | Payroll separation of duties, approval invalidation and publish idempotency not implemented. | BLOCKED — P4 |
| HRM-15 | Payslip publication versus reconciled payment evidence not implemented. | BLOCKED — P4 |
| HRM-16 | File API, MIME signature, size, quarantine, cross-user denial, unauthenticated 401, no-store download and file-review timestamp are tested in local HRM integration; MIME signature validator has unit coverage. Export remains P5. | PASS — P1 private-file checks |
| HRM-17 | ATS-to-HRM controlled transfer and independent document retention not implemented. | BLOCKED — P2 |
| HRM-18 | `startEmploymentPeriod`, the work-details rehire form and local integration preserve an ended period, create a later period, audit the actor, make retry idempotent and conflict on a second rehire. Employee-only access is denied after employment ends and returns with a new period. Manager/grant offboarding and legal-hold deletion remain incomplete. | UNPROVEN — tested self-access/rehire subset passes |
| HRM-19 | HRM notification/outbox behavior is not implemented; CRM notifications remain separate. | BLOCKED — P5 |
| HRM-20 | Route/content parity is checked in local integration. Chrome inspected policy acknowledgement and employee onboarding at 320, 430 and 1280px; no-JS rendering, reduced motion, Tab focus and document overflow pass on those two pages. Full HRM route/locale browser coverage is not complete. | UNPROVEN — tested browser subset passes |
| HRM-21 | Joint D1/R2 restore and checksum reconciliation not implemented. | BLOCKED — P5 |
| HRM-22 | Versioned templates/plans, snapshot task creation, idempotency and previewed due-date rescheduling are implemented in `onboarding.ts`; focused integration covers template review/activation and plan/task retries. | PASS — tested onboarding scope |
| HRM-23 | Cycle-checked dependencies, submission/review evidence, PDF quarantine and authorized waiver/reason are covered by `onboarding.ts` and focused integration. | PASS — tested task/evidence scope |
| HRM-24 | Employee, assigned owner and HR queues are capability/scoped; integration checks a buddy/manager cannot read private employee records through onboarding. | PASS — tested visibility scope |
| HRM-25 | Cancellation and reassignment queue/actions are implemented and tested; employment offboarding, grant revocation orchestration and legal-hold flow remain incomplete. | PARTIAL — P2 lifecycle gate remains open |

| Spec section | Implementation/evidence | Status |
|---|---|---|
| §1–3 identity, roles and navigation | EmDash/Workspace contract, HRM capability map, EN/VI routes; integration and role unit tests | PASS for P1 scope |
| §4–5 profile, dependents, identity and files | Migration 0012, P1 pages/services, local Worker/D1/R2 integration | PASS for implemented P1 scope |
| §6 legal papers, contracts, NDA and COI | Migration 0013, legal and COI EN/VI pages, scoped PDF evidence, immutable events and local Worker/D1/R2 integration cover policy snapshots, acknowledgement, paper scans and COI review | PASS for implemented paper/legal/COI workflows; e-sign is intentionally disabled |
| §7 onboarding/offboarding | `onboarding.ts`, migration 0014, EN/VI manager/self pages, evidence API and focused Worker/D1/R2 integration; ATS transfer and employment offboarding remain | PARTIAL — onboarding scope passes; lifecycle scope remains |
| §8–9 schedule, attendance and leave | README spec only | BLOCKED — P3 |
| §10 payroll/payslips | README spec only; no policy/formula assumed | BLOCKED — P4 |
| §11 employee services | README spec only | BLOCKED — P5 |
| §12 data custody/audit | P1 D1/R2, audit/revision and access controls; later lifecycle/export work remains | UNPROVEN overall |
| §13 retention, legal hold, export, backup/restore | Configurable activation prerequisite and design contract; category policy and enforcement/recovery not implemented | UNPROVEN |

## Verification log

- Current revision `a777fe3` plus the uncommitted P2 working tree: `npm run check`, `npm run lint` and `npm test` PASS; Astro reports 0 errors and 1 existing unused-import hint, lint checks 257 files, and 86 unit tests pass.
- Current `npm run ci:verify`: PASS on the same source tree — lint checked 257 files, 86 unit tests passed, Astro check reports 0 errors and 1 existing Hiring unused-import hint, and the Cloudflare server build completes. The build reports the repository's existing large-chunk warning and selected inspector port 9230 because 9229 was occupied. No deployment occurred.
- Current `npm run test:integration` with `HRM_BROWSER_BINARY` set to the installed Chrome: PASS — isolated Astro Worker, EmDash synthetic sessions, temporary D1/local R2, HRM end-to-end (78.8 seconds) and all 43 CRM/Workspace/directory/API/dashboard/ATS regressions (113.9 seconds); overall exit status 0. HRM covers DOCX source review/version/issue, exact-checksum acknowledgement with immutable UTC time and UI display, Employee/HR PDF uploads and review, COI, onboarding plans/tasks/evidence/waiver/reassignment/cancellation, and permission boundaries.
- Real-Chrome QA (same integration run) PASS on the policy acknowledgement and employee onboarding pages at 320, 430 and 1280 CSS px. Both retained server-rendered content/forms with page JavaScript disabled, honored reduced-motion preference, exposed a keyboard Tab focus indicator and had no document/body horizontal overflow. Screenshots were written under `/private/tmp/runlumi-hrm-browser-qa`, outside the repository. A real long-checksum overflow found on the first screenshot was fixed with wrapping and rechecked.
- `npm run test:integration`: PASS locally — one HRM suite plus 43 CRM/Workspace/ATS/directory/API/dashboard regressions against an isolated Astro Worker, EmDash sessions, temporary D1 and local R2. The HRM suite covers P1, DOCX source review/version activation, employee audience/scope, exact-checksum acknowledgement and retry, paper-contract PDFs from Employee and HR with independent party verification, COI yes/no validation, creation/submit/assignment/start/review retries, quarantine/download scope, self-review denial, clarification, stale-source conflict, draft snapshot refresh, amendment supersession, mitigation/follow-up, clear/close, immutable event trail and retained evidence.
- Hosted CI: run 38443175443 passed on an earlier P1 head. The PR description records run 38447373757 passing on the live head `d5fa0e5bd23fe8d3b60d4492181d7fcced457033`, but the current combined-status response returned `pending` with no status entries; confirm detailed check runs before merge.
- Hosted runs 38443912112 (head `93c8068f1db9a3cc814745fc92ce66f2361d055a`) and 38445098900 (head `278afafad781db4d82805cd0bc8d48ce6f5aeb59`) failed in the local Worker integration step with `UND_ERR_SOCKET` while requesting `/hrm`; rerunning 38443912112 reproduced it. These were status-only heads after the passing run, so no application source changed. The synthetic EmDash dev-email store had accumulated magic-link messages; its DELETE endpoint first rejected cleanup without `X-EmDash-Request`. The test helper now clears each synthetic message with the required CSRF header and the runner redacts magic-link tokens from any failure logs. This is a suspected resource cause, not yet a hosted-verified fix.
- Hosted run 38441553225 on earlier head `b10775f24766600cfed5528c336b266669303ffa` also failed with a Worker socket reset. These historical failures are distinct from the fresh local integration rerun and do not substitute for an exact hosted check readback.
- Browser QA full gate: UNPROVEN. The Playwright wrapper remains blocked by the machine's `pkg-age-guard`; installed Chrome was driven through its local DevTools protocol for the two page subsets listed above. The complete route, locale and page-state matrix remains outstanding.
- Local synthetic browser Worker was stopped. Its temporary D1 and `.dev.vars` were removed and verified absent after both integration runs.
- Hosted GitHub checks and post-merge Cloudflare deployment are separate proof layers; read their state on the final PR head before changing any gate.

## Next actions

1. Finish the full regression run and production build on the current P2 tree; keep the exact exit status in this log.
2. Reconcile local `codex/hrm-p2` with the live PR #50 head before pushing a stacked draft PR; the local P1 tree has identical contents but diverged commit ancestry.
3. P1 remains unmerged until manager/grant offboarding, legal-hold, complete browser coverage and exact-head hosted gates pass. Extend browser review to EN/VI across the full HRM route matrix and supported sizes.
4. Continue P2 with controlled ATS transfer and employment offboarding/revocation. Then build P3 attendance/leave, P4 payroll/payslips and P5 employee services to the documented gates. Keep P0 production configuration closed until the owner approves entity, purposes, policy, category retention and signing.

# HRM — Implementation status

Updated: 2026-10-14. The overall HRM goal is active. P1 remains in draft PR #50; P2 is in draft PR #51 stacked on P1. P2 legal, COI, onboarding, controlled ATS transfer and offboarding access workflow are implemented and locally verified. Retention/legal hold and P3–P5 remain incomplete. No phase has been released.

## Current state and ownership

- The user checkout at `/Volumes/SSD/www.runlumi` remains on `codex/restore-repo-privacy-todo` with unrelated untracked files `docs/hiring/recruitment-worklog.md` and `docs/security-publication-review.md`. They were not modified.
- P2 work is in `/private/tmp/runlumi-hrm`, clean branch `codex/hrm-p2`, stacked directly on the P1 PR #50 head. The checkout is separate from the user's dirty checkout; local dependency files and browser screenshots are not committed.
- PR #50 was re-read on 2026-10-14: open draft, head `d5fa0e5bd23fe8d3b60d4492181d7fcced457033`, base `main`; the GitHub combined-status endpoint returned pending with zero status entries. Its description records CI run 38447373757 as passing on that SHA, but the current live check response does not confirm those checks. P1 remains unmerged; read exact check runs before any merge.
- PR #51 was created as an open draft, base `codex/hrm-p1`, head `codex/hrm-p2`; GitHub re-read on 2026-10-14 reports pending with zero status checks. No real employee, policy, contract or payroll data was used. Production HRM remains closed. No production access grant or deployment was made.

## Owner decisions and unresolved policy

- 2026-10-13: HRM Admin and System Super Admin (EmDash role 50) may approve HRM operations; nobody may approve their own submission. HRM Admin does not receive user/role administration, ATS or CRM access.
- 2026-10-13: legal entity, policy text, category-specific retention, signing method and payroll rules are not finalized. Build configurable workflows and keep production closed until the responsible owner/reviewer configures them.
- 2026-10-14: reconfirmed that users with policy-management permission upload DOCX source files, while employees and HR upload PDF evidence within the issue/COI/onboarding scope they may access. An affirmative acknowledgement stores the EmDash actor, server UTC timestamp and exact issued version/checksum, and displays the confirmation time. Acknowledgement is not an electronic signature.
- Separate payroll preparer and approver identities, specialist-reviewed calculations, and jurisdiction-specific tax/insurance rules remain unresolved. The System Super Admin approval capability does not waive payroll self-approval controls.

## Phase gates

| Phase | Contract Gate | Integration Gate | Release state | Dependency / next action |
|---|---|---|---|---|
| P0 — policy and ownership | BLOCKED: core roles clarified; legal entity, purpose/legal basis, retention by category, signing method and payroll reviewers are unapproved | UNPROVEN | CLOSED by owner decision | Keep the live switch off; record approved policy owners before production activation |
| P1 — employee profile and private files | PASS for the technical P1 contract: additive schema, independent grants, EmDash link, private-file custody and EN/VI routes are implemented; retention remains configurable and production closed | UNPROVEN on PR #50 head: its Worker/D1/R2 tests cover employment-end self-access denial and rehire history/restore; manager/grant offboarding, legal-hold deletion and full HRM-20 browser coverage are absent from that branch. Hosted run 38443175443 passed on an earlier SHA; current live status for the exact head is pending with zero checks. | NOT MERGED | Read exact-head hosted checks before merge; complete P1 browser and legal-hold gates; do not merge before the full gate |
| P2 — legal papers and onboarding TODO | PARTIAL: DOCX/PDF legal evidence, timestamped acknowledgement, COI, versioned onboarding, controlled ATS transfer and offboarding checklist/access revocation are implemented; category retention/legal hold and P4 settlement remain | PASS for implemented ATS/offboarding flows on Worker/D1/R2; selected Chrome QA and all 43 CRM/Workspace/ATS regressions pass. Legal hold/deletion remains unproven. | DRAFT PR #51; NOT RELEASED | Complete approved retention/legal-hold workflow; keep production closed |
| P3 — schedules, attendance and leave | BLOCKED | BLOCKED | NOT RELEASED | Requires reviewed calendar/shift/accrual/leave rules and locked attendance inputs |
| P4 — payroll and payslips | BLOCKED | BLOCKED | NOT RELEASED | Requires specialist-approved inputs/rules, independent preparer/approver and an independently checked parallel run |
| P5 — employee services and operations | BLOCKED | BLOCKED | NOT RELEASED | Requires prior phase gates, retention/legal-hold decisions and D1/R2 recovery evidence |

## Implemented local scope

- Migration `0014_hrm_records.sql` adds HRM role grants and structured people, employment periods, profile/history, change-request, private-file, idempotency and audit tables without removing old role grants.
- Workspace roles remain separate for Employee, People Manager, HRM Officer and HRM Admin; System Super Admin remains EmDash role 50. HR/Finance/Sales/Partner do not gain HRM access through their old roles. Users and grants are still managed through the shared EmDash/Workspace contract.
- HR creates a record by selecting one active EmDash account; it does not auto-link by matching email. A person can have separate employment periods.
- HRM Admin can close an employment period and start a later rehire period on the same person record. A rehire preserves the prior period, checks the previous revision and new start date, requires the linked EmDash account to remain active, validates the manager, and is idempotent. It does not automatically restore revoked Workspace grants.
- Middleware rechecks linked employment on private HRM requests; when all employment periods have ended, the person loses every HRM route even if other HRM/manager roles remain. Workspace access in other modules is unchanged until System Super Admin disables the shared membership through the audited offboarding task.
- Employee self-service and scoped HR/manager views cover contact, personal, identity/CCCD, dependents, bank and tax/insurance fields. Riskier changes enter a versioned reviewer workflow; stale updates conflict. Actor, server time and audit history are retained.
- HRM file endpoints use private R2 objects under the `hrm/` namespace, signature-checked PDF/JPEG/PNG, a 5 MB cap, quarantine/review and authenticated no-store downloads. HR review is not an antivirus-scan claim.
- HRM is guarded by `HRM_LIVE_ENABLED` and reviewed settings. The production switch remains off.
- HRM page POST forms retain a bounded same-origin URL-encoded request clone before adapter consumption; oversized forms are rejected. Profile routes return mutation Responses instead of rendering them as page data.
- P2 legal slice is implemented in the local working tree: authorized HRM users upload bounded DOCX sources; another reviewer approves source files and versions; an approver activates a reviewed version; audience status is checked before issue; issue snapshots retain source checksum/version; employees can acknowledge the exact issued policy and the server stores actor/time/checksum immutably; employees and HR can upload quarantined PDF evidence to paper-signing issues; another reviewer records each required paper-signing party and server timestamp. No electronic-signature provider is configured.
- COI self-service and review pages now use EmDash identity and HRM-specific scope. Drafts capture both conflict/no-conflict declarations; assigned HRM Officer or Admin can request clarification, clear, require mitigation, escalate or close with actor/time/reason. PDF evidence is quarantined, scoped to the declaration and reviewer assignment, and cannot be self-reviewed. Amendments link to immutable prior submissions, snapshot the source revision and atomically mark the source superseded only when the new declaration is submitted. Stale source changes conflict; an unsubmitted draft can refresh its snapshot after reload/review.
- Onboarding templates are versioned and reviewed before activation; plans snapshot the selected version and applicability for one employment period. Todo supports owners/reviewers, cycle-checked dependencies, calendar-day due dates, previewed rescheduling, evidence submissions, independent review, authorized waivers, blocking, reassignment, cancellation and audit history. Employee, assigned manager/buddy and HR views are scoped; private records do not inherit onboarding visibility. Focused Worker/D1/R2 integration passed these flows.
- ATS transfer requires both `hiring.applications.manage` and `hrm.records.manage`, a hired application, a fresh preview of application/job/settings revisions, and manual selection of an active EmDash member with the Employee role. It creates the HRM person and preboarding period in one D1 command, transfers only name/contact/work fields, excludes CV/files/answers/notes/interviews/scorecards, stores an immutable non-cascading source reference and is idempotent. A synthetic source-application deletion test proves the HRM person and transfer record remain.
- Ending an employment period with an end date creates an offboarding case and checklist for handover, assets, Workspace access, records review and payroll closeout. HRM access is denied immediately to the linked ended person even if other HRM roles remain. Only System Super Admin can disable shared Workspace membership through the common audit/token-revocation path; role records remain for audited restoration. Starting a later employment period supersedes the prior open offboarding case instead of revoking a returning employee. Payroll closeout stays blocked until P4; checklist completion does not delete records or claim external settlement.

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
| HRM-17 | `lifecycle.ts`, migration 0015 and bilingual preview/API require both ATS+HRM permissions, hired status, selected active EmDash Employee account, revision guards and one idempotent D1 transfer; integration removes the source application and verifies the HRM record/provenance remain. ATS files and private notes are excluded. | PASS — tested transfer/source-deletion scope; file-retention policy remains separate |
| HRM-18 | `startEmploymentPeriod`, migration 0016 offboarding triggers, middleware employment gate and atomic System Super Admin membership-disable action retain history, deny HRM access after end across HRM roles, audit revocation and supersede the old case on rehire. | PARTIAL — end/rehire/access subset passes; legal-hold deletion/restore is not implemented |
| HRM-19 | HRM notification/outbox behavior is not implemented; CRM notifications remain separate. | BLOCKED — P5 |
| HRM-20 | Route/content parity is checked in local integration. Chrome inspected policy acknowledgement, employee onboarding and System Admin offboarding at 320, 430 and 1280px; no-JS rendering, reduced motion, Tab focus and document overflow pass on those pages. Full HRM route/locale browser coverage is not complete. | UNPROVEN — tested browser subset passes |
| HRM-21 | Joint D1/R2 restore and checksum reconciliation not implemented. | BLOCKED — P5 |
| HRM-22 | Versioned templates/plans, snapshot task creation, idempotency and previewed due-date rescheduling are implemented in `onboarding.ts`; focused integration covers template review/activation and plan/task retries. | PASS — tested onboarding scope |
| HRM-23 | Cycle-checked dependencies, submission/review evidence, PDF quarantine and authorized waiver/reason are covered by `onboarding.ts` and focused integration. | PASS — tested task/evidence scope |
| HRM-24 | Employee, assigned owner and HR queues are capability/scoped; integration checks a buddy/manager cannot read private employee records through onboarding. | PASS — tested visibility scope |
| HRM-25 | Onboarding cancellation/reassignment and offboarding tasks are covered by `onboarding.ts`, migration 0016 and Worker integration; System Super Admin alone revokes shared Workspace membership, while HRM Admin is denied that action. | PASS — tested workflow scope; payroll closeout remains correctly blocked under P4 |

| Spec section | Implementation/evidence | Status |
|---|---|---|
| §1–3 identity, roles and navigation | EmDash/Workspace contract, HRM capability map, EN/VI routes; integration and role unit tests | PASS for P1 scope |
| §4–5 profile, dependents, identity and files | Migration 0012, P1 pages/services, local Worker/D1/R2 integration | PASS for implemented P1 scope |
| §6 legal papers, contracts, NDA and COI | Migration 0013, legal and COI EN/VI pages, scoped PDF evidence, immutable events and local Worker/D1/R2 integration cover policy snapshots, acknowledgement, paper scans and COI review | PASS for implemented paper/legal/COI workflows; e-sign is intentionally disabled |
| §7 onboarding/offboarding | Versioned onboarding, migration 0016 offboarding cases/tasks, ATS transfer, HRM access gate and shared membership revocation; EN/VI pages and synthetic Worker/D1/R2 integration | PARTIAL — workflow passes; retention/legal-hold and P4 settlement remain |
| §8–9 schedule, attendance and leave | README spec only | BLOCKED — P3 |
| §10 payroll/payslips | README spec only; no policy/formula assumed | BLOCKED — P4 |
| §11 employee services | README spec only | BLOCKED — P5 |
| §12 data custody/audit | P1 D1/R2, audit/revision and access controls; later lifecycle/export work remains | UNPROVEN overall |
| §13 retention, legal hold, export, backup/restore | Configurable activation prerequisite and design contract; category policy and enforcement/recovery not implemented | UNPROVEN |

## Verification log

- Current P2 feature tree: `npm run ci:verify` PASS — lint checked 271 files, 86 unit tests passed, Astro check reports 0 errors and 1 existing Hiring unused-import hint, and the Cloudflare server build completes. The build reports the repository's existing large-chunk warning and selected inspector port 9230 because 9229 was occupied. No deployment occurred.
- Current `npm run test:integration` with installed Chrome: PASS — isolated Astro Worker, EmDash synthetic sessions, temporary D1/local R2, HRM end-to-end (94.9 seconds) and all 43 CRM/Workspace/directory/API/dashboard/ATS regressions (119.1 seconds); overall exit status 0. HRM covers P1 profiles, legal DOCX/PDF/acknowledgement, COI, onboarding, ATS transfer/source deletion and offboarding/revocation/rehire.
- Real-Chrome QA (same integration run) PASS on policy acknowledgement, employee onboarding and System Admin offboarding pages at 320, 430 and 1280 CSS px. Server-rendered forms/content remained available with page JavaScript disabled; reduced motion, Tab focus and zero document/body horizontal overflow passed. Screenshots are under `/private/tmp/runlumi-hrm-browser-qa`, outside the repository.
- Hosted CI: run 38443175443 passed on an earlier P1 head. The PR description records run 38447373757 passing on the live head `d5fa0e5bd23fe8d3b60d4492181d7fcced457033`, but the current combined-status response returned `pending` with no status entries; confirm detailed check runs before merge.
- Hosted runs 38443912112 (head `93c8068f1db9a3cc814745fc92ce66f2361d055a`) and 38445098900 (head `278afafad781db4d82805cd0bc8d48ce6f5aeb59`) failed in the local Worker integration step with `UND_ERR_SOCKET` while requesting `/hrm`; rerunning 38443912112 reproduced it. These were status-only heads after the passing run, so no application source changed. The synthetic EmDash dev-email store had accumulated magic-link messages; its DELETE endpoint first rejected cleanup without `X-EmDash-Request`. The test helper now clears each synthetic message with the required CSRF header and the runner redacts magic-link tokens from any failure logs. This is a suspected resource cause, not yet a hosted-verified fix.
- Hosted run 38441553225 on earlier head `b10775f24766600cfed5528c336b266669303ffa` also failed with a Worker socket reset. These historical failures are distinct from the fresh local integration rerun and do not substitute for an exact hosted check readback.
- Browser QA full gate: UNPROVEN. The Playwright wrapper remains blocked by the machine's `pkg-age-guard`; installed Chrome was driven through its local DevTools protocol for the two page subsets listed above. The complete route, locale and page-state matrix remains outstanding.
- Local synthetic browser Worker was stopped. Its temporary D1 and `.dev.vars` were removed and verified absent after both integration runs.
- Hosted GitHub checks and post-merge Cloudflare deployment are separate proof layers; read their state on the final PR head before changing any gate.

## Next actions

1. Update PR #51 with the verified ATS/offboarding slice and keep it draft; exact hosted statuses for PR #50/#51 currently need a fresh read before any merge.
2. P1 remains unmerged until legal-hold deletion/restore and the complete EN/VI browser matrix pass. Extend browser review across the full HRM route/state matrix and supported sizes.
3. Complete approved retention/legal-hold and restore paths, then build P3 attendance/leave, P4 payroll/payslips and P5 employee services to the documented gates. Keep P0 production configuration closed until the owner approves entity, purposes, policy, category retention and signing.

# HRM incident, retention and recovery runbook

**Reviewed:** 2026-10-17 against current Cloudflare D1 and R2 documentation. **Status:** operational procedure draft. Production recovery, backup coverage, owner-approved retention, restore objectives and recovery ownership are not established by this document. It does not prove recoverability.

[Tiếng Việt](RUNBOOK.vi.md)

This runbook covers HRM files and records in the `lumi-jobs` D1 database and the private `FILES` R2 binding (`lumi-job-files`). EmDash account state is held separately in `lumi-content`; Workspace grants and HRM records are in `lumi-jobs`. The repository declares no separate R2 backup binding. Confirm the active account, database backend, bucket, Worker version and jurisdiction from the authenticated Cloudflare environment before any production action; the repository configuration alone does not prove which resources are serving traffic.

## Authority and stop conditions

- HRM Admin coordinates the employee-data incident. System Super Admin controls shared Workspace access. The Cloudflare account owner or authorized infrastructure operator controls D1/R2 recovery. Payroll incidents also require the designated payroll owner and an independent reviewer.
- Do not restore, delete, change retention, publish or mark payment records confirmed with real data unless the responsible owner has approved that exact action, target and time. Never test with real employee records or a production backup copied into a test environment.
- Require approved legal entity, purpose, retention, signing, schedules, payroll policy and recovery responsibilities before any HRM activation. A feature flag does not prove those decisions or the recovery gate.
- Preserve actor/audit history and copies of relevant error codes. Store incident evidence in an approved private location; do not paste names, CCCD, payslips, private object keys, tokens or file contents into tickets, chat or logs.
- If the affected population, restored point, R2 source, backup freshness or access state is uncertain, stop the restore and leave affected HRM actions unavailable. Do not improvise retention periods, RPO/RTO or identity matching.

## First response by incident

| Incident | Immediate containment | Recovery rule |
|---|---|---|
| Private file or payslip exposed | Disable the affected HRM route/scope, revoke the relevant access grant, preserve access/audit evidence, identify affected people and request legal/privacy-owner direction. | Do not delete the source or audit trail to conceal exposure. Re-enable only after access tests with two synthetic employees prove cross-person denial. |
| File attached to the wrong person | Stop further downloads and downstream review, quarantine the file, preserve both metadata records and checksums, and have HR verify identity from an approved source. | Relink only through an audited, version-guarded correction reviewed by another HRM Admin/System Super Admin. Keep the original event and decide retention/legal hold separately. |
| Payslip published with incorrect inputs | Stop further publication and payment confirmation for that run; preserve the published snapshot and payroll events. Notify the payroll owner and independent reviewer. | Never edit a published slip. Create a correction version with reason, source snapshot and independent approval; do not claim money was paid without reconciled evidence. |
| Wrong attendance period locked or payroll input differs | Stop calculation/publication, preserve the lock checksum, import batch and revisions. | Correct through the configured adjustment workflow and re-review. Never rewrite a locked or published snapshot to make totals match. |
| Worker, reminder or outbox job failed | Inspect the bounded job state and redacted error code; preserve the request key and attempts. | Retry only through the idempotent path. Do not create a second request or externally notify employees to compensate for an unverified delivery. |
| Suspected D1 corruption, migration damage or missing HRM files | Stop HRM writes and file deletion for the affected scope; record UTC incident time, last known good release and available D1 bookmark. | Follow the D1 and R2 procedures below as one coordinated recovery. Restoring D1 alone is not a complete HRM recovery. |
| Retention deletion or legal hold conflict | Stop the affected deletion job; preserve its request, reviewer, executor and tombstone state. | Do not remove a legal hold or recreate a file from an unverified copy. Legal/records owner decides retention and restoration authority. |

## Coordinated D1 and R2 recovery

Cloudflare D1 Time Travel can restore a database to a prior point, but the restore overwrites that database in place and cancels in-flight queries. Capture the current bookmark first; Cloudflare returns a previous bookmark that can be used to undo the restore. Verify that the target D1 database uses the supported storage backend and that the approved timestamp is within the account's configured retention window. See [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).

R2 objects are separate from D1. Cloudflare documents object deletion as irreversible; an R2 delete is not undone by a D1 restore. A restore therefore requires an independently retained private copy of the needed R2 objects and a manifest that can be reconciled against D1 metadata. The repository does not currently configure or prove that copy/restore process. See [R2 Delete Objects](https://developers.cloudflare.com/r2/objects/delete-objects/) and [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/).

### Before the restore

1. Assign an incident lead, a recovery operator and an independent verifier. Record the authorization, affected data range, proposed UTC restore point, current Worker version and intended rollback point.
2. Verify the production database identity and backend with the Cloudflare account owner. The read-only `wrangler d1 time-travel info lumi-jobs` command obtains a current bookmark; the `--timestamp` form can inspect a proposed UTC time. Do not select a point merely because it precedes the first error: account for valid HR changes, legal holds, access revocations and files written after that point.
3. Preserve a **current-point** `lumi-jobs` export/bookmark in the approved private recovery location before restoring an older point. A full D1 export contains private HRM/ATS/CRM/payroll data and may interrupt queries while it is produced. Set `umask 077`; store it only in the authorized recovery location. Never commit exports, manifest data, identifiers or credentials to Git.

Create the recovery directory outside the checkout with owner-only permissions. Save the current shared-D1 export and list of active EmDash role-50 operator IDs/names there; their contents are private:

```sh
: "${PRIVATE_RECOVERY_DIR:?Set an incident-specific private path outside the repository}"
umask 077
mkdir -p -m 0700 "$PRIVATE_RECOVERY_DIR"
./node_modules/.bin/wrangler d1 export lumi-jobs --remote --output "$PRIVATE_RECOVERY_DIR/current-lumi-jobs.sql"
./node_modules/.bin/wrangler d1 execute lumi-content --remote --command "SELECT id,name FROM users WHERE role=50 AND disabled=0" --json > "$PRIVATE_RECOVERY_DIR/current-system-admins.json"
```
4. Confirm that a separate R2 copy exists for every in-scope live `hrm_files` object, including bytes and SHA-256 checksum. If a copy is missing, this runbook cannot recover those bytes; record the gap and stop before enabling access.
5. Before starting an in-place Time Travel restore, set the production Worker variable `WORKSPACE_RESTORE_MODE=true` through the approved Cloudflare recovery change and publish that Worker version. Confirm Workspace, Hiring, CRM, Finance and HRM private EN/VI pages/APIs return 503 with `private, no-store` and `nosniff`. This fence does not block `/jobs` or `/vi/jobs`, but D1 may be unavailable while its restore runs; verify those pages against the live database only after D1 is serving again. Candidate submission writes (`POST /api/jobs/<slug>/apply`) remain paused while the fence is active. The fence also skips all scheduled Worker tasks. Pause automatic main/Workers Builds for the recovery window so a deploy cannot remove it. Do not issue the restore until the production fence is serving. Keep it enabled through D1 and R2 reconciliation.
6. Compare the proposed D1 timestamp with the R2 copy's coverage. Agree how events newer than the restore point will be preserved or replayed. If there is no approved decision for newer writes, stop.

### Restore D1 (production action requires separate owner approval)

The following is a destructive command. Do not run it as part of routine CI, a local test, a draft PR review or this runbook's publication:

```sh
./node_modules/.bin/wrangler d1 time-travel restore lumi-jobs --bookmark="<owner-approved-bookmark>"
```

Use a timestamp only when the approved incident plan specifies it and the operator has verified the resulting bookmark. Record the returned new and previous bookmarks securely. The previous bookmark is the rollback point; do not discard it until the restore has passed verification and the owner has accepted the result.

After restoring, keep HRM closed and apply the current additive D1 migrations before reconciling authority. Export the restored D1 to another mode-0600 SQL file in the private recovery directory. Verify the System Super Admin actor against the still-current `lumi-content` account list, then generate a checked, bounded current-authority patch plan from the current-point export and the restored export. The independent verifier checks the manifest checksums and counts before applying it:

```sh
umask 077
node scripts/reconcile-workspace-restore.mjs \
  --current "$PRIVATE_RECOVERY_DIR/current-lumi-jobs.sql" \
  --restored "$PRIVATE_RECOVERY_DIR/restored-lumi-jobs.sql" \
  --output-dir "$PRIVATE_RECOVERY_DIR/workspace-authority-patches" \
  --operator-id "<verified-current-system-super-admin-id>" \
  --operator-name "<verified-current-system-super-admin-name>"
```

Before this command, the recovery operator independently verifies an active EmDash role-50 account and provides its exact user ID and name; these become `workspace_audit` actors for recovery lock/reopen events. Inspect only the sanitized counts and source/restored/patch checksums in its manifest. Keep SQL patch contents private. Apply every numbered patch in lexical order, confirming that each D1 command succeeds before moving to the next:

```sh
for patch in "$PRIVATE_RECOVERY_DIR"/workspace-authority-patches/*.sql; do
  ./node_modules/.bin/wrangler d1 execute lumi-jobs --remote --file="$patch"
done
```

The first patch closes HRM, disables all restored Workspace memberships and clears restored role grants. The Worker maintenance fence remains enabled during all patch stages; later patches reapply the captured current members/roles, append-only Workspace audit, active holds and lifecycle events. Each membership lockdown and current grant re-open is recorded under the verified System Super Admin actor. The final patch enables only accounts that were enabled in the current-point snapshot. HRM remains disabled and unreviewed after reconciliation; its owner must review it again. If schema, identity, immutable audit or hold rows conflict, stop and leave the access lock in place. A half-applied patch sequence likewise keeps memberships disabled until the final patch runs. Do not use `--admin` to skip the reconciliation. After the verifier accepts the patch counts, gate, holds, R2 checksums and smoke test, the owner may remove the restore fence. Keep HRM `enabled=0` and `reviewed_by=NULL`; remove the build freeze only after verifying the Worker release configuration does not silently clear or re-enable HRM. If any step fails, leave `WORKSPACE_RESTORE_MODE=true`.

After the command, verify migration/schema version, required tables and indexes, employee/employment counts, open workflow counts, audit continuity, active and released legal-hold history, and current shared account grants. A restored database may predate a membership revocation; the current-point Workspace patch is the source of grants after restore, while EmDash remains the source of active account identity. Do not publish payslips or run file-retention jobs during this step.

### Restore and reconcile R2

1. Restore only from the approved private copy. Keep the destination private and inaccessible to public URLs. Do not overwrite an existing production key until the two-person review confirms the target file and checksum.
2. For each D1 file row that should be live, verify that the exact R2 object exists and its SHA-256 and byte count match `hrm_files`. Preserve MIME type, original filename, legal-hold and deletion metadata from the approved D1 state; do not infer them from the object key.
3. Check both directions: D1 rows with missing objects, and R2 objects with no matching live D1 row or approved tombstone. Keep mismatches quarantined. Never expose an orphan because its filename looks familiar, and do not purge orphans until the records/legal owner resolves them.
4. Verify synthetic A/B access boundaries, manager denial for identity/pay/private reasons, legal holds, retention eligibility, and file downloads through the application routes. Direct bucket URLs are not an acceptance test.
5. Record counts and checksum-match totals only in ordinary logs. Any detailed identifier-to-object manifest remains private and access-controlled.

### Reopen and rollback

Reopen HRM only after the independent verifier confirms the D1 point, D1/R2 checksum reconciliation, current account revocations, legal holds, permissions and smoke tests. The owner must explicitly accept any known loss window. If data, access or files do not reconcile, keep HRM closed and restore the saved previous D1 bookmark or follow the approved object-repair plan; do not attempt an unreviewed second restore.

## Synthetic recovery drill

The automated synthetic drill is implemented in [`tests/integration/hrm-recovery-drill.mjs`](../../../tests/integration/hrm-recovery-drill.mjs) and runs through `npm run test:integration:hrm:p5`. It snapshots synthetic `lumi-jobs` D1 state into a private temporary SQLite file, backs up HRM R2 objects to a private temporary directory, changes a still-enabled Workspace member and places a closeout file hold **after** that backup point through the real Worker/EmDash routes, then restores D1/R2 into a separate local Worker. The test captures the later Workspace authority, feeds it through the same SQL patch builder, applies numbered patches to isolated D1, and verifies membership disable/roles, access-revocation audit, current hold event/history, checksum parity and the HRM-closed/unreviewed gate. A separate unit case exercises placement plus release after backup. It must run with disposable local D1/R2 and synthetic EmDash users only. Check [`STATUS.md`](STATUS.md) for the latest exact-head result; the existence of this test or an older pass does not establish the current gate.

For a manual synthetic rehearsal, use the following sequence. Never use production data:

1. Create two synthetic employees, HRM Officer/Admin and one manager. Create a private file for A, legal-hold it, and create a separate synthetic file for B; record their D1 metadata and SHA-256 hashes in a temporary private test artifact.
2. Back up the local D1 state and copy the exact R2 objects into an isolated recovery target. Record a manifest hash and backup time. Delete or corrupt one disposable copy to exercise detection, not the source fixture.
3. Restore the saved D1 and object copies into fresh isolated state; verify A/B authorization, hold state, metadata-to-byte checksums, missing-file detection and orphan detection. Confirm old/revoked access is not restored and every test file remains private.
4. Capture command output, test commit, D1 migration set, R2 object/checksum counts, elapsed time and cleanup result. Do not include employee names, real identifiers, object keys or file bytes in the committed report.

A passing synthetic drill proves only the local recovery procedure. Production restore remains `UNPROVEN` until the owner approves RPO/RTO, the private R2 backup mechanism and retention, a production-specific recovery authority, and a separately authorized recovery test.

## Asset handover evidence

Employees can upload a PDF after reporting that they physically handed an assigned item to HR. HRM staff can upload a return receipt while the assignment is awaiting physical return. The upload is linked to the exact asset assignment and stored in private R2 as `asset_evidence`; the route validates PDF signature and size, records checksum and actor, inherits an applicable person/category legal hold, and leaves retention due dates unset until the owner approves a policy.

New files remain quarantined. The uploader may retrieve their own upload; other access follows the employee/asset scope and review permission. Only an HRM Admin or System Super Admin may approve or reject, and neither the uploader nor the asset issuer may review the file. Verify that the document matches the employee, asset and physical handover before approving. A file's existence alone does not prove the item was returned: HR must record the physical condition and close the asset assignment. Keep the offboarding task open while the assignment is active; do not waive it to bypass a missing return.

The offboarding asset-return task lists each active assignment linked to that employment, including asset tag, type, condition and evidence count, without displaying serial numbers. Each link is immutable and is backfilled for assignments already open when the migration runs. One task can cover multiple assets, but it remains open until every linked assignment has been returned, cancelled or otherwise resolved.

If the PDF is wrong or attached to another assignment, stop review and download, preserve its audit/checksum record, and follow the wrong-person/file incident procedure above. Do not move or relink the immutable evidence record; request a corrected upload under the right assignment. Do not invent a retention period or release a legal hold to clear the queue.

## Training and certification reminders

Manage deadline offsets under HRM Settings with an HRM Admin or System Super Admin account. Each policy version accepts 1–12 explicit day offsets from -365 through 365: positive is before the due date, zero is the due date, and negative is after. No offset is preconfigured. The creator cannot review or activate their own version; record a meaningful review reason. Activation also requires a configured, enabled HRM entity. Keep production HRM closed until the owner approves the reminder-record retention and legal-hold treatment.

The existing Worker Cron runs at 08:40 Vietnam time. It considers completion dates for assigned/submitted training and renewal dates for approved assignments. Only the linked employee and the currently active Workspace HR account that issued the assignment receive the in-app reminder. It does not send email, Lark or webhook messages. Replaying a Cron event for the same date is safe. An HRM Admin can run the same bounded sweep from Settings while HRM and `HRM_LIVE_ENABLED` are open.

Recipients mark their own inbox items read on `/hrm/me/training` or `/hrm/training`. If a reminder appears stale, check the active entity policy, explicit offsets, assignment state and date, and the recipient's active EmDash account and Workspace membership. Unread completion reminders resolve when the assignment completes, is declined or cancelled. Renewal reminders resolve if the renewal date changes or a new open assignment supersedes the same course. Replacing a policy retires the previous version but preserves reminders it already generated. Do not create another assignment just to replay a reminder; uniqueness is per assignment, recipient, deadline, date and offset.

Reminder retention and legal hold are not yet owner-approved or implemented as a dedicated disposition flow. Do not delete reminder/event rows manually or infer a production retention period.

## Aggregate report snapshots and schedules

Only HRM Admin/System Super Admin can save snapshots or create, pause, resume and retire schedules; HRM Officer can read saved aggregates, while CSV download still requires `hrm.reports.export`. Report queries omit employee names/IDs, HR case text and pay data, but department names, small counts and changes between captures can still permit identification. Aggregate output is not a proven anonymous dataset. Department filters are not department-specific access grants.

Each save or schedule requires an explicit whole-day duration from 1 to 36,500 and a nonempty basis; no duration or schedule is seeded. The current service validates those inputs, not an approved report-policy version or its legal applicability. A schedule's duration applies to each generated snapshot; the schedule itself has no automatic expiry or review date. Create a replacement after retiring a definition that needs a different department or retention basis. Do not put names, allegations or legal advice in the basis field.

The daily Worker Cron runs at 08:40 Vietnam time. Daily and Monday-weekly captures select the current month; first-of-month captures select the previous month. Some groups describe generation-time state, and assets are always entity-wide; this is not a reconstructed month-end ledger. The 20-active-schedule cap is enforced on create and resume with an atomic service guard and D1 trigger. If legacy data exceeds the cap, the sweep records `run_failed` and skips deletion/generation instead of silently selecting only 20. Before snapshot insertion, the sweep rechecks that the schedule is active and the reviewed HRM settings version is unchanged. Runs deduplicate per schedule/local date, send no external notification and record sanitized errors. Check `/hrm/reports` for the latest run; pause/retire stops subsequent scheduling and an insertion race, but does not preserve existing snapshots.

`expires_on` is the recorded Vietnam date plus the entered days, inclusive for reading: manual captures use the current date; scheduled captures use the Cron event date. A delayed scheduled run queries data when processed but records the scheduled timestamp, so it does not reconstruct that earlier instant. Ordinary reads stop on the next local day after `expires_on`. A later successful sweep replaces report JSON with `{}` and clears its checksum to `NULL`, up to 1,000 rows per invocation. Metadata, the basis, actor identifiers and event/audit history remain; their finite disposition is not implemented. Downloads and backup copies are separate lifecycles. An expired payload cannot be restored through this interface.

**Expiry now runs only when the reviewed/enabled HRM settings and `HRM_LIVE_ENABLED` both permit HRM; each D1 purge rechecks the settings version. Turning a gate off defers future expiry and stops new generation, but it is not a legal hold: overdue snapshots may be purged after reactivation. Pause/retire and person/file holds do not protect report snapshots.** Keep production reporting closed until approved policy and effective report-specific holds exist; do not use a switch, date extension or long duration as a substitute for a hold. The [retention decision for approval](REPORT-RETENTION-DECISION.md) remains PROPOSED.

## Open operator decisions

- Authoritative D1 backup/restore ownership, approved RPO and RTO, and who can authorize an in-place restore.
- A separate R2 backup destination, copy cadence, access separation, checksum manifest, retention/legal-hold treatment and restore authority.
- Owner-approved retention windows and legal basis for each HRM file and structured-record category.
- Whether restore access reconciliation uses EmDash/Workspace as the authority for revocations made after the restore point.
- Evidence retention location and required incident/report approvals.
- Owner-approved report purpose, basis/durations/clock, effective snapshot holds, schedule ownership and separate audit/export/backup disposition: [proposed decision and acceptance gates](REPORT-RETENTION-DECISION.md). None is approved by this runbook.
- Owner-approved training-reminder retention and legal-hold treatment before activating reminder policies in production.

## Synthetic integration verification

Run `npm run test:integration:hrm` for P1/P2, P3, P4 and P5 serially against one disposable local Worker/D1/R2 deployment. The `:p1`, `:p3`, `:p4` and `:p5` commands select one phase only. Set `HRM_BROWSER_BINARY` to an installed Chrome binary and `HRM_BROWSER_ARTIFACT_DIR` to a private temporary directory to include EN/VI browser audits; without the binary, a passing integration run does not prove browser behavior. Keep the final TAP phase results and screenshots together. A combined pass covers the implemented assertions, not every role/state combination or production readiness.

## Employee payslip copies

When the owner enables HRM, open **HRM → My payslips** (`/hrm/me/payslips`, or `/vi/hrm/me/payslips`). The download link uses the page language; payroll staff use the equivalent link on the payroll desk. Both copies use the issued snapshot, including its saved component titles, currency and minor-unit scale. Vietnamese copies and the Vietnamese pages use Vietnamese number separators without recalculating or rounding the stored amounts.

An older snapshot may lack Vietnamese titles. Its copy retains the original titles and displays a notice; changing the current policy does not rewrite an issued statement. A correction remains a separate, linked publication. Opening or downloading a copy does not acknowledge its amounts or confirm payment. Employees can download only their own statements; staff still need the payroll capability.

The attachment is an HTML file delivered as downloadable bytes, with a language header, private/no-store headers and no CMS editor UI. The file also carries its own restrictive content policy and explicit light palette for offline viewing. It contains salary data: keep downloaded copies in approved private storage and follow the organization's reviewed retention policy; do not publish them. This does not activate payroll or establish payroll-policy approval.

## Effective compensation for payroll

Lines from an `employment_record` component must name one compensation version on **HRM → Payroll → Effective contract compensation** (`/hrm/payroll#compensation`, `/vi/hrm/payroll#compensation`). An HRM Admin records the employee code, component code, currency, minor-unit scale, the exact amount per pay period, effective dates, and the source. The source is either a completed employment contract or addendum issue for the same employment, or a decision reference held outside HRM. Another HRM Admin or System Super Admin approves it. Nobody can create or approve pay for their own employee record.

Approved versions for one employment component never overlap. To change pay, create a version that names the approved version it replaces. It must run through that version's end date. When it is approved, an earlier version is shortened to the day before the new start, or marked superseded if the new version starts on or before it. Published payslips keep the version they used, so a retroactive change needs a linked payroll correction.

The line amount must equal the approved amount, and one approved version must cover the whole pay period. A period with no version, a version starting or ending mid-period, or two versions inside one period is blocked: there is no proration rule. Calculation stores the version ID, dates and source type in the run snapshot. Review, approval and publication fail if a version stops covering the line. A reviewer or approver cannot be anyone who entered a line in the run, authored a compensation version it uses, or is paid in it.

This is a traceability control, not a calculation of statutory pay, tax, insurance, overtime or commission. Owner-approved proration and pay rules, and an independently checked parallel run, are still required before payroll opens.

## CRM commission in payroll

Recorded CRM commission is not pay. For a seller whose CRM seller type is Employee at the end of the month, Finance opens **CRM → Commission → Hand off to HRM payroll** and confirms the month. CRM freezes the earned lines that became eligible in that month, under an approved policy, at their computed amounts. Nobody types the total. Each earned line can be in only one live handoff. A person-month is either handed off or recorded as a manual CRM payout, never both. D1 enforces this in both directions.

In payroll, a policy component with source `crm_commission` (VND, minor-unit scale 0) takes the confirmed handoff for the employee's own EmDash account and the run's single calendar month, at exactly its amount. HRM reads only the handoff ID, month, total and line count. Customers, opportunities and ledger entries never reach payroll or the payslip. A handoff can be used by one run; after publication it appears on exactly one current payslip. A linked correction carries it forward, and a separate regular run cannot pay it again. Once payroll references a handoff, Finance can no longer void it. A refund after the handoff does not deduct pay automatically: decide it through a reviewed payroll correction or recovery.

Missing commission stays unknown, not zero. Tax treatment, the approved commission policy and the payroll parallel run still need owner and specialist approval before production use.

## Final pay for an ended employment

A regular payroll run enrols only probation, active and notice employments. It cannot publish while a participant's employment has ended. If someone leaves after a draft regular run was created, a payroll preparer removes them on the run detail ("Remove from regular run"), with a reason. That resets calculation and approvals, and counts as a run input, so the remover cannot review or approve the run.

Pay the leaver through **Payroll → Final pay for an ended employment**. Choose the active policy, the locked period, the employee code and, for a rehire, the employment period ID. The employment must have ended and must overlap the period. No other draft run or published payslip may already pay that employment for the period. The final run holds exactly that one employment and follows every regular control: locked time, compensation traced to an approved version (for an ended employment it must end with the employment), independent review and approval, and an immutable payslip. A published final payslip is changed only through a linked correction. A regular run and a final run never both pay one employment for one period.

A mid-period leaver's compensation covers only part of the period, so `employment_record` lines stay blocked: there is no proration rule. Until the owner approves one, final settlement amounts belong in an owner-defined, evidenced component (for example `manual_evidence`). Creating a final run does not restore HRM or Workspace access, and it does not complete the offboarding payroll task. That still needs the independently reviewed financial dossier.

## File disposition and role changes

File disposition uses three separate actors: requester, independent reviewer and System Super Admin executor. Promotion or combined roles do not waive that separation, including when resuming a deletion. Reject a requester or reviewer acting as executor before reserving or deleting the R2 object; a final D1 constraint alone cannot protect bytes already erased. A denial must preserve the request state, metadata and downloadable object. Use another authorized independent executor; never bypass the queue with a manual object deletion.

If a deletion was attempted and D1 finalization failed, a null metadata tombstone does not prove the R2 bytes survived. Preserve the execution evidence and reconcile the private R2 object, request and audit trail under the approved incident procedure before authorizing another attempt. Production restore still requires separate owner approval. Anonymous 401 and non-member 403 responses from private HRM APIs must also carry `Cache-Control: private, no-store`; a correct status code alone is not a passing privacy-header check. Retention forms and error redirects preserve the employee/HR interface language.

## Financial retention and disposition

The financial panel on **HRM → Retention** is restricted to current payroll-approval and offboarding-management capabilities as well as the relevant retention capability. General HR reviewers do not load its policy, source, case or request metadata. Configuration is available while HRM is closed; employee disposition remains closed. There are no seeded durations or active financial policies. Use an independently reviewed DOCX for the configured legal entity, explicit effective dates, purpose and a reviewed basis for each category. Empty duration and anchor mean unscheduled. Scheduled durations use Vietnam calendar dates (UTC+7), with an explicitly selected employment, case or record anchor.

When approved for use, select a case, inspect its evidence and holds, then request disposition for an exact PDF or dossier version under an applicable active policy. The requester, independent reviewer and current System Super Admin executor must be three different people. The server rechecks current EmDash/Workspace authority, subject identity, target version, policy/source, due date and legal holds. A changed target, case or policy blocks the queued request; reassess with a new request. Never release a genuine preservation matter just to make a retention deadline executable.

PDF erasure removes only that private R2 payload. Dossier disposition clears its private basis/checklist/exemption JSON and review reason, including direct copies of that reason in decision events. It preserves original checksums, approval actors/times, minimal decision references and the historical business outcome. It does not delete separately governed PDFs, independent notes, original payroll sources, identity records, audit history or old backups. Neither operation restores ended employee access. A legitimate subsequent financial or identity change still invalidates the old closeout decision through the normal workflow.

The existing private R2 binding also holds minimal monotonic financial-control records outside the `hrm/` payload prefix. Do not copy, overwrite or delete these controls as part of a payload restore. Missing, staged, erasing or malformed controls make the corresponding payload unavailable; restored D1 rows or PDF bytes cannot establish current authority. Uploads use conditional registration and a conditional staging nonce to prevent a delayed payload write from recreating an already erased file. These controls cover the same registered identity; new-ID copies, derivatives and broader backup erasure require further lifecycle work and are not proven by this path.

An operation spans D1 and R2, so do not infer completion from a single row. A failed PDF operation remains retryable until the erased control and D1 tombstone agree. A dossier may have atomically redacted D1 content while its control still says erasing: the queue calls out that incomplete reconciliation. A current independent System Super Admin can reconcile an already proven erasure without opening HRM or deleting more data. Do not clear markers, rewrite request actors/times or rerun a fresh deletion to hide an interrupted operation. Current-authorization replay across a full older D1 restore, independent backup/derivative disposal and production recovery objectives remain separate, unapproved gates.

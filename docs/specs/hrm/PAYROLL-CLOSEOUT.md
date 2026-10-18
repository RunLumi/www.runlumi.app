# Final payroll review for offboarding

Status: policy configuration is released; the case-specific dossier implementation is being validated. This is not an approved business policy. Production remains closed. [Tiếng Việt](PAYROLL-CLOSEOUT.vi.md).

The final offboarding financial task requires a current independently approved dossier. A completion note alone cannot establish reconciliation. A zero recorded balance does not establish that leave cashout, advances, expenses or statutory/external obligations are settled or inapplicable.

## Required workflow

1. An authorized HRM policy administrator prepares a versioned closeout policy for a legal entity, referencing an independently reviewed private DOCX version/checksum. The owner supplies purpose, jurisdiction, finite validity dates and a bounded EN/VI checklist. No legal categories, amounts, rates, durations, exemptions or production policies are seeded. Each check has an explicit key, titles/instructions and whether an independently evidenced not-applicable outcome is allowed. If no payroll is recorded, that is unknown: only an explicit policy provision and independently approved evidence may establish an exemption.
2. A finance-authorized HRM administrator prepares a case-specific dossier for the exact person/employment/ending. It freezes the policy version, recorded payroll/time/claim/payment basis and a source revision/fingerprint, plus an outcome, reason and scoped reviewed PDF references for every required check. Evidence must be live, reviewed independently of its uploader, checksum-consistent and accessible to the actor; neither public CMS media nor another employee's file is accepted. A PDF review records a human's inspection, not bank authenticity or legal compliance.
3. A different authorized HRM Admin/System Super Admin reviews the dossier. The subject, preparer and a revoked account cannot approve it. Missing, stale, quarantined, deleted or pending-disposition evidence; mismatched identity/entity/employment; unresolved claims; missing/unclosed runs; underpayment or overpayment; stale/unlocked time sources; and absent required final-period coverage block approval. Existing recorded financial sources must reconcile exactly. External applicability remains an explicit, evidenced human decision under the approved policy.
4. The independent approver records the offboarding task only from that current approved dossier, with explicit confirmation, actor and server UTC time. Check capability/membership, policy/current dossier revision, case/employment and source readiness again in the same D1 mutation batch. There is no free-note waiver, no implicit zero and no automatic payment, tax filing, provision or account grant. Employee acknowledgements are not fabricated.
5. Preserve immutable dossier/check/evidence/basis history. A relevant payroll correction, payment, claim reopening or time/identity change invalidates a pending approval. After completion it must create visible follow-up/reopen the financial review without rewriting prior review evidence or restoring employee access. Races admit either a valid earlier completion followed by invalidation, or refusal of stale completion; never a final current approval on stale data.

## UI and scope

Policy preparation/review must have EN/VI peers and remain separate from global activation. Cases show authorized finance staff the missing policy/dossier or concrete source blockers and an independently reviewed approval record; manager/buddy/HR roles without payroll access see only their permitted task/status. Source evidence links keep their own authorization, private/no-store delivery and audit. Do not infer professional expertise from an EmDash role.

The integration journey uses synthetic policies, DOCX/PDFs, amounts and actors. It must keep a single candidate/person/employment through the workflow, reject other-user reads, preserve issued snapshots, and finish with revoked membership plus held-file/restore checks. The original phase regressions and financial guards remain. Owner-approved policy, professional parallel-run reconciliation, production recovery targets and the broader HRM gates remain separate, unproven release conditions; a passing synthetic dossier is not their approval.

## Implemented foundation and remaining work

The implementation adds policy version configuration and EN/VI forms inside the payroll desk, plus additive migration `0042_hrm_closeout_policies.sql`. Draft/review/activation/retirement decisions use the existing EmDash and Workspace authority. Reviewed policy DOCX checks include entity, checksum, independent file/version review, object deletion and pending disposal; definitions and decision history are immutable. Rollover records retirement events. These configuration records do not complete any employee task.

The recorded payroll reconciliation predicate now requires exact integer net/cash matching at the final correction leaf, rejects empty/missing or malformed issued amounts, and is reused by both the UI and atomic close command. SQL tests cover overpayment, underpayment, successive corrections and a receipt arriving between preflight and commit. This proves recorded reconciliation only, not final statutory/external clearance.

The working-tree dossier implementation now covers staff-private R2 PDFs, independent review, frozen financial basis, guarded task/case completion and source-triggered follow-up without access resurrection. Full same-employee recovery, all regression gates and release verification are still required. Owner policy, specialist approval, general disposition policy/UI for this file class and first-ever final payroll without an issued correction source remain separate unproven conditions. A partial or failing whole-journey run is not a completed acceptance gate.


D1 runtime verification is required in addition to Node SQLite tests. The current local D1 runtime rejects expression trees deeper than 100; the checklist checks are split into flat policy, shape, file-reference and no-payroll-exemption guards without dropping conditions. A real D1 profile-write reproduction caught a failure that ordinary Node SQLite tests did not.


Calendar assignment creation accepts an explicit optional ending. A bounded historical employment calendar can end before other locked/reviewed periods; overlap checks still protect every locked window and other assignments. No end date is inferred.

Leave-policy assignments likewise accept an explicit optional ending; protected-period and overlap checks use the complete interval and retry grants remain single entries.

## File-specific legal holds

Authorized finance staff can place a matter-specific hold on an individual confidential closeout PDF from its case, including after the case is completed. Placement requires both the financial desk capabilities and `hrm.legalhold.manage`; independent release also requires `hrm.retention.review`. HRM Officer, Payroll Officer, managers and employees cannot see or release this financial hold history through their broader non-financial permissions. Revalidate the current EmDash account and current D1 membership/capabilities, entity, file revision and HRM gate before each mutation. A rehired subject still cannot place or release a hold on their own previous case.

Placement and release retain the exact actor, server UTC timestamp, short matter reference and immutable history. Another person must release a hold. File and person-wide holds overlap: releasing either one preserves the other. A held file cannot be marked deleted, enter disposition or have its hold flag cleared. Deleted files and an in-progress erasure cannot receive a new hold. Preservation alone does not invalidate the financial basis, reopen a completed case or restore Workspace membership. This implements preservation controls only: owner-approved retention, approved erasure of financial file/dossier payloads, backup and derivative erasure remain separate work. No retention period or automatic deletion is introduced.

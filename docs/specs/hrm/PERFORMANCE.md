# Private performance reviews

[Tiếng Việt](PERFORMANCE.vi.md) · [Scope](README.md#11-phúc-lợi-tài-sản-và-dịch-vụ-nhân-viên) · [Implementation evidence](STATUS.md)

This implements the performance-review part of §11. Production remains closed. It does not establish an approved assessment policy, rating scale, promotion/pay decision or retention period.

## Workflow and authority

| Step | Actor and required behavior |
|---|---|
| Open | HRM Officer/Admin creates an explicitly named cycle for an active employee/employment, with period, completion deadline, objectives, evidence instructions and an active assigned reviewer. The period must fit the employment dates known at creation; employment revision is rechecked at commit. The configured legal entity must match. No cycle, dates, objectives or rating defaults are seeded. |
| Self-assessment | The employee submits a written assessment and evidence: facts, dates and source references. These references are plain text; they do not fetch documents or grant access. |
| Assessment | Only the assigned active People Manager/HRM Officer/HRM Admin submits the assessment, evidence and development plan. A manager's title or reporting line alone grants no review access. |
| Independent review | HRM Admin/System Super Admin, different from the subject, creator and assessor, returns the assessment for revision or approves sharing. The employee cannot see unpublished assessment/evidence/development text, including when holding a combined Employee + HRM Admin role. |
| Response | The employee sees the published revision, may disagree or request support, and must explicitly acknowledge reading. Server UTC time and the exact prior revision remain in immutable history. Acknowledgement means receipt, not agreement or electronic signature. |
| Close | An independent HRM Admin/System Super Admin closes only after the employee responds. Feedback and acknowledgement time remain unchanged. |

HR may reassign an unpublished cycle with a reason. Reassignment clears the current assessment and requires the new reviewer to assess again; prior content stays in HR-only immutable history. The old reviewer loses access on the next request. HR may cancel an unpublished cycle; a replacement may reuse its cycle code. Published cycles cannot be cancelled or rewritten. Published corrections now use the linked workflow below; each revision remains separately identifiable.

Self-assessment, assessment and development-plan evidence are written records, not PDF upload or external verification claims. File attachments, versioned assessment templates/scales, reminder policies, performance-specific retention/disposition/holds are not implemented by this slice. No retention duration is inferred from payroll, training or another category. Keep production closed while those applicable policy/lifecycle requirements are unresolved.

## Access and persistence

- Reuse EmDash identity/session and shared Workspace grants. Employee has `hrm.performance.self`; People Manager has `hrm.performance.review`; HRM Officer has manage/review; HRM Admin has manage/review/approve. These grants add no ATS, CRM, payroll or user-administration rights.
- `/hrm/performance` and `/vi/hrm/performance` contain the HR/assigned-reviewer queue. `/hrm/me/performance` and its `/vi` peer contain only the employee's cycles. Unknown and out-of-scope record IDs return the same not-found result.
- Lists page at 25 cycles. Writes check permission, membership, current assignment, expected revision, current subject identity and enabled/reviewed HRM settings in the D1 batch. Reviewer selection also checks the current EmDash account; the two databases cannot provide one cross-database transaction. Disabling EmDash still blocks that account's next authenticated request.
- Migration 0039 adds private review rows and append-only snapshots/events. Published content and employee responses cannot be rewritten; command keys are actor-scoped and idempotent. Audit details contain action/revision, not assessment text.
- Self-export schema v9 adds only employee-visible cycle data. Unpublished staff content and reviewer account IDs stay excluded. It is a bounded, private snapshot, not an export of internal HR event payloads.
- No Lark/email/webhook, payroll input, role change or provisioning is triggered.

## Verification contract

Exercise create/retry, independent publication, return/reassessment, reassignment versus assessment race, old-reviewer denial, combined-role subject privacy on both queues and self-export, employee acknowledgement/feedback, premature close denial, immutable closure and unrelated-record probes. Audit EN/VI native forms at 320/430/1280px without JavaScript, with reduced motion, visible keyboard focus and no horizontal overflow. Results belong in STATUS and the exact-head PR; this contract alone is not a pass.

## Linked corrections after publication

A correction is a new cycle linked to the original root and the latest effective source. It retains the same person, employment and legal entity. HR explicitly supplies a new cycle code, deadline, reviewer and corrected objectives/evidence requirements; the period may be corrected within that employment's dates. Current employment identity/version and legal entity are checked again at commit/publication. An ended employment is supported. This workflow never changes the employee's account or grants.

HR must select one employee-input mode; neither is preselected:

- **New submission:** the linked employee needs an active EmDash account and current self-service access. The correction starts open with empty self-assessment/evidence, and the employee submits a new version.
- **Carried context:** employee words/evidence are copied verbatim from the latest authentic self-submission in the source chain. The original event, author, time, period and objectives remain traceable. The UI/export mark this as historical context, even if HR corrects the period or objectives; it is not a new employee submission, agreement or receipt. This permits a historical correction when the account is disabled without restoring access. No `submit_self` event is fabricated.

| Situation | Result |
|---|---|
| Two pending corrections proposed from one effective source | One transaction wins; the loser leaves no orphan review or command. |
| An unpublished proposal is cancelled | Its link/history remain. The source stays current and a new numbered attempt is permitted. |
| Source feedback/receipt changes while a proposal is prepared | The source stays actionable. The independent publisher must review its current revision and feedback, explicitly confirm that review and submit the expected source revision. A stale source rejects publication. |
| Correction publication races a source receipt | Exactly one wins. If the receipt wins, the publisher reloads/reviews it; if publication wins, no new action/receipt may be written to the superseded source. A retry of a previously successful source receipt remains idempotent. |
| The correction is published | It becomes current. Source fields, prior feedback, receipt, actor and timestamps remain unchanged; the archive marker is derived from lineage. The new publication needs its own real receipt before closure. |

Migration 0040 adds immutable correction links and publication-basis rows. A basis identifies the exact source event/revision/checksum, employment revision, independent approver and server time. D1 triggers reject correction publication without that basis and reject subsequent mutations to a superseded source. Source checksums identify stored history; they are not electronic signatures.

Each linked page keeps its own permissions. Assignment to a correction grants copied employee context, not automatic access to the source's HR assessment; inaccessible source/root/current links are omitted. Related attempts paginate at 25. Unpublished assessments remain masked from the subject even with HRM Admin privileges. The correction freezes the publication's employee identity; an identity-link mismatch blocks ordinary access/actions until HR resolves it, and both the original and current subject identities retain draft-content masking under privileged roles.

Self-export schema v10 adds bundle-local review/root/source references, correction reason/attempt, source versions/checksum, current/archive markers and actual-versus-carried self-input provenance. It contains no reviewer account IDs or internal event payloads. All employee collections are read in the same D1 batch snapshot. Staff drafts are masked in SQL; a visible-text/row budget gates fetching large results, and the final encoded bundle retains its five-MiB cap.

The correction lineage replaces the earlier requirement to create an unrelated cycle for a published error. It does not add file attachments, performance-specific legal holds/retention/disposition, assessment scales, outside delivery, payroll/access changes or production activation. Those remaining scope items and owner decisions remain open.

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

HR may reassign an unpublished cycle with a reason. Reassignment clears the current assessment and requires the new reviewer to assess again; prior content stays in HR-only immutable history. The old reviewer loses access on the next request. HR may cancel an unpublished cycle; a replacement may reuse its cycle code. Published cycles cannot be cancelled or rewritten. A correction after publication currently needs a separately identified cycle; explicit correction linkage remains a follow-up.

Self-assessment, assessment and development-plan evidence are written records, not PDF upload or external verification claims. File attachments, versioned assessment templates/scales, reminder policies, explicit correction lineage and performance-specific retention/disposition/holds are not implemented by this slice. No retention duration is inferred from payroll, training or another category. Keep production closed while those applicable policy/lifecycle requirements are unresolved.

## Access and persistence

- Reuse EmDash identity/session and shared Workspace grants. Employee has `hrm.performance.self`; People Manager has `hrm.performance.review`; HRM Officer has manage/review; HRM Admin has manage/review/approve. These grants add no ATS, CRM, payroll or user-administration rights.
- `/hrm/performance` and `/vi/hrm/performance` contain the HR/assigned-reviewer queue. `/hrm/me/performance` and its `/vi` peer contain only the employee's cycles. Unknown and out-of-scope record IDs return the same not-found result.
- Lists page at 25 cycles. Writes check permission, membership, current assignment, expected revision, current subject identity and enabled/reviewed HRM settings in the D1 batch. Reviewer selection also checks the current EmDash account; the two databases cannot provide one cross-database transaction. Disabling EmDash still blocks that account's next authenticated request.
- Migration 0039 adds private review rows and append-only snapshots/events. Published content and employee responses cannot be rewritten; command keys are actor-scoped and idempotent. Audit details contain action/revision, not assessment text.
- Self-export schema v9 adds only employee-visible cycle data. Unpublished staff content and reviewer account IDs stay excluded. It is a bounded, private snapshot, not an export of internal HR event payloads.
- No Lark/email/webhook, payroll input, role change or provisioning is triggered.

## Verification contract

Exercise create/retry, independent publication, return/reassessment, reassignment versus assessment race, old-reviewer denial, combined-role subject privacy on both queues and self-export, employee acknowledgement/feedback, premature close denial, immutable closure and unrelated-record probes. Audit EN/VI native forms at 320/430/1280px without JavaScript, with reduced motion, visible keyboard focus and no horizontal overflow. Results belong in STATUS and the exact-head PR; this contract alone is not a pass.

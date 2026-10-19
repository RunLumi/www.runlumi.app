# HRM — P0 decision package

[Tiếng Việt](P0-DECISIONS.vi.md) · Status: **AWAITING OWNER** · Updated: 2026-10-20

This package collects every §16 decision in the [HRM specification](README.md) that code cannot settle. Each row lists the value to fill in, where it is configured, who signs and which gate it opens. Agents and developers **never fill the blanks themselves**. Once the owner fills and signs a row, configuration still goes through the existing flow: one person creates it, someone else reviews it, and only then is it activated.

## Decisions recorded

| Date | Decision | Consequence |
|---|---|---|
| 2026-10-20 | **One legal entity** uses HRM. Entity name: `__________` | Enter exactly this name in *HRM → Settings*. Every payroll, leave and report policy uses it. |
| 2026-10-20 | HRM covers **employees and contractors (CTV)**. Contractors have a minimal profile and are **never in payroll**. | Engineering follow-up: add a relationship type (employee/contractor) to each employment period and exclude contractors from payroll runs. The system does not yet distinguish relationship types. A CRM Partner is still not automatically an HRM contractor. |
| 2026-10-20 | The owner will name **two independent approvers** and the **payroll owner**. | Fill in item 2 below. |
| 2026-10-20 | An **accountant/specialist** will check pay rules and run the parallel period. | Fill in the name under item 6. |

## Decisions to fill in

| # | Decision | Value needed | Configured in | Signs | Opens |
|---|---|---|---|---|---|
| 1 | Entity, workplace, relationship types | Entity name; workplace; minimal contractor profile rules | *HRM → Settings*; people records | Owner | P0, P1 |
| 2 | Role holders | HRM Admins (two different people, or one HRM Admin plus the System Super Admin); HRM Officer; Payroll Officer; independent payroll approver; COI reviewer; a backup for each | *Workspace → Users* (Admin only) | Owner | Every independently approved flow |
| 3 | Data and retention | Required fields; purpose/legal basis; retention (days and anchor) for 13 file categories, 6 record kinds, financial dossiers and report snapshots (RPT-01); legal-hold rules; who handles data-subject requests | *HRM → Retention* (policy DOCX + independent review) | Owner + legal | P2, P5, HRM-34/36 |
| 4 | Documents and signing | Contract/NDA/COI/policy templates; for each: read acknowledgement, paper/scan or e-signature; which provider if e-signature | *HRM → Documents* | Owner + legal | P2, HRM-11 |
| 5 | Time and leave | Schedules, shifts, holidays; leave types, annual grant, accrual, carry-over, allowed negative balance; overtime; attendance cutoff | *HRM → Time*, *HRM → Leave* | Owner + HR | P3 |
| 6 | Payroll | Components; PIT and social/health/unemployment insurance; rounding; pay date; advances/repayments; **proration for partial months**; inquiry handling. Accountant/specialist: `__________`. Parallel period: `____`, with the attached reconciliation | *HRM → Payroll* (policy + contract compensation) | Owner + accountant | P4, HRM-13/14/15 |
| 7 | CRM commission | Approve the `local-commission` policy (still a proposal); tax treatment of employee commission | *CRM → Commission* | Owner + accountant | Commission into payroll |
| 8 | Infrastructure and recovery | RPO/RTO; D1/R2 backup destination and retention; recovery authority; handling of copies and old backups after an erasure request (RPT-08/09) | Recovery runbook | Owner + Cloudflare operator | HRM-21 in production |
| 9 | Notifications and leaving | Allowed channels beyond in-app; minimum content; when access ends after leaving; document handover | Reminder settings; offboarding | Owner + HR | HRM-19 |
| 10 | Onboarding | Templates per role; required/optional tasks; date anchors; reviewers; waivers; overdue handling | *HRM → Onboarding* | Owner + HR | P2 |
| 11 | Activation | Who sets `HRM_LIVE_ENABLED` in Cloudflare and marks HRM settings reviewed; when real users get access | Cloudflare + *HRM → Settings* | Owner | Production opening |

## How to use

1. The owner fills in the `____` blanks and the "Value needed" column, with a date and signer per item.
2. A permitted person creates the matching configuration. Someone else reviews and activates it; nobody approves their own work.
3. Record the outcome (policy version, reviewer, date) in [STATUS.md](STATUS.md).
4. Set `HRM_LIVE_ENABLED` only after items 1–6 and 8 have signed values and the parallel payroll period has no unexplained differences.

No legal, tax or insurance value in this document is a recommendation. A qualified person must confirm each one for the workplace and the period in which it applies.

# HRM — Implementation status

Updated: 2026-10-13. Goal active; no HRM phase is complete yet.

## Checkout and resume

- Worktree: `/Users/james/.codex/worktrees/hrm-p1/www.runlumi`; branch `codex/hrm-p1`; base `ab87173864f97e683e7cdf8aad7c80827524894c`.
- Original checkout has unrelated untracked hiring/security documentation; preserve it.
- This task owns HRM source/routes/tests/migrations and necessary Workspace integration. No production HR data or grants authorized.
- A task-owned `node_modules` symlink points to original installed dependencies; do not commit it or delete its target. Host Node 22.14 requires `NODE_OPTIONS=--experimental-strip-types` for TS tests.
- GitHub Actions budget previously prevented jobs starting; local checks do not count as hosted PASS. Cloudflare Builds API access previously returned 403 and dashboard failed; revalidate before release claims.

## Owner decisions

- 2026-10-13: HRM Admin and System Super Admin may approve HRM operations. System Super Admin remains EmDash role 50. HRM Admin is a separate combinable Workspace role, without user/role administration, ATS or CRM permissions. Self-approval remains prohibited.
- 2026-10-13: policies/templates not yet finalized; build configurable workflows and keep production closed. No invented legal entity, retention period, tax/insurance formula or valid signing policy.
- Technical proposal P1: HRM metadata in existing business D1 with `hrm_` tables; private files in `hrm/` namespace of existing FILES R2 binding, using distinct metadata and endpoints. No file reused from ATS or public EmDash media. Reassess physical bucket separation before activation if custody requirements demand it.

- Owner clarification, 2026-10-13: policy authors upload DOCX; employees and HR submit PDF evidence; each affirmative acknowledgement must store actor and server confirmation time tied to immutable issue/version/checksum and display it in the UI. This records acknowledgement, not electronic signature.

## Phase gates

| Phase | Contract | Integration | Release | Next step |
|---|---|---|---|---|
| P0 | UNPROVEN: roles clarified; policy configuration unapproved | UNPROVEN | CLOSED by owner | Record configurable activation prerequisites |
| P1 | UNPROVEN | UNPROVEN | Not released | Implement scoped employee/profile/record/file workflows and bilingual pages |
| P2 | UNPROVEN | UNPROVEN | Not released | Wait for P1 integration before legal/onboarding implementation |
| P3 | UNPROVEN | UNPROVEN | Not released | Time/leave after base identities and workflow custody |
| P4 | UNPROVEN | UNPROVEN | Not released | Payroll requires independently reviewed policies/calculation evidence |
| P5 | UNPROVEN | UNPROVEN | Not released | Services, operation and restore evidence |

## Requirement-to-evidence matrix

| Requirement | Phase | Implementation/test/evidence | Status |
|---|---|---|---|
| §1–3 identity, roles, EN/VI navigation | P1 | Pending | UNPROVEN |
| §4 employee profiles and changes | P1 | Pending | UNPROVEN |
| §5 dependents, identity and private files | P1 | Pending | UNPROVEN |
| §6 contracts, NDA, COI and evidence | P2 | Pending | UNPROVEN |
| §7 lifecycle; §7.1–7.3 onboarding todo | P2 | Pending | UNPROVEN |
| §8 time and calendars | P3 | Pending | UNPROVEN |
| §9 leave and concurrency | P3 | Pending | UNPROVEN |
| §10 payroll/payslips | P4 | Pending | UNPROVEN |
| §11 benefits/assets/learning/HR requests | P5 | Pending | UNPROVEN |
| §12 shared persistence/audit/custody | P1–P5 | Pending | UNPROVEN |
| §13 retention/hold/restore/runbooks | P1–P5 | Pending | UNPROVEN |
| HRM-01–05 | P1 | Pending | UNPROVEN |
| HRM-06–09 | P2–P4 | Pending | UNPROVEN |
| HRM-10–12 | P2 | Pending | UNPROVEN |
| HRM-13–15 | P4 | Pending | UNPROVEN |
| HRM-16 | P1 | Pending | UNPROVEN |
| HRM-17–18 | P1–P2 | Pending | UNPROVEN |
| HRM-19–21 | P1–P5 | Pending | UNPROVEN |
| HRM-22–25 | P2 | Pending | UNPROVEN |

## Verification log

- Initial implementation exists in the isolated checkout: additive 0012 migration, independent HRM grants, profile/record validators and approval service. It is NOT YET verified or integrated.
- Isolated temporary clone created from `origin/main` at `ab87173864f97e683e7cdf8aad7c80827524894c`; branch `codex/hrm-p1` in `/private/tmp/runlumi-hrm`. This avoids writing into the concurrently checked-out privacy branch. No PR exists for P1 yet.
- Monthly engineering review already recorded complete for October; no extra guidance change inferred.
- Next: build P1 vertical slice, then unit/migration and real Worker/D1/R2/EmDash integration before claiming PASS.

## Latest P1 work (2026-10-13)

- Implemented: roles `employee`, `people_manager`, `hrm_officer`, `hrm_admin`; System Super Admin remains EmDash role 50. HRM grants remain separate from ATS/CRM and users administration. A runtime `HRM_LIVE_ENABLED` switch defaults off.
- Implemented: stable `hrm_people` identity with separate `hrm_employments`, allowing rehire as another immutable employment period. New role/profile fields are EN/VI and use EmDash session identity.
- Implemented: effective date/status/contact/work fields; separated record kinds for contact, personal, identity/CCCD, dependents, banking and tax; server validation; self-edit versus submitted/reviewed workflow; revision guards and idempotency; audit/history triggers and immutable snapshots.
- Implemented: private R2 `hrm/` uploads for signature-checked PDF/JPEG/PNG, 5 MB ceiling, per-person/per-record permission checks, quarantine, review reason/actor/time, no-store attachment downloads and upload cleanup when DB commit fails. No antivirus scan claim; manual review remains distinct.
- Implemented: EN/VI overview, employee profile, scoped people listing, work record admin, policy setup, API endpoints, phone styles and authenticated file flows. Access remains closed for all HRM non-admin users unless the deployment switch and owner-reviewed settings are ready.
- Verification so far: `npm run lint` PASS; `npm test` PASS (83 tests); `astro check` PASS (0 errors; one pre-existing hiring hint); Python SQLite schema exercise PASS for old-role preservation, end/re-hire periods and append-only employment history. `npm run build` was attempted but Astro font generation was denied permission to bind `0.0.0.0`. The real Worker integration runner was attempted but could not bind `127.0.0.1` in this sandbox. Build and real Worker/EmDash/D1/R2 evidence remain UNPROVEN; these are environment restrictions, not PASS.
- Isolated real-Worker integration harness and CI step are drafted. This machine's sandbox currently refuses opening a localhost listening socket; do not represent Python SQLite/unit tests as a real Worker/D1/R2 PASS. Require hosted CI or an approved runnable test environment for P1 Integration Gate.
- P1 PR not yet published or merged. No production change, role grant or HR data exists.
- Owner policy-file direction (2026-10-13): HRM Admin authors DOCX policy sources; employee/HR evidence comes as PDF; explicit acknowledgement captures the server timestamp and exact issued version. Implement this in P2 without claiming acknowledgement is an electronic signature.

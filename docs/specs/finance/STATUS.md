# Finance status / Trạng thái Finance

[English specification](README.md) · [Đặc tả tiếng Việt](README.vi.md)

**Updated / Cập nhật:** 2026-10-18. **Scope / Phạm vi:** complete Finance v1 implementation; owner authorized PR creation and merge / triển khai toàn bộ Finance v1; owner đã yêu cầu tạo PR và merge.

## Implementation / Triển khai

| Stage | Status / Trạng thái | Evidence / Bằng chứng |
|---|---|---|
| F0 requirements | COMPLETE / HOÀN TẤT | Canonical specs moved from `docs/finance` to `docs/specs/finance`, with EN/VI parity |
| F1 monthly workflow | IMPLEMENTED / ĐÃ TRIỂN KHAI | Super Admin boundary, D1 schema, native setup/plan/actual forms, reconciliation, immutable baseline and monthly close |
| F2 complete v1 | IMPLEMENTED / ĐÃ TRIỂN KHAI | All eleven EN/VI routes, scenarios/forecasts, allocation/copy previews, material thresholds, all reports, imports/exports and audit |
| F3 code/release validation | AUTOMATED COVERAGE IMPLEMENTED / ĐÃ TRIỂN KHAI KIỂM TRA | Unit, full Worker regression, local recovery and optional Chrome checks are wired into the repository; commit-specific CI and deployment results are attached to the implementation PR |
| Real book activation | OWNER SETUP REQUIRED / OWNER CẦN THIẾT LẬP | Migration contains no entity, policy, account, balance or sample financial facts; deployment flag and configured/enabled book are both required |

The owner explicitly requested implementation and merge after reviewing the requirements phase. That release authorization is already present; the future entry of real company policy/opening figures is a separate operational action. / Owner đã yêu cầu triển khai và merge sau bước đặc tả. Quyền phát hành đã có; nhập chính sách/số đầu kỳ thật là bước vận hành riêng.

## Implemented sources / Mã nguồn

- [D1 migration](../../../migrations/0038_finance.sql), [store and command lifecycle](../../../src/lib/finance/store.ts), [typed contract](../../../src/lib/finance/store-types.ts).
- [Access boundary](../../../src/lib/finance/access.ts), [form/JSON validation](../../../src/lib/finance/http.ts), [API](../../../src/lib/finance/api.ts), [SSR loader](../../../src/lib/finance/pages.ts).
- [Definitions](../../../src/lib/finance/model.ts), [calculations](../../../src/lib/finance/calculations.ts), [reports](../../../src/lib/finance/reports.ts), [CSV](../../../src/lib/finance/csv.ts), [immutable exports](../../../src/lib/finance/exports.ts).
- [Shared Finance UI](../../../src/components/finance/FinancePage.astro) and eleven `/finance` + `/vi/finance` routes. Existing CRM Finance permissions do not grant this module.

## Verification / Kiểm tra

| Check | Result / Kết quả | Evidence / Bằng chứng |
|---|---|---|
| Finance behavioral unit cases | PASS — 75 cases | Calculations24, CSV9, reports8, exports10, D1 store16, access/HTTP8; direct individual test execution |
| Isolated Worker/D1 journey | PASS — 9 reported tests, 8 sequential scenarios | Real synthetic EmDash sessions, 22 route authorization, setup, 12-month baseline, close/reopen, forecast, CSV, exact export replay and local recovery |
| Repository CI/build after latest main integration | PASS — 254 unit tests; Astro 463 files, 0 errors/warnings | `npm run ci:verify`; one existing Hiring unused-import hint and the existing bundle-size notice remain |
| Full module regression | Required commit check / Gate bắt buộc theo commit | Includes existing Hiring/CRM/HRM behavior and Finance; exact run results belong to the implementation PR checks and release notes |
| Responsive/accessibility | PASS — 4 views × 4 widths | 320/430/1280/1920px, no horizontal page overflow, no-JS forms, reduced motion, visible keyboard focus and accessibility tree; screenshots reviewed locally |
| Finance text contrast | PASS — minimum 4.81:1 among checked foreground/background pairs | Checked body/muted text, links, badges, status colors and empty-value text; empty-value color corrected to the standard muted color |
| Isolated D1 recovery | PASS — native SQLite online backup/restore | Consistent read-only snapshot restored into separate local D1; Finance/Workspace content hashes, closed facts, foreign keys and immutable guards preserved; original database unchanged |
| Local documentation links and EN/VI parity | PASS | 15 documents, seven localized pairs, matching requirement IDs/headings and eleven peer routes; no broken local links |

This is the implementation handoff record, based on the candidate integrated with main `ff07491d0d33675e346221852dd83a7409469d0d` (including the HRM job-description change). The [Finance implementation PR](https://github.com/RunLumi/www.runlumi.app/pulls?q=is%3Apr+head%3Afeat%2Ffinance-module) records the final local regression result, exact proposed commit, GitHub CI and Cloudflare Workers Builds outcome. PR validation must pass before merge; the production Workers Build is verified after merge. The measured smoke/recovery results above do not claim a production restoration or a load-test SLA. / Đây là bản ghi bàn giao triển khai, đã tích hợp thay đổi mô tả công việc HRM từ main nêu trên. PR Finance ghi kết quả hồi quy cuối, commit được đề xuất, CI GitHub và Cloudflare Workers Builds. Gate PR theo commit phải qua trước merge; Workers Build production được xác minh sau merge. Kết quả smoke/khôi phục ở trên không phải restore production hoặc cam kết SLA tải lớn.

## Requirement mapping / Đối chiếu yêu cầu

| IDs | Implementation and meaningful coverage |
|---|---|
| FIN-01/02/17 | Non-grantable permissions; active role50 session; all-role/union and demotion/disabled/token denials; no queries/card for unauthorized user; independent HRM gate |
| FIN-03/10/15 | Additive D1; SQL assertion rollback; immutable published/closed/audit/operation rows; CAS; reopen history; actor provenance; recovery rehearsal |
| FIN-04/18 | Eleven bilingual views, native forms, private errors, bounded pages/imports, responsive keyboard/no-JS QA and operations runbook |
| FIN-05/11/12 | Twelve-month exact rational allocation, preview/copy, separate baseline/scenario/forecast, pinned sources, segment grain and cost behavior |
| FIN-06/07/08/09/14 | Blank/zero/N/A, safe integer money, source evidence, fiscal boundaries, contiguous YTD, stock/flow/ratio rules, independent cash/aging/position/equity controls |
| FIN-13/16 | Strict bounded CSV preview and per-month atomic commit, own-manifest version advancement, duplicate prevention, provenance-preserving discard, formula-safe frozen export replay |

## Operational boundaries / Ranh giới vận hành

- No production financial, banking, payroll, applicant or customer records were read or seeded. All testing uses synthetic records in isolated local databases. / Không đọc hoặc tạo dữ liệu thật; kiểm tra dùng dữ liệu giả lập, DB cô lập.
- Real entity/currency/calendar/cutover/policy, source ownership, opening balances, retention and backup responsibility must be supplied by the owner. Cash floor/materiality remain unset until configured. / Owner cung cấp phạm vi/chính sách/nguồn/số đầu kỳ/trách nhiệm lưu giữ và sao lưu.
- V1 rejects actual months before the immutable cutover. A changed historical cutover requires reviewed migration; midyear reporting stays explicitly partial. / Nhập trước mốc đã khóa cần migration được rà soát; năm giữa kỳ được ghi rõ một phần.
- CSV256KiB, 200 facts/month, complete-month512KiB and export16MiB/24 insertion-group bounds are explicit. Oversize requests fail; no truncated totals. / Giới hạn dữ liệu rõ ràng; vượt giới hạn báo lỗi, không cắt tổng.
- Local recovery evidence does not claim a production Time Travel restore was performed. Shared-D1 restore affects other modules and requires its own concrete authorized scope. / Diễn tập local không phải restore production; DB dùng chung cần phạm vi khôi phục được phép riêng.
- PR checks and the existing Cloudflare main release pipeline establish publication/deployment status. A merged PR alone is not evidence of an enabled real financial book. / PR và pipeline xác định trạng thái phát hành; merge không đồng nghĩa sổ số thật đã bật.

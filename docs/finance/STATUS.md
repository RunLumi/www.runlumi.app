# Finance status / Trạng thái Finance

[English specification](README.md) · [Đặc tả tiếng Việt](README.vi.md)

**Updated / Cập nhật:** 2026-10-18. **Scope / Phạm vi:** requirements first; documentation only / phân tích yêu cầu trước, chỉ tài liệu.

## Implementation status / Trạng thái triển khai

| Stage | Status / Trạng thái | Evidence / Bằng chứng |
|---|---|---|
| F0 requirements / Yêu cầu | DOCUMENTED; READY FOR OWNER REVIEW / ĐÃ ĐẶC TẢ; SẴN SÀNG ĐỂ OWNER DUYỆT | 13 Finance documents: six EN/VI pairs plus this shared status; independent cross-review fixes incorporated |
| F1 secure monthly workflow / Quy trình tháng có phân quyền | NOT IMPLEMENTED / CHƯA TRIỂN KHAI | No Finance routes, permissions, schema or migrations added |
| F2 complete v1 / V1 đầy đủ | NOT IMPLEMENTED / CHƯA TRIỂN KHAI | All 11 page roots are proposed |
| F3 production readiness / Sẵn sàng production | NOT STARTED / CHƯA BẮT ĐẦU | Real reporting setup, source inputs and runtime evidence pending |
| Production Finance / Finance production | NOT ENABLED BY THIS CHANGE / KHÔNG KÍCH HOẠT TRONG THAY ĐỔI NÀY | No deployment, migration, data import or feature-switch change performed |

The existing CRM role named Finance is implemented elsewhere and remains unchanged. It is not this module. / Role Finance của CRM đã có ở phần khác và không đổi; không phải module trong đặc tả này.

## Source and review evidence / Nguồn và bằng chứng rà soát

- Source baseline / Mã nguồn đối chiếu: [`30c75a64ba1184f241a421d2591a5b5be9db6426`](https://github.com/RunLumi/www.runlumi.app/commit/30c75a64ba1184f241a421d2591a5b5be9db6426).
- Current architecture was inspected, including EmDash role 50, the CRM Finance role, shared D1, Workspace navigation, private route middleware, CRM commercial evidence and HRM gates. / Đã kiểm tra danh tính, phân quyền, D1, điều hướng, middleware, số CRM và gate HRM.
- Separate reviews covered financial meaning, D1 transaction/integer behavior and application access. Cross-review resolved expected line/segment completeness, sequential plan-import versions, CSV explanations/provenance, temporal/YTD rules, overdraft financing, gross/net receivables, shared forecast inputs and reproducible settings. / Rà soát độc lập đã khép các lỗi về ô bắt buộc, import nhiều tháng, giải thích/nguồn CSV, kỳ/YTD, thấu chi, phải thu gross/net, số forecast dùng chung và cấu hình tái lập.
- Fixtures are synthetic; no production finance, bank, payroll or customer data was read or committed. / Ví dụ giả lập; không đọc hoặc commit dữ liệu tài chính, ngân hàng, lương hoặc khách hàng thật.

## Verification / Kiểm tra

| Check / Kiểm tra | Result / Kết quả | Meaning / Ý nghĩa |
|---|---|---|
| Local Markdown links and EN/VI route/requirement parity | PASS | 13 Finance files; local targets resolve; six localized pairs preserve route and requirement IDs |
| Independent arithmetic checks / Kiểm tra số độc lập | PASS — 8 assertions | Exact positive/negative annual allocation, weighted remainder, cash, overdraft, receivable allowance, signed variance and cash-floor fixtures; specification examples only |
| `npm run lint` | PASS | Existing source policy check: 400 source files |
| `npm run build` | PASS | Astro check: 403 files, zero errors/warnings; application build completed. Existing bundle-size warning remains; no application source changed |
| Finance runtime acceptance / Nghiệm thu runtime Finance | NOT RUN / CHƯA CHẠY | Finance is not implemented; FIN-01–18 remain future runtime obligations |

Build used `CI=1`, disabled Astro telemetry and a writable Wrangler log destination. The first restricted attempt could not open Astro's local build listener; the authorized local build then completed. No deploy command, remote D1 migration or production restore ran. / Build dùng chế độ CI, tắt telemetry và đường log ghi được; lần đầu sandbox chặn listener local của Astro, lần build local được cho phép sau đó hoàn tất. Không chạy deploy, migration D1 remote hoặc restore production.

## Next authorized work / Công việc tiếp theo được phép

Review the documentation PR. Runtime implementation starts only as a separate requested step, following [Delivery](DELIVERY.md) / [Triển khai](DELIVERY.vi.md). Future implementation updates this record with exact commit, commands, data scope, results and remaining gates; never replace a missing test result with the existence of a specification.

Duyệt PR tài liệu. Triển khai mã ứng dụng là bước yêu cầu riêng; khi làm, cập nhật commit, lệnh, phạm vi dữ liệu, kết quả và gate còn lại. Có đặc tả không thay cho bằng chứng kiểm thử.

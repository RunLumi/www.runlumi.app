# Finance — kiến trúc, phân quyền và hợp đồng API

**Trạng thái:** bản triển khai đang được kiểm chứng; bằng chứng kiểm thử và kích hoạt production được ghi riêng tại [STATUS.md](STATUS.md). **Rà soát:** 2026-10-18. **Baseline ban đầu:** `30c75a64ba1184f241a421d2591a5b5be9db6426`. [English](ARCHITECTURE.md).

Tài liệu mô tả mã Finance trên nhánh triển khai và các ranh giới bảo vệ bắt buộc. Baseline ban đầu chưa có phân hệ tài chính toàn công ty; các tệp liên kết bên dưới hiện đã có phần triển khai. Mã nguồn không chứng minh production đã hoạt động hoặc mọi cổng nghiệm thu đã đạt. Đọc cùng [sản phẩm](PRODUCT.vi.md), [quy tắc tài chính](FINANCIAL-RULES.vi.md) và [dữ liệu](DATA-MODEL.vi.md). Giá trị mặc định vẫn là đề xuất ban đầu, chưa phải chính sách doanh nghiệp đã xác nhận.

## 1. Tích hợp với repository

| Nguồn | Hành vi và hệ quả |
|---|---|
| [Danh tính](../../../src/lib/admin-auth.ts), [quyền Workspace](../../../src/lib/workspace/roles.ts) | Tài khoản EmDash đang hoạt động có **role đúng bằng 50** là System Super Admin; không phải vai trò Workspace có thể cấp. Admin nhận các capability đã khai báo. |
| [Vai trò](../../../src/lib/workspace/roles.ts) | `finance` hiện chỉ có `workspace.access`, `crm.access`, `crm.finance`. **CRM Finance không được vào phân hệ mới**. |
| [Middleware](../../../src/middleware.ts), [cổng Finance](../../../src/lib/finance/access.ts), [menu](../../../src/lib/workspace/nav.ts) | Finance có kiểm tra phiên/readiness riêng, menu theo quyền và header riêng tư. Ẩn menu không thay thế phân quyền. |
| [Bindings](../../../wrangler.jsonc), [migration](../../../migrations/0038_finance.sql) | Bảng Finance dùng binding `DB`, D1 `lumi-jobs` dùng chung. `CONTENT_DB` vẫn dành cho danh tính/nội dung EmDash. |
| [Mô hình CRM](../../../src/lib/crm/routes/business-model.ts), [bằng chứng](../../../src/lib/crm/business-evidence.ts) | Sales Manager và CRM Finance đọc được tổng thương mại. Loader không tự kiểm tra actor này không phải cổng bảo vệ hoặc nguồn số liệu Finance. |
| [HRM](../../../src/lib/hrm/service.ts), [payroll](../../../src/lib/hrm/payroll.ts) | Cổng HRM, bản phát hành và guard phiên bản hoạt động độc lập. Finance không nhận quyền HRM và không đọc payroll trong v1. |

## 2. Cấu trúc phân hệ và mã nguồn

V1 có một sổ quản trị, một pháp nhân được xác định và một tiền tệ cơ sở; mặc định VND trước khi có dữ liệu. Cấu hình tham chiếu được giữ cùng kế hoạch công bố và revision đã chốt. Không thêm số tài chính mẫu, công thức thực thi, credentials hoặc tệp nhị phân vào bản ghi Finance.

Mười một trang đều có [route SSR tiếng Việt](../../../src/pages/vi/finance/) tương ứng, dùng [FinancePage](../../../src/components/finance/FinancePage.astro) trong [WorkspaceShell](../../../src/layouts/WorkspaceShell.astro) với `module="finance"`. [Loader chung](../../../src/lib/finance/pages.ts) phục vụ cả hai ngôn ngữ; đổi ngôn ngữ không đổi bản ghi hoặc số tiền.

| Mã trang / route | Trách nhiệm |
|---|---|
| [Tổng quan](../../../src/pages/finance/index.astro) — `/finance` | Độ đầy đủ, đối chiếu, sàn tiền và chênh lệch đạt ngưỡng |
| [Kế hoạch](../../../src/pages/finance/plans/index.astro) — `/finance/plans` | Bảng 12 tháng, nhập theo tháng, xem trước phân bổ/sao chép, baseline, forecast/scenario |
| [Thực tế](../../../src/pages/finance/actuals/index.astro) — `/finance/actuals` | Số tháng, quan sát số dư, nguồn, CSV, lịch sử, chốt/điều chỉnh |
| [Lãi lỗ](../../../src/pages/finance/pnl/index.astro) — `/finance/pnl` | So sánh thu nhập/chi phí theo tháng, quý, lũy kế và năm |
| [Dòng tiền](../../../src/pages/finance/cash-flow/index.astro) — `/finance/cash-flow` | Thu chi, tài khoản, đối chiếu và khoảng dự báo có dữ liệu |
| [Doanh thu](../../../src/pages/finance/revenue/index.astro) — `/finance/revenue` | Doanh thu ghi nhận, phân khúc, chênh lệch |
| [Chi phí](../../../src/pages/finance/costs/index.astro) — `/finance/costs` | Trực tiếp/hoạt động, tính chất chi phí, phân biệt chi phí lương và tiền trả |
| [Vốn lưu động](../../../src/pages/finance/working-capital/index.astro) — `/finance/working-capital` | Tuổi nợ phải thu/phải trả, quá hạn và đối chiếu |
| [Tình hình tài chính](../../../src/pages/finance/position/index.astro) — `/finance/position` | Tài sản, nghĩa vụ, vốn chủ và kiểm tra liên kỳ |
| [Thiết lập](../../../src/pages/finance/settings/index.astro) — `/finance/settings` | Sổ, lịch, định nghĩa, phân khúc, tài khoản và ngưỡng |
| [Lịch sử](../../../src/pages/finance/audit/index.astro) — `/finance/audit` | Thay đổi, công bố, chốt/mở lại, giải trình và xuất báo cáo |

[model.ts](../../../src/lib/finance/model.ts), [calculations.ts](../../../src/lib/finance/calculations.ts), [reports.ts](../../../src/lib/finance/reports.ts) dùng chung quy tắc tiền, độ đầy đủ và báo cáo. [store-types.ts](../../../src/lib/finance/store-types.ts), [store.ts](../../../src/lib/finance/store.ts) định nghĩa lệnh, ghi D1 và guard. [csv.ts](../../../src/lib/finance/csv.ts), [exports.ts](../../../src/lib/finance/exports.ts) quản lý nhập/xuất. Giao diện nằm ở [components/finance](../../../src/components/finance/) với CSS có phạm vi riêng trong [finance.css](../../../src/styles/finance.css).

## 3. Quyền chỉ dành cho Super Admin

Các capability sau đã khai báo ở [roles.ts](../../../src/lib/workspace/roles.ts), **không cấp cho bất kỳ vai trò grantable nào**:

| Capability | Thao tác |
|---|---|
| `finance.access` | Đọc trang và báo cáo |
| `finance.plan.manage` | Tạo/sửa/công bố kế hoạch, forecast/scenario |
| `finance.actuals.manage` | Nhập thực tế và xác nhận import thực tế |
| `finance.period.close` | Chốt revision tháng đã đối chiếu |
| `finance.period.reopen` | Tạo bản điều chỉnh với lý do |
| `finance.export` | Xuất báo cáo được phép |
| `finance.configure` | Cấu hình sổ, định nghĩa và tài khoản |
| `finance.audit.read` | Đọc lịch sử Finance |

Service kiểm tra capability cùng điều kiện Super Admin. Actor lấy từ phiên EmDash hiện tại, không từ payload. CRM Finance, HRM Admin, Payroll Officer và **mọi vai trò grantable cộng lại** vẫn bị chặn. Header `Authorization` bị từ chối kể cả có phiên hợp lệ; token CRM và danh tính MCP không được hỗ trợ. Không thêm cookie đăng nhập hay vai trò quản trị Finance có thể cấp.

Super Admin bỏ qua bảng thành viên Workspace. Xóa grant không thu hồi quyền này; tắt/hạ quyền tại EmDash phải có hiệu lực ở request tiếp theo. Một Super Admin được soạn, công bố và chốt; không tự đặt quy trình hai Admin. Quy tắc phê duyệt riêng của HRM vẫn giữ nguyên.

## 4. Bảo vệ request, menu và dữ liệu

[Middleware](../../../src/middleware.ts) đưa cả hai ngôn ngữ và `/api/finance/` qua [financeBoundary](../../../src/lib/finance/access.ts) trước truy vấn riêng tư. Page, API và service cũng kiểm tra quyền. [Redirect đăng nhập](../../../src/lib/admin-auth.ts) chỉ nhận đích Finance nội bộ và giữ bộ lọc, không nhận URL bên ngoài. [Workspace home](../../../src/lib/workspace/pages.ts) và menu dùng quyền/readiness; loader người không phải Admin không truy vấn tổng tài chính.

Điều kiện mở gồm schema, sổ đã cấu hình/bật có ghi chú chính sách và `FINANCE_LIVE_ENABLED="true"`. Khi chưa sẵn sàng, ẩn module/card, trả `503` sau xác thực. Mọi đọc tài chính, kể cả audit/preview/export, đều theo cổng này. Ngoại lệ thiết lập là `/finance/settings`, bản `/vi`, `/api/finance/settings` và POST `/api/finance/commands`; endpoint lệnh vẫn chỉ cho action cấu hình chạy trước readiness. Nhờ đó thiết lập không phụ thuộc chính nó. HRM có cổng độc lập.

Mọi response Finance, kể cả lỗi, redirect, download, có `Cache-Control: private, no-store`, `nosniff`, `Referrer-Policy: same-origin`, `noindex,nofollow` và chặn frame. Không tạo dữ liệu công khai/prerender, sitemap, cache tài chính dùng chung, lưu trình duyệt hoặc payload analytics. Số tiền và ghi chú không đi vào URL bộ lọc.

POST sửa/xuất yêu cầu Origin khớp chính xác; từ chối fetch metadata cross-site/same-site, Origin opaque hoặc thiếu. V1 không hỗ trợ client thiếu Origin và không có luồng CSRF-token thay thế. Content type/body có giới hạn. GET/HEAD không thay đổi tài chính.

Form gốc POST về chính trang. Loader dùng [bộ phân tích HTTP](../../../src/lib/finance/http.ts) và service chung; thành công redirect `303`, lỗi dựng lại trang cùng nội dung đã nhập. Luồng chính không cần JavaScript; chọn tệp CSV chỉ bổ sung cho form dán nội dung luôn hoạt động. Xuất báo cáo POST endpoint riêng.

## 5. API qua phiên và hợp đồng lệnh

[API catch-all](../../../src/pages/api/finance/[...path].ts) gọi [api.ts](../../../src/lib/finance/api.ts). Đây là API phiên nội bộ có giới hạn, không phải giao diện tích hợp bên ngoài.

| Endpoint | Thao tác hỗ trợ |
|---|---|
| `/api/finance/overview` | GET báo cáo theo kỳ |
| `/api/finance/plans`, `/api/finance/actuals` | GET phiên bản, số liệu và định nghĩa đúng phạm vi |
| `/api/finance/reports` và `/reports/{pnl,cash-flow,revenue,costs,working-capital,position}` | GET báo cáo được cho phép và lựa chọn đối chiếu tương thích |
| `/api/finance/settings` | GET cấu hình/thiết lập |
| `/api/finance/audit`, `/api/finance/imports` | GET lịch sử hoặc bản nhập chờ được phép |
| `/api/finance/template` | GET đúng ô CSV có thể nhập theo loại/năm/kế hoạch/tháng |
| `/api/finance/commands` | POST envelope lệnh đã kiểm tra |
| `/api/finance/exports` | POST `report.export`; CSV riêng tư có manifest |

JSON dùng `{request_key, command:{action,...}}`; form dùng `intent`, `request_key`, `return_to` và trường có tên rõ. Action gồm `book.save`, `definition.save`, `account.save`, `plan.create`, `plan.save`, `plan.publish`, `actual.open`, `actual.save`, `actual.close`, `actual.reopen`, `import.preview`, `import.commit`, `import.discard`, `annotation.add`, `report.export`. Hai helper form `plan.preview`, `plan.copy.preview` tính thay đổi để xem trước, không ghi D1; áp dụng qua `plan.save`.

Lệnh có `expected_version` và version kỳ/revision liên quan. Chặn trường thừa và đích sai. Tiền JSON là chuỗi số nguyên đơn vị nhỏ nhất; tiền form/CSV theo quy ước thập phân đã mô tả. Audit lọc action/actor, cursor ghép `createdAt|id`, tối đa 100 sự kiện/trang. Danh sách kế hoạch và lịch sử tháng tải 100 mục mới nhất cùng baseline, kế hoạch được chọn, forecast và revision hiện hành/nguồn cần thiết; các mục bổ sung đúng phạm vi có thể làm số lượng vượt 100. Import hiển thị 30 batch mới nhất. Không cắt tổng tài chính âm thầm.

Xác thực/readiness diễn ra trước replay. Cùng nội dung trả kết quả đã lưu trước guard version/trạng thái mới; chỉ mutation mới chạy guard đó. Retry chốt thành công vẫn nhận biên nhận; người bị thu hồi quyền không được replay. Cùng key khác payload bị xung đột. Cho nháp tháng hiện tại, chặn save/import thực tế tương lai, chỉ chốt sau cuối tháng địa phương.

| HTTP | Ý nghĩa đang triển khai |
|---|---|
| `401` / redirect đăng nhập | Thiếu/hết phiên, tài khoản bị tắt, hoặc xác thực bearer không hỗ trợ |
| `403` | Danh tính không có quyền Finance hoặc POST sai Origin |
| `404` | Object/route không tồn tại sau phân quyền |
| `400` | Payload hoặc quy tắc nghiệp vụ không hợp lệ, gồm thời gian/nguồn |
| `422` | Lỗi trường form/lựa chọn được tầng HTTP phát ra tường minh |
| `409` | Version/key/nguồn xung đột, kỳ khóa hoặc đích bất biến |
| `413` / `415` | Body quá lớn/không được hỗ trợ |
| `503` | Phân hệ/cấu hình/schema/D1 chưa sẵn sàng |

Lỗi dùng mã an toàn, không lộ SQL/số trái quyền. Không có hợp đồng `423` riêng. Manifest ghim pháp nhân/tiền tệ, kỳ, baseline/revision, độ đầy đủ nguồn, thời gian, định nghĩa, phép tính, sàn tiền và chính sách ngưỡng chênh lệch. CSV vô hiệu text giống công thức; không có link download công khai.

## 6. Ghi nguyên tử và import

Số nguyên chính xác và làm tròn theo [quy tắc tài chính](FINANCIAL-RULES.vi.md). Guard, ghi dữ liệu, audit và kết quả idempotency commit cùng D1 batch. UPDATE có điều kiện thất bại phải làm giao dịch thất bại; kiểm tra `meta.changes` sau khi ghi khác đã commit là không đủ.

Chốt đổi `authoritative_closed_revision_id` nguyên tử; mở lại tạo `working_revision_id`, giữ snapshot cũ. Đổi tiền cuối kỳ trước làm đầu kỳ/dự báo phụ thuộc stale. Giải trình về sau chỉ thêm annotation ghim revision/baseline/dòng/phân khúc, không sửa số đã chốt. Thiết lập định nghĩa trước khi nhập số; công bố bất kỳ kế hoạch hoặc chốt tháng sẽ giữ nguyên ý nghĩa năm. Control tiền hạn chế và vốn chủ không cộng vào tổng không liên quan.

CSV có cột `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note`. Chỉ nhập `entered|not_applicable`; N/A, số âm và Other cần note. Staging cả plan và actual cần ngày/phạm vi nguồn, cùng tham chiếu từng nhóm có mặt. Quan sát tài khoản tiền vẫn nhập form. Dòng mẫu trống phải điền hoặc bỏ; xóa số là sửa nháp tường minh.

Giới hạn: UTF-8 256 KiB, 2.400 dòng/tệp, 200 ô/tháng, 12 tháng trong một năm tài chính. Preview lưu manifest, chưa đổi số. Commit chọn trọn một tháng, kiểm tra version/định nghĩa/fingerprint và ghi nguyên tử. Tháng chưa có dữ liệu được tạo nháp; tháng đã chốt cần mở lại trước. Commit plan tăng version plan/manifest và expected version tháng chờ chỉ từ mutation trước của chính manifest; sửa ngoài cần preview lại. Actual giữ version kỳ/revision độc lập. Discard/hết hạn chỉ bỏ payload chờ; giữ biên nhận và nguồn đã commit.

## 7. Cách ly, kiểm thử và bằng chứng phát hành

V1 dùng số Finance nhập tay. [Tiền CRM](../../../src/lib/crm/money.ts) không phải doanh thu ghi nhận, ước tính hoa hồng không phải đã chi, [báo cáo HRM](../../../src/lib/hrm/reports.ts) không phải đầu vào chi phí payroll. Adapter tương lai cần mapping được xem xét riêng. Finance ghi audit riêng; không gửi payload vào `crm_events`, `crm_notifications`, mô hình CRM, Lark, MCP, thông báo HRM hoặc nội dung công khai.

Có bộ kiểm thử [access/HTTP](../../../tests/finance-access-http.test.ts), [phép tính](../../../tests/finance-calculations.test.ts), [CSV](../../../tests/finance-csv.test.ts), [báo cáo](../../../tests/finance-reports.test.ts), [xuất](../../../tests/finance-exports.test.ts), [D1 store](../../../tests/finance-store.test.ts), [Worker integration](../../../tests/integration/finance.integration.test.mjs). Ca âm bắt buộc gồm tổ hợp vai trò, phiên tắt/hạ quyền, EN/VI, bearer token, cache mọi status, CSRF, lệnh cũ/lặp, bất biến và rollback import. Có tệp test không đồng nghĩa đã đạt cổng; [STATUS](STATUS.md) ghi kết quả thực tế.

Migration của bản triển khai là [0038_finance.sql](../../../migrations/0038_finance.sql), bổ sung vào D1 chung. [Release](../../../scripts/release.mjs) chạy migration trước deploy main; merge main là phát hành production. Kiểm tra lại số migration với main và các phân hệ cũ trước phát hành. Time Travel tác động ATS/CRM/HRM nữa, cần kế hoạch phục hồi phối hợp. [Delivery](DELIVERY.vi.md) quy định nghiệm thu vận hành/phát hành.

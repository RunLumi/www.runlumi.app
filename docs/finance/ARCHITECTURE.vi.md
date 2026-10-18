# Finance — kiến trúc, phân quyền và hợp đồng API

**Trạng thái:** PROPOSED; mới là yêu cầu, chưa triển khai hoặc kích hoạt. **Rà soát:** 2026-10-18. **Mã nguồn đối chiếu:** `30c75a64ba1184f241a421d2591a5b5be9db6426`. [English](ARCHITECTURE.md).

Finance chỉ dành cho Super Admin. Lựa chọn kỹ thuật là đề xuất, chưa phê duyệt production. Đọc cùng [sản phẩm](PRODUCT.vi.md), [quy tắc tài chính](FINANCIAL-RULES.vi.md), [dữ liệu](DATA-MODEL.vi.md). Kiểm thử dùng dữ liệu giả.

## 1. Hiện trạng đã kiểm tra

| Nguồn | Hành vi và hệ quả |
|---|---|
| [Danh tính](../../src/lib/admin-auth.ts), [quyền Workspace](../../src/lib/workspace/roles.ts) | Tài khoản EmDash đang hoạt động có **role đúng bằng 50** là System Super Admin; không phải vai trò Workspace có thể cấp. Admin nhận mọi capability đã khai báo. |
| [Vai trò](../../src/lib/workspace/roles.ts) | `finance` hiện chỉ có `workspace.access`, `crm.access`, `crm.finance`. **CRM Finance không được vào phân hệ mới**. |
| [Middleware](../../src/middleware.ts), [menu](../../src/lib/workspace/nav.ts), [WorkspaceShell](../../src/layouts/WorkspaceShell.astro) | Đã có vùng riêng tư, menu và khung song ngữ; chưa có Finance. Ẩn menu không bảo vệ truy vấn. |
| [Bindings](../../wrangler.jsonc), [môi trường](../../src/lib/ats.ts) | `DB` là D1 `lumi-jobs` dùng chung; `CONTENT_DB` dành cho danh tính/nội dung EmDash. Finance dùng `DB`. |
| [Mô hình CRM](../../src/lib/crm/routes/business-model.ts), [bằng chứng](../../src/lib/crm/business-evidence.ts) | Sales Manager và CRM Finance đọc được số thương mại tổng hợp. Loader bằng chứng không tự kiểm tra actor. |
| [HRM](../../src/lib/hrm/service.ts), [payroll](../../src/lib/hrm/payroll.ts) | Có cổng chính sách/triển khai, số tiền nguyên, chống sửa đồng thời, idempotency và bản phát hành bất biến. Đây là mẫu kỹ thuật, không phải quyền Finance. |

Baseline chưa có Finance toàn công ty. Kiểm tra mã nguồn không chứng minh trạng thái production.

## 2. Cấu trúc phân hệ

V1: một sổ, một pháp nhân xác định, một tiền tệ cơ sở; mặc định VND trước khi có dữ liệu. Không đổi ngầm cấu hình được lịch sử tham chiếu. Kế hoạch tháng, baseline, forecast/scenario riêng và revision thực tế theo mô hình dữ liệu.

Mọi route có bản `/vi`, dùng `WorkspaceShell`, `module="finance"` và loader chung. Ngôn ngữ chỉ đổi cách trình bày.

| Route | Trách nhiệm |
|---|---|
| `/finance` | Tổng quan, độ đầy đủ, ngoại lệ |
| `/finance/plans` | Kế hoạch tháng, baseline, forecast/scenario |
| `/finance/actuals` | Nhập thực tế, revision, chốt và điều chỉnh |
| `/finance/pnl` | Thu nhập/chi phí tháng, lũy kế, đối chiếu |
| `/finance/cash-flow` | Tiền đầu kỳ, thu/chi, cuối kỳ, dự báo |
| `/finance/revenue` | Nhóm doanh thu, chiều phân tích, chênh lệch |
| `/finance/costs` | Giá vốn, chi phí vận hành, chênh lệch |
| `/finance/working-capital` | Quan sát công nợ, tuổi nợ |
| `/finance/position` | Số dư tài chính và đối chiếu |
| `/finance/settings` | Sổ, lịch, định nghĩa, chiều phân tích |
| `/finance/audit` | Truy cập, thay đổi, khóa/chốt/mở lại, xuất |

Service tại `src/lib/finance/`, endpoint tại `src/pages/api/finance/`; tính toán/kiểm tra ở server. Bảng dùng `finance_*`, không chứa credentials, phiên, tệp nhị phân hoặc công thức thực thi. V1 chưa có tích hợp trực tiếp/định kỳ với production.

## 3. Quyền chỉ dành cho Super Admin

Khai báo tập capability sau tại [roles.ts](../../src/lib/workspace/roles.ts), **không cấp cho bất kỳ vai trò grantable nào**:

| Capability | Thao tác |
|---|---|
| `finance.access` | Đọc trang và báo cáo |
| `finance.plan.manage` | Tạo/sửa/khóa kế hoạch, tạo forecast/scenario |
| `finance.actuals.manage` | Nhập/import thực tế |
| `finance.period.close` | Chốt revision đã đối chiếu |
| `finance.period.reopen` | Tạo bản điều chỉnh với lý do |
| `finance.export` | Xuất báo cáo |
| `finance.configure` | Cấu hình và định nghĩa |
| `finance.audit.read` | Đọc lịch sử Finance |

Service kiểm tra capability và Super Admin. Actor lấy từ phiên EmDash, không từ payload. CRM Finance, HRM Admin, Payroll Officer và **mọi vai trò grantable cộng lại** vẫn bị chặn. Không thêm mật khẩu, cookie hoặc màn hình cấp vai trò Finance.

Admin bỏ qua bảng thành viên Workspace. Xóa grant không thu hồi Super Admin; phải tắt/hạ quyền trong EmDash, kiểm tra request kế tiếp của phiên đang mở.

Một Super Admin được soạn, khóa, chốt; không bắt buộc hai Admin. Thao tác có actor/version/audit. HRM vẫn giữ quy tắc không tự duyệt riêng.

## 4. Bảo vệ request và giao diện

Thêm `/finance`, bản `/vi` và `/api/finance/` vào middleware trước matcher rộng hơn. Xác thực, phân quyền **trước truy vấn**, kể cả ID sai hoặc action lạ. Đăng ký module trong [nav.ts](../../src/lib/workspace/nav.ts), mở rộng [NavIcon](../../src/components/workspace/NavIcon.astro), thêm card ở [Workspace home](../../src/lib/workspace/pages.ts) sau kiểm tra quyền và trạng thái sẵn sàng. Loader của người không có quyền không được truy vấn số Finance.

Thêm đích Finance vào [allowlist quay lại sau đăng nhập](../../src/lib/admin-auth.ts); giữ kiểm tra đường dẫn nội bộ và bộ lọc, chặn redirect ra ngoài. Shell chỉ trình bày; page, API, service, export và endpoint tệp vẫn phải kiểm tra quyền.

Điều kiện mở: có schema, sổ hợp lệ, cấu hình bật và biến như `FINANCE_LIVE_ENABLED=true`. Trước đó ẩn menu/card, trả chưa sẵn sàng sau xác thực. Riêng `/finance/settings` và action cấu hình cho Super Admin thiết lập khi schema đã có, tránh phụ thuộc vòng. HRM có cổng riêng.

Mọi response Finance, gồm lỗi, redirect và download, có `Cache-Control: private, no-store`, `nosniff`, referrer policy hạn chế và `noindex,nofollow`. Không prerender, đưa vào sitemap công khai, cache dùng chung, lưu trình duyệt hoặc gửi dữ liệu cho analytics bên thứ ba. Kiểm tra accessibility, bảng tháng trên màn hình hẹp và hành vi responsive của shell.

Mutation/export qua phiên yêu cầu cùng origin, đúng content type và giới hạn kích thước. [sameOrigin](../../src/lib/http.ts) hiện chấp nhận một số request thiếu Origin hoặc `same-site`; không thể chỉ dùng tên helper để kết luận an toàn. Finance đề xuất so Origin chính xác; nếu hỗ trợ client thiếu Origin thì cần token chống CSRF đã kiểm chứng. Từ chối cross-origin/opaque origin; CORS không cấp quyền. GET không thay đổi số liệu.

## 5. API qua phiên đăng nhập

Đây là API nội bộ cho trình duyệt. Token CRM/MCP, kể cả token của Super Admin, không xác thực Finance. Không thêm tool Finance vào CRM MCP; không nhận SQL, tên bảng hoặc lựa chọn trường tùy ý.

| Endpoint | Đọc và action POST |
|---|---|
| `/api/finance/overview` | GET tổng quan sổ/tháng |
| `/api/finance/plans` | GET revision; `create`, `save`, `freeze`, `clone_forecast`, `clone_scenario` |
| `/api/finance/actuals` | GET revision; `save`, `close`, `reopen` |
| `/api/finance/reports` | GET loại báo cáo, khoảng tháng, baseline/revision được cho phép |
| `/api/finance/settings` | GET; action cấu hình/định nghĩa/chiều phân tích tường minh |
| `/api/finance/audit` | GET lịch sử; POST `annotate` cần quyền plan/actuals của đích |
| `/api/finance/imports` | `preview`, `commit`, `discard`; GET preview được phép |
| `/api/finance/exports` | POST xuất báo cáo giới hạn phạm vi, ghi manifest |

Lệnh sửa có `expected_version`, `idempotency_key`; tạo vẫn cần key. Chặn trường thừa, kiểm tra đích/kỳ/chiều/filter theo sổ. Phân trang 25, tối đa 100 dòng. Import cần quyền plan/actuals. Giới hạn và phạm vi key theo [DATA-MODEL](DATA-MODEL.vi.md); không cắt tổng âm thầm.

Kiểm tra danh tính/quyền/readiness hiện tại trước replay. Retry giống hệt trả kết quả đã lưu trước kiểm tra version/trạng thái mới; chỉ mutation mới chạy guard đó. Vì vậy retry chốt đã thành công vẫn nhận biên nhận, người bị thu hồi quyền thì không. Cùng key khác nội dung trả `409`.

Cho nháp thực tế tháng hiện tại; chặn save/import tháng tương lai. Chỉ chốt sau cuối tháng theo múi giờ sổ; vi phạm trả `422`.

| HTTP | Ý nghĩa |
|---|---|
| `401` / redirect đăng nhập | Không có phiên hợp lệ hoặc tài khoản bị tắt |
| `403` | Có danh tính nhưng không có quyền Finance |
| `404` | Người có quyền yêu cầu object không tồn tại/sai sổ |
| `409` | Version cũ, dùng lại key với payload khác, nguồn thay đổi |
| `423` | Sửa kỳ đã khóa hoặc revision bất biến |
| `422` | Sai trường, số học, thiếu dữ liệu hoặc chưa đối chiếu |
| `413` / `415` | Body quá lớn/không được hỗ trợ |
| `503` | Chưa bật, thiếu schema/cấu hình hoặc D1 không sẵn sàng |

Lỗi chỉ rõ trường/dòng, không lộ SQL/số trái quyền. Manifest báo cáo/export ghim pháp nhân, tiền tệ, kỳ, baseline/revision, độ đầy đủ, thời gian, phiên bản cấu hình/sàn tiền/phép tính. Cấu hình mới không đổi nghĩa báo cáo cũ. Chặn công thức trong text CSV; không link công khai.

## 6. Ghi nguyên tử và import

Tiền dùng số nguyên chính xác, làm tròn theo [FINANCIAL-RULES](FINANCIAL-RULES.vi.md). Guard, dữ liệu, audit và kết quả idempotency nằm trong cùng D1 batch; tham khảo [HRM command](../../src/lib/hrm/service.ts). UPDATE có điều kiện không tác động dòng nào phải làm giao dịch thất bại; kiểm tra `meta.changes` sau khi các ghi khác đã commit là không đủ.

Chốt đổi `authoritative_closed_revision_id` nguyên tử; mở lại tạo `working_revision_id`, giữ snapshot cũ. Forecast không đổi baseline. Sửa tiền cuối kỳ trước làm đầu kỳ sau stale, phải đối chiếu lại. Ghi chú sau chốt chỉ thêm audit annotation ghim kỳ/revision/dòng/phân khúc/baseline, không sửa số đã chốt. Control tiền hạn chế dự báo/biến động vốn theo mô hình dữ liệu, không cộng vào tổng khác.

CSV cho một sổ/tiền tệ/bộ định nghĩa, plan hoặc revision đang làm, tối đa một năm. Cột: `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note`. Chỉ nhận `entered|not_applicable`; N/A/số âm/Other bắt buộc note. Form staging cung cấp `source_as_of`, phạm vi/bối cảnh nguồn; quan sát tài khoản vẫn nhập form. Preview hiện lỗi/thiếu/zero/tổng/trùng, chưa ghi số. Xóa giá trị là action nháp riêng.

Commit từng tháng kiểm tra version/khóa/định nghĩa/checksum cùng giao dịch. Với plan năm, guard compare-and-swap tăng nguyên tử `plan.version`, `manifest.version` và expected-parent-version của tháng chờ, chỉ nối từ mutation trước của chính manifest. Sửa plan bên ngoài cần preview lại. Tháng thực tế giữ version kỳ/revision độc lập. Hiện riêng tháng đã ghi/chờ/xung đột; lỗi sau không đảo biên nhận trước. Discard/expiry chỉ bỏ payload chưa commit, giữ receipts/references và replay. Không ghi dở tháng/đè ngầm; áp dụng giới hạn dữ liệu.

## 7. Cách ly tích hợp và bằng chứng triển khai

V1 dùng số Finance nhập tay. [Tiền CRM](../../src/lib/crm/money.ts) không phải doanh thu ghi nhận; [ước tính hoa hồng](../../migrations/0004_crm_commission.sql) không phải đã chi. Import sau cần mapping/rà soát. Dùng `finance_audit_events`; không đưa payload vào `crm_events`, `crm_notifications`, báo cáo/mô hình CRM, Lark, MCP, HRM hoặc nội dung công khai.

[Báo cáo HRM](../../src/lib/hrm/reports.ts) là số lượng, không phải chi phí payroll. Tích hợp tương lai phải giữ cổng HRM, pháp nhân, tiền tệ, phân biệt phát hành/đã trả và chỉ lấy tổng cần thiết; không đọc D1 trực tiếp để vượt cổng.

Mở rộng [test quyền](../../tests/workspace-roles.test.ts), [auth](../../tests/admin-auth.test.ts), [integration Worker](../../tests/integration/workspace.integration.test.mjs): mọi vai trò không phải Admin và tổ hợp; EN/VI; URL sâu/API/export/audit; phiên bị tắt/hạ quyền; token CRM; truy vấn card; cache mọi status; CSRF; lệnh cũ/lặp/đồng thời; baseline bất biến; race chốt/mở lại; rollback import lỗi. Dùng dữ liệu giả, kiểm tra response/event để phát hiện rò rỉ.

[Release](../../scripts/release.mjs) chạy migration trước deploy main; main là production. Chọn số migration tiếp theo khi triển khai, giữ thay đổi additive và kiểm tra các phân hệ cũ. Time Travel phục hồi cả D1 dùng chung, ảnh hưởng ATS/CRM/HRM; cần kế hoạch phục hồi phối hợp. Ghi bằng chứng/cổng còn thiếu trong [DELIVERY](DELIVERY.vi.md). Tài liệu này không thêm route, migration, quyền hay cấu hình production.

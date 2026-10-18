# Finance — kế hoạch theo tháng và báo cáo quản trị

[English](README.md) · **Triển khai Finance v1** · 2026-10-18

Finance là phân hệ riêng trong Lumi Workspace dành cho **System Super Admin đang hoạt động (EmDash role 50)**. Phân hệ kết hợp kế hoạch chia theo tháng, nhập số thực tế, đối chiếu, kiểm tra cân đối và báo cáo. Số liệu có cấu trúc, phiên bản bất biến, biên nhận import và audit được lưu trong Cloudflare D1 hiện có: `DB` / `lumi-jobs`.

Owner ban đầu yêu cầu phân tích đầy đủ trước, sau đó yêu cầu chuyển vào `docs/specs`, triển khai toàn bộ tính năng, tạo PR và merge. Đây là thư mục đặc tả chính thức. [Trạng thái](STATUS.md) ghi bằng chứng kiểm tra/phát hành; có tài liệu không thay cho deployment hoặc cấu hình dữ liệu thật.

## Tài liệu

| Tài liệu | Trách nhiệm | English |
|---|---|---|
| [Sản phẩm](PRODUCT.vi.md) | Mười một trang, quy trình và UX | [Product](PRODUCT.md) |
| [Quy tắc](FINANCIAL-RULES.vi.md) | Tiền chính xác, độ đầy đủ, chênh lệch, đối chiếu và ví dụ | [Rules](FINANCIAL-RULES.md) |
| [Dữ liệu](DATA-MODEL.vi.md) | Độ chi tiết D1, lịch sử, giao dịch và giới hạn | [Data](DATA-MODEL.md) |
| [Kiến trúc](ARCHITECTURE.vi.md) | Danh tính, đường dẫn, ranh giới tích hợp và API | [Architecture](ARCHITECTURE.md) |
| [Nghiệm thu](DELIVERY.vi.md) | FIN-01–18 và kịch bản kiểm tra | [Delivery](DELIVERY.md) |
| [Vận hành](RUNBOOK.vi.md) | Thiết lập, quy trình tháng, điều chỉnh và phục hồi | [Runbook](RUNBOOK.md) |
| [Trạng thái](STATUS.md) | Kiểm tra đã hoàn tất và thiết lập vận hành còn lại | Chung EN/VI |

Sản phẩm quy định phạm vi; Quy tắc quy định phép tính; Dữ liệu quy định lưu trữ; Kiến trúc quy định truy cập/HTTP. Khi có mâu thuẫn phải sửa rõ ràng. Trạng thái là hồ sơ bằng chứng.

## Các trang được triển khai

| Đường dẫn | Chức năng |
|---|---|
| `/finance` | Tổng quan, chênh lệch trọng yếu và triển vọng tiền |
| `/finance/plans` | Ngân sách 12 tháng, xem trước phân bổ/sao chép, baseline, kịch bản và forecast |
| `/finance/actuals` | Nguồn số tháng, số dư quan sát, đối chiếu, chốt/mở lại và lịch sử |
| `/finance/pnl` | Doanh thu ghi nhận, chi phí, lợi nhuận và tỷ suất tính lại |
| `/finance/cash-flow` | Thu chi kinh doanh/đầu tư/tài trợ và đối chiếu số dư |
| `/finance/revenue` | Nhóm doanh thu, phân khúc và so sánh kế hoạch |
| `/finance/costs` | Chi phí trực tiếp/dùng chung, cố định/biến đổi và chênh lệch |
| `/finance/working-capital` | Phải thu gộp, dự phòng, phải trả, tuổi nợ và dự kiến thu/chi |
| `/finance/position` | Tài sản, nợ, vốn và số kiểm soát độc lập |
| `/finance/settings` | Đơn vị, tiền tệ/kỳ, chính sách, ngưỡng, khoản mục, phân khúc và tài khoản |
| `/finance/audit` | Lịch sử có bộ lọc, biên nhận và giải trình chỉ bổ sung |

Cả 11 trang có bản `/vi`. Form phía máy chủ hoạt động khi không chạy JavaScript. Import CSV có xem trước và ghi nguyên tử từng tháng. Export dùng snapshot đã lưu bất biến và hỗ trợ tải lại đúng nội dung theo khóa thao tác.

Role Workspace tên **Finance** tiếp tục chỉ mang quyền thanh toán/hoa hồng CRM (`crm.finance`), không được vào Finance doanh nghiệp. Tổ hợp các role được cấp cũng không đủ quyền; token CRM không xác thực phân hệ này.

## Trước khi dùng số thật

Migration không tạo sẵn đơn vị, chính sách, tài khoản, số đầu kỳ hay số liệu mẫu. Cờ deployment bật mã ứng dụng; owner còn phải cấu hình và bật sổ rõ ràng. Trước đó menu/card bị ẩn và yêu cầu tài chính bị chặn. Super Admin vào `/vi/finance/settings` từ liên kết thiết lập Workspace.

Xác nhận đơn vị/phạm vi, đồng tiền/độ chính xác, năm tài chính, múi giờ, tháng đầu và chính sách ghi nhận. Chọn tháng sớm nhất dự định nhập bù trước khi khóa lịch sử. VND, tháng 1 và `Asia/Ho_Chi_Minh` là gợi ý có thể sửa. Ngưỡng tiền/chênh lệch ban đầu chưa đặt; tính chất chi phí chưa phân loại. Ô trống là thiếu, số 0 phải được nhập rõ ràng.

V1 là sổ quản trị một đơn vị, nguồn tổng hợp tháng nhập thủ công. Tự lấy số CRM/HRM, chi tiền, khai thuế, hạch toán sổ cái, đa tiền tệ và hợp nhất nhóm nằm ngoài phạm vi đã định. Finance không gửi thông báo ngoài hệ thống hoặc lập lịch purge.

## Mã nguồn và bằng chứng

Điểm bắt đầu: [mô hình](../../../src/lib/finance/model.ts), [dịch vụ D1](../../../src/lib/finance/store.ts), [lớp truy cập](../../../src/lib/finance/access.ts), [trang dùng chung](../../../src/components/finance/FinancePage.astro), [kiểm thử Worker](../../../tests/integration/finance.integration.test.mjs). Khảo sát ban đầu dùng [`30c75a6`](https://github.com/RunLumi/www.runlumi.app/commit/30c75a64ba1184f241a421d2591a5b5be9db6426); triển khai kết hợp cả thay đổi mô tả công việc HRM mới trên main.

Main chạy quy trình phát hành hiện có. Deployment ứng dụng và cấu hình sổ thật của owner là hai sự kiện có thể kiểm chứng riêng. Xem [Trạng thái](STATUS.md) và [Vận hành](RUNBOOK.vi.md).

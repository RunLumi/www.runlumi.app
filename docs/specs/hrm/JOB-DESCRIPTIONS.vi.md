# Mô tả công việc trong HRM

[English](JOB-DESCRIPTIONS.md) · Bổ sung ngày 18/10/2026

## Mục đích và phạm vi

HRM có danh mục **Mô tả công việc** nội bộ và bản nháp đầu tiên:
**COO – Head of Sales & Operations**, mã `LUMI-COO-001`, phiên bản `1.0`.
Vị trí này chịu trách nhiệm kết nối bán hàng, bàn giao cho khách, thu tiền và
điều phối công việc hằng ngày, với ranh giới rõ giữa CEO, CTO, HR và kế toán.

| Trang | English | Tiếng Việt |
| --- | --- | --- |
| Danh mục | `/hrm/job-descriptions` | `/vi/hrm/job-descriptions` |
| JD COO | `/hrm/job-descriptions/coo-head-of-sales-operations` | `/vi/hrm/job-descriptions/coo-head-of-sales-operations` |

Thanh điều hướng và trang tổng quan HRM dẫn tới danh mục. JD gồm mục tiêu vị
trí, trách nhiệm, kế hoạch 30/60/90 ngày đề xuất, bảng thước đo, quyền quyết
định, yêu cầu ứng viên có bằng chứng và bài đánh giá bằng dữ liệu giả lập.
Nội dung và mục lục được render phía máy chủ, đọc được khi tắt JavaScript.
Hai ngôn ngữ dùng chung cấu trúc và mã vị trí. Bảng cuộn trong vùng riêng trên
màn hình nhỏ.

## Phân quyền

Page helper yêu cầu `hrm.access` và `hrm.records.manage`. Middleware hiện có
tiếp tục kiểm tra danh tính EmDash đang hoạt động, thành viên Workspace và
cổng HRM trước khi render nội dung riêng tư.

| Người dùng | HRM đang đóng | HRM đã mở |
| --- | --- | --- |
| System Super Admin | Đọc | Đọc |
| HRM Admin | Đọc | Đọc |
| HRM Officer | Đóng | Đọc |
| Employee / People Manager / Payroll Officer | Không truy cập | Không truy cập |
| ATS HR / vai trò chỉ có CRM | Không truy cập | Không truy cập |
| Chưa đăng nhập hoặc bị thu hồi quyền Workspace | Không truy cập | Không truy cập |
| Quan hệ làm việc đã kết thúc | Áp dụng chặn HRM hiện có | Áp dụng chặn HRM hiện có |

Điều hướng khi HRM đóng dùng ngoại lệ `hrm.configure` hiện có. Quản trị viên
được rà soát mẫu vị trí không chứa hồ sơ cá nhân trong giai đoạn thiết lập.
Thay đổi này không mở hồ sơ nhân viên, bật `HRM_LIVE_ENABLED`, thay trạng thái
policy hay cấp quyền cho vai trò khác. Chức danh COO không tự tạo quyền phần
mềm; tài khoản chỉ nhận các quyền Workspace được cấp riêng.

Hai trang nhận GET và HEAD. Phương thức khác, sau khi qua kiểm tra middleware
hiện có, trả 405 với `Allow: GET, HEAD` khi người gọi đủ quyền; slug ngoài danh mục trả 404. Phản
hồi riêng tư dùng `Cache-Control: private, no-store`. Danh mục không đọc tên,
hồ sơ ứng viên, lương hoặc dữ liệu nhân viên.

## Nguồn nội dung và cập nhật

Nguồn duy nhất là
[`src/lib/hrm/job-description-catalog.ts`](../../../src/lib/hrm/job-description-catalog.ts).
Danh mục có kiểu dữ liệu và danh sách slug cố định, được phát hành cùng ứng
dụng. Lát cắt này không có editor trên trình duyệt, migration D1, ghi dữ liệu
khi đọc, đăng tuyển, gán JD cho nhân viên hay quy trình xác nhận pháp lý.

Yêu cầu hiện tại là bổ sung mục và vị trí đầu tiên, nên cập nhật qua review
trong repository đáp ứng phạm vi này. Nếu cần editor lưu D1, phải xác định
thêm phiên bản nháp/đã duyệt, lịch sử người soạn và người rà soát, chống ghi
đè bản cũ, nhật ký thay đổi và thao tác đăng tuyển tường minh. Không tự biến
danh mục thành tin tuyển dụng đang mở hoặc thỏa thuận lao động.

Để thêm vị trí, tạo slug và mã riêng, viết đủ hai ngôn ngữ, giữ section ID và
cấu trúc bảng tương ứng, tăng phiên bản khi đổi kỳ vọng và cập nhật ngày.
Astro render chuỗi văn bản; không thêm mã thực thi hoặc HTML thô từ người dùng.

## Các quyết định khi soạn JD COO

- COO trực tiếp bán hàng và điều hành, xây quy trình có thể lặp lại với đội
  gọn. JD không mặc định đã có đội sales lớn, gói bán đã chứng minh hiệu quả
  hay doanh thu thực tế.
- Bắt đầu bằng một đến hai gói đã được duyệt và phản hồi từ khách thật.
  Phạm vi giới thiệu ban đầu cần có giới hạn; triển khai cần thống nhất đầu
  ra, tính khả thi, năng lực bàn giao, nghiệm thu và điều khoản thương mại.
- Phân biệt tiền đã thu, giá trị hợp đồng và doanh thu ghi nhận. Chỉ tiêu
  được thống nhất dựa trên dữ liệu đầu kỳ và nguồn lực; không biến tham vọng
  của công ty thành quota cá nhân chưa duyệt. Biên lợi nhuận, doanh thu định
  kỳ, công nợ và chất lượng bàn giao là điều kiện đi cùng tăng trưởng.
- CEO duyệt chiến lược, biên chế/ngân sách, giá ngoại lệ, thu nhập, cổ phần
  và cam kết ngoài quyền đã giao. CTO quyết định tính khả thi và kỹ thuật.
  Kế toán xác nhận tiền và số liệu tài chính; HR phụ trách thủ tục nhân sự.
- Kế hoạch hội nhập và ngưỡng đánh giá là đề xuất nội bộ. Hình thức làm
  việc, địa điểm, lương, hoa hồng, cổ phần, ngân sách và quyền cuối cùng cần
  được thống nhất trước khi tuyển dụng hoặc đánh giá.

Nguồn bối cảnh gồm [hợp đồng sản phẩm](../../../AGENTS.md),
[định vị và thiết kế](../../../DESIGN.md),
[mô hình CRM](../../crm/README.md),
[quy tắc sổ thương mại và hoa hồng](../../crm/COMMISSION.md),
[quy trình Local](../../Lumi_Sales_Process.en.md) và
[quy trình Solutions](../../Lumi_Agents_Vaults_Sales_Process.en.md). Đây là nguồn về sản
phẩm và quy tắc vận hành, không phải bằng chứng về khách đã mua, doanh thu
thực tế hay điều khoản lao động đã duyệt của một người.

## Kiểm chứng và phát hành

Kiểm thử tập trung vào ranh giới quyền, quan hệ làm việc đã kết thúc, chế độ
đóng/mở, từ chối phương thức ghi, slug không có, tương ứng EN/VI và điều
hướng. Bộ tích hợp HRM đọc hai cặp trang bằng danh tính EmDash giả lập và
kiểm tra việc đọc không tạo bản ghi ATS/HRM. Có lời gọi kiểm tra trình duyệt
cho danh mục và chi tiết ở cả hai ngôn ngữ.

Chạy `npm run ci:verify` và phạm vi tích hợp HRM liên quan. Chỉ đặt
`HRM_BROWSER_BINARY` trỏ tới Chrome cục bộ có sẵn để chạy kiểm tra màn hình
nhỏ/lớn, tắt JavaScript, giảm chuyển động và bàn phím. Ghi kết quả thực tế
vào [STATUS.md](STATUS.md) hoặc PR; có mã kiểm thử không có nghĩa đã chạy.

Merge vào `main` sẽ kích hoạt triển khai production của repository. Danh mục
không bật toàn bộ HRM hoặc tự thông báo tuyển dụng.

# HRM — Gói quyết định P0

[English](P0-DECISIONS.md) · Trạng thái: **ĐANG CHỜ OWNER** · Cập nhật: 2026-10-20

Tài liệu này gom mọi quyết định ở §16 của [đặc tả HRM](README.md) mà code không tự quyết được. Mỗi dòng ghi giá trị cần điền, nơi cấu hình trong hệ thống, người ký và gate được mở. Agent và nhà phát triển **không tự điền giá trị** vào ô trống. Khi owner điền và ký, cấu hình vẫn đi qua luồng hiện có: người tạo, người rà soát độc lập rồi mới kích hoạt.

## Quyết định đã ghi nhận

| Ngày | Quyết định | Hệ quả |
|---|---|---|
| 2026-10-20 | **Một pháp nhân** dùng HRM. Tên pháp nhân: `__________` | Điền đúng tên này ở *HRM → Thiết lập*; mọi chính sách payroll, nghỉ phép và báo cáo dùng cùng pháp nhân. |
| 2026-10-20 | HRM áp dụng cho **nhân viên và cộng tác viên (CTV)**. CTV có hồ sơ tối thiểu và **không vào payroll**. | Đã làm (migration 0050): mỗi đợt làm việc là nhân viên hoặc CTV. CTV không có thu nhập theo hợp đồng, kỳ lương hay quyết toán lương, và loại quan hệ bị khóa khi đợt làm việc đã được dùng cho lương. Partner trong CRM vẫn không mặc nhiên là CTV trong HRM. Trường hồ sơ tối thiểu của CTV vẫn thuộc mục 1. |
| 2026-10-20 | Owner sẽ ghi tên **hai người duyệt độc lập** và **người phụ trách payroll**. | Điền ở mục 2 bên dưới. |
| 2026-10-20 | Có **kế toán/chuyên gia** kiểm tra quy tắc lương và chạy kỳ song song. | Điền tên ở mục 6. |

## Quyết định cần điền

| # | Quyết định | Giá trị cần điền | Nơi cấu hình | Người ký | Gate được mở |
|---|---|---|---|---|---|
| 1 | Pháp nhân, nơi làm việc, loại quan hệ | Tên pháp nhân; nơi làm việc; quy tắc hồ sơ tối thiểu cho CTV | *HRM → Thiết lập*; hồ sơ nhân sự | Owner | P0, P1 |
| 2 | Người giữ vai trò | HRM Admin (≥2 người khác nhau hoặc 1 HRM Admin + System Super Admin); HRM Officer; Payroll Officer; người duyệt payroll độc lập; người rà soát COI; người dự phòng của từng vai trò | *Workspace → Người dùng* (chỉ Admin cấp) | Owner | Mọi luồng cần duyệt độc lập |
| 3 | Dữ liệu và lưu trữ | Trường bắt buộc; mục đích/căn cứ xử lý; thời hạn lưu (số ngày, mốc tính) cho 13 loại tệp, 6 loại bản ghi, hồ sơ quyết toán tài chính và snapshot báo cáo (RPT-01); quy tắc legal hold; người xử lý yêu cầu dữ liệu cá nhân | *HRM → Lưu giữ* (DOCX chính sách + rà soát độc lập) | Owner + người phụ trách pháp lý | P2, P5, HRM-34/36 |
| 4 | Giấy tờ và cách ký | Danh sách mẫu hợp đồng/NDA/COI/chính sách; với từng loại: xác nhận đã đọc, ký giấy/scan, hay ký điện tử; nếu ký điện tử thì nhà cung cấp nào | *HRM → Tài liệu* | Owner + pháp lý | P2, HRM-11 |
| 5 | Công và phép | Lịch làm việc, ca, ngày lễ; loại phép, mức cấp năm, tích lũy, chuyển phép, số âm cho phép; OT; hạn chốt công | *HRM → Công*, *HRM → Nghỉ phép* | Owner + HR | P3 |
| 6 | Payroll | Cấu phần lương; thuế TNCN, BHXH/BHYT/BHTN; làm tròn; ngày trả; tạm ứng/hoàn ứng; **quy tắc chia theo ngày cho tháng lẻ**; xử lý khiếu nại. Tên kế toán/chuyên gia: `__________`. Kỳ chạy song song: kỳ `____`, kết quả đối chiếu đính kèm | *HRM → Payroll* (chính sách + thu nhập theo hợp đồng) | Owner + kế toán | P4, HRM-13/14/15 |
| 7 | Hoa hồng CRM | Duyệt chính sách `local-commission` (hiện là đề xuất); cách tính thuế hoa hồng của nhân viên | *CRM → Hoa hồng* | Owner + kế toán | Nhập hoa hồng vào payroll |
| 8 | Hạ tầng và phục hồi | RPO/RTO; nơi lưu bản sao lưu D1/R2 và thời hạn lưu; người có quyền phục hồi; cách xử lý bản sao và bản sao lưu cũ khi có yêu cầu xóa (RPT-08/09) | Runbook phục hồi | Owner + người vận hành Cloudflare | HRM-21 production |
| 9 | Thông báo và nghỉ việc | Kênh được phép ngoài thông báo trong ứng dụng; nội dung tối thiểu; thời điểm tắt quyền sau nghỉ việc; cách bàn giao giấy tờ | Cấu hình nhắc hạn; offboarding | Owner + HR | HRM-19 |
| 10 | Onboarding | Mẫu theo vị trí; việc bắt buộc/tùy chọn; mốc ngày; người kiểm tra; quyền miễn; xử lý quá hạn | *HRM → Onboarding* | Owner + HR | P2 |
| 11 | Kích hoạt | Ai bật `HRM_LIVE_ENABLED` trên Cloudflare và đánh dấu cấu hình HRM đã rà soát; thời điểm mở cho người dùng thật | Cloudflare + *HRM → Thiết lập* | Owner | Mở production |

## Cách dùng

1. Owner điền các ô `____` và cột “Giá trị cần điền”, ghi ngày và người ký cho từng mục.
2. Người có quyền tạo cấu hình tương ứng trong hệ thống. Một người khác rà soát và kích hoạt; không ai tự duyệt phần mình tạo.
3. Ghi kết quả (phiên bản chính sách, người duyệt, ngày) vào [STATUS.md](STATUS.md).
4. Chỉ bật `HRM_LIVE_ENABLED` sau khi các mục 1–6 và 8 có giá trị đã ký, và kỳ payroll song song không còn chênh lệch chưa giải thích.

Không có giá trị pháp lý, thuế hay bảo hiểm nào trong tài liệu này là khuyến nghị; người có chuyên môn phải xác nhận theo nơi làm việc và thời điểm áp dụng.

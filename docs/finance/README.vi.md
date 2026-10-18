# Finance — kế hoạch và báo cáo tài chính theo tháng

[English](README.md) · **Trạng thái: ĐỀ XUẤT / CHƯA TRIỂN KHAI** · 2026-10-18

Finance là module riêng tư dự kiến trong Lumi Workspace, **chỉ System Super Admin được truy cập**. Module tập trung kế hoạch tài chính, số thực tế từng tháng và đối chiếu có cùng cơ sở. Thay đổi này là đặc tả sản phẩm; chưa tạo route, permission, migration, số dư mẫu hoặc cấu hình production.

## Đọc bộ đặc tả

| Tài liệu | Nội dung do tài liệu quản lý | English |
|---|---|---|
| [Sản phẩm](PRODUCT.vi.md) | Phạm vi, 11 trang, luồng sử dụng, đầu vào, đầu ra và UX | [Product](PRODUCT.md) |
| [Quy tắc tài chính](FINANCIAL-RULES.vi.md) | Ghi nhận và dòng tiền, công thức, dữ liệu thiếu, chênh lệch, đối soát và ví dụ | [Financial rules](FINANCIAL-RULES.md) |
| [Mô hình dữ liệu](DATA-MODEL.vi.md) | Grain D1, bảng, lịch sử phiên bản, ràng buộc, ghi nguyên tử và khôi phục | [Data model](DATA-MODEL.md) |
| [Kiến trúc](ARCHITECTURE.vi.md) | Hiện trạng repository, phân quyền, ranh giới tích hợp và hợp đồng API | [Architecture](ARCHITECTURE.md) |
| [Triển khai và nghiệm thu](DELIVERY.vi.md) | Mã yêu cầu, từng giai đoạn, ca nghiệm thu, phát hành và điều kiện dừng | [Delivery and acceptance](DELIVERY.md) |
| [Trạng thái](STATUS.md) | Phần đã làm thật và bằng chứng kiểm tra | Dùng chung EN/VI |

Thứ tự đọc: Sản phẩm → Quy tắc tài chính → Kiến trúc/Mô hình dữ liệu → Triển khai. Sản phẩm quản lý phạm vi; Quy tắc tài chính quản lý phép tính; Mô hình dữ liệu quản lý lưu trữ và transaction; Kiến trúc quản lý quyền và HTTP. Mâu thuẫn giữa các tài liệu là lỗi cần sửa, không phải quyền chọn quy tắc lỏng hơn. Status ghi bằng chứng, không tạo thêm một roadmap cạnh tranh.

## Yêu cầu đã xác nhận và thiết kế đề xuất

**Yêu cầu của owner ngày 18/10/2026:** bổ sung module Finance vào repository này; chỉ Super admin được xem; có các trang tài chính quan trọng và kế hoạch chia theo tháng; nhập số thực tế từng tháng để đối chiếu; lưu vào D1; phân tích và viết yêu cầu trong `docs/finance` trước.

| Quyết định | Phân loại | Đặc tả |
|---|---|---|
| Tài liệu trước, triển khai sau | Owner yêu cầu | PR này chỉ thay đổi tài liệu. |
| Quyền truy cập | Owner yêu cầu; đối chiếu danh tính hiện có | Tài khoản EmDash đang hoạt động, role 50; không role Workspace nào khác, kể cả kết hợp tất cả role, được truy cập. |
| Lưu trữ | D1 do owner yêu cầu; binding là đề xuất | Các bảng `finance_*` trong `DB` / `lumi-jobs`, không dùng `CONTENT_DB`. |
| Phạm vi báo cáo | Đề xuất | Một sổ quản trị cho một pháp nhân/phạm vi được ghi rõ; không tự hợp nhất nhiều công ty. |
| Tiền tệ/lịch | Mặc định đề xuất | VND, năm tài chính bắt đầu tháng 1, Asia/Ho_Chi_Minh; xác nhận trong setup trước khi nhập số đầu tiên. |
| Số thực tế | Đề xuất | Nhập tổng hợp theo tháng, có thể dùng CSV qua bước xem trước; v1 không tự lấy số CRM/HRM. |
| Kế hoạch/lịch sử | Đề xuất | Đóng băng ngân sách đã công bố; forecast/scenario riêng; bản số thực tế đã chốt bất biến. |
| Ý nghĩa Finance | Đề xuất | Báo cáo quản trị nội bộ; không phải sổ cái kế toán, báo cáo kiểm toán hoặc hệ thống khai thuế. |

Role **Finance** hiện có trong Workspace là quyền CRM (`crm.finance`). Role này không được cấp quyền vào module Finance mới. Các trang CRM giữ quyền hiện tại; không đưa ngân sách, số dư công ty và dữ liệu riêng của Finance vào payload các trang đó. Xem [Kiến trúc](ARCHITECTURE.vi.md).

## Phiên bản đầu tiên có ích

V1 gồm Tổng quan, Kế hoạch tài chính, Số thực tế tháng, Lãi/lỗ, Dòng tiền, Doanh thu, Chi phí, Vốn lưu động, Tình hình tài chính, Thiết lập và Lịch sử. Đây là 11 góc nhìn trên dữ liệu dùng chung, không phải 11 nơi nhập số độc lập. Mọi trang có bản tiếng Anh và tiếng Việt.

Lát cắt triển khai đầu tiên phải đi hết một pháp nhân, một năm và một tháng đã chốt: có kế hoạch gốc, tiền đã đối soát và bản xuất tái lập được. Các trang v1 còn lại dùng cùng mô hình và quyền. Hoàn thành một lát cắt chưa có nghĩa toàn module đã xong.

## Quyết định cần xác nhận trước khi dùng số thật

| Quyết định | Cách xử lý khi chưa xác nhận |
|---|---|
| Pháp nhân/phạm vi, tiền tệ, năm tài chính và tháng bắt đầu | Setup chưa hoàn tất; không suy pháp nhân từ tên thương hiệu. |
| Tiền đầu kỳ, các số dư và nguồn số thực tế tháng | Để trống; chỉ dùng ví dụ giả lập có nhãn rõ trong kiểm thử. |
| Cách ghi nhận doanh thu/chi phí, phân bổ chi phí trực tiếp, gross/net của khoản thu hộ/chi hộ | Ghi chính sách quản trị và nguồn căn cứ; không tự ghi nhận hoặc đặt thuế suất. |
| Mức tiền tối thiểu và ngưỡng chênh lệch đáng chú ý | Không biến số mặc định thành chính sách công ty; khi chưa cấu hình chỉ hiện chênh lệch gốc. |
| Lưu trữ, người chịu trách nhiệm backup và mục tiêu khôi phục | Giữ lịch sử tài chính; không lập lịch xóa; hoàn thiện chính sách lưu/xử lý dữ liệu trước production. |

Các câu hỏi này không cản việc viết đặc tả hoặc làm prototype bằng dữ liệu giả. Chúng ngăn việc trình bày số thật như báo cáo đã đầy đủ và cấu hình đúng. Đặc tả này không cấp quyền gửi thông báo ra ngoài, thanh toán hoặc bật tự động hóa tài chính theo lịch.

## Ranh giới bằng chứng

Đã khảo sát repository tại [`30c75a6`](https://github.com/RunLumi/www.runlumi.app/commit/30c75a64ba1184f241a421d2591a5b5be9db6426). Kiến trúc dẫn tới mã nguồn quyết định hành vi và tách hiện trạng khỏi đề xuất. Quy tắc tài chính và Mô hình dữ liệu dẫn nguồn gốc liên quan. Mặc định đề xuất, mục tiêu hiệu năng và số giả lập không phải tình hình tài chính thực của Lumi.

**Hoàn thành công việc lần này:** bộ yêu cầu nhất quán, có thể duyệt, được rà soát độc lập về quyền và tính đúng của số liệu, lưu trên nhánh tài liệu và có PR. Triển khai runtime và kích hoạt production là việc tiếp theo. Merge vào `main` kích hoạt quy trình phát hành production hiện có; xem [Triển khai](DELIVERY.vi.md).

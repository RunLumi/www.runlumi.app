# Đánh giá hiệu suất riêng tư

[English](PERFORMANCE.md) · [Phạm vi](README.md#11-phúc-lợi-tài-sản-và-dịch-vụ-nhân-viên) · [Bằng chứng triển khai](STATUS.md)

Phần này triển khai luồng đánh giá hiệu suất trong §11. Production vẫn đóng. Mã nguồn không thay thế chính sách đánh giá đã được duyệt, không đặt thang điểm, quyết định tăng lương/thăng chức hay thời hạn lưu hồ sơ.

## Quy trình và thẩm quyền

| Bước | Người thực hiện và yêu cầu |
|---|---|
| Mở kỳ | HRM Officer/Admin đặt mã/tên kỳ cho nhân viên và đợt làm việc đang hoạt động, điền kỳ, hạn hoàn tất, mục tiêu, yêu cầu bằng chứng và người đánh giá đang hoạt động. Kỳ phải nằm trong mốc đợt làm việc được biết lúc tạo; revision đợt làm việc được kiểm tra lại khi ghi. Pháp nhân phải khớp cấu hình. Không tạo sẵn kỳ, ngày, mục tiêu hay điểm số. |
| Tự đánh giá | Nhân viên nộp nhận xét và bằng chứng bằng văn bản: sự kiện, ngày và nguồn tham chiếu. Tham chiếu chỉ là chữ, không tự lấy tài liệu hoặc cấp quyền xem. |
| Đánh giá | Chỉ People Manager/HRM Officer/HRM Admin đang được giao mới gửi nhận xét, bằng chứng và kế hoạch phát triển. Chức danh hay quan hệ quản lý đơn thuần không cho quyền đọc đánh giá. |
| Rà soát độc lập | HRM Admin/System Super Admin khác nhân viên, người tạo kỳ và người đánh giá trả lại để sửa hoặc duyệt gửi nhân viên. Nhân viên chưa thấy nhận xét, bằng chứng và kế hoạch chưa phát hành, kể cả khi đồng thời có vai trò Employee + HRM Admin. |
| Phản hồi | Nhân viên xem phiên bản đã phát hành, có thể không đồng ý hoặc đề nghị hỗ trợ, và chủ động xác nhận đã đọc. Thời gian UTC phía server và đúng revision trước thao tác được giữ trong lịch sử bất biến. Đây là xác nhận nhận/đọc, không phải đồng ý hay chữ ký điện tử. |
| Kết thúc | HRM Admin/System Super Admin độc lập chỉ kết thúc sau phản hồi của nhân viên. Ý kiến và thời gian xác nhận không bị sửa. |

HR được đổi người đánh giá trước phát hành nếu ghi lý do. Đổi người xóa phần nhận xét hiện hành và yêu cầu người mới đánh giá lại; nội dung cũ còn trong lịch sử chỉ HR được xem. Người cũ mất quyền trên yêu cầu kế tiếp. HR được hủy kỳ chưa phát hành; kỳ thay thế có thể dùng lại mã kỳ đó. Kỳ đã phát hành không bị hủy hoặc viết lại. Sửa sau phát hành hiện cần một kỳ có mã riêng; liên kết điều chỉnh tường minh còn là phần cần bổ sung.

Bằng chứng tự đánh giá, nhận xét và kế hoạch là văn bản, không phải tính năng tải PDF hoặc tuyên bố xác minh từ bên ngoài. Tệp đính kèm, mẫu/thang điểm có phiên bản, policy nhắc việc, liên kết điều chỉnh và retention/disposition/legal hold riêng cho đánh giá chưa được triển khai trong phần này. Không suy ra thời hạn từ payroll, đào tạo hay danh mục khác. Giữ production đóng khi các yêu cầu chính sách/vòng đời áp dụng chưa được xử lý.

## Quyền và lưu trữ

- Dùng danh tính/phiên EmDash và grant Workspace chung. Employee có `hrm.performance.self`; People Manager có `hrm.performance.review`; HRM Officer có manage/review; HRM Admin có manage/review/approve. Các grant này không mở ATS, CRM, payroll hay quản trị tài khoản.
- `/hrm/performance` và `/vi/hrm/performance` là hàng chờ HR/người được giao. `/hrm/me/performance` và trang `/vi` chỉ chứa kỳ của đúng nhân viên. ID không tồn tại và ID ngoài scope cùng trả not-found.
- Danh sách phân trang 25 kỳ. Lệnh ghi kiểm tra quyền, membership, người đang được giao, revision kỳ vọng, danh tính nhân viên hiện hành và cấu hình HRM đã bật/được rà soát trong cùng batch D1. Chọn reviewer còn kiểm tra tài khoản EmDash hiện hành; hai database không có một transaction chung. Tắt EmDash vẫn chặn yêu cầu đã xác thực tiếp theo của tài khoản đó.
- Migration 0039 thêm hồ sơ riêng tư và snapshot/event chỉ nối thêm. Nội dung đã phát hành và phản hồi không bị viết lại; command key có scope theo actor và retry idempotent. Audit chỉ ghi thao tác/revision, không ghi nội dung đánh giá.
- Self-export schema v9 chỉ thêm dữ liệu kỳ nhân viên được xem. Nội dung nội bộ chưa phát hành và ID tài khoản reviewer bị loại. Đây là snapshot riêng tư có giới hạn, không phải xuất payload event nội bộ HR.
- Không tạo thông báo Lark/email/webhook, input lương, thay vai trò hoặc provision hệ thống.

## Hợp đồng kiểm thử

Kiểm tra tạo/retry, phát hành độc lập, trả lại/đánh giá lại, race đổi reviewer với gửi đánh giá, mất quyền của reviewer cũ, che nội dung khỏi nhân viên có vai trò kết hợp trên cả hai hàng chờ và self-export, xác nhận/phản hồi, chặn đóng sớm, bất biến sau đóng và dò hồ sơ ngoài scope. Kiểm tra form native EN/VI ở 320/430/1280px không JavaScript, giảm chuyển động, focus bàn phím rõ và không tràn ngang. Kết quả phải nằm trong STATUS và PR trên đúng head; chỉ có hợp đồng này không chứng minh đã đạt.

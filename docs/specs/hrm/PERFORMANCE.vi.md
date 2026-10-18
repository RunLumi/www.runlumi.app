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

HR được đổi người đánh giá trước phát hành nếu ghi lý do. Đổi người xóa phần nhận xét hiện hành và yêu cầu người mới đánh giá lại; nội dung cũ còn trong lịch sử chỉ HR được xem. Người cũ mất quyền trên yêu cầu kế tiếp. HR được hủy kỳ chưa phát hành; kỳ thay thế có thể dùng lại mã kỳ đó. Kỳ đã phát hành không bị hủy hoặc viết lại. Sửa sau phát hành dùng quy trình liên kết bên dưới; mỗi bản vẫn có mã riêng để đối chiếu.

Bằng chứng tự đánh giá, nhận xét và kế hoạch là văn bản, không phải tính năng tải PDF hoặc tuyên bố xác minh từ bên ngoài. Tệp đính kèm, mẫu/thang điểm có phiên bản, policy nhắc việc, retention/disposition/legal hold riêng cho đánh giá chưa được triển khai trong phần này. Không suy ra thời hạn từ payroll, đào tạo hay danh mục khác. Giữ production đóng khi các yêu cầu chính sách/vòng đời áp dụng chưa được xử lý.

## Quyền và lưu trữ

- Dùng danh tính/phiên EmDash và grant Workspace chung. Employee có `hrm.performance.self`; People Manager có `hrm.performance.review`; HRM Officer có manage/review; HRM Admin có manage/review/approve. Các grant này không mở ATS, CRM, payroll hay quản trị tài khoản.
- `/hrm/performance` và `/vi/hrm/performance` là hàng chờ HR/người được giao. `/hrm/me/performance` và trang `/vi` chỉ chứa kỳ của đúng nhân viên. ID không tồn tại và ID ngoài scope cùng trả not-found.
- Danh sách phân trang 25 kỳ. Lệnh ghi kiểm tra quyền, membership, người đang được giao, revision kỳ vọng, danh tính nhân viên hiện hành và cấu hình HRM đã bật/được rà soát trong cùng batch D1. Chọn reviewer còn kiểm tra tài khoản EmDash hiện hành; hai database không có một transaction chung. Tắt EmDash vẫn chặn yêu cầu đã xác thực tiếp theo của tài khoản đó.
- Migration 0039 thêm hồ sơ riêng tư và snapshot/event chỉ nối thêm. Nội dung đã phát hành và phản hồi không bị viết lại; command key có scope theo actor và retry idempotent. Audit chỉ ghi thao tác/revision, không ghi nội dung đánh giá.
- Self-export schema v9 chỉ thêm dữ liệu kỳ nhân viên được xem. Nội dung nội bộ chưa phát hành và ID tài khoản reviewer bị loại. Đây là snapshot riêng tư có giới hạn, không phải xuất payload event nội bộ HR.
- Không tạo thông báo Lark/email/webhook, input lương, thay vai trò hoặc provision hệ thống.

## Hợp đồng kiểm thử

Kiểm tra tạo/retry, phát hành độc lập, trả lại/đánh giá lại, race đổi reviewer với gửi đánh giá, mất quyền của reviewer cũ, che nội dung khỏi nhân viên có vai trò kết hợp trên cả hai hàng chờ và self-export, xác nhận/phản hồi, chặn đóng sớm, bất biến sau đóng và dò hồ sơ ngoài scope. Kiểm tra form native EN/VI ở 320/430/1280px không JavaScript, giảm chuyển động, focus bàn phím rõ và không tràn ngang. Kết quả phải nằm trong STATUS và PR trên đúng head; chỉ có hợp đồng này không chứng minh đã đạt.

## Điều chỉnh có liên kết sau phát hành

Bản điều chỉnh là kỳ mới, liên kết với kỳ gốc và bản nguồn hiện hành mới nhất. Nhân viên, đợt làm việc và pháp nhân được giữ nguyên. HR nhập rõ mã kỳ mới, hạn, reviewer, mục tiêu/yêu cầu bằng chứng đã sửa; có thể sửa kỳ ngày trong phạm vi đợt làm việc đó. Danh tính, revision đợt làm việc và pháp nhân được kiểm tra lại khi ghi/phát hành. Hỗ trợ đợt làm việc đã kết thúc; quy trình không đổi tài khoản hoặc grant của nhân viên.

HR phải chọn một cách lấy ý kiến nhân viên; không có lựa chọn mặc định:

- **Nộp mới:** tài khoản EmDash liên kết và quyền tự phục vụ phải đang hoạt động. Bản sửa bắt đầu mở, chưa có tự đánh giá/bằng chứng; nhân viên thực sự gửi phiên bản mới.
- **Giữ làm bối cảnh:** sao nguyên văn ý kiến/bằng chứng từ lần tự nộp thật gần nhất trong chuỗi nguồn. Vẫn truy được event, người nộp, thời gian, kỳ và mục tiêu gốc. Giao diện/export ghi rõ đây là bối cảnh lịch sử, kể cả khi HR sửa kỳ hoặc mục tiêu; không phải lần nộp, đồng ý hay xác nhận đọc mới. Có thể sửa hồ sơ lịch sử khi tài khoản đã bị tắt mà không khôi phục quyền. Không tạo event `submit_self` giả.

| Tình huống | Kết quả |
|---|---|
| Hai đề xuất đồng thời từ một bản nguồn hiện hành | Chỉ một transaction thắng; bản thua không để lại review hay command mồ côi. |
| Hủy đề xuất chưa phát hành | Giữ link/lịch sử. Nguồn vẫn hiện hành; được mở lần điều chỉnh mới có số riêng. |
| Nguồn có phản hồi/xác nhận mới trong lúc chuẩn bị bản sửa | Nguồn vẫn được thao tác. Người phát hành độc lập phải xem revision/phản hồi hiện hành, chủ động xác nhận đã rà soát và gửi revision nguồn kỳ vọng. Nguồn stale chặn phát hành. |
| Phát hành bản sửa chạy đồng thời với xác nhận đọc bản nguồn | Chỉ một thắng. Nếu xác nhận thắng, người duyệt tải lại để rà soát; nếu phát hành thắng, nguồn đã được thay thế không nhận thao tác/xác nhận mới. Retry của xác nhận đã thành công trước đó vẫn idempotent. |
| Phát hành bản sửa | Bản sửa thành hiện hành. Nội dung, phản hồi, xác nhận, actor và thời gian cũ không bị sửa; nhãn bản lưu được suy ra từ link. Bản mới cần lần xác nhận đọc thật riêng trước khi kết thúc. |

Migration 0040 thêm link và căn cứ phát hành bất biến. Căn cứ xác định đúng event/revision/checksum nguồn, revision đợt làm việc, người duyệt độc lập và thời gian server. Trigger D1 chặn phát hành nếu thiếu căn cứ và chặn ghi tiếp vào nguồn đã được thay thế. Checksum dùng đối chiếu lịch sử lưu trữ, không phải chữ ký điện tử.

Mỗi trang trong chuỗi vẫn có quyền riêng. Được giao bản sửa chỉ nhận bối cảnh nhân viên được chuyển rõ ràng, không tự được đọc nhận xét HR ở bản nguồn; link nguồn/gốc/hiện hành ngoài scope bị loại. Các lần điều chỉnh phân trang 25 mục. Nội dung chưa phát hành vẫn được che khỏi nhân viên dù họ có quyền HRM Admin. Bản sửa giữ danh tính nhân viên từ lúc phát hành nguồn; lệch liên kết danh tính chặn truy cập/thao tác thông thường tới khi HR xử lý, đồng thời che nội dung nháp với cả danh tính gốc và danh tính hiện hành nếu họ có vai trò đặc quyền.

Self-export schema v10 bổ sung tham chiếu review/gốc/nguồn chỉ có nghĩa trong bundle, lý do/lần điều chỉnh, version/checksum nguồn, nhãn hiện hành/bản lưu và nguồn tự nộp thật hay bối cảnh kế thừa. Không xuất ID tài khoản reviewer hoặc payload event nội bộ. Các nhóm dữ liệu nhân viên được đọc trong cùng snapshot batch D1. SQL che bản nháp HR; giới hạn chữ hiển thị/số dòng chặn lấy kết quả lớn trước khi nạp, và bundle đã mã hóa vẫn chịu giới hạn năm MiB.

Link mới thay cho việc phải tạo kỳ rời rạc để sửa lỗi sau phát hành. Phần này chưa thêm tệp đính kèm, legal hold/retention/disposition riêng, thang điểm, kênh gửi ngoài, thay lương/quyền hoặc kích hoạt production. Các phần phạm vi đó và quyết định owner vẫn còn mở.

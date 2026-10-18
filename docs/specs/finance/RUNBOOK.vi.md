# Hướng dẫn vận hành Finance

[English](RUNBOOK.md) · [Tổng quan](README.vi.md)

## Thiết lập lần đầu

Vào `/vi/finance/settings` bằng phiên System Super Admin đang hoạt động. Xác nhận đơn vị/phạm vi, đồng tiền/độ chính xác, năm tài chính, múi giờ, tháng đầu và chính sách ghi nhận. Chọn tháng sớm nhất dự định nhập bù trước khi tạo bất kỳ kế hoạch, kỳ thực tế hoặc bản import nào. Không có đơn vị, tài khoản hoặc số tiền thật được điền sẵn.

Khai báo tài khoản tiền cùng tháng bắt đầu/kết thúc hoạt động. Kiểm tra nhãn khoản mục, tính chất chi phí và tọa độ phân khúc. Khoản dùng chung có thể giữ ở `unallocated`; không nhập thêm tổng trùng với các dòng con. Có thể để trống ngưỡng tiền/chênh lệch đến khi có chính sách. Bật sổ khi cấu hình sẵn sàng. Nghiệp vụ cần cả sổ đã bật và `FINANCE_LIVE_ENABLED=true`; khi tắt chỉ thiết lập/cấu hình được bảo vệ còn khả dụng.

Lịch tài chính, múi giờ và tháng bắt đầu không thể đổi khi đã có kế hoạch, kỳ thực tế hoặc bản import. Hoàn tất định nghĩa khoản mục/phân khúc của năm trước khi nhập số; số nháp đã ngăn sửa định nghĩa, và công bố bất kỳ kế hoạch hoặc chốt tháng sẽ đóng băng định nghĩa. V1 từ chối thực tế trước `firstPeriod`; đổi mốc quá khứ cần migration được rà soát riêng. Năm đầu bắt đầu giữa năm được ghi rõ là một phần năm.

## Kế hoạch và quy trình tháng

1. Tạo ngân sách theo năm bắt đầu kỳ. Nhập 12 tháng P&L/thu chi trực tiếp, tiền đầu kỳ và tiền cuối kỳ bị hạn chế. Nhập 0 khi đã biết không phát sinh; N/A có giải thích chỉ dùng ở ô cho phép.
2. Xem trước phân bổ năm hoặc sao chép tháng rồi mới áp dụng. Phân bổ nhận trọng số thập phân không âm chính xác và giữ tổng có dấu. Nhân bản tạo bản nháp riêng. Công bố ngân sách gốc bất biến khi đã nhập đủ kế hoạch của cả 12 tháng; không cần đợi năm tài chính kết thúc.
3. Mở bản nháp thực tế cho tháng hiện tại/đã qua theo giờ địa phương. Ghi ngày nguồn, phạm vi và bằng chứng P&L/tiền/tuổi nợ/tình hình tài chính. Có thể lưu từng phần.
4. Nhập số dư ngân hàng cuối tháng đúng thời điểm; tại mốc bắt đầu nhập thêm số đầu ngày đầu kỳ. Số dư âm cần phân loại vay và biến động tài trợ rõ ràng. Không trừ thấu chi hai lần khỏi tiền khả dụng.
5. Đối chiếu thu chi với số dư quan sát, tuổi nợ phải thu/phải trả gộp với số kiểm soát, tài sản với nợ cộng vốn, và biến động vốn với lợi nhuận/điều chỉnh có bằng chứng. Vốn đầu kỳ cần nguồn riêng kể cả khi đã nhập rõ số 0. Mỗi biến động vốn phi tiền tệ hoặc biến động vốn khác có giá trị khác 0 cũng cần nguồn riêng.
6. Lưu, kiểm tra và chỉ chốt sau khi tháng kết thúc theo múi giờ sổ. Chốt đóng băng số, giải thích, định nghĩa, chính sách, tài khoản, nguồn và tham chiếu phiên bản trước.

Nhập tiền theo đơn vị chính, không có dấu phân cách hàng nghìn; API dùng chuỗi số nguyên đơn vị nhỏ nhất. Ô trống không thành 0. Form bị từ chối giữ nội dung vừa nhập. Khi xung đột phiên bản, tải lại và rà soát thay đổi đồng thời trước khi gửi lại.

Forecast ghim chuỗi thực tế đã chốt liên tục và dự kiến các tháng còn lại. Nguồn thực tế thiếu/cũ không được thay bằng số kế hoạch sao chép. Kịch bản và forecast không ghi đè ngân sách gốc.

## CSV và báo cáo

Tải mẫu đúng phạm vi, điền số hoặc bỏ dòng trống chưa dùng rồi dán CSV UTF-8/chọn file bằng tiện ích tùy chọn. Các cột: `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note`. Xem trước chênh lệch rồi ghi từng tháng.

Giới hạn: CSV 256 KiB, 2.400 dòng, 12 tháng cùng năm tài chính, 200 giá trị/tháng và 512 KiB cho toàn bộ tháng tuần tự hóa gồm số dư/nguồn. Ghi tháng bị từ chối không để lại dữ liệu, biên nhận hay audit dở dang. Chỉ lần ghi tháng trước thành công của cùng preview được tăng phiên bản kỳ vọng còn lại; sửa bên ngoài yêu cầu preview mới. Bỏ import xóa phần chờ, giữ bằng chứng đã ghi.

Export dùng POST và snapshot bất biến. Gửi lại cùng khóa/nội dung tái tạo CSV cũ sau điều chỉnh nếu quyền và trạng thái khả dụng hiện tại vẫn hợp lệ. Văn bản được bảo vệ khỏi công thức bảng tính; số giữ đúng giá trị có dấu. Snapshot xuất giới hạn 16 MiB và 24 nhóm insert. Vượt giới hạn báo lỗi rõ, không cắt báo cáo. Xem [Mô hình dữ liệu](DATA-MODEL.vi.md).

## Điều chỉnh và so sánh lịch sử

Mở lại tháng đã chốt cùng lý do. Bản nháp mới được tạo, bản cũ giữ bất biến. Sửa, đối chiếu và chốt lại để con trỏ hiện hành đổi nguyên tử. Đối chiếu tháng phụ thuộc theo thứ tự thời gian và tạo forecast mới khi nguồn ghim bị cũ.

YTD dùng cùng chuỗi tháng đã chốt liên tục cho thực tế và kế hoạch. Dừng ở tháng thiếu, mở lại, chưa khớp hoặc nguồn cũ đầu tiên; không bắt đầu lại sau khoảng trống. Dòng phát sinh được cộng, số dư lấy đầu/cuối kỳ, tỷ suất tính lại. Dùng khoảng tháng khi chọn bản nháp/phiên bản cũ. Thêm nguyên nhân/hành động/rà soát bằng annotation, không sửa giải thích đã đóng băng; ghi chú không gửi tin hoặc giao việc cho người khác.

## Phát hành, phục hồi và xác minh

[CI](../../../.github/workflows/ci.yml) chạy kiểm tra quy tắc, unit test, migration local, Worker integration đầy đủ và build. Kiểm tra riêng Finance: `npm run test:integration:finance`; hồi quy đầy đủ: `npm run test:integration`. Đặt `FINANCE_BROWSER_BINARY` tới Chrome local để kiểm tra 320/430/1280/1920px, không JavaScript, giảm chuyển động, focus bàn phím và accessibility. `FINANCE_BROWSER_ARTIFACTS` chọn thư mục ảnh. Ca khôi phục integration dùng SQLite online backup tạo bản sao nhất quán của D1 local dùng thử, khôi phục vào D1 local riêng rồi so hash nội dung, lịch sử, khóa ngoại và cơ chế bất biến. Đây là bằng chứng khôi phục local; chưa thực hiện Time Travel production hay export/restore SQL.

[Script phát hành](../../../scripts/release.mjs) kiểm tra production, lấy bookmark D1 Time Travel trước migration còn chờ, áp dụng migration bổ sung rồi deploy main có tag. Dùng quy trình này. Migration Finance không chứa số mẫu hoặc dữ liệu tài chính thật.

Nếu rollout lỗi, giữ Finance nghiệp vụ tắt, xem log và sửa tiếp. Với hồi quy ứng dụng, ưu tiên quay về Worker đã biết hoạt động tốt. Không xóa bảng/lịch sử. Restore D1 ảnh hưởng toàn bộ `lumi-jobs`, gồm Tuyển dụng, CRM và HRM: operator được phép phải rà soát bookmark, khoảng thời gian và mọi ghi dữ liệu, rồi diễn tập bản sao cô lập trước khi restore production. Hướng dẫn này không cho phép tự động restore/purge. Xem [Time Travel của Cloudflare](https://developers.cloudflare.com/d1/reference/time-travel/).

Sau deploy kiểm tra từ chối trang/API khi chưa đăng nhập và header private/no-store. Dùng phiên Super Admin thật của owner để kiểm tra thiết lập; không tạo sổ giả lập trên production để thử. Trước khi dùng số thật, xác định chủ nguồn, chính sách lưu giữ/xử lý và trách nhiệm sao lưu. Theo dõi chênh lệch chưa xử lý, tháng thiếu, chuỗi nguồn cũ, import lỗi và audit. Finance không thêm lịch purge, thanh toán, tin nhắn ngoài hoặc tự lấy số CRM/HRM.

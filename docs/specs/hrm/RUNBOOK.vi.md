# HRM — Quy trình sự cố, lưu giữ và phục hồi dữ liệu

**Rà soát:** 2026-10-15 theo tài liệu Cloudflare D1 và R2 hiện hành. **Trạng thái:** bản thảo quy trình vận hành. HRM production vẫn đóng cho đến khi chủ sở hữu phê duyệt thời hạn lưu giữ, mục tiêu phục hồi và người chịu trách nhiệm. Chưa có bằng chứng về một lần phục hồi production hoặc bản sao lưu R2. Tài liệu này không chứng minh dữ liệu có thể phục hồi.

[English](RUNBOOK.md)

Quy trình này áp dụng cho tệp và hồ sơ HRM trong cơ sở dữ liệu D1 `lumi-jobs` và binding R2 riêng tư `FILES` (`lumi-job-files`). Trạng thái tài khoản EmDash được lưu riêng trong `lumi-content`; quyền thành viên Workspace và hồ sơ HRM nằm trong `lumi-jobs`. Cấu hình hiện không khai báo một binding R2 dự phòng riêng. Trước mọi thao tác production, hãy xác minh bằng môi trường Cloudflare đã xác thực: tài khoản, backend cơ sở dữ liệu, bucket, phiên bản Worker và khu vực pháp lý đang áp dụng. Cấu hình trong repository không chứng minh tài nguyên nào đang phục vụ traffic.

## Người có thẩm quyền và điều kiện dừng

- HRM Admin điều phối sự cố dữ liệu nhân sự. System Super Admin kiểm soát quyền Workspace dùng chung. Chủ tài khoản Cloudflare hoặc người vận hành hạ tầng được ủy quyền chịu trách nhiệm phục hồi D1/R2. Sự cố payroll cần thêm chủ sở hữu payroll và một người rà soát độc lập.
- Không phục hồi, xóa, đổi thời hạn lưu, phát hành payslip hay xác nhận khoản thanh toán bằng dữ liệu thật nếu chủ sở hữu chưa phê duyệt chính xác thao tác, đích và thời điểm đó. Không thử quy trình bằng hồ sơ nhân viên thật hoặc bằng bản sao lưu production đưa vào môi trường thử nghiệm.
- Giữ `HRM_LIVE_ENABLED` ở trạng thái đóng cho đến khi pháp nhân, mục đích, thời hạn lưu, phương thức ký, lịch làm việc, chính sách payroll và trách nhiệm phục hồi đã được cấu hình, phê duyệt. Cờ tính năng không thay thế các quyết định này và cũng không chứng minh khả năng phục hồi.
- Giữ nguyên lịch sử actor/audit và mã lỗi liên quan. Lưu bằng chứng sự cố ở nơi riêng tư đã được duyệt; không đưa tên, CCCD, payslip, khóa object riêng tư, token hay nội dung tệp vào ticket, chat hoặc log.
- Nếu chưa rõ phạm vi người bị ảnh hưởng, mốc dữ liệu cần phục hồi, nguồn R2, độ mới của bản sao lưu hoặc trạng thái quyền truy cập, hãy dừng. Giữ các thao tác HRM liên quan ở trạng thái không khả dụng; không tự đặt RPO/RTO, thời hạn lưu hay cách ghép tài khoản.

## Ứng phó ban đầu theo loại sự cố

| Sự cố | Ngăn chặn ngay | Nguyên tắc phục hồi |
|---|---|---|
| Tệp riêng tư hoặc payslip bị lộ | Tắt route/phạm vi HRM bị ảnh hưởng, thu hồi quyền liên quan, giữ bằng chứng truy cập và audit, xác định người có thể bị ảnh hưởng, rồi xin hướng dẫn từ phụ trách pháp lý/quyền riêng tư. | Không xóa nguồn hay lịch sử audit để che giấu việc lộ dữ liệu. Chỉ mở lại sau khi hai tài khoản nhân viên tổng hợp A/B chứng minh được việc chặn truy cập chéo. |
| Tệp gắn nhầm người | Dừng tải tệp và các bước xử lý tiếp theo, cách ly tệp, giữ hai bản ghi metadata cùng checksum, nhờ HR xác minh danh tính từ nguồn đã duyệt. | Chỉ liên kết lại qua thao tác sửa có audit, kiểm tra phiên bản và được một HRM Admin/System Super Admin khác rà soát. Giữ sự kiện gốc; xử lý lưu giữ và legal hold riêng. |
| Payslip phát hành sai dữ liệu đầu vào | Dừng phát hành thêm và xác nhận thanh toán cho đợt đó; giữ snapshot đã phát hành cùng sự kiện payroll. Báo cho chủ payroll và người rà soát độc lập. | Không sửa payslip đã phát hành. Tạo phiên bản điều chỉnh có lý do, snapshot nguồn và phê duyệt độc lập; không khẳng định đã trả tiền nếu chưa có bằng chứng đối soát. |
| Khóa nhầm kỳ chấm công hoặc dữ liệu payroll bị lệch | Dừng tính toán/phát hành; giữ checksum của kỳ đã khóa, lô nhập và các revision. | Điều chỉnh qua luồng đã cấu hình rồi rà soát lại. Không viết lại snapshot đã khóa hoặc payslip đã phát hành để ép số khớp nhau. |
| Worker, lời nhắc hoặc outbox bị lỗi | Kiểm tra trạng thái job có giới hạn và mã lỗi đã lược bỏ dữ liệu nhạy cảm; giữ request key và số lần thử. | Chỉ thử lại qua đường xử lý idempotent. Không tạo request thứ hai hoặc gửi thông báo ngoài hệ thống để bù cho một lần gửi chưa được xác minh. |
| Nghi D1 hỏng, migration lỗi hoặc thiếu tệp HRM | Dừng ghi HRM và xóa tệp trong phạm vi bị ảnh hưởng; ghi thời điểm UTC, bản phát hành tốt gần nhất và D1 bookmark hiện có. | Phục hồi D1 và R2 như một quy trình thống nhất bên dưới. Chỉ phục hồi D1 không khôi phục đầy đủ HRM. |
| Xung đột giữa xóa theo thời hạn và legal hold | Dừng job xóa liên quan; giữ request, người rà soát, người thực hiện và trạng thái tombstone. | Không gỡ legal hold hoặc dựng lại tệp từ bản sao chưa xác minh. Chủ sở hữu hồ sơ/pháp lý quyết định quyền phục hồi và thời hạn lưu. |

## Phục hồi D1 và R2 phối hợp

Cloudflare D1 Time Travel có thể đưa cơ sở dữ liệu về một thời điểm trước đó, nhưng thao tác ghi đè trực tiếp lên database và hủy các truy vấn đang chạy. Hãy chụp bookmark hiện tại trước; Cloudflare trả về bookmark trước khi phục hồi để có thể hoàn tác. Xác minh database dùng backend được hỗ trợ và mốc thời gian được duyệt còn nằm trong cửa sổ lưu của tài khoản. Xem [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).

Object R2 tách biệt với D1. Cloudflare ghi rõ thao tác xóa object không thể đảo ngược; phục hồi D1 không làm sống lại object R2 đã xóa. Vì vậy, muốn phục hồi phải có bản sao riêng tư được lưu độc lập và manifest để đối soát với metadata trong D1. Repository hiện chưa cấu hình hoặc chứng minh cơ chế sao chép/phục hồi đó. Xem [R2 Delete Objects](https://developers.cloudflare.com/r2/objects/delete-objects/) và [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/).

### Trước khi phục hồi

1. Chỉ định người chỉ huy sự cố, người thao tác phục hồi và người xác minh độc lập. Ghi lại phê duyệt, khoảng dữ liệu bị ảnh hưởng, thời điểm UTC dự kiến phục hồi, phiên bản Worker hiện tại và mốc rollback dự kiến.
2. Cùng chủ tài khoản Cloudflare xác minh đúng database production và backend. Lệnh chỉ đọc `wrangler d1 time-travel info lumi-jobs` lấy bookmark hiện tại; dạng có `--timestamp` có thể kiểm tra một thời điểm UTC được đề xuất. Không chọn mốc chỉ vì nó nằm trước lỗi đầu tiên: phải tính cả thay đổi HR hợp lệ, legal hold, thu hồi quyền và các tệp được ghi sau mốc đó.
3. Giữ bản export/bookmark D1 hiện tại và danh mục R2 ở nơi phục hồi riêng tư đã được duyệt. Không commit bản sao lưu, bản export, manifest có ID người/object hoặc thông tin xác thực vào Git.
4. Xác nhận có bản sao R2 riêng cho mọi object đang hoạt động trong `hrm_files` thuộc phạm vi phục hồi, gồm bytes và SHA-256. Nếu thiếu bản sao, quy trình này không thể khôi phục bytes đó; ghi nhận thiếu hụt và dừng trước khi mở quyền truy cập.
5. Giữ HRM đóng trong khi người thao tác và người xác minh đối chiếu timestamp D1 dự kiến với phạm vi dữ liệu của bản sao R2. Thống nhất cách giữ lại hoặc phát lại sự kiện mới hơn mốc D1. Nếu chưa có quyết định được duyệt cho các lần ghi mới, hãy dừng.

### Phục hồi D1 (cần chủ sở hữu phê duyệt riêng)

Lệnh sau có tính phá hủy dữ liệu. Không chạy trong CI thường lệ, kiểm thử cục bộ, review PR nháp hoặc khi chỉ đang xuất bản tài liệu này:

```sh
./node_modules/.bin/wrangler d1 time-travel restore lumi-jobs --bookmark="<owner-approved-bookmark>"
```

Chỉ dùng timestamp khi kế hoạch sự cố đã duyệt ghi rõ và người vận hành đã xác minh bookmark kết quả. Lưu bookmark mới và bookmark cũ ở nơi an toàn. Bookmark cũ là điểm rollback; không hủy nó cho đến khi phục hồi qua bước xác minh và chủ sở hữu chấp nhận kết quả.

Sau lệnh, giữ HRM đóng. Kiểm tra phiên bản schema/migration, bảng và index bắt buộc, số lượng nhân viên và kỳ làm việc, workflow đang mở, tính liên tục của audit, legal hold và quyền tài khoản dùng chung hiện tại. Database sau phục hồi có thể cũ hơn một lần thu hồi quyền thành viên; phải đối chiếu lại với nguồn tài khoản hiện hành trước khi cấp quyền trở lại. Không phát hành payslip hoặc chạy tác vụ lưu giữ tệp trong bước này.

### Phục hồi và đối soát R2

1. Chỉ khôi phục từ bản sao riêng tư đã được duyệt. Giữ đích ở trạng thái riêng tư, không mở URL công khai. Không ghi đè khóa production hiện có cho đến khi hai người rà soát đúng tệp và checksum.
2. Với từng dòng D1 đại diện cho tệp còn hiệu lực, xác minh đúng object R2 tồn tại và SHA-256 cùng kích thước byte khớp với `hrm_files`. Giữ MIME type, tên tệp gốc, legal hold và metadata xóa theo trạng thái D1 đã duyệt; không suy đoán chúng từ object key.
3. Đối soát cả hai chiều: dòng D1 không có object tương ứng, và object R2 không khớp dòng D1 còn hiệu lực hoặc tombstone đã duyệt. Cách ly mọi sai lệch. Không công khai orphan chỉ vì tên tệp trông quen thuộc; không dọn orphan cho đến khi chủ sở hữu hồ sơ/pháp lý giải quyết.
4. Kiểm tra ranh giới quyền A/B bằng tài khoản tổng hợp, việc chặn manager khỏi thông tin định danh/lương/lý do riêng tư, legal hold, điều kiện xóa theo thời hạn và tải tệp qua route ứng dụng. Truy cập URL bucket trực tiếp không phải bài kiểm tra chấp nhận.
5. Log thông thường chỉ ghi số lượng và tổng số checksum khớp. Manifest chi tiết nối ID người với object phải nằm riêng tư, có kiểm soát truy cập.

### Mở lại hệ thống và rollback

Chỉ mở HRM sau khi người xác minh độc lập xác nhận mốc D1, kết quả đối soát checksum D1/R2, các lần thu hồi quyền hiện tại, legal hold, quyền truy cập và smoke test. Chủ sở hữu phải chấp nhận rõ khoảng dữ liệu có thể mất. Nếu hồ sơ, quyền hoặc tệp không khớp, tiếp tục giữ HRM đóng rồi phục hồi bookmark D1 đã lưu hoặc làm theo kế hoạch sửa object được duyệt; không tự ý thực hiện lần phục hồi thứ hai.

## Diễn tập phục hồi bằng dữ liệu tổng hợp

Diễn tập tự động được triển khai tại [`tests/integration/hrm-recovery-drill.mjs`](../../../tests/integration/hrm-recovery-drill.mjs) và chạy qua `npm run test:integration:hrm:p5`. Test export trạng thái D1 `lumi-jobs` tổng hợp, sao lưu object HRM từ R2 vào thư mục tạm riêng tư, rồi phục hồi D1/R2 vào một Worker cục bộ biệt lập trong khi giữ trạng thái tài khoản EmDash hiện hành. Sau đó test đối soát checksum/metadata, legal hold, quyền tải riêng tư, thu hồi tài khoản sau mốc backup, phát hiện object thiếu và object mồ côi. Chỉ chạy với D1/R2 cục bộ dùng một lần và tài khoản EmDash giả lập. Xem [`STATUS.md`](STATUS.md) để biết kết quả trên head mới nhất; có test hoặc từng chạy xanh không đồng nghĩa cổng hiện tại đã đạt.

Khi diễn tập thủ công bằng dữ liệu giả, dùng trình tự sau. Tuyệt đối không dùng dữ liệu production:

1. Tạo hai nhân viên tổng hợp, HRM Officer/Admin và một manager. Tạo tệp riêng cho A, gắn legal hold, rồi tạo tệp riêng cho B; ghi metadata D1 và hash SHA-256 vào artifact kiểm thử tạm thời, riêng tư.
2. Sao lưu D1 cục bộ và chép đúng object R2 sang một đích phục hồi biệt lập. Ghi hash manifest và thời điểm sao lưu. Xóa hoặc làm hỏng một bản sao dùng một lần để kiểm tra khả năng phát hiện lỗi; không đụng vào fixture nguồn.
3. Phục hồi trạng thái D1 và object đã lưu vào môi trường biệt lập mới; xác minh quyền A/B, trạng thái hold, checksum metadata/bytes, phát hiện tệp thiếu và orphan. Xác nhận quyền cũ/đã thu hồi không bị khôi phục và mọi tệp kiểm thử vẫn riêng tư.
4. Ghi lại output lệnh, commit kiểm thử, tập migration D1, số lượng object/checksum R2, thời gian thực hiện và kết quả dọn dẹp. Không đưa tên nhân viên, định danh thật, object key hay bytes của tệp vào báo cáo được commit.

Một diễn tập tổng hợp đạt yêu cầu chỉ chứng minh quy trình cục bộ. Khả năng phục hồi production vẫn `UNPROVEN` cho đến khi chủ sở hữu phê duyệt RPO/RTO, cơ chế và thời hạn giữ bản sao R2 riêng tư, người có quyền phục hồi production và một lần thử phục hồi được phê duyệt riêng.

## Các quyết định vận hành còn thiếu

- Ai sở hữu backup/restore D1, RPO và RTO nào được duyệt, ai có quyền phê duyệt phục hồi ghi đè database.
- Đích backup R2 riêng, tần suất sao chép, phân tách quyền, manifest checksum, xử lý retention/legal hold và thẩm quyền phục hồi.
- Thời hạn lưu được chủ sở hữu duyệt và căn cứ pháp lý cho từng loại tệp cùng hồ sơ HRM có cấu trúc.
- Khi đối chiếu quyền sau restore, EmDash/Workspace có phải nguồn chuẩn cho các lần thu hồi phát sinh sau mốc phục hồi hay không.
- Nơi lưu bằng chứng và các bước phê duyệt bắt buộc cho báo cáo sự cố.

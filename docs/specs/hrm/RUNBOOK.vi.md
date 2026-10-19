# HRM — Quy trình sự cố, lưu giữ và phục hồi dữ liệu

**Rà soát:** 2026-10-17 theo tài liệu Cloudflare D1 và R2 hiện hành. **Trạng thái:** bản thảo quy trình vận hành. Tài liệu này chưa xác lập backup coverage, thời hạn lưu đã duyệt, mục tiêu phục hồi hoặc người có thẩm quyền phục hồi; không chứng minh dữ liệu production có thể phục hồi.

[English](RUNBOOK.md)

Quy trình này áp dụng cho tệp và hồ sơ HRM trong cơ sở dữ liệu D1 `lumi-jobs` và binding R2 riêng tư `FILES` (`lumi-job-files`). Trạng thái tài khoản EmDash được lưu riêng trong `lumi-content`; quyền thành viên Workspace và hồ sơ HRM nằm trong `lumi-jobs`. Cấu hình hiện không khai báo một binding R2 dự phòng riêng. Trước mọi thao tác production, hãy xác minh bằng môi trường Cloudflare đã xác thực: tài khoản, backend cơ sở dữ liệu, bucket, phiên bản Worker và khu vực pháp lý đang áp dụng. Cấu hình trong repository không chứng minh tài nguyên nào đang phục vụ traffic.

## Người có thẩm quyền và điều kiện dừng

- HRM Admin điều phối sự cố dữ liệu nhân sự. System Super Admin kiểm soát quyền Workspace dùng chung. Chủ tài khoản Cloudflare hoặc người vận hành hạ tầng được ủy quyền chịu trách nhiệm phục hồi D1/R2. Sự cố payroll cần thêm chủ sở hữu payroll và một người rà soát độc lập.
- Không phục hồi, xóa, đổi thời hạn lưu, phát hành payslip hay xác nhận khoản thanh toán bằng dữ liệu thật nếu chủ sở hữu chưa phê duyệt chính xác thao tác, đích và thời điểm đó. Không thử quy trình bằng hồ sơ nhân viên thật hoặc bằng bản sao lưu production đưa vào môi trường thử nghiệm.
- Chỉ kích hoạt HRM sau khi đã duyệt pháp nhân, mục đích, thời hạn lưu, phương thức ký, lịch làm việc, chính sách payroll và trách nhiệm phục hồi. Cờ tính năng không thay thế các quyết định này và cũng không chứng minh khả năng phục hồi.
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
3. Trước khi phục hồi mốc cũ, giữ export `lumi-jobs` tại **thời điểm hiện tại** trong kho riêng được duyệt. Export D1 đầy đủ chứa dữ liệu HRM/ATS/CRM/payroll riêng tư và có thể làm gián đoạn truy vấn trong lúc tạo. Dùng `umask 077`; chỉ lưu tại kho phục hồi được phép. Không commit export, manifest, định danh hoặc thông tin đăng nhập vào Git.

Tạo thư mục phục hồi ngoài checkout, chỉ chủ sở hữu truy cập. Lưu export D1 hiện hành và danh sách ID/tên EmDash role 50 đang hoạt động tại đó; nội dung các tệp là dữ liệu riêng tư:

```sh
: "${PRIVATE_RECOVERY_DIR:?Chọn đường dẫn riêng theo sự cố, nằm ngoài repository}"
umask 077
mkdir -p -m 0700 "$PRIVATE_RECOVERY_DIR"
./node_modules/.bin/wrangler d1 export lumi-jobs --remote --output "$PRIVATE_RECOVERY_DIR/current-lumi-jobs.sql"
./node_modules/.bin/wrangler d1 execute lumi-content --remote --command "SELECT id,name FROM users WHERE role=50 AND disabled=0" --json > "$PRIVATE_RECOVERY_DIR/current-system-admins.json"
```
4. Xác nhận có bản sao R2 riêng cho mọi object đang hoạt động trong `hrm_files` thuộc phạm vi phục hồi, gồm bytes và SHA-256. Nếu thiếu bản sao, quy trình này không thể khôi phục bytes đó; ghi nhận thiếu hụt và dừng trước khi mở quyền truy cập.
5. Trước khi khôi phục Time Travel trực tiếp, bật biến Worker production `WORKSPACE_RESTORE_MODE=true` theo thay đổi phục hồi Cloudflare đã được duyệt và phát hành phiên bản đó. Xác minh các trang/API riêng tư EN/VI của Workspace, Hiring, CRM, Finance và HRM đều trả 503 kèm `private, no-store` và `nosniff`. Hàng rào này không chặn `/jobs` và `/vi/jobs`, nhưng D1 có thể tạm thời không phục vụ khi đang restore; chỉ xác minh hai trang này với database production sau khi D1 hoạt động lại. Thao tác ghi hồ sơ ứng tuyển (`POST /api/jobs/<slug>/apply`) tạm dừng khi hàng rào bật. Hàng rào cũng bỏ qua mọi scheduled Worker task. Tạm dừng Workers Builds/main auto-deploy trong cửa sổ phục hồi để deploy khác không gỡ hàng rào. Chưa chạy Time Travel nếu Worker chưa thực sự trả trạng thái maintenance. Giữ biến này bật suốt bước đối soát D1/R2.
6. Đối chiếu timestamp D1 dự kiến với phạm vi bản sao R2. Thống nhất cách giữ hoặc phát lại sự kiện mới hơn mốc restore. Nếu chưa có quyết định được duyệt cho phần phát sinh mới, dừng lại.

### Phục hồi D1 (cần chủ sở hữu phê duyệt riêng)

Lệnh sau có tính phá hủy dữ liệu. Không chạy trong CI thường lệ, kiểm thử cục bộ, review PR nháp hoặc khi chỉ đang xuất bản tài liệu này:

```sh
./node_modules/.bin/wrangler d1 time-travel restore lumi-jobs --bookmark="<owner-approved-bookmark>"
```

Chỉ dùng timestamp khi kế hoạch sự cố đã duyệt ghi rõ và người vận hành đã xác minh bookmark kết quả. Lưu bookmark mới và bookmark cũ ở nơi an toàn. Bookmark cũ là điểm rollback; không hủy nó cho đến khi phục hồi qua bước xác minh và chủ sở hữu chấp nhận kết quả.

Sau khi phục hồi, giữ HRM đóng và áp dụng các migration D1 hiện hành trước khi đối soát quyền. Export D1 sau restore thành tệp SQL riêng, quyền 0600 trong kho bảo mật. Xác minh actor System Super Admin qua danh sách tài khoản EmDash vẫn hiện hành, rồi tạo patch kiểm tra từ export hiện tại và export vừa phục hồi:

```sh
umask 077
node scripts/reconcile-workspace-restore.mjs \
  --current "$PRIVATE_RECOVERY_DIR/current-lumi-jobs.sql" \
  --restored "$PRIVATE_RECOVERY_DIR/restored-lumi-jobs.sql" \
  --output-dir "$PRIVATE_RECOVERY_DIR/workspace-authority-patches" \
  --operator-id "<id-system-super-admin-hien-hanh-da-xac-minh>" \
  --operator-name "<ten-system-super-admin-hien-hanh-da-xac-minh>"
```

Trước lệnh này, người thao tác phải xác minh độc lập tài khoản EmDash đang hoạt động với role 50 và truyền đúng ID/tên làm actor cho sự kiện khóa/khôi phục trong `workspace_audit`. Người xác minh đối chiếu checksum và số lượng trong manifest. Patch SQL có dữ liệu riêng phải được giữ bảo mật. Áp dụng từng patch theo thứ tự tên, chỉ chuyển sang bước kế tiếp khi D1 trả thành công:

```sh
for patch in "$PRIVATE_RECOVERY_DIR"/workspace-authority-patches/*.sql; do
  ./node_modules/.bin/wrangler d1 execute lumi-jobs --remote --file="$patch"
done
```

Patch đầu tiên đóng HRM, tắt membership đã phục hồi và xóa role snapshot cũ. Hàng rào Worker vẫn phải bật trong toàn bộ chuỗi patch. Các patch tiếp theo khôi phục membership/role hiện hành, audit Workspace nối tiếp, hold còn hiệu lực và lifecycle event. Sự kiện khóa và mở lại membership ghi System Super Admin hiện hành làm actor. Patch cuối chỉ bật tài khoản có trạng thái bật trong snapshot hiện hành. HRM vẫn tắt/chưa duyệt sau đối soát; owner phải rà soát lại. Nếu schema, danh tính, audit bất biến hoặc hold xung đột, dừng và giữ trạng thái khóa. Nếu chuỗi patch lỗi giữa chừng, membership vẫn tắt cho đến khi patch cuối chạy. Không dùng `--admin` để bỏ các guard này. Chỉ khi người xác minh chấp nhận checksum patch, cổng HRM, holds, R2 và smoke test thì owner mới được gỡ hàng rào phục hồi. Giữ `hrm_settings.enabled=0` và `reviewed_by=NULL`; chỉ bỏ lệnh đóng Workers Builds sau khi xác minh release tiếp theo không âm thầm mở HRM. Nếu có bước nào lỗi, giữ `WORKSPACE_RESTORE_MODE=true`.

Sau đó, kiểm tra migration/schema, bảng/index, số nhân viên/đợt làm việc, workflow đang mở, audit, lịch sử đặt/gỡ legal hold và grant Workspace hiện hành. D1 phục hồi có thể cũ hơn lần thu hồi quyền; snapshot Workspace hiện hành là nguồn role sau restore, EmDash vẫn xác minh tài khoản còn hoạt động. Không phát hành payslip hoặc chạy xóa theo retention ở bước này.

### Phục hồi và đối soát R2

1. Chỉ khôi phục từ bản sao riêng tư đã được duyệt. Giữ đích ở trạng thái riêng tư, không mở URL công khai. Không ghi đè khóa production hiện có cho đến khi hai người rà soát đúng tệp và checksum.
2. Với từng dòng D1 đại diện cho tệp còn hiệu lực, xác minh đúng object R2 tồn tại và SHA-256 cùng kích thước byte khớp với `hrm_files`. Giữ MIME type, tên tệp gốc, legal hold và metadata xóa theo trạng thái D1 đã duyệt; không suy đoán chúng từ object key.
3. Đối soát cả hai chiều: dòng D1 không có object tương ứng, và object R2 không khớp dòng D1 còn hiệu lực hoặc tombstone đã duyệt. Cách ly mọi sai lệch. Không công khai orphan chỉ vì tên tệp trông quen thuộc; không dọn orphan cho đến khi chủ sở hữu hồ sơ/pháp lý giải quyết.
4. Kiểm tra ranh giới quyền A/B bằng tài khoản tổng hợp, việc chặn manager khỏi thông tin định danh/lương/lý do riêng tư, legal hold, điều kiện xóa theo thời hạn và tải tệp qua route ứng dụng. Truy cập URL bucket trực tiếp không phải bài kiểm tra chấp nhận.
5. Log thông thường chỉ ghi số lượng và tổng số checksum khớp. Manifest chi tiết nối ID người với object phải nằm riêng tư, có kiểm soát truy cập.

### Mở lại hệ thống và rollback

Chỉ mở HRM sau khi người xác minh độc lập xác nhận mốc D1, kết quả đối soát checksum D1/R2, các lần thu hồi quyền hiện tại, legal hold, quyền truy cập và smoke test. Chủ sở hữu phải chấp nhận rõ khoảng dữ liệu có thể mất. Nếu hồ sơ, quyền hoặc tệp không khớp, tiếp tục giữ HRM đóng rồi phục hồi bookmark D1 đã lưu hoặc làm theo kế hoạch sửa object được duyệt; không tự ý thực hiện lần phục hồi thứ hai.

## Diễn tập phục hồi bằng dữ liệu tổng hợp

Diễn tập tự động ở [`tests/integration/hrm-recovery-drill.mjs`](../../../tests/integration/hrm-recovery-drill.mjs), chạy qua `npm run test:integration:hrm:p5`. Test chụp D1/R2 giả lập vào thư mục tạm riêng tư, sau mốc backup thu hồi một Workspace member còn EmDash active và đặt hold PDF quyết toán qua Worker thật, rồi phục hồi D1/R2 vào Worker local biệt lập. Test chụp Workspace authority hiện hành, tạo patch bằng cùng SQL builder, áp dụng vào D1 cô lập và xác minh membership/role, audit thu hồi, hold/lịch sử, checksum cùng cổng HRM vẫn đóng. Unit test riêng kiểm tra hold đặt rồi gỡ sau backup. Chỉ chạy với D1/R2 cục bộ dùng một lần và EmDash users giả lập. Xem [`STATUS.md`](STATUS.md) để biết kết quả mới nhất; một lần PASS cũ không chứng minh gate hiện tại.

Khi diễn tập thủ công bằng dữ liệu giả, dùng trình tự sau. Tuyệt đối không dùng dữ liệu production:

1. Tạo hai nhân viên tổng hợp, HRM Officer/Admin và một manager. Tạo tệp riêng cho A, gắn legal hold, rồi tạo tệp riêng cho B; ghi metadata D1 và hash SHA-256 vào artifact kiểm thử tạm thời, riêng tư.
2. Sao lưu D1 cục bộ và chép đúng object R2 sang một đích phục hồi biệt lập. Ghi hash manifest và thời điểm sao lưu. Xóa hoặc làm hỏng một bản sao dùng một lần để kiểm tra khả năng phát hiện lỗi; không đụng vào fixture nguồn.
3. Phục hồi trạng thái D1 và object đã lưu vào môi trường biệt lập mới; xác minh quyền A/B, trạng thái hold, checksum metadata/bytes, phát hiện tệp thiếu và orphan. Xác nhận quyền cũ/đã thu hồi không bị khôi phục và mọi tệp kiểm thử vẫn riêng tư.
4. Ghi lại output lệnh, commit kiểm thử, tập migration D1, số lượng object/checksum R2, thời gian thực hiện và kết quả dọn dẹp. Không đưa tên nhân viên, định danh thật, object key hay bytes của tệp vào báo cáo được commit.

Một diễn tập tổng hợp đạt yêu cầu chỉ chứng minh quy trình cục bộ. Khả năng phục hồi production vẫn `UNPROVEN` cho đến khi chủ sở hữu phê duyệt RPO/RTO, cơ chế và thời hạn giữ bản sao R2 riêng tư, người có quyền phục hồi production và một lần thử phục hồi được phê duyệt riêng.

## Biên bản bàn giao tài sản

Nhân viên có thể tải PDF sau khi ghi nhận đã bàn giao trực tiếp tài sản được giao cho HR. HRM có thể tải biên nhận nhận lại khi assignment đang chờ thu hồi vật lý. PDF được gắn với đúng assignment và lưu trong R2 riêng tư dưới loại `asset_evidence`; route kiểm tra chữ ký/kích thước PDF, lưu checksum và actor, kế thừa legal hold theo người/danh mục nếu có, và không tự đặt ngày đến hạn xóa khi owner chưa duyệt chính sách retention.

Tệp mới ở trạng thái cách ly. Người tải lên được tải lại tệp của mình; quyền còn lại tuân theo scope nhân viên/tài sản và capability review. Chỉ HRM Admin hoặc System Super Admin được duyệt/từ chối; người tải lên và người giao tài sản không được tự rà soát. Hãy xác minh giấy tờ đúng nhân viên, tài sản và lần bàn giao thực tế trước khi duyệt. Có PDF không tự chứng minh tài sản đã trả: HR phải ghi nhận tình trạng vật lý và đóng assignment. Giữ task offboarding mở khi assignment còn hoạt động; không miễn bước để lách việc thiếu biên nhận.

Task thu hồi tài sản trong offboarding liệt kê từng assignment đang mở của đúng đợt làm việc, gồm mã tài sản, loại, tình trạng và số PDF chứng cứ, không hiển thị serial number. Mỗi liên kết là bất biến và migration gắn bổ sung các assignment đã mở trước đó. Một task có thể bao phủ nhiều tài sản, nhưng chỉ hoàn tất khi mọi assignment liên quan đã trả, hủy hoặc được xử lý hợp lệ.

Nếu PDF sai hoặc gắn nhầm assignment, dừng review và tải xuống, giữ audit/checksum, rồi làm theo quy trình sự cố ghép nhầm người/tệp ở trên. Không sửa hoặc chuyển liên kết chứng từ bất biến; yêu cầu tải lại theo đúng assignment. Không tự đặt thời hạn retention hoặc gỡ legal hold chỉ để dọn hàng chờ.

## Nhắc hạn đào tạo và chứng chỉ

Quản lý offset tại Thiết lập HRM bằng tài khoản HRM Admin hoặc System Super Admin. Mỗi phiên bản policy nhận 1–12 mốc ngày tường minh trong khoảng -365 đến 365: số dương là trước hạn, 0 là đúng hạn và số âm là sau hạn. Không có mốc cài sẵn. Người tạo không thể tự rà soát hoặc kích hoạt; ghi lý do rà soát cụ thể. Kích hoạt còn yêu cầu pháp nhân HRM đã cấu hình và đang bật. Giữ production HRM đóng cho đến khi owner duyệt thời hạn lưu và cách áp dụng legal hold cho dữ liệu nhắc hạn.

Worker Cron hiện có chạy lúc 08:40 giờ Việt Nam. Job xét hạn hoàn thành của assignment đang assigned/submitted và hạn gia hạn của assignment approved. Chỉ nhân viên được liên kết và tài khoản HR Workspace đang hoạt động đã giao assignment mới nhận nhắc trong ứng dụng. Job không gửi email, Lark hay webhook. Chạy lại Cron trong cùng ngày là an toàn. HRM Admin có thể chạy cùng sweep có giới hạn trong Thiết lập khi cả HRM và `HRM_LIVE_ENABLED` đang bật.

Người nhận đánh dấu hộp nhắc của mình đã xem tại `/vi/hrm/me/training` hoặc `/vi/hrm/training`. Nếu nhắc có vẻ cũ, kiểm tra policy đang active đúng pháp nhân, offset tường minh, trạng thái/ngày assignment và tài khoản EmDash cùng membership Workspace của người nhận. Nhắc hoàn thành chưa đọc được resolve khi assignment hoàn tất, bị từ chối hoặc hủy. Nhắc gia hạn resolve nếu ngày gia hạn đổi hoặc assignment mới của cùng khóa học thay thế assignment cũ. Thay policy sẽ retire phiên bản trước nhưng giữ nguyên reminder đã phát sinh từ phiên bản đó. Không tạo thêm assignment chỉ để chạy lại nhắc; khóa duy nhất gồm assignment, người nhận, loại hạn, ngày và offset.

Thời hạn lưu và legal hold cho reminder chưa được owner phê duyệt hoặc có luồng disposition riêng. Không xóa thủ công hàng reminder/event và không tự suy ra thời hạn production.

## Snapshot và lịch báo cáo tổng hợp

Chỉ HRM Admin/System Super Admin được lưu snapshot hoặc tạo, tạm dừng, tiếp tục và kết thúc lịch; HRM Officer được đọc số liệu tổng hợp đã lưu, còn tải CSV vẫn cần `hrm.reports.export`. Truy vấn không lấy tên/ID nhân viên, nội dung vụ việc HR hoặc dữ liệu lương, nhưng tên phòng ban, số đếm nhỏ và chênh lệch giữa các lần chụp vẫn có thể giúp nhận diện người. Dữ liệu tổng hợp chưa được chứng minh là đã ẩn danh. Bộ lọc phòng ban không phải quyền truy cập riêng theo phòng ban.

Mỗi lần lưu/lập lịch phải nhập số ngày nguyên từ 1 đến 36.500 và căn cứ không rỗng; không seed thời hạn hoặc lịch. Service hiện kiểm tra đầu vào, không xác minh phiên bản chính sách báo cáo đã được phê duyệt hay căn cứ pháp lý áp dụng. Thời hạn của lịch áp dụng cho từng snapshot được sinh; bản thân lịch không tự hết hạn hoặc đến kỳ rà soát. Nếu cần đổi phòng ban hoặc căn cứ, kết thúc định nghĩa cũ rồi tạo lịch thay thế. Không đưa tên người, cáo buộc hoặc ý kiến pháp lý vào trường căn cứ.

Worker Cron hằng ngày chạy lúc 08:40 giờ Việt Nam. Daily và weekly thứ Hai chọn tháng hiện tại; monthly ngày đầu tháng chọn tháng trước. Một số nhóm phản ánh trạng thái lúc tạo, còn tài sản luôn tính toàn pháp nhân; đây không phải sổ tái dựng chính xác cuối tháng. Giới hạn 20 lịch active/pháp nhân được kiểm tra khi tạo và tiếp tục bằng guard atomic cùng trigger D1. Nếu dữ liệu cũ vượt giới hạn, sweep ghi `run_failed` và bỏ qua việc xóa/sinh báo cáo thay vì âm thầm lấy 20 dòng đầu. Trước khi chèn snapshot, Cron kiểm tra lại lịch còn active và phiên bản settings HRM vẫn hiện hành. Job chống trùng theo lịch/ngày, không gửi thông báo ngoài và chỉ ghi mã lỗi đã lọc. Xem lần chạy gần nhất tại `/vi/hrm/reports`; pause/retire dừng các lần lập lịch sau và chặn cuộc đua chèn snapshot, nhưng không bảo toàn các snapshot đã có.

`expires_on` bằng ngày ghi nhận tại Việt Nam cộng số ngày đã nhập và vẫn được đọc trong ngày đó: lưu thủ công dùng ngày hiện tại; chụp theo lịch dùng ngày của sự kiện Cron. Job trễ truy vấn dữ liệu lúc xử lý nhưng ghi timestamp được lên lịch, nên không tái dựng trạng thái tại thời điểm trước đó. Quyền đọc thông thường kết thúc từ ngày địa phương kế tiếp sau `expires_on`. Sweep thành công sau đó thay JSON bằng `{}` và xóa checksum về `NULL`, tối đa 1.000 hàng mỗi lần chạy. Metadata, căn cứ, định danh actor và lịch sử event/audit vẫn còn; chưa có luồng xử lý cuối cùng với thời hạn hữu hạn. Bản tải xuống và backup có vòng đời riêng. Không thể khôi phục payload đã hết hạn qua giao diện này.

**Sweep hết hạn chỉ chạy khi settings HRM đã bật/rà soát và `HRM_LIVE_ENABLED` cùng bật; mỗi lệnh xóa D1 kiểm tra lại version settings. Tắt cổng sẽ hoãn các lần xóa sau và chặn sinh mới, nhưng không phải legal hold: snapshot đã quá hạn vẫn có thể bị xóa khi bật lại. Pause/retire và hold theo người/tệp không bảo vệ snapshot báo cáo.** Giữ báo cáo production đóng cho tới khi policy được duyệt và có hold riêng hiệu lực; không dùng công tắc, gia hạn ngày hoặc thời hạn dài thay hold. [Hồ sơ lưu trữ trình phê duyệt](REPORT-RETENTION-DECISION.vi.md) vẫn ở trạng thái PROPOSED.

## Các quyết định vận hành còn thiếu

- Ai sở hữu backup/restore D1, RPO và RTO nào được duyệt, ai có quyền phê duyệt phục hồi ghi đè database.
- Đích backup R2 riêng, tần suất sao chép, phân tách quyền, manifest checksum, xử lý retention/legal hold và thẩm quyền phục hồi.
- Thời hạn lưu được chủ sở hữu duyệt và căn cứ pháp lý cho từng loại tệp cùng hồ sơ HRM có cấu trúc.
- Khi đối chiếu quyền sau restore, EmDash/Workspace có phải nguồn chuẩn cho các lần thu hồi phát sinh sau mốc phục hồi hay không.
- Nơi lưu bằng chứng và các bước phê duyệt bắt buộc cho báo cáo sự cố.
- Mục đích, căn cứ/thời hạn/mốc tính, hold hữu hiệu, chủ sở hữu lịch và vòng đời audit/export/backup riêng của báo cáo: [hồ sơ đề xuất và tiêu chí nghiệm thu](REPORT-RETENTION-DECISION.vi.md). Runbook này không phê duyệt các nội dung đó.
- Thời hạn lưu và cách áp dụng legal hold cho reminder đào tạo phải được owner phê duyệt trước khi kích hoạt policy production.

## Kiểm chứng tích hợp bằng dữ liệu giả

Chạy `npm run test:integration:hrm` để chạy lần lượt P1/P2, P3, P4 và P5 trên cùng một Worker/D1/R2 cục bộ dùng một lần. Các lệnh `:p1`, `:p3`, `:p4` và `:p5` chỉ chọn một pha. Đặt `HRM_BROWSER_BINARY` tới Chrome đã cài và `HRM_BROWSER_ARTIFACT_DIR` tới thư mục tạm riêng tư để chạy kiểm tra trình duyệt EN/VI; nếu thiếu binary, integration đạt không chứng minh hành vi trên trình duyệt. Giữ kết quả TAP từng pha và ảnh chụp cùng nhau. Một lần chạy kết hợp đạt chỉ chứng minh các assertion đã triển khai, chưa bao phủ mọi tổ hợp vai trò/trạng thái hay tính sẵn sàng production.

## Phiếu lương và bản tải riêng tư

Khi owner mở HRM, vào **HRM → Phiếu lương của tôi** (`/vi/hrm/me/payslips`, hoặc `/hrm/me/payslips`). Liên kết tải dùng ngôn ngữ của trang; người phụ trách payroll có liên kết tương ứng trên bàn làm việc payroll. Hai bản đều lấy dữ liệu từ snapshot đã phát hành, gồm tên từng khoản, loại tiền và số chữ số thập phân đã lưu. Trang và bản tải tiếng Việt dùng dấu phân cách số tiếng Việt, không tính lại hay làm tròn số tiền đã ghi nhận.

Snapshot cũ có thể chưa lưu tên tiếng Việt. Bản tải giữ nguyên tên gốc và hiện thông báo; sửa chính sách hiện tại không viết lại phiếu đã phát hành. Bản điều chỉnh vẫn là lần phát hành riêng có liên kết. Xem hoặc tải phiếu không đồng nghĩa đồng ý số tiền hay xác nhận đã trả lương. Nhân viên chỉ tải được phiếu của mình; nhân sự xử lý payroll vẫn cần quyền payroll tương ứng.

Tệp đính kèm là bản HTML được trả như dữ liệu tải xuống, có header ngôn ngữ, header riêng tư/no-store và không kèm giao diện biên tập CMS. Tệp cũng có chính sách nội dung hạn chế và nền sáng rõ ràng để đọc khi mở bản đã lưu. Bản tải chứa thông tin lương: lưu trong nơi riêng tư được phê duyệt và tuân theo chính sách lưu trữ đã được tổ chức rà soát; không công khai. Hướng dẫn này không mở payroll hay xác nhận chính sách tính lương đã được duyệt.

## Thu nhập có hiệu lực cho payroll

Khoản lương thuộc cấu phần `employment_record` phải trỏ tới đúng một phiên bản thu nhập tại **HRM → Payroll → Thu nhập theo hợp đồng có hiệu lực** (`/vi/hrm/payroll#compensation`, `/hrm/payroll#compensation`). HRM Admin nhập mã nhân viên, mã cấu phần, loại tiền, số chữ số thập phân, số tiền chính xác mỗi kỳ lương, ngày hiệu lực và nguồn. Nguồn là hồ sơ hợp đồng lao động hoặc phụ lục đã hoàn tất của cùng đợt làm việc, hoặc số quyết định được lưu ngoài HRM. Một HRM Admin khác hoặc System Super Admin phê duyệt. Không ai được tạo hoặc duyệt thu nhập cho hồ sơ nhân viên của chính mình.

Các phiên bản đã duyệt của cùng một cấu phần và đợt làm việc không được chồng ngày. Để đổi thu nhập, tạo phiên bản mới ghi rõ phiên bản đã duyệt mà nó thay thế; phiên bản mới phải kéo dài tới hết ngày kết thúc của bản cũ. Khi được duyệt, bản cũ bị rút ngắn tới ngày trước ngày bắt đầu mới, hoặc chuyển sang “đã được thay thế” nếu bản mới bắt đầu từ cùng ngày hoặc sớm hơn. Phiếu lương đã phát hành giữ nguyên phiên bản đã dùng; thay đổi hồi tố phải đi qua bản điều chỉnh payroll có liên kết.

Số tiền trên dòng lương phải bằng số tiền đã duyệt và một phiên bản phải phủ trọn kỳ lương. Kỳ không có phiên bản, phiên bản bắt đầu/kết thúc giữa kỳ hoặc có hai phiên bản trong kỳ đều bị chặn vì chưa có quy tắc chia theo ngày. Bước tính lưu mã phiên bản, ngày hiệu lực và loại nguồn vào snapshot của kỳ. Rà soát, phê duyệt và phát hành sẽ thất bại nếu phiên bản không còn phủ dòng lương. Người rà soát hoặc phê duyệt kỳ không được là người đã nhập dòng lương trong kỳ, người tạo phiên bản thu nhập được dùng hoặc người được trả lương trong kỳ.

Đây là kiểm soát truy vết nguồn, không phải phép tính lương theo luật, thuế, bảo hiểm, làm thêm giờ hay hoa hồng. Vẫn cần quy tắc chia theo ngày và quy tắc lương được owner duyệt, cùng một kỳ chạy song song được kiểm tra độc lập, trước khi mở payroll.

## Hoa hồng CRM trong payroll

Hoa hồng ghi nhận trong CRM chưa phải là lương. Với người có loại người bán là Nhân viên vào cuối tháng, Tài chính mở **CRM → Hoa hồng → Chuyển sang payroll HRM** và xác nhận tháng đó. CRM cố định các dòng đã đủ điều kiện trong tháng theo chính sách đã duyệt, với số tiền do CRM tính; không ai nhập tay tổng tiền. Mỗi dòng chỉ nằm trong một bản chuyển còn hiệu lực. Một người trong một tháng chỉ đi một kênh: hoặc chuyển payroll, hoặc ghi chi thủ công trong CRM. D1 chặn cả hai chiều.

Trong payroll, cấu phần có nguồn `crm_commission` (VND, độ chính xác 0) nhận bản chuyển đã xác nhận của chính tài khoản EmDash của nhân viên và đúng một tháng dương lịch của kỳ, với đúng số tiền. HRM chỉ đọc mã bản chuyển, tháng, tổng và số dòng. Khách hàng, cơ hội và sổ thu không bao giờ đi vào payroll hay phiếu lương. Một bản chuyển chỉ được một kỳ dùng; sau khi phát hành, nó nằm trên đúng một phiếu lương hiện hành. Bản điều chỉnh có liên kết được mang tiếp, còn một kỳ thường khác không được trả lại lần nữa. Khi payroll đã dùng, Tài chính không còn hủy được bản chuyển. Hoàn tiền phát sinh sau đó không tự trừ lương; phải quyết định qua bản điều chỉnh hoặc thu hồi có rà soát.

Hoa hồng chưa có vẫn là chưa biết, không phải số 0. Cách tính thuế, chính sách hoa hồng đã duyệt và kỳ chạy song song payroll vẫn cần owner và người phụ trách chuyên môn phê duyệt trước khi dùng thật.

## Xử lý xóa tệp khi vai trò thay đổi

Quy trình xóa tệp dùng ba người khác nhau: người tạo yêu cầu, người rà soát độc lập và System Super Admin thực hiện xóa. Được nâng quyền hoặc có nhiều vai trò không miễn điều kiện này, kể cả khi tiếp tục một lần xóa đang dở. Phải chặn người tạo hoặc người rà soát đóng vai người thực hiện trước khi giữ chỗ hay xóa object R2; ràng buộc D1 ở bước cuối không bảo vệ được bytes đã bị xóa. Lần từ chối phải giữ nguyên trạng thái yêu cầu, metadata và object vẫn tải được. Dùng người thực hiện độc lập có quyền; không xóa object thủ công để vượt hàng đợi.

Nếu đã thử xóa nhưng bước hoàn tất D1 lỗi, tombstone metadata còn null không chứng minh bytes R2 vẫn còn. Giữ bằng chứng thực hiện và đối soát object R2 riêng tư, yêu cầu cùng audit theo quy trình sự cố đã duyệt trước khi cho phép xử lý tiếp. Phục hồi production vẫn cần chủ sở hữu phê duyệt riêng. Phản hồi 401 khi chưa đăng nhập và 403 khi chưa là Workspace member từ API HRM riêng tư cũng phải có `Cache-Control: private, no-store`; chỉ đúng mã HTTP chưa đủ để đạt kiểm tra header riêng tư. Biểu mẫu retention và trang trả lỗi giữ đúng ngôn ngữ giao diện nhân viên/HR.

## Lưu giữ và xử lý dữ liệu quyết toán

Bảng tài chính tại **HRM → Lưu trữ và legal hold** chỉ dành cho tài khoản hiện còn quyền duyệt payroll, quản lý nghỉ việc và quyền lưu trữ tương ứng. Nhân sự chỉ có quyền rà soát HR thông thường không tải siêu dữ liệu chính sách, nguồn, hồ sơ hay yêu cầu tài chính. Có thể chuẩn bị cấu hình khi HRM đang đóng; chưa mở xử lý dữ liệu nhân viên. Hệ thống không tạo sẵn thời hạn hoặc chính sách tài chính đang hiệu lực. Chọn DOCX đã được rà soát độc lập, đúng pháp nhân, ngày hiệu lực rõ ràng, mục đích và căn cứ cho từng danh mục. Để trống cả hạn lẫn mốc nghĩa là chưa lên lịch. Thời hạn đã cấu hình dùng ngày lịch Việt Nam (UTC+7), với mốc đợt làm việc, hồ sơ nghỉ việc hoặc bản ghi được chọn rõ ràng.

Khi được phép sử dụng, chọn hồ sơ, kiểm tra chứng cứ và legal hold, rồi đề nghị xử lý đúng phiên bản PDF hoặc dossier theo chính sách còn hiệu lực. Người đề nghị, người rà soát độc lập và System Super Admin thực hiện phải là ba người khác nhau. Máy chủ kiểm tra lại quyền EmDash/Workspace hiện hành, danh tính chủ thể, phiên bản dữ liệu, chính sách/nguồn, ngày đến hạn và legal hold. Hồ sơ, dữ liệu hoặc chính sách thay đổi sẽ chặn yêu cầu đang chờ; cần đánh giá lại và lập yêu cầu mới. Không gỡ yêu cầu bảo toàn còn thực tế chỉ để xóa kịp hạn lưu.

Xóa PDF chỉ xóa nội dung riêng tư của tệp đó khỏi R2. Xử lý dossier xóa JSON riêng tư về cơ sở quyết toán, checklist, chứng cứ miễn quyết toán và lý do rà soát, kể cả bản sao trực tiếp của lý do trong sự kiện quyết định. Checksum gốc, người/thời gian phê duyệt, tham chiếu quyết định tối thiểu và kết quả nghiệp vụ lịch sử được giữ lại. Thao tác không xóa PDF có vòng đời riêng, ghi chú độc lập, nguồn payroll gốc, hồ sơ danh tính, lịch sử kiểm toán hoặc bản sao lưu cũ. Cả hai luồng đều không mở lại quyền của nhân viên đã nghỉ. Thay đổi tài chính hoặc danh tính thực tế sau đó vẫn làm quyết định cũ mất hiệu lực theo quy trình thường.

Binding R2 riêng tư hiện có lưu thêm bản ghi kiểm soát tối thiểu chỉ chuyển tiến, nằm ngoài tiền tố nội dung `hrm/`. Không sao chép đè hoặc xóa các bản ghi kiểm soát này khi phục hồi nội dung. Kiểm soát thiếu, chưa đăng ký xong, đang xóa hoặc sai định dạng khiến nội dung tương ứng chưa khả dụng; bản ghi D1 hay byte PDF phục hồi không xác lập được quyền hiện hành. Tải lên dùng đăng ký có điều kiện và nonce tạm có điều kiện để một lần ghi chậm không tạo lại nội dung đã xóa. Cơ chế này bảo vệ cùng định danh đã đăng ký; bản sao mang ID mới, dữ liệu dẫn xuất và xóa bản sao lưu rộng hơn vẫn cần hoàn thiện vòng đời, chưa được luồng này chứng minh.

Thao tác đi qua cả D1 và R2 nên không suy ra hoàn tất từ một dòng dữ liệu. Lỗi xóa PDF giữ trạng thái cần thử lại cho đến khi kiểm soát đã xóa và dấu xóa D1 khớp nhau. Dossier có thể đã xóa nội dung D1 trong một giao dịch nhưng kiểm soát vẫn đang xóa: hàng đợi nêu rõ cần đối soát. System Super Admin độc lập, còn quyền hiện hành có thể hoàn tất đối soát một lần xóa đã chứng minh mà không mở HRM hoặc xóa thêm dữ liệu. Không xóa marker, sửa người/thời gian quyết định hoặc tạo lần xóa mới để che thao tác bị gián đoạn. Áp dụng lại quyền hiện hành khi phục hồi toàn bộ D1 cũ, xóa bản sao lưu/dẫn xuất độc lập và mục tiêu phục hồi production vẫn là các gate riêng chưa được phê duyệt.

# Rà soát quyết toán khi nghỉ việc

Trạng thái: cấu hình chính sách đã phát hành; phần hồ sơ theo nhân viên đang được kiểm chứng. Đây chưa phải chính sách nghiệp vụ được phê duyệt. Production tiếp tục đóng. [English](PAYROLL-CLOSEOUT.md).

Bước quyết toán trong offboarding cần hồ sơ hiện hành được duyệt độc lập. Chỉ một ghi chú hoàn tất không chứng minh được việc đối soát. Số dư đã ghi nhận bằng không không tự chứng minh phép tồn, tạm ứng, chi phí hay nghĩa vụ thuế/bảo hiểm/bên ngoài đã được giải quyết hoặc không áp dụng.

## Luồng bắt buộc

1. Người có quyền cấu hình HRM chuẩn bị phiên bản chính sách closeout theo pháp nhân, tham chiếu phiên bản/checksum nguồn DOCX riêng tư đã được rà soát độc lập. Owner cung cấp mục đích, phạm vi pháp luật, khoảng hiệu lực hữu hạn và checklist EN/VI có giới hạn. Không tạo sẵn nhóm nghĩa vụ pháp lý, số tiền, tỷ lệ, thời hạn, miễn trừ hay chính sách production. Mỗi mục có mã, tên/hướng dẫn và lựa chọn rõ có cho phép kết luận không áp dụng với bằng chứng độc lập hay không. Không có payroll được ghi nhận là chưa biết: chỉ chính sách cho phép tường minh và bằng chứng được duyệt độc lập mới xác lập được miễn trừ.
2. Quản trị HRM có quyền tài chính lập hồ sơ đối soát cho đúng người/đợt làm việc/ngày kết thúc. Hồ sơ đóng băng phiên bản chính sách, dữ liệu công/kỳ lương/khiếu nại/thanh toán đã ghi nhận và revision/fingerprint nguồn, cùng kết luận, căn cứ và tham chiếu PDF đã kiểm tra cho mọi mục bắt buộc. Tệp phải còn, đã được người khác uploader kiểm tra, khớp checksum và thuộc quyền đọc của actor; không nhận public media CMS hay tệp của người khác. Rà soát PDF ghi nhận việc con người kiểm tra, không xác thực giao dịch ngân hàng hay tính tuân thủ pháp luật.
3. HRM Admin/System Super Admin khác người lập rà soát hồ sơ. Nhân viên là chủ thể, người lập và tài khoản đã mất quyền không được duyệt. Thiếu/tệp cũ, cách ly, đã xóa hoặc chờ disposition; sai danh tính/pháp nhân/employment; khiếu nại chưa giải quyết; kỳ thiếu/chưa đóng; thiếu hoặc thừa tiền; nguồn công cũ/chưa khóa; và thiếu kỳ cuối cần có đều chặn duyệt. Nguồn tài chính đã ghi nhận phải khớp chính xác. Việc áp dụng nghĩa vụ bên ngoài vẫn là quyết định tường minh của con người, có căn cứ theo chính sách được duyệt.
4. Người duyệt độc lập ghi hoàn tất tác vụ offboarding chỉ từ hồ sơ hiện hành đã duyệt, có xác nhận rõ, actor và thời gian UTC phía server. Kiểm tra lại capability/membership, chính sách/revision hồ sơ, case/employment và nguồn trong cùng batch ghi D1. Không có miễn trừ bằng ghi chú tự do, không ngầm coi unknown là không, không tự trả tiền, nộp thuế, provision hay cấp quyền. Không tạo xác nhận thay nhân viên.
5. Giữ bất biến lịch sử hồ sơ, checklist, tệp và căn cứ. Payroll correction, thanh toán, mở lại khiếu nại hoặc đổi nguồn công/danh tính liên quan phải làm mất hiệu lực phê duyệt đang chờ. Nếu đã hoàn tất, cần công việc theo dõi/mở lại rà soát tài chính rõ ràng, không viết lại bằng chứng cũ và không khôi phục quyền nhân viên. Race chỉ cho hoàn tất hợp lệ trước rồi vô hiệu hóa, hoặc từ chối hoàn tất trên nguồn cũ; không để phê duyệt hiện hành trỏ tới dữ liệu cũ.

## Giao diện và phạm vi

Chuẩn bị/rà soát chính sách có EN/VI và tách khỏi mở cổng toàn HRM. Người có quyền tài chính thấy chính sách/hồ sơ còn thiếu hoặc blocker nguồn cụ thể cùng bản duyệt độc lập; manager/buddy/HR không có quyền payroll chỉ thấy tác vụ/trạng thái được phép. Liên kết chứng cứ giữ quyền riêng, private/no-store và audit. Không suy ra chuyên môn từ vai trò EmDash.

Ca integration dùng chính sách, DOCX/PDF, số tiền và actor giả. Phải giữ đúng một candidate/person/employment, chặn người khác đọc, giữ snapshot đã phát hành và kết thúc bằng thu hồi membership cùng kiểm tra hold/restore. Giữ các hồi quy phase và kiểm soát tài chính hiện có. Chính sách owner duyệt, đối chiếu kỳ song song đúng chuyên môn, mục tiêu phục hồi production và các gate HRM còn lại là điều kiện riêng chưa chứng minh; hồ sơ giả qua test không phê duyệt thay các điều kiện đó.

## Phần đã triển khai và công việc còn lại

Phần triển khai bổ sung cấu hình chính sách theo phiên bản và form EN/VI trong trang payroll, cùng migration bổ sung `0042_hrm_closeout_policies.sql`. Lưu nháp, duyệt, áp dụng và ngừng áp dụng dùng quyền EmDash/Workspace hiện có. Nguồn DOCX được kiểm tra pháp nhân, checksum, người duyệt độc lập ở tệp/phiên bản, dấu xóa object và yêu cầu disposition đang chờ. Định nghĩa và lịch sử quyết định bất biến; thay phiên bản có sự kiện ngừng áp dụng bản cũ. Cấu hình này không hoàn tất tác vụ của nhân viên.

Phép đối soát payroll đã ghi nhận nay yêu cầu số tiền nguyên khớp chính xác với lương ròng ở phiếu điều chỉnh cuối chuỗi; không coi kỳ rỗng, số liệu thiếu hoặc sai kiểu là đã đối soát. Màn hình và giao dịch đóng kỳ dùng chung điều kiện. Kiểm thử SQL bao gồm trả thừa, trả thiếu, nhiều lần điều chỉnh và khoản thanh toán xuất hiện giữa bước kiểm tra với bước ghi. Đây chỉ là bằng chứng đối soát số liệu đã ghi nhận, chưa xác nhận nghĩa vụ pháp luật hoặc bên ngoài.

Phần đang làm đã có PDF riêng tư trên R2 dành cho nhân sự có quyền tài chính, duyệt độc lập, bản nguồn tài chính bất biến, ghi hoàn tất tác vụ/case có guard và mở việc rà soát lại khi nguồn đổi mà không cấp lại quyền. Vẫn cần kiểm chứng phục hồi cùng một nhân viên, mọi gate hồi quy và release. Chính sách owner, rà soát chuyên môn, chính sách/giao diện disposition chung cho loại tệp mới và lần payroll cuối đầu tiên khi chưa có phiếu nguồn để điều chỉnh vẫn là phạm vi chưa được chứng minh riêng. Một lượt toàn hành trình mới qua một phần hoặc còn lỗi không phải acceptance gate đã hoàn tất.


Cần kiểm chứng runtime D1 ngoài kiểm thử SQLite của Node. D1 local hiện từ chối cây biểu thức sâu hơn 100; guard checklist được tách phẳng thành kiểm tra chính sách, cấu trúc, tham chiếu tệp và ngoại lệ chưa có payroll, giữ nguyên các điều kiện. Tái hiện thao tác hồ sơ trên D1 thật đã tìm ra lỗi mà kiểm thử SQLite thông thường chưa phát hiện.


Khi gán lịch có thể nhập ngày kết thúc tường minh. Lịch lịch sử có giới hạn được phép kết thúc trước các kỳ công khác đã khóa/đang duyệt; kiểm tra chồng lịch và mọi cửa sổ khóa vẫn giữ nguyên. Hệ thống không tự suy ra ngày kết thúc.

Gán chính sách phép cũng nhận ngày kết thúc tùy chọn tường minh; guard kỳ công và chồng chính sách dùng toàn bộ khoảng hiệu lực, retry không cấp phép thêm lần nữa.

## Legal hold riêng cho từng tệp

Nhân sự có quyền tài chính có thể đặt hold theo vụ việc cho từng PDF quyết toán ngay trong case, kể cả sau khi case đã hoàn tất. Đặt hold cần cả quyền của bàn quyết toán và `hrm.legalhold.manage`; gỡ hold còn cần `hrm.retention.review` và phải do người khác thực hiện. HRM Officer, Payroll Officer, quản lý và nhân viên không được xem hoặc gỡ lịch sử hold tài chính bằng các quyền ngoài tài chính. Mỗi lần ghi phải kiểm tra lại tài khoản EmDash hiện tại, membership/quyền D1, pháp nhân, revision tệp và HRM gate. Người được tuyển lại vẫn không được đặt hoặc gỡ hold trên case cũ của chính mình.

Lịch sử bất biến giữ người đặt/gỡ, thời gian UTC máy chủ và tham chiếu vụ việc ngắn. Hold toàn nhân viên và hold riêng tệp có hiệu lực chồng nhau; gỡ một phạm vi không gỡ phạm vi còn lại. Không thể đánh dấu đã xóa, đưa vào disposition hoặc bỏ cờ giữ khi tệp còn hold. Không đặt hold mới cho tệp đã xóa hoặc đang xử lý xóa. Việc bảo toàn chứng cứ không tự thay nguồn tài chính, mở lại case đã đóng hoặc cấp lại membership. Phần này chỉ triển khai bảo toàn: chính sách retention được owner duyệt, xóa có phê duyệt cho payload tệp/hồ sơ quyết toán, backup và bản sao dẫn xuất vẫn là công việc riêng. Không có thời hạn hay tác vụ xóa tự động được thêm.

# HRM — Quản trị nhân sự và cổng nhân viên

**Trạng thái:** hợp đồng phạm vi và tiêu chí nghiệm thu; tình trạng triển khai được theo dõi tại [STATUS.md](STATUS.md). **Ngày cập nhật:** 2026-10-15.

HRM là phân hệ nhân sự trong Lumi Workspace, phục vụ cả nhân viên, người quản lý, HR và người phụ trách tiền lương. Hiring quản lý ứng viên trước khi tuyển; HRM quản lý quan hệ làm việc từ tiếp nhận đến nghỉ việc. Cả hai dùng chung danh tính EmDash nhưng có quyền riêng. CRM tiếp tục độc lập về nghiệp vụ và quyền dữ liệu.

Tài liệu này xác định yêu cầu sản phẩm và tiêu chí nghiệm thu. P1 vẫn chờ gate đầy đủ; P2 đã có luồng DOCX/PDF, xác nhận, COI, onboarding, chuyển ATS→HRM, checklist offboarding và bộ máy cấu hình retention/legal hold. Các thời hạn cụ thể chưa được người phụ trách chuyên môn chốt; production vẫn đóng. P3–P5 và các gate browser/hosted còn mở. Đừng suy ra tính sẵn sàng production từ nội dung đặc tả. Quy tắc pháp lý, thuế, bảo hiểm, lưu trữ và giá trị chữ ký phải được người có chuyên môn rà soát theo nơi làm việc và thời điểm áp dụng; tài liệu không mặc định một mức luật định hay tuyên bố tuân thủ.

## 1. Mục tiêu và ranh giới

Nhân viên có một nơi để cập nhật thông tin, nộp giấy tờ, đọc và ký/xác nhận tài liệu, xem lịch làm việc, xin nghỉ phép, kiểm tra công, nhận payslip và theo dõi yêu cầu của mình. HR có hồ sơ đầy đủ, lịch sử thay đổi, danh sách việc đến hạn và bằng chứng để giải quyết tranh chấp. Quản lý chỉ xử lý phạm vi đội được giao; người làm lương chỉ có dữ liệu cần thiết.

Phạm vi bao gồm hồ sơ, người phụ thuộc, ảnh và CCCD; hợp đồng, NDA, COI và chính sách; onboarding/offboarding; lịch làm việc, chấm công, nghỉ phép; tính lương và payslip; phúc lợi, tài sản, yêu cầu nhân sự và báo cáo. Đây là phạm vi đích đầy đủ, được triển khai theo các giai đoạn ở §15.

Không mặc định kết nối máy chấm công, ngân hàng, cơ quan thuế, bảo hiểm hay nhà cung cấp chữ ký điện tử. Không tự chuyển tiền, nộp hồ sơ pháp lý, phát hành quyết định nhân sự hoặc dùng AI quyết định lương, kỷ luật, tuyển dụng hay chấm dứt hợp đồng. COI trong tài liệu này là **Conflict of Interest — khai báo xung đột lợi ích**. Yêu cầu ban đầu “DNA” đã được người dùng xác nhận là **NDA và các giấy tờ pháp lý cần ký/xác nhận**, không phải dữ liệu di truyền hoặc hồ sơ tính cách.

**Phản biện chính:** làm toàn bộ HRM trong một lần dễ tạo bảng lương thiếu kiểm soát và thu thập quá nhiều dữ liệu. Vì vậy, hồ sơ và quyền truy cập phải hoàn thành trước; bảng lương chỉ mở sau khi công, phép, hợp đồng và cơ chế khóa kỳ được kiểm chứng.

## 2. Danh tính và phân quyền

Dùng phiên đăng nhập, trạng thái tài khoản và người dùng EmDash hiện có. Không tạo mật khẩu hoặc cookie đăng nhập riêng. Thành viên, vai trò kết hợp và ánh xạ quyền tiếp tục ở `workspace_members`, `workspace_roles` và `src/lib/workspace/roles.ts`. Chỉ Admin quản lý quyền tại `/workspace/users`; không ai thay đổi quyền của chính mình. Admin là EmDash role 50, không lưu thành vai trò trong bảng Workspace.

Nhân viên có `employee_id` nghiệp vụ ổn định, tách khỏi `emdash_user_id`. Hồ sơ có thể được HR tạo trước khi có tài khoản; liên kết tài khoản phải do người có quyền xác minh, có ràng buộc duy nhất và audit. Email trùng nhau không đủ để tự ghép danh tính. Một người có nhiều đợt làm việc nhưng chỉ một hồ sơ con người và lịch sử đợt làm việc riêng.

Các vai trò grantable trong Workspace gồm Employee, People Manager, HRM Officer, HRM Admin và Payroll Officer. Payroll Officer chỉ được đọc/chuẩn bị dữ liệu payroll và xử lý thắc mắc được cấp; không đọc CCCD, tài khoản ngân hàng, thuế, hồ sơ nhân sự, payslip của người khác hoặc tự duyệt/phát hành. HRM Admin và System Super Admin (EmDash role 50) được rà soát/phê duyệt/phát hành/xác nhận thanh toán trong capability tương ứng, nhưng không thể tự duyệt nội dung do chính mình chuẩn bị. HRM Admin không có `users.manage`; HR hiện có chỉ giữ quyền ATS, Finance chỉ giữ quyền CRM. System Super Admin không lưu thành Workspace role và là vai trò duy nhất quản lý users/roles tại `/workspace/users`. Mọi grant vẫn do System Super Admin quản lý.

| Nhóm quyền | Nhân viên | Quản lý trực tiếp | HRM Officer | HRM Admin | Payroll Officer (P4; production gate đóng) | System Super Admin (EmDash 50) |
|---|---|---|---|---|---|---|
| `hrm.access` | Cổng của mình | Cổng và đội | Bàn nhân sự | Capability HRM được cấp; không có `users.manage` | Bàn payroll khi feature gate mở | Toàn bộ capability; theo feature gate |
| `hrm.profile.self` | Xem mình; gửi đề nghị sửa | Như nhân viên nếu có hồ sơ | Như nhân viên nếu có hồ sơ | Hồ sơ của mình nếu được liên kết | Không | Có |
| `hrm.team.read` | Không | Thông tin công việc của đội | Không tự suy ra từ chức danh | Có | Không | Có |
| `hrm.records.manage` | Không | Không | Hồ sơ nghiệp vụ | Có | Không | Có |
| `hrm.identity.read` | Giấy tờ mình | Không | Theo quyền và phạm vi | Có | Không | Có |
| `hrm.legal.manage` | Không | Không | Phát hành/theo dõi tài liệu | Có | Không | Có |
| `hrm.legal.activate` | Không | Không | Không | Kích hoạt bản người khác đã rà soát | Không | Kích hoạt; không tự duyệt |
| `hrm.legal.self` | Đọc, ký/xác nhận tài liệu mình | Chỉ tài liệu mình | Tài liệu mình nếu được liên kết | Tài liệu mình nếu được liên kết | Không | Có |
| `hrm.leave.request` | Phép mình | Phép mình | Chỉ khi có grant nhân viên riêng | Phép mình nếu được liên kết | Không | Có |
| `hrm.leave.approve` | Không | Đội được giao | Theo phạm vi review | HRM theo capability | Không | Có; không tự duyệt |
| `hrm.attendance.manage` | Gửi giải trình | Duyệt đội nếu được giao | Kiểm tra/khóa công | Kiểm tra/khóa công | Đọc snapshot công đã chốt ở P4 | Có |
| `hrm.payroll.read` | Không | Không | Không | Có | Kỳ lương cần xử lý | Có |
| `hrm.payroll.configure` | Không | Không | Không | Có | Không | Có |
| `hrm.payroll.prepare` | Không | Không | Không mặc định | Có; không tự duyệt bản của mình | Có; không được duyệt/phát hành | Có; không tự duyệt |
| `hrm.payroll.review` | Không | Không | Không | Có; không tự rà soát | Không | Có |
| `hrm.payroll.approve` | Không | Không | Không | Có; không tự duyệt | Không | Có; không tự duyệt |
| `hrm.payroll.publish` | Không | Không | Không | Có | Không | Có |
| `hrm.payroll.payment.confirm` | Không | Không | Không | Có; cần tham chiếu đối soát | Không | Có; cần tham chiếu đối soát |
| `hrm.payroll.self` | Payslip mình | Chỉ khi có grant Employee | Chỉ khi có grant Employee | Chỉ khi có grant Employee | Không | Có |
| `hrm.payroll.dispute` | Thắc mắc phiếu của mình | Thắc mắc phiếu của mình | Không | Không mặc định | Không | Có |
| `hrm.payroll.dispute.manage` | Không | Không | Không | Có | Xử lý thắc mắc payroll | Có |
| `hrm.compensation.read` | Thu nhập mình | Không | Grant riêng | Theo nhu cầu HRM | Dữ liệu cần cho lương | Có |
| `hrm.export`, `hrm.audit.read`, `hrm.configure` | Không | Không | Grant riêng cho audit/xuất | Theo capability HRM | Grant riêng khi P4 mở | Có |

Payroll Officer được thêm bằng migration additive `0024_hrm_payroll.sql`; grant mới không sửa hoặc xóa grant ATS/CRM hiện có. Mọi thay đổi role/permission tiếp tục phải mở rộng CHECK constraint bằng migration additive và dùng `src/lib/workspace/roles.ts` làm ánh xạ duy nhất.

Ma trận là yêu cầu cho permission map, không phải logic kiểm tra tên vai trò. Server kiểm tra capability **và** phạm vi bản ghi **và** loại trường/tệp. Có nhiều vai trò thì kết hợp quyền, nhưng không bỏ kiểm soát tự duyệt, khóa kỳ hoặc giới hạn dữ liệu. Quản lý nhân sự khác quản trị tài khoản.

Phạm vi đội được tính từ phân công quản lý có ngày hiệu lực; không cho quản lý đọc ngược hồ sơ riêng tư của người từng thuộc đội. Quản lý trực tiếp có thể tạo ủy quyền duyệt chấm công hoặc nghỉ phép riêng theo từng loại, chọn một tài khoản People Manager đang hoạt động và ngày bắt đầu/kết thúc cùng lý do. Grant được audit và giữ lịch sử tạo/thu hồi bất biến; hết hạn, thu hồi vai trò hoặc đổi người quản lý làm quyền ủy quyền mất hiệu lực ngay trong request tiếp theo. Người được ủy quyền chỉ nhận phạm vi phê duyệt hiện tại, không nhận quyền hồ sơ/file riêng tư hay quyền ủy quyền tiếp. Không tự duyệt yêu cầu của chính mình. Chưa có người duyệt hợp lệ thì yêu cầu tiếp tục chờ HR/Admin, không tự chấp thuận.

Thu hồi thành viên/vai trò hoặc vô hiệu hóa tài khoản có hiệu lực ở request tiếp theo, kể cả tải file, export và thao tác nền. Hồ sơ nghỉ việc vẫn tồn tại theo chính sách; không giữ quyền cổng nhân viên vô thời hạn. Việc nhận giấy tờ sau nghỉ việc dùng quy trình xác minh và bàn giao riêng, không link công khai.

## 3. Điều hướng và trải nghiệm

Module dự kiến: `/hrm` và `/vi/hrm`; tất cả trang riêng tư trong `WorkspaceShell`, điều hướng từ `src/lib/workspace/nav.ts`, chỉ hiện mục có quyền. Module không xuất hiện trước khi quyền và chức năng thật được triển khai.

| Mục EN / VI | Đường dẫn đề xuất | Nội dung |
|---|---|---|
| My overview / Tổng quan của tôi | `/hrm` | Việc cần làm, phép còn lại có ngày tính, công cần xác nhận, tài liệu chờ ký, payslip mới |
| My profile / Hồ sơ của tôi | `/hrm/me` | Thông tin cá nhân, công việc, liên hệ, giấy tờ, người phụ thuộc |
| Onboarding / Việc cần làm khi gia nhập | `/hrm/me/onboarding` | Checklist cá nhân, hạn, hướng dẫn, bằng chứng và phản hồi |
| My documents / Tài liệu của tôi | `/hrm/me/documents` | Hợp đồng, NDA, COI, chính sách và lịch sử ký/xác nhận |
| Working time / Công và lịch làm việc | `/hrm/me/time` | Ca, ngày làm việc, công thực tế, sai lệch và giải trình |
| Leave / Nghỉ phép | `/hrm/me/leave` | Số dư, đơn, phê duyệt và lịch sử |
| Payslips / Phiếu lương | `/hrm/me/payslips` | Kỳ đã phát hành, diễn giải khoản, tải bản riêng tư, khiếu nại |
| Requests / Yêu cầu của tôi | `/hrm/me/requests` | Hồ sơ, phúc lợi, tài sản, chứng nhận, hỗ trợ |
| My team / Đội của tôi | `/hrm/team` | Lịch đội, yêu cầu chờ duyệt, công; không hiện lương/CCCD |
| People / Nhân sự | `/hrm/people` | Danh sách, hồ sơ, cơ cấu, onboarding/offboarding |
| ATS → HRM transfer / Chuyển ứng viên thành nhân viên | `/hrm/transfers/{applicationId}` | Preview ứng viên đã tuyển; cần đồng thời quyền Hiring và HRM; chuyển tối thiểu, không sao chép CV/ghi chú/scorecard |
| Offboarding / Checklist nghỉ việc | `/hrm/offboarding` | Handover, tài sản, rà soát hồ sơ và chuyển việc tắt quyền Workspace cho System Super Admin |
| Retention and legal holds / Lưu trữ và legal hold | `/hrm/retention` | Phiên bản thời hạn theo danh mục, đặt/gỡ hold, hai người duyệt xóa và System Super Admin thực hiện xóa object |
| Legal documents / Hồ sơ pháp lý | `/hrm/documents` | Mẫu có phiên bản, chiến dịch ký, trạng thái và bằng chứng |
| Attendance and leave / Công và phép | `/hrm/time` | Chính sách, đối soát, ngoại lệ, chốt kỳ |
| Payroll / Bảng lương | `/hrm/payroll` | Chuẩn bị, kiểm tra, phê duyệt, phát hành, đối soát thanh toán |
| Reports / Báo cáo | `/hrm/reports` | Headcount, biến động, hạn hồ sơ, công/phép theo quyền |
| Settings / Thiết lập | `/hrm/settings` | Chính sách phiên bản, luồng duyệt, lưu trữ; Admin |

Mỗi đường dẫn có peer `/vi` tương ứng; nhãn, trạng thái, lỗi, mẫu thông báo và nội dung biểu mẫu có EN/VI. Ngôn ngữ của tài liệu pháp lý là thuộc tính riêng: đổi locale giao diện không tự dịch hay thay bản đã ký. Lưu lựa chọn ngôn ngữ và bản được phát hành cho nhân viên.

Theo `DESIGN.md`: form chia nhóm dễ đọc, không dồn mọi dữ liệu vào một màn hình; trạng thái và người chịu trách nhiệm rõ ràng; bàn phím, focus, nhãn lỗi, tương phản, reduced motion; kiểm tra 320–430px, 1280px và desktop lớn ở cả hai ngôn ngữ. Luồng cốt lõi gửi đơn, sửa hồ sơ và xác nhận đã đọc dùng được không có client JavaScript; phương thức ký cần JS phải được mô tả và có phương án bàn giao phù hợp.

## 4. Hồ sơ nhân viên

| Nhóm | Trường và nghiệp vụ |
|---|---|
| Định danh nội bộ | Mã nhân viên duy nhất, họ tên pháp lý, tên thường dùng, ảnh đại diện, trạng thái hồ sơ, liên kết EmDash, ngày tạo |
| Cá nhân | Ngày sinh; thông tin giới tính/quốc tịch/tình trạng hôn nhân chỉ thu thập nếu có mục đích nghiệp vụ được duyệt; không mặc định bắt buộc |
| Liên hệ | Email/điện thoại cá nhân và công việc, địa chỉ thường trú/liên hệ; người liên hệ khẩn cấp, quan hệ và số điện thoại |
| Giấy tờ | Loại CCCD/hộ chiếu/giấy tờ khác, số được che trên danh sách, nơi/ngày cấp, hạn nếu có, ảnh mặt trước/sau, trạng thái xác minh |
| Công việc | Pháp nhân sử dụng lao động, phòng ban, vị trí, cấp bậc nếu dùng, quản lý, địa điểm, loại quan hệ làm việc, lịch/ca, ngày vào/thử việc/chính thức/nghỉ việc |
| Thu nhập và thanh toán | Thỏa thuận lương có ngày hiệu lực, loại tiền, tài khoản nhận lương, chủ tài khoản; quyền riêng, sửa qua phê duyệt |
| Thuế và bảo hiểm | Mã số thuế, mã bảo hiểm, đăng ký tham gia và mốc hiệu lực, chứng từ; không tự gửi cơ quan bên ngoài |
| Năng lực và phát triển | Kỹ năng, chứng chỉ có hạn, đào tạo, mục tiêu và đánh giá có bằng chứng; triển khai sau lõi hồ sơ, không chấm điểm AI tự động |
| Tài liệu | Hợp đồng/phụ lục, NDA, COI, xác nhận chính sách, chứng nhận công tác và hồ sơ bàn giao |

Tách dữ liệu công khai nội bộ (tên công việc, bộ phận, liên hệ công việc, ảnh theo lựa chọn) khỏi dữ liệu hạn chế. Danh bạ không lộ ngày sinh đầy đủ, địa chỉ, số định danh, tài khoản ngân hàng, người phụ thuộc hay lương. Hiển thị trường không được cấp quyền phải loại từ truy vấn/payload, không chỉ ẩn CSS.

Nhân viên trực tiếp sửa các trường rủi ro thấp đã cấu hình; các trường định danh, ngân hàng, thuế, người phụ thuộc và hợp đồng đi qua yêu cầu `draft → submitted → approved/rejected → applied`. Người duyệt thấy bản cũ/mới và giấy tờ hỗ trợ; từ chối cần lý do. Không tự sửa mã nhân viên, trạng thái làm việc, lương hoặc quản lý. Thay đổi có hiệu lực theo ngày; lịch sử không ghi đè.

Trường chưa biết lưu là chưa biết, không thay bằng ngày hiện tại, số 0 hay giá trị giả. Kiểm tra trùng mã, liên kết tài khoản và số giấy tờ trong phạm vi cần thiết; không tiết lộ danh tính bản ghi trùng cho người không có quyền. Hồ sơ nhập hàng loạt có preview, lỗi theo dòng, khóa idempotency và rollback cho phần chưa được tham chiếu.

## 5. Người phụ thuộc, hình ảnh và chứng từ

Một nhân viên có nhiều người phụ thuộc: họ tên, quan hệ, ngày sinh, định danh/mã thuế nếu cần, thời gian phụ thuộc/đăng ký, trạng thái hồ sơ và chứng từ hỗ trợ. Liên kết phụ thuộc có ngày hiệu lực và kết thúc; phát hiện đăng ký trùng để HR rà soát, không tự suy ra gian lận. Dữ liệu trẻ em và bên thứ ba chỉ thu thập tối thiểu, ghi rõ mục đích và căn cứ xử lý được rà soát.

Trạng thái hồ sơ: `draft → submitted → needs_information → verified/rejected → ended`. “Đã HR kiểm tra” khác “đã được cơ quan bên ngoài chấp nhận”; trạng thái bên ngoài chỉ ghi khi có bằng chứng, người xác nhận và thời điểm.

Ảnh đại diện, CCCD, giấy khai sinh, giấy tờ người phụ thuộc, hợp đồng scan và chứng từ ngân hàng đều có loại, chủ thể, người tải, thời điểm, phiên bản, hạn và trạng thái kiểm tra. CCCD không dùng làm ảnh đại diện. Không thu thập selfie, sinh trắc học, vị trí liên tục hoặc hồ sơ y tế chi tiết mặc định.

D1 lưu metadata và quan hệ; R2 riêng tư lưu tệp, không lưu blob/base64 trong D1. File không đi vào media công khai EmDash hoặc file ATS. Kiểm tra kích thước, MIME thực, định dạng cho phép, tên an toàn; từ chối nội dung thực thi. Có vùng cách ly và kiểm tra file trước khi cho người khác tải; nếu chưa có bộ quét thì ghi rõ giới hạn và không tuyên bố đã quét sạch.

Endpoint tải kiểm tra session, permission và chủ thể ở mỗi request, trả header tải xuống an toàn, `Cache-Control: private, no-store`; không URL bucket công khai, không cache CDN. Object key nội bộ không xuất ra trình duyệt. Thumbnail ảnh định danh cũng chịu cùng quyền. Xóa phiên bản chỉ theo retention, legal hold và kiểm tra tham chiếu; không xóa cascade bằng thao tác hồ sơ thông thường.

## 6. Hợp đồng và tài liệu pháp lý: NDA, COI, xác nhận chính sách

### 6.1. Danh mục

- Hợp đồng thử việc/lao động hoặc thỏa thuận cộng tác theo quan hệ thực tế; phụ lục, gia hạn, thay đổi vị trí/thu nhập và văn bản chấm dứt.
- NDA: cam kết bảo mật và xử lý thông tin, phiên bản và thời hạn áp dụng.
- COI: khai báo xung đột lợi ích ban đầu, định kỳ và khi hoàn cảnh thay đổi; trả lời “không có xung đột” vẫn là một khai báo có thời điểm.
- Quy tắc ứng xử; chính sách bảo mật, dữ liệu cá nhân, an toàn thông tin, sử dụng thiết bị và tài khoản; sở hữu trí tuệ nếu được rà soát và áp dụng.
- Biên bản bàn giao tài sản/quyền truy cập; xác nhận đào tạo, nhận nội quy, quyết định và chính sách liên quan.

Đây là loại tài liệu có thể cấu hình, không phải danh sách giấy tờ pháp luật bắt buộc cho mọi nhân viên. Mẫu phải có chủ sở hữu chuyên môn, người duyệt và ngày rà soát. Chính sách nội bộ và văn bản ràng buộc hợp đồng không được coi là cùng loại.

### 6.2. Mẫu, phát hành và nghĩa vụ

Mỗi mẫu có `document_type`, mã/phiên bản, pháp nhân, ngôn ngữ, đối tượng áp dụng, phương thức ký/xác nhận, người ký các bên, thời hạn, ngày hiệu lực, chủ duyệt và checksum nội dung. Mẫu có trạng thái `draft → reviewed → active → retired`. HRM Admin hoặc System Super Admin có `hrm.legal.activate` mới được kích hoạt phiên bản đã được người khác rà soát; người tạo không tự kích hoạt. Sửa nội dung tạo phiên bản mới, không thay bản đã phát hành.

Mỗi lần phát hành lưu snapshot nội dung và các trường được điền, chủ thể, phiên bản mẫu, hạn xử lý, chính sách áp dụng và người phát hành. Trạng thái: `draft → issued → viewed → awaiting_action → completed`; có `declined`, `expired`, `cancelled`, `superseded`. “Đã xem” không tự chuyển thành “đã ký”. Nếu cần nhiều bên ký, hoàn tất chỉ khi đủ các bên và xác minh bằng chứng; lưu tiến độ từng bên.

Dashboard cho HR thấy người chưa nhận, chưa xem, chờ ký, từ chối, hết hạn và bản cần thay thế. Nhắc hạn có giới hạn tần suất và khóa chống gửi trùng; gửi thông báo chỉ khi kênh được cấu hình và được phép. Thay mẫu không tự hủy tài liệu cũ: ghi quan hệ thay thế và phát hành yêu cầu mới theo chính sách.

**Tải chính sách và lưu bằng chứng:** người có quyền `hrm.legal.manage` tải DOCX làm bản nguồn. DOCX được kiểm tra cấu trúc, lưu riêng và cách ly; một người khác rà soát tệp trước khi tạo phiên bản, rồi người có quyền `hrm.legal.activate` kích hoạt. Phiên bản phát hành giữ đúng file nguồn và checksum; không render DOCX như HTML hoặc coi việc tải lên là phát hành. Nhân viên và HR có thể tải PDF vào đúng issue ký giấy được cấp quyền; PDF cũng được cách ly và chỉ hoàn tất sau khi một người khác rà soát/xác minh. Tải file không tự đánh dấu đã ký.

### 6.3. Phân biệt xác nhận với chữ ký

| Phương thức | Bằng chứng cần giữ | Cách trình bày |
|---|---|---|
| Xác nhận đã đọc | Danh tính đang đăng nhập, nội dung chính xác, hành động xác nhận chủ động, thời gian server, phiên bản/checksum | “Đã xác nhận đã đọc”; không ghi “đã ký hợp đồng” |
| Khai báo COI | Câu hỏi/đáp án snapshot, tuyên bố của nhân viên, tệp liên quan, thời gian và actor | “Đã gửi khai báo”; kết quả rà soát riêng |
| Ký giấy, nộp scan | Bản scan, ngày ký khai báo, các bên, người kiểm tra và nguồn bản gốc | “Bản ký giấy đã được kiểm tra” sau khi người có quyền kiểm tra |
| Ký điện tử qua nhà cung cấp | Yêu cầu giao dịch, callback đã xác minh, tài liệu hoàn tất, chứng cứ nhà cung cấp và checksum | Chỉ ghi “Đã ký” khi giao dịch hợp lệ và đủ bên |

Checkbox, tên gõ hoặc ảnh chữ ký không tự tạo tuyên bố giá trị pháp lý. Phương thức được phép cho từng loại giấy tờ phải được rà soát trước khi bật. Nếu chưa tích hợp nhà cung cấp ký, hỗ trợ quy trình giấy/scan và xác nhận đã đọc; không tạo trạng thái ký điện tử giả.

Khi nhân viên chủ động chọn “Tôi đã đọc và xác nhận”, hệ thống lưu EmDash user ID, thời gian UTC do máy chủ ghi, issue, phiên bản và checksum chính xác. Lịch sử không sửa/xóa; gửi lại cùng xác nhận không tạo sự kiện thứ hai. Giao diện hiển thị thời gian theo `Asia/Ho_Chi_Minh` và phiên bản đã xác nhận. Một phiên bản mới cần xác nhận mới nếu được cấu hình; xác nhận đã đọc vẫn không phải chữ ký hợp đồng hay chữ ký điện tử.

Với tích hợp tương lai: callback xác thực nguồn, chống replay, idempotent, đối chiếu tài liệu/người ký; callback trễ sau hủy không tự làm sống lại yêu cầu. Download bản để ký không phải bằng chứng hoàn tất. Tài liệu sửa sau khi gửi yêu cầu ký phải phát hành lại và yêu cầu lại đúng các bên.

Hợp đồng lưu loại, số, pháp nhân, kỳ hạn, ngày ký/hiệu lực/hết hạn, vị trí, nơi làm việc, giờ làm và điều khoản thu nhập qua snapshot được duyệt. Gia hạn/phụ lục có liên kết bản gốc và mốc hiệu lực; không ghi đè quá khứ. Cảnh báo hạn có người xử lý; hợp đồng hết hạn không tự sa thải hoặc cắt tài khoản.

### 6.4. Quy trình COI

Nhân viên khai quan hệ/lợi ích có liên quan theo biểu mẫu tối thiểu: loại xung đột, tổ chức/hoạt động liên quan, phạm vi ảnh hưởng, biện pháp đề xuất và tệp hỗ trợ. Cho phép lưu nháp và bổ sung khi thay đổi. Nội dung chỉ HRM/người rà soát được giao có quyền chuyên biệt `hrm.coi.review` xem; quản lý trực tiếp không tự nhận toàn bộ khai báo.

Luồng: `submitted → under_review → clarification_needed → cleared/mitigation_required/escalated → closed`. Kết quả có người ra quyết định, lý do, biện pháp, hạn theo dõi và lịch tái khai báo. “Đã khai báo” không đồng nghĩa “không có xung đột” hoặc “đã được chấp thuận”. Không dùng AI tự kết luận hay kỷ luật.

## 7. Vòng đời nhân sự

Trạng thái đợt làm việc: `preboarding → probation/active → notice → ended`; `on_leave` là trạng thái vắng mặt theo kỳ, không mặc định chấm dứt việc làm. Chuyển trạng thái phải có ngày hiệu lực, bằng chứng và người thực hiện.

**Tiếp nhận:** tạo hồ sơ từ thông tin tối thiểu; xác minh/link tài khoản; thu hồ sơ; phát hành hợp đồng/NDA/COI/chính sách; giao tài sản và đào tạo; xác nhận hoàn tất. Từ ATS sang HRM chỉ sau quyết định tuyển hợp lệ, có quyền ở cả hai phía, preview trường được chuyển và chống tạo trùng. Không chuyển toàn bộ nhận xét tuyển dụng, scorecard hay file ứng viên sang cổng nhân viên. Chính sách giữ ứng viên 60 ngày hiện có không tự áp dụng cho hồ sơ nhân viên; file được chuyển hợp lệ có vòng đời độc lập.

**Trong thời gian làm việc:** điều chuyển, đổi quản lý/ca/thu nhập, đánh giá thử việc, gia hạn hợp đồng, phúc lợi và đào tạo đều có ngày hiệu lực. Một thay đổi tổ chức không tự mở lương hay giấy tờ riêng tư cho quản lý mới.

**Nghỉ việc:** checklist ngày kết thúc, bàn giao công việc/tài sản, thu hồi quyền đúng mốc, quyết toán công/phép/lương có đối soát, giấy tờ bàn giao và chính sách giữ/xóa. Tác vụ chậm hoặc lỗi phải hiện trong hàng chờ; không coi checklist tick là đã thực hiện bên ngoài. Nhân viên quay lại có đợt làm việc mới, không xóa lịch sử cũ.

### 7.1. Onboarding todo — kế hoạch gia nhập của từng nhân viên

Mỗi đợt làm việc có một kế hoạch onboarding riêng, được tạo từ mẫu theo pháp nhân, vị trí, địa điểm và loại quan hệ làm việc. HR kiểm tra đối tượng, người phụ trách và hạn trước khi kích hoạt; không tự tạo việc không phù hợp cho mọi nhân viên. Mẫu có phiên bản; kế hoạch giữ snapshot phiên bản đã dùng, thay mẫu không sửa các kế hoạch đang chạy.

Nhân viên xem **Việc cần làm khi gia nhập / Onboarding** ở `/hrm/me/onboarding` và `/vi/hrm/me/onboarding`, đồng thời thấy việc đến hạn ở tổng quan. HR theo dõi kế hoạch trong hồ sơ nhân sự; quản lý/buddy/người hỗ trợ chỉ thấy việc được giao và dữ liệu tối thiểu cần làm. Nhân viên thấy việc của mình cùng trạng thái chuẩn bị liên quan, không thấy ghi chú nội bộ hoặc tệp hạn chế của HR.

Mỗi todo gồm tên EN/VI, hướng dẫn, nhóm/mốc, người thực hiện, người kiểm tra nếu cần, hạn, mức bắt buộc, phụ thuộc, liên kết hành động, loại bằng chứng, trạng thái, lý do bị chặn, thời điểm hoàn tất và lịch sử. Hạn có thể tính từ ngày bắt đầu bằng ngày lịch hoặc ngày làm việc theo lịch được giao; cách tính phải hiển thị rõ. Một todo có một người chịu trách nhiệm chính; người hỗ trợ không thay thế trách nhiệm đó.

### 7.2. Mẫu công việc onboarding đầy đủ

Các mốc dưới đây là mẫu vận hành đề xuất, không phải thời hạn pháp lý. HR điều chỉnh và xác nhận khi áp dụng. Những việc HR/IT/quản lý thực hiện phải có chủ tài khoản được chỉ định; chức danh IT/buddy không tự tạo quyền Workspace.

| Mốc | Công việc cần làm | Người thực hiện chính | Điều kiện hoàn tất/bằng chứng |
|---|---|---|---|
| Trước ngày đầu | Xác nhận ngày bắt đầu, vị trí, pháp nhân, quản lý và lịch làm việc | HR | Đợt làm việc và phân công đã kiểm tra |
| Trước ngày đầu | Hoàn thiện thông tin cá nhân, liên hệ khẩn cấp, ảnh nếu sử dụng | Nhân viên | Trường bắt buộc hợp lệ; đề nghị sửa cần duyệt đã được xử lý |
| Trước ngày đầu | Nộp giấy tờ định danh và chứng từ cần thiết | Nhân viên | Tệp hợp lệ; HR xác minh theo quyền riêng |
| Trước ngày đầu | Khai thông tin nhận lương, thuế, bảo hiểm và người phụ thuộc nếu áp dụng | Nhân viên | Đã nộp; bước HR/Payroll kiểm tra riêng, không tự đồng nghĩa đã đăng ký bên ngoài |
| Trước ngày đầu | Phát hành hợp đồng/thỏa thuận và phụ lục cần thiết | HR | Đúng mẫu, đúng người, ngày hiệu lực và phương thức ký được duyệt |
| Trước ngày đầu | Ký hợp đồng và NDA theo phương thức được phát hành | Nhân viên và các bên cần ký | Todo riêng từng bên; bản đầy đủ được kiểm tra theo §6, không chỉ tick checkbox |
| Trước ngày đầu | Gửi khai báo COI; rà soát và xử lý nếu có xung đột | Nhân viên; người rà soát phụ trách bước riêng | Khai báo đã gửi; kết quả rà soát/biện pháp được ghi riêng |
| Trước ngày đầu | Chuẩn bị tài khoản, thiết bị, chỗ làm và người hướng dẫn | Người hỗ trợ được giao | Danh mục chuẩn bị, người giao, tình trạng; không ghi mật khẩu trong todo |
| Ngày đầu | Xác minh/liên kết EmDash và cấp đúng quyền công việc | Admin | Quyền được cấp qua `/workspace/users`, có audit; todo không tự cấp quyền |
| Ngày đầu | Nhận thiết bị, phụ kiện và ký/xác nhận biên bản bàn giao | Nhân viên; người bàn giao phụ trách bước riêng | Danh sách tài sản và biên bản đúng phương thức |
| Ngày đầu | Kiểm tra truy cập các công cụ được phép | Nhân viên | Truy cập thành công hoặc báo lỗi; HRM không giả định đã provision bên ngoài |
| Ngày đầu | Đọc/xác nhận nội quy, bảo mật, dữ liệu cá nhân và sử dụng tài sản | Nhân viên | Xác nhận đúng bản phát hành; giữ bằng chứng theo §6 |
| Ngày đầu | Gặp quản lý/buddy; thống nhất kênh trao đổi và lịch hỗ trợ | Quản lý | Cuộc gặp đã diễn ra, ghi thời điểm và nội dung công việc tối thiểu |
| Tuần đầu | Học cách ghi công, xin phép, xem payslip và gửi yêu cầu HR | Nhân viên | Hoàn thành hướng dẫn/thực hành với dữ liệu phù hợp, không tạo đơn/lương thật giả |
| Tuần đầu | Đào tạo an toàn thông tin và quy trình riêng của vị trí | Nhân viên | Buổi học/kiểm tra yêu cầu đã hoàn thành; có người xác nhận nếu mẫu yêu cầu |
| Tuần đầu | Thống nhất mô tả việc, mục tiêu thử việc và tiêu chí đánh giá | Quản lý | Mục tiêu, người đánh giá và lịch review được ghi; nhân viên đã nhận |
| Tuần đầu | Thực hiện công việc đầu tiên có người hỗ trợ | Nhân viên | Kết quả thực tế và phản hồi; không dùng thời gian đăng nhập làm bằng chứng năng lực |
| Ngày 7/30 hoặc mốc cấu hình | Check-in về công việc, hỗ trợ, thiết bị và điểm còn vướng | Quản lý | Cuộc trao đổi, việc khắc phục và người phụ trách |
| Trước hết thử việc nếu áp dụng | Đánh giá theo tiêu chí đã thống nhất và ghi phản hồi nhân viên | Quản lý | Đánh giá có bằng chứng, đủ người kiểm tra theo quy trình |
| Kết thúc onboarding | Kiểm tra hồ sơ, tài liệu, đào tạo, quyền và các việc tồn đọng | HR | Các việc bắt buộc được xác minh; ngoại lệ có người duyệt và lý do |

Các hàng gồm nhiều người là **nhóm việc**; khi tạo kế hoạch phải tách thành todo có chủ riêng, phụ thuộc rõ ràng. Ví dụ “nhân viên nộp CCCD” và “HR xác minh CCCD” là hai việc; việc thứ nhất hoàn tất không tự hoàn tất việc thứ hai. Không thu thập giấy tờ chưa có mục đích được phê duyệt chỉ vì nằm trong mẫu.

### 7.3. Trạng thái, phụ thuộc và theo dõi tiến độ

Todo dùng `not_started → in_progress → submitted → verified`; công việc không cần kiểm tra có thể chuyển trực tiếp từ `in_progress` sang `completed`, nhưng phải có bằng chứng theo loại. `blocked` cần lý do và người tháo gỡ; kiểm tra không đạt trả về `in_progress` kèm phản hồi, giữ lần nộp cũ. `waived` chỉ do người có `hrm.onboarding.manage` trong phạm vi kế hoạch, có lý do, quyền miễn việc và audit; không được miễn bước ký/xác minh pháp lý nếu chưa có chính sách cho phép. Hủy kế hoạch ghi `cancelled`, không coi các việc là đã hoàn tất. Quá hạn là trạng thái suy ra từ hạn và trạng thái thực, không tự chuyển thành hoàn tất.

Todo tham chiếu hợp đồng, NDA, COI, hồ sơ hoặc tài sản chỉ hoàn tất khi nguồn nghiệp vụ đáp ứng điều kiện. Chỉ khi hệ thống có sự kiện được xác minh mới cập nhật tự động; tác vụ bên ngoài do người có quyền xác nhận bằng chứng. Người quản lý không xem được nội dung NDA/COI riêng tư chỉ vì có todo liên quan; có thể chỉ thấy “đã hoàn tất yêu cầu” nếu được phép.

Phụ thuộc phải cùng kế hoạch, không có chu trình, không phụ thuộc chính nó. Việc cần bước trước không được hoàn tất trước khi bước đó đạt điều kiện. Kế hoạch không có owner hoặc người kiểm tra hợp lệ hiện cảnh báo và chặn kích hoạt. Người thôi việc/mất quyền khi còn todo thì chuyển vào hàng chờ để HR phân công lại, không tự mở quyền cho người khác.

Đổi ngày bắt đầu đề xuất tính lại hạn của các việc chưa hoàn tất; HR xem chênh lệch và xác nhận, giữ hạn cũ trong lịch sử, không sửa ngày đã hoàn tất. Retry tạo kế hoạch/việc không tạo trùng; sửa trạng thái và phân công kiểm tra revision. Khi hủy gia nhập, dừng nhắc việc và xử lý các tài khoản/tài sản đã cấp qua checklist có người xác nhận.

Tiến độ hiển thị số việc bắt buộc đã xác minh/hoàn tất, việc tùy chọn và miễn riêng; không tính việc bị chặn, quá hạn hoặc đã nộp nhưng chưa duyệt là hoàn tất. Kế hoạch chỉ `completed` khi toàn bộ việc bắt buộc đủ bằng chứng hoặc có ngoại lệ được cho phép. Onboarding hoàn tất không tự xác nhận qua thử việc, ký hợp đồng, tăng lương hay thay trạng thái làm việc; mỗi quyết định có quy trình riêng.

HR có bộ lọc theo nhân viên, mốc, owner, trạng thái, việc quá hạn và phụ thuộc bị chặn; nhân viên có danh sách “cần làm hôm nay”, “đang chờ kiểm tra” và “đã hoàn tất”. Nhắc hạn/escalation dùng outbox §11, không chứa dữ liệu nhạy cảm. Bình luận và tệp giữ quyền theo loại dữ liệu, không mặc định mọi người trong kế hoạch đều xem được.

Quyền đề xuất: `hrm.onboarding.self` cho kế hoạch mình; `hrm.onboarding.tasks` cho việc được giao và phạm vi tối thiểu; `hrm.onboarding.manage` cho tạo mẫu/kế hoạch, phân công và xác minh theo phạm vi. Admin kích hoạt phiên bản mẫu và cấp quyền tài khoản; quyền quản lý onboarding không bao gồm `users.manage`, đọc CCCD, COI hoặc lương. Người có quyền ở nguồn nghiệp vụ vẫn phải qua kiểm tra quyền tương ứng khi mở liên kết.

## 8. Ngày làm việc, lịch và chấm công

Phân biệt ngày theo lịch, ngày làm việc theo lịch được giao, giờ/ca dự kiến, công thực tế và công được duyệt để tính lương. Lịch có pháp nhân/địa điểm, múi giờ, ngày nghỉ, ca, giờ nghỉ, làm từ xa, part-time và ngày hiệu lực. Không hard-code mọi người làm thứ Hai–thứ Sáu hoặc một ngày luôn bằng tám giờ.

Nhân viên xem lịch của mình, check-in/out nếu được bật, xem công đã nhập và gửi sửa công. HR có thể nhập công với nguồn rõ ràng, upload bảng có preview và đối soát. Bản ghi gốc được giữ; sửa qua điều chỉnh và audit. Không mặc định nhận diện khuôn mặt, GPS hoặc kết nối thiết bị.

Nhập bảng công dùng CSV UTF-8 tối đa 512 KB/100 dòng với các cột `employee_code,work_date,shift_key,check_in_local,check_out_local,break_minutes`. Preview đối chiếu nhân viên, đợt làm việc, lịch/ca/múi giờ, ngày nghỉ, OT, đơn nghỉ và dòng trùng; mỗi lỗi chỉ hiện số dòng và mã lỗi, không lưu dữ liệu cá nhân của dòng không hợp lệ. CSV gốc không được giữ. Không tạo công trước khi người có quyền xem đối soát và xác nhận; bản nhập đã xác nhận tạo công ở trạng thái chờ rà soát, không tự duyệt. Kỳ công không được khóa khi còn preview đang chờ. Xác nhận giữ checksum, người/thời điểm và liên kết dòng → bản ghi công; từ chối/hoàn tất xóa dữ liệu trùng ở staging, giữ dấu vết tối thiểu. Không upsert hay sửa bản ghi công đã có; cần chỉnh qua quy trình giải trình.

Giải trình: `draft → submitted → approved/rejected → applied`; gồm ngày/ca, giá trị gốc, đề nghị mới, lý do, bằng chứng và người duyệt. Không tự duyệt. Có nhãn thiếu check-out, trùng lần ghi, nghỉ phép trùng giờ, ngày lễ, đi công tác, ca qua nửa đêm, thay ca và dữ liệu chưa xác minh.

Lưu instant theo UTC và múi giờ lịch cho hiển thị/tính ngày; ca qua đêm tính theo quy tắc lịch có phiên bản, không cắt sai theo ngày UTC. OT có đăng ký/phê duyệt, giờ thực tế và giờ được tính riêng. Hệ số OT và điều kiện áp dụng là cấu hình được rà soát, không tự suy từ số giờ có mặt.

Chốt công theo kỳ `open → reviewing → locked`. Chỉ snapshot đã khóa và hợp lệ được vào kỳ lương. Sửa sau khóa qua yêu cầu mở lại có quyền/lý do; kỳ lương đã phát hành thì dùng điều chỉnh kỳ sau, không thay lịch sử.

## 9. Xin nghỉ phép và các yêu cầu thời gian

Loại nghỉ cấu hình: phép năm, nghỉ không lương, nghỉ ốm, thai sản/chăm sóc gia đình, việc riêng, nghỉ bù và loại khác theo chính sách thực tế. Phân biệt nghỉ hưởng lương/không lương, hạn mức, chứng từ, người duyệt và tác động tới công/lương. Không mặc định mọi loại đều trừ cùng một quỹ.

Nhân viên chọn loại, khoảng ngày/giờ hoặc nửa ngày, lý do chỉ khi cần, người bàn giao và tệp nếu bắt buộc. Preview hiện số giờ/ngày bị trừ, ngày nghỉ/lễ bị loại, số dư dự kiến, phiên bản chính sách và tuyến duyệt. Không tự lấy số ngày lịch làm số ngày phép.

Nếu loại nghỉ yêu cầu chứng từ, nhân viên gửi đơn trước rồi tải PDF vào đúng đơn; HR cũng có thể tải thay trong phạm vi quyền. Tệp được kiểm tra chữ ký PDF, lưu riêng trong R2 và cách ly đến khi người khác rà soát. Đơn vẫn ở trạng thái chờ; không thể duyệt trước khi chứng từ đạt rà soát. Người quản lý được giao xem trạng thái và mở PDF để rà soát, nhưng không xem lý do nghỉ riêng tư. `leave_evidence` có danh mục retention/legal hold riêng; không có thời hạn mặc định, và production vẫn đóng tới khi owner phê duyệt căn cứ/thời hạn.

Luồng: `draft → submitted → pending_approval → approved/rejected`; rút trước duyệt thành `withdrawn`; hủy đơn đã duyệt là yêu cầu riêng `cancellation_requested → cancelled/cancellation_rejected`. Sửa đơn đang duyệt tạo revision và vô hiệu phê duyệt cũ; thay đổi sau duyệt phải xin lại. Lý do từ chối/bổ sung được ghi và nhân viên nhìn thấy.

Số dư là sổ biến động: đầu kỳ, tích lũy, cấp bổ sung, giữ chỗ đơn đang chờ, sử dụng, hoàn khi hủy, chuyển kỳ, hết hạn và điều chỉnh. Phân biệt số dư đã hưởng với số khả dụng sau giữ chỗ. Chính sách tích lũy, prorate theo ngày vào/nghỉ, carry-over, hết hạn và cho phép âm đều có phiên bản và ngày hiệu lực. Điều chỉnh cần actor, lý do, tham chiếu; không sửa trực tiếp số dư không dấu vết.

Gửi/duyệt phải kiểm tra lại số dư, xung đột và revision trong giao dịch hoặc thao tác có điều kiện để hai đơn đồng thời không dùng trùng phép. Đơn không hợp lệ không được giữ chỗ; từ chối/rút giải phóng đúng một lần. Hủy sau chốt lương tạo điều chỉnh, không viết lại kỳ đã phát hành.

Lịch đội chỉ hiện “vắng mặt” và khoảng thời gian cần điều phối; không lộ chẩn đoán, chứng từ y tế hay lý do riêng tư. Đổi người quản lý lúc đang duyệt phải tái kiểm tra người có quyền hiện tại và audit chuyển tuyến. Có hàng chờ quá hạn, người duyệt thay thế và nhắc việc; không tự duyệt khi quá hạn.

Các yêu cầu liên quan: làm từ xa, đổi ca, đi công tác, OT và sửa công có loại, bằng chứng, tuyến duyệt và tác động riêng. Phê duyệt công tác không tự tạo chi trả công tác phí.

## 10. Bảng lương và payslip

### 10.1. Dữ liệu và kiểm soát

Cấu hình kỳ, pháp nhân, loại tiền, ngày chốt/phát hành, người chuẩn bị/phê duyệt; cấu phần lương, phụ cấp, thưởng, OT, khoản trừ, tạm ứng/hoàn ứng, thuế và bảo hiểm theo chính sách được rà soát. Thành phần thiếu dữ liệu phải chặn tính hoặc đánh dấu cần xử lý; không thay unknown bằng 0.

Mỗi dòng tính truy về hợp đồng/thu nhập có hiệu lực, snapshot công/phép đã khóa, dữ liệu điều chỉnh và phiên bản quy tắc. Tiền dùng đơn vị nhỏ nhất hoặc decimal cố định; lưu quy tắc làm tròn và loại tiền, không dùng float cho quyết toán. Không cộng các loại tiền khác nhau mà thiếu tỷ giá, nguồn và ngày quy đổi được duyệt. Nếu cần quy tắc tính cấu hình, dùng toán tử/dữ liệu khai báo có whitelist và validation; không chạy SQL, mã hay biểu thức tùy ý.

CRM commission đã ghi nhận không tự thành lương. Chỉ nhập khoản được bên phụ trách xác nhận với nguồn, kỳ và mã chống trùng; giữ nguyên điều kiện đã thu tiền, đã bàn giao và giữ khách của chính sách CRM. Không mở dữ liệu khách hàng hoặc ledger CRM cho nhân viên qua payslip.

**Implementation boundary (2026-10-15):** P4 currently stores reviewed component definitions without executable formulas and totals entered integer minor-unit amounts exactly. It does not calculate statutory tax/insurance, overtime, foreign exchange or CRM commission. Each required component must be entered with a source reference; unknown values are not zero. Until a responsible owner approves policy and an independent specialist reconciles a synthetic parallel run, payroll stays closed and no live payslip/payment workflow is available.

### 10.2. Trạng thái kỳ và phát hành

`draft → calculated → reviewed → approved → published → closed`. Người soạn không tự duyệt; thay đầu vào sau duyệt làm mất phê duyệt và phải tính/duyệt lại trước phát hành. Nếu chỉ có một người có quyền thì kỳ đứng chờ, không âm thầm bỏ nguyên tắc. Phát hành là thao tác tường minh, idempotent; nhân viên chỉ thấy payslip đã phát hành của mình.

Payslip có mã/kỳ, pháp nhân, nhân viên, ngày phát hành, phiên bản, thu nhập gộp, từng khoản cộng/trừ, dữ liệu công/phép liên quan, tổng khấu trừ, thực nhận và diễn giải. Có bản HTML dễ đọc và bản tải riêng tư; bản tải khớp snapshot. Không hiển thị mọi payslip trong HTML rồi ẩn bằng giao diện.

“Đã phát hành phiếu lương” khác “đã trả lương”. Thanh toán có luồng `unconfirmed → partially_confirmed → confirmed`, với số tiền, ngày, tham chiếu và người xác nhận có quyền riêng `hrm.payroll.payment.confirm`. Chỉ ghi đã trả khi có bằng chứng được đối soát. HRM không tự chuyển tiền. Mở/truy cập payslip không tự coi nhân viên đồng ý số tiền.

Kỳ đã phát hành bất biến; sai sót tạo phiên bản điều chỉnh có liên kết bản trước, lý do và phê duyệt, giữ các bản lịch sử. Khoản bù/truy thu liên kết kỳ gốc và kỳ thực hiện, chống tính hai lần. Hủy bản trước phải ghi hiệu lực thay thế, không xóa bằng chứng đã phát hành.

### 10.3. Khiếu nại và đối soát

Nhân viên gửi thắc mắc theo kỳ/khoản; Payroll xử lý `submitted → investigating → answered → resolved/reopened`, giữ lịch sử trao đổi và quyết định. Không sửa payslip trực tiếp từ ticket. Báo cáo tổng đối soát với các dòng; export ngân hàng/bảng kê là grant riêng, file có hạn, audit và không tự upload bên ngoài.

## 11. Phúc lợi, tài sản và dịch vụ nhân viên

- **Phúc lợi:** danh mục, điều kiện hưởng và mốc hiệu lực, đăng ký/hủy, chứng từ, trạng thái xử lý; hạn mức và khoản chi phải có nguồn xác nhận, không tự đưa vào payslip.
- **Tài sản:** mã tài sản, tình trạng, người nhận, ngày giao/trả, biên bản xác nhận, phụ kiện và chênh lệch. Không tự khấu trừ lương vì mất tài sản.
- **Đào tạo và đánh giá:** mục tiêu, người đánh giá, kỳ, bằng chứng, phản hồi nhân viên, kế hoạch phát triển, chứng chỉ cần gia hạn. Tách nội dung đánh giá riêng tư khỏi danh bạ và lịch đội.
- **Yêu cầu HR:** xác nhận công tác, bổ sung giấy tờ, đổi thông tin, hỗ trợ chính sách, hoàn ứng/công tác phí và phản ánh. Có người xử lý, hạn, trạng thái, tệp và lịch sử; yêu cầu nhạy cảm không tự chuyển cho quản lý bị phản ánh.
- **Thông báo:** trung tâm việc cần làm và thông báo trong ứng dụng trước; email/kênh bên ngoài chỉ là tích hợp được cấu hình riêng. Thông báo bên ngoài chỉ ghi có việc cần xử lý và link đăng nhập, không đính CCCD, lương, người phụ thuộc hoặc nội dung COI.

Không gửi dữ liệu HRM qua webhook Lark CRM hiện có. Outbox có khóa chống gửi trùng và retry có giới hạn; lỗi thông báo không làm thất bại thao tác HRM. Nhân viên xem được trạng thái thực tế ngay cả khi kênh nhắc việc bị lỗi.

## 12. Mô hình dữ liệu và kiến trúc đề xuất

| Nhóm bảng đề xuất | Nội dung và bất biến |
|---|---|
| `hrm_people`, `hrm_employments`, `hrm_assignments` | Người, từng đợt làm việc, cơ cấu/quản lý có mốc hiệu lực; không trùng liên kết tài khoản |
| `hrm_identity_records`, `hrm_dependents`, `hrm_bank_accounts` | Dữ liệu hạn chế tách khỏi trường danh bạ; có phiên bản/xác minh |
| `hrm_files`, `hrm_file_versions` | Metadata R2, chủ thể, quyền, checksum, trạng thái, retention/hold |
| `hrm_contracts`, `hrm_contract_versions` | Hợp đồng và phụ lục có hiệu lực, snapshot bất biến khi phát hành |
| `hrm_document_templates`, `hrm_document_issues`, `hrm_document_actions` | Mẫu, bản phát hành, các bên, bằng chứng xem/ký/xác nhận |
| `hrm_coi_declarations`, `hrm_coi_reviews` | Khai báo, revision, người rà soát và kết quả có quyền riêng |
| `hrm_calendars`, `hrm_shifts`, `hrm_time_entries`, `hrm_time_adjustments` | Lịch/ca có phiên bản; công gốc và sửa công độc lập |
| `hrm_leave_policies`, `hrm_leave_requests`, `hrm_leave_ledger` | Chính sách theo hiệu lực, đơn và sổ phép chống trùng |
| `hrm_approval_steps`, `hrm_approval_delegations`, `hrm_approval_delegation_history` | Tuyến duyệt snapshot, quyết định từng bước và ủy quyền công/nghỉ có hiệu lực, thu hồi và lịch sử bất biến |
| `hrm_payroll_runs`, `hrm_payroll_inputs`, `hrm_payslips`, `hrm_payroll_adjustments`, `hrm_payment_confirmations` | Snapshot, khoản tính, bản phát hành bất biến, điều chỉnh và bằng chứng trả tiền |
| `hrm_onboarding_templates`, `hrm_onboarding_plans`, `hrm_onboarding_tasks`, `hrm_onboarding_dependencies`, `hrm_onboarding_submissions` | Mẫu phiên bản, kế hoạch theo đợt làm việc, todo có owner/hạn, phụ thuộc không chu trình, bằng chứng và lần kiểm tra |
| `hrm_checklists`, `hrm_assets`, `hrm_benefits`, `hrm_service_requests` | Vòng đời, tài sản, phúc lợi, dịch vụ HR |
| `hrm_events`, `hrm_audit`, `hrm_outbox` | Nghiệp vụ, audit hạn chế dữ liệu và thông báo idempotent |

Đề xuất lưu bảng HRM có prefix riêng trong D1 nghiệp vụ hiện có, tách khỏi schema/dữ liệu EmDash; tệp ở namespace hoặc bucket HRM riêng tư được cấu hình riêng. Quyết định vật lý về database/bucket phải được chốt trước migration đầu tiên dựa trên dung lượng, quyền vận hành và khả năng phục hồi. Không tái dùng candidate file route, CRM token hoặc quyền API CRM cho HRM.

Mọi mutation có actor, thời gian server, revision kỳ vọng và idempotency key khi có nguy cơ retry. Sửa stale trả conflict, không ghi đè. Audit ghi loại sự kiện, đối tượng, người thực hiện, trường thay đổi và lý do; không sao chép toàn bộ CCCD, tài khoản hay tài liệu nhạy cảm vào log. Xem/tải/export dữ liệu nhạy cảm cũng được audit.

Server kiểm tra session hiện tại và scope trong từng truy vấn, không chỉ middleware. Không tải toàn bộ rồi lọc ở client. Dùng server-side pagination và whitelist sort/filter. Đường dẫn/tệp của người khác trả not found; người không được mở module nhận trang 403 song ngữ theo Workspace. POST có bảo vệ CSRF và kiểm tra nguồn theo cơ chế hiện có; kiểm tra phía server cho mọi biểu mẫu.

Tích hợp agent/API là giai đoạn riêng: chưa có thì không quảng cáo. Nếu triển khai, có token và scope HRM riêng, kiểm tra quyền hiện tại, audit, rate limit và phê duyệt cho mutation nhạy cảm; token CRM không dùng được. Agent không mặc định đọc hồ sơ định danh, COI, lương hoặc chứng từ. Dữ liệu tệp là nguồn không đáng tin, không được coi là chỉ thị cho agent.

## 13. Lưu trữ, quyền riêng tư và vận hành

Trước mở production phải chốt mục đích/căn cứ xử lý, trường bắt buộc, người xem, hạn giữ từng loại, quy trình yêu cầu truy cập/sửa/xóa và người chịu trách nhiệm. Không dùng một hạn giữ chung cho ứng viên, CCCD, COI, hợp đồng và payroll. Xóa phải xét nghĩa vụ lưu giữ, tranh chấp/legal hold và tham chiếu; legal hold có người đặt/gỡ và lý do.

Không đưa dữ liệu thật vào fixture, prompt, ảnh chụp demo, log lỗi, analytics hoặc preview công khai. Export hạn chế cột/phạm vi, ghi người xuất và thời hạn; chống CSV formula injection. Backup dữ liệu và file có quyền riêng; phục hồi cần chứng minh khớp metadata/tệp, có dry run với dữ liệu giả. Restore database không tự khôi phục file đã xóa; quy trình phải xử lý cả D1 và R2.

**Retention/legal hold đã triển khai ở P2, chưa phải chính sách production:** phiên bản quy tắc bao phủ ảnh hồ sơ, CCCD/định danh, phụ thuộc, ngân hàng, thuế/bảo hiểm, dữ liệu cá nhân, DOCX nguồn, PDF pháp lý, COI và onboarding. Không có thời hạn mặc định; mỗi danh mục cần một căn cứ được người phụ trách rà soát. `retention_days: null` nghĩa là không lên lịch tự động đủ hạn. Ngày đến hạn hiện tính từ thời điểm tải file; thay đổi policy chặn yêu cầu pending/approved theo version cũ. Kích hoạt policy không tự mở `HRM_LIVE_ENABLED`.

Hold có thể áp dụng cho toàn bộ hồ sơ/danh mục hoặc một tệp, có người đặt, thời gian và lý do; tệp mới cùng danh mục nhận hold. Gỡ hold cần người khác với người đặt. Yêu cầu xóa qua chuỗi người tạo → người duyệt độc lập → System Super Admin thực hiện R2. Hold, version policy thay đổi hoặc sai checksum chặn thao tác. Xóa R2 có retry; D1 giữ checksum, metadata, tham chiếu và tombstone/audit, không cascade xóa hồ sơ nhân viên. Chưa có xóa retention cho dữ liệu cấu trúc, diễn tập restore phối hợp D1/R2, hay thời hạn/category basis được owner phê duyệt; không bật production cho tới khi các điều kiện đó được chốt.

Giám sát hàng chờ duyệt, tài liệu hết hạn, lỗi file/thông báo, sai lệch công/lương và job thất bại; không đưa số lương hay số CCCD vào metric. Có runbook sự cố lộ tệp, ghép nhầm danh tính, phát hành nhầm payslip và khóa kỳ sai. Ngừng phát hành/tải phạm vi bị ảnh hưởng, giữ bằng chứng, sửa quyền và đối soát; không xóa audit để “dọn lỗi”.

Migration cộng thêm, không phá bảng ATS/CRM; ghi điểm phục hồi và xác minh quyền/tệp trước mở module. Tính năng chưa qua gate ẩn bằng cấu hình tường minh, không thêm menu rỗng cho mọi nhân viên. Thay `main` là release production; tuân thủ runbook hiện có khi được yêu cầu triển khai.

## 14. Tiêu chí nghiệm thu bắt buộc

Các kiểm tra dưới đây là yêu cầu cho triển khai, **chưa phải kết quả test**. Dùng nhân viên và tài liệu giả, kiểm chứng cả trang, endpoint, truy vấn và file trên biên Worker/D1/R2 thật ở môi trường kiểm thử.

| ID | Tình huống | Kết quả bắt buộc |
|---|---|---|
| HRM-01 | Nhân viên A sửa URL/ID/payload để xem B, phụ thuộc, file hoặc payslip B | Không trả dữ liệu, kể cả metadata, thumbnail, HTML và export |
| HRM-02 | Người chỉ có HR ATS, Finance CRM, Partner hoặc Sales Manager vào HRM | Không có quyền HRM tự động; ATS/CRM vẫn hoạt động như trước |
| HRM-03 | Quản lý xem đội hoặc nhân viên đổi đội | Chỉ phạm vi hiệu lực; không có CCCD, lương, COI, lý do nghỉ riêng tư |
| HRM-04 | Thu hồi quyền/vô hiệu tài khoản trong lúc đang dùng | Request kế tiếp và job nhạy cảm tái kiểm tra; tải file/export bị chặn |
| HRM-05 | Hai người sửa hồ sơ cùng revision | Lần stale bị conflict; lịch sử và dữ liệu đã duyệt được giữ |
| HRM-06 | Xin nghỉ nửa ngày, ngày lễ, lịch part-time, ca đêm | Tính theo lịch/chính sách đúng, có preview và nguồn tính |
| HRM-07 | Hai đơn phép gửi/duyệt đồng thời hoặc retry | Không âm sai quy tắc, không giữ/trừ/hoàn phép hai lần |
| HRM-08 | Tự duyệt, ủy quyền hết hạn hoặc đổi quản lý khi chờ duyệt | Chặn người không hợp lệ; chuyển tuyến có audit, không auto-approve |
| HRM-09 | Hủy phép hoặc sửa công sau phát hành lương | Bản cũ không đổi; tạo điều chỉnh có tham chiếu/phê duyệt |
| HRM-10 | Tài liệu đã xem, đã xác nhận đọc, scan chưa kiểm tra | Trạng thái riêng; không gọi tất cả là “đã ký” |
| HRM-11 | Sửa mẫu NDA, phát hành lại, callback ký trùng/trễ/giả | Snapshot cũ giữ nguyên; nguồn không hợp lệ bị từ chối; không hoàn tất hai lần |
| HRM-12 | COI cần bổ sung hoặc có biện pháp giảm xung đột | Lưu từng khai báo/quyết định; người ngoài tuyến không đọc được |
| HRM-13 | Lương thiếu đầu vào, làm tròn, nhiều tiền tệ hoặc commission nhập lại | Không tính âm thầm, không cộng sai tiền tệ, không tính hai lần |
| HRM-14 | Người soạn tự duyệt, sửa sau duyệt, phát hành retry | Chặn tự duyệt; hủy phê duyệt khi sửa; một bản hợp lệ cho mỗi revision |
| HRM-15 | Phát hành phiếu nhưng chưa đối soát trả tiền | Không ghi đã thanh toán; tổng phiếu khớp từng khoản và snapshot |
| HRM-16 | Tải file công khai, sai MIME, file nguy hiểm, cache, hold và export | Không truy cập công khai; cách ly/từ chối; no-store; hold chặn xóa; scope và audit đúng |
| HRM-17 | Chuyển ứng viên thành nhân viên rồi ATS chạy retention | Chuyển đúng trường một lần; HRM không mất tài liệu có vòng đời độc lập |
| HRM-18 | Nghỉ việc/quay lại, thu hồi nhiều vai trò hoặc xóa có legal hold | HRM bị khóa theo employment; Workspace access có audit; lịch sử giữ đúng; hold ngăn xóa |
| HRM-19 | Lark CRM/kênh nhắc việc lỗi hoặc retry | Không gửi dữ liệu HRM qua CRM; nghiệp vụ thành công, outbox không gửi trùng |
| HRM-20 | EN/VI, mobile, bàn phím, giảm motion và không JS | Nội dung/quyền/trạng thái tương đương, không tràn trang, luồng lõi hoàn tất |
| HRM-21 | Restore metadata và file từ bản phục hồi thử | Khớp tham chiếu/checksum, không phục hồi quyền đã thu hồi ngoài ý muốn |
| HRM-22 | Tạo onboarding theo mẫu, retry hoặc đổi ngày bắt đầu | Không trùng kế hoạch/việc; snapshot mẫu giữ nguyên; đổi hạn có preview, xác nhận và lịch sử |
| HRM-23 | Nộp hồ sơ/ký chưa đủ bên, task bị chặn hoặc miễn không hợp lệ | Không báo hoàn tất sai; phụ thuộc được kiểm tra, chu trình bị từ chối, miễn cần quyền và lý do |
| HRM-24 | Buddy/quản lý mở todo có CCCD, COI, lương hoặc cấp quyền | Chỉ thấy trạng thái được phép; nguồn/tệp vẫn có quyền riêng; không cấp quyền qua todo |
| HRM-25 | Người phụ trách mất quyền, hủy gia nhập hoặc kết thúc onboarding | Có hàng chờ phân công lại; dừng nhắc việc đã hủy; không tự duyệt thử việc hay bỏ bước thu hồi |
| HRM-26 | CSV vượt giới hạn/sai header, có dòng lỗi/trùng, assignment đổi, retry xác nhận hoặc khóa kỳ còn preview | Không ghi trước xác nhận; lỗi chỉ giữ số dòng/mã lỗi; xác nhận atomic/idempotent tạo công chờ duyệt; từ chối/hoàn tất xóa staging PII, giữ checksum/audit/liên kết; kỳ không khóa khi preview còn mở |
| HRM-27 | Loại phép bắt buộc chứng từ nhưng thiếu PDF, file sai chữ ký, upload/review lặp, reviewer không đúng scope, giữ hồ sơ hoặc người khác mở file | Thiếu/chưa review phải chặn duyệt; PDF cách ly/private, checksum và actor/time được audit, uploader không tự review; legal hold/retention bao phủ file mới; employee chỉ xem đơn và chứng từ của mình |
| HRM-28 | Nhân viên/HR sửa đơn đang chờ duyệt, retry sửa, revision cũ có PDF, reviewer dùng revision stale | Lưu snapshot bất biến trước/sau cùng actor/thời gian/lý do; update dùng expected-version và idempotency; tính lại số giờ/số dư; phê duyệt chỉ gắn revision mới; PDF của revision trước không thỏa chứng từ và phải được nộp/rà soát lại |

Trước mỗi giai đoạn: cập nhật permission map, migration, navigation, middleware, tài liệu và hai locale cùng thay đổi; chạy `npm run build` cùng các kiểm tra phù hợp. Build xanh không chứng minh tính đúng của payroll, chữ ký hay quyền truy cập production.

## 15. Trình tự triển khai và điều kiện mở

| Giai đoạn | Kết quả phải có | Gate trước khi mở |
|---|---|---|
| P0 — Chốt chính sách | Pháp nhân, đối tượng, permission map, mục đích dữ liệu, retention, người duyệt, cách ký từng giấy tờ | Owner/HR/người phụ trách chuyên môn duyệt các quyết định §16 |
| P1 — Hồ sơ và cổng nhân viên | Danh tính, hồ sơ, phụ thuộc, file, đề nghị sửa, danh bạ hạn chế, EN/VI | HRM-01–05, 16, 18, 20; hồi quy ATS/CRM |
| P2 — Hồ sơ pháp lý và vòng đời | Hợp đồng, NDA, COI, chính sách, onboarding/offboarding, ký giấy/xác nhận đọc | HRM-08, 10–12, 17–19, 22–25; ký điện tử chỉ bật sau kiểm chứng riêng |
| P3 — Công và phép | Lịch/ca, giải trình, import/đối soát công, tuyến duyệt, sổ phép, chứng từ và chốt công | HRM-06–09, 26–28; đối chiếu với bộ công/phép đã được HR kiểm tra |
| P4 — Lương và payslip | Snapshot, tính/duyệt, phiếu, khiếu nại, điều chỉnh, xác nhận trả tiền | HRM-09, 13–15; ít nhất một kỳ chạy song song được đối soát không có chênh lệch chưa giải thích |
| P5 — Mở rộng | Phúc lợi, tài sản, đào tạo/đánh giá, reports, tích hợp có nhu cầu thật | Gate quyền/dữ liệu cho từng chức năng; HRM-19–21 và hồi quy |

Thử nghiệm rẻ nhất: HR và một nhóm nhân viên được chọn dùng dữ liệu giả đi hết chuỗi tạo hồ sơ → NDA/COI → xin nghỉ → chốt công → đọc payslip. Ghi từng bước không hoàn tất, dữ liệu còn thiếu và phạm vi quyền sai trước khi thêm tích hợp.

Trong bảy ngày đầu của dự án triển khai: chốt quyết định P0; đi thử chuỗi trên với biểu mẫu/mẫu tài liệu hiện có; chọn backlog P1 theo lỗi đã quan sát. Đây là khuyến nghị kế hoạch, chưa phải cam kết tiến độ.

Tiếp tục mở giai đoạn khi mọi test quyền/privacy tương ứng đạt, không còn sai lệch tài chính hoặc trạng thái ký chưa giải thích, và người phụ trách xác nhận các chính sách áp dụng. Dừng phát hành nếu rò dữ liệu giữa nhân viên, mất bằng chứng, ghép nhầm người, tự duyệt hoặc chưa xác định phương thức ký hợp lệ. Không đánh đổi các gate này để đạt deadline.

## 16. Quyết định còn phải chốt

1. Pháp nhân, nơi làm việc, loại quan hệ lao động/cộng tác nào dùng HRM; Partner CRM không mặc nhiên là nhân viên.
2. Ai giữ vai trò HRM Officer, Payroll Officer, người phê duyệt độc lập và người rà soát COI; tuyến dự phòng là ai.
3. Trường bắt buộc, mục đích/căn cứ xử lý, retention và legal hold từng loại; ai xử lý yêu cầu dữ liệu cá nhân.
4. Mẫu hợp đồng/NDA/COI/chính sách hiện có; phương thức ký/xác nhận cho từng loại; có cần nhà cung cấp ký điện tử ngay không.
5. Lịch làm việc, ca, cách ghi công, loại phép, tích lũy/carry-over, OT và thời hạn chốt thực tế.
6. Cấu phần lương, thuế/bảo hiểm, làm tròn, ngày trả, quy trình tạm ứng/hoàn ứng và xử lý khiếu nại; ai kiểm tra chuyên môn.
7. D1/bucket vật lý, nhu cầu mã hóa bổ sung, cách kiểm tra file, sao lưu và mục tiêu phục hồi; không đoán khả năng đang có.
8. Kênh thông báo được phép và nội dung tối thiểu; thời điểm tắt quyền sau nghỉ việc, cách bàn giao giấy tờ sau đó.

9. Mẫu onboarding theo vị trí, nhiệm vụ bắt buộc/tùy chọn, mốc ngày làm việc/ngày lịch, người kiểm tra, quyền miễn và tuyến xử lý quá hạn.

## 17. Tài liệu liên quan

- [Prompt /goal triển khai đầy đủ HRM](goal-hrm.md)

- [Workspace: vai trò, điều hướng và cách thêm module](../../workspace/README.md)
- [Hợp đồng hướng dẫn repo](../../../AGENTS.md)
- [Thiết kế và khả năng truy cập](../../../DESIGN.md)
- [Quy trình kỹ thuật và phục hồi tác vụ](../../engineering-practices.md)
- [CRM: ranh giới API và token](../../crm/API.md)
- [CRM: chính sách hoa hồng](../../crm/COMMISSION.md)
- [Runbook release hiện có](../../crm/RUNBOOK.md)

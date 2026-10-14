# Prompt /goal — Hoàn thiện phân hệ HRM trong Lumi Workspace

Copy toàn bộ khối dưới đây để bắt đầu một nhiệm vụ triển khai. Prompt này mô tả công việc tương lai; việc lưu hoặc merge tài liệu không đồng nghĩa HRM đã được triển khai.

```text
/goal Hoàn thiện phân hệ HRM trong /Volumes/SSD/www.runlumi thành một module nhân sự dùng được từ đầu đến cuối: nhân viên tự phục vụ, HR quản lý hồ sơ và tài liệu pháp lý, quản lý xử lý công/phép, người phụ trách payroll phát hành payslip có kiểm soát. Hoàn tất toàn bộ phạm vi đã đặc tả, không dừng ở scaffold, schema, menu, trang demo hoặc happy path.

NGUỒN SỰ THẬT VÀ PHẠM VI

Đọc AGENTS.md hiện tại, DESIGN.md, docs/specs/hrm/README.md, docs/workspace/README.md, docs/engineering-practices.md, docs/crm/API.md, docs/crm/COMMISSION.md và docs/crm/RUNBOOK.md §12. Kiểm tra lại code, migration, dependency, deployment và trạng thái Git thật; tài liệu cũ không thay thế bằng chứng. Nếu đường dẫn nguồn đã thay đổi, tìm nguồn canonical tương ứng trước khi triển khai.

docs/specs/hrm/README.md là hợp đồng sản phẩm: thực hiện §1–13, toàn bộ HRM-01–28 ở §14, thứ tự/gate P0–P5 ở §15 và các quyết định §16. Các tiêu chí trong prompt này bổ sung cho đặc tả, không thay thế hoặc thu hẹp đặc tả. Lập ma trận từng yêu cầu → code → test → bằng chứng → trạng thái.

Đây là nhiệm vụ triển khai được ủy quyền khi người dùng gửi prompt này. Tạo PR theo từng giai đoạn, merge phần đã qua gate và kiểm tra production sau merge; không merge phase chưa sẵn sàng. Main thay đổi sẽ phát hành production. Không gộp tất cả thành một PR lớn thiếu khả năng kiểm tra/rollback.

Không tự mở quyền, gửi thông báo chứa dữ liệu thật, thu thập giấy tờ thật, ký văn bản thay nhân viên, phát hành lương thật, xác nhận trả tiền hoặc thay đổi dữ liệu nhân sự thật để lấy bằng chứng. Kiểm thử bằng dữ liệu giả ở môi trường tách biệt. Không chuyển tiền, nộp thuế/bảo hiểm, gửi lời mời bên ngoài hoặc provision hệ thống bên ngoài nếu chưa được ủy quyền riêng. Lưu credential mới hoặc bật tích hợp bên ngoài cần quyết định cụ thể của owner trước hành động đó; tiếp tục các phần độc lập trong lúc chờ.

CÁCH THỰC HIỆN

1. Kiểm tra nhánh, HEAD, remote, PR đã tồn tại/đã merge và thay đổi chưa commit. Giữ nguyên WIP không thuộc nhiệm vụ; dùng checkout/worktree riêng nếu cần. Không stash/reset/clean hoặc sửa dữ liệu người khác. Không đổi lockfile hay framework nếu không có nhu cầu được chứng minh.
2. Tạo docs/specs/hrm/STATUS.md làm hồ sơ triển khai: phase, yêu cầu, quyết định, revision, lệnh đã chạy, bằng chứng, lỗi và việc tiếp theo. Ghi PASS/FAIL/UNPROVEN/BLOCKED chính xác. Không dùng số test xanh thay cho chứng minh hành vi.
3. P0: chốt phạm vi pháp nhân, chính sách, cách ký, dữ liệu tối thiểu, retention và người phê duyệt. Những quyết định kỹ thuật có thể đảo ngược thì chọn theo repo và ghi rõ. Chính sách pháp lý/thuế/bảo hiểm, grant thật hoặc phương thức ký chưa được duyệt phải đứng chờ ở điểm phụ thuộc; không tự giả định, không chặn phần độc lập.
4. Mỗi phase phải hoàn thành một luồng dọc: migration + logic server + permission + giao diện EN/VI + validation + audit + test + hướng dẫn vận hành. Không tạo phần giao diện làm người dùng tưởng nghiệp vụ đã hoạt động khi nguồn dữ liệu chưa có.
5. Đọc tài liệu chính thức hiện tại khi cần API/SDK hoặc thay cấu hình Cloudflare; kiểm tra nguồn có thể thay đổi. Không dùng kiến thức nhớ lại làm bằng chứng tuân thủ pháp luật hoặc giá trị pháp lý chữ ký.
6. Khi gặp lỗi, xác định nguyên nhân và kiểm tra nhỏ nhất có thể phân biệt các giả thuyết. Không làm yếu test, quyền, kiểm soát tài chính hay gate để đạt PASS. Trước interruption/compaction, ghi checkpoint đã che thông tin nhạy cảm theo resume protocol; khi tiếp tục kiểm tra lại trạng thái thật.

BẤT BIẾN DANH TÍNH, QUYỀN VÀ DỮ LIỆU

- Tái sử dụng EmDash users, session và trạng thái tài khoản. Không tạo auth riêng. employee_id là định danh nghiệp vụ, liên kết có xác minh với EmDash user ID; không ghép tự động bằng email.
- Workspace dùng chung allowlist, role model, permission map, nav và WorkspaceShell. HRM có capability riêng; HR ATS, Finance CRM, Sales Manager và Partner không mặc nhiên có quyền HRM. Chỉ Admin quản lý users/roles; không tự thay quyền của mình.
- Grant HRM tường minh; kết hợp vai trò không bỏ scope, khóa kỳ hay nguyên tắc không tự duyệt. Tạo migration additive cho CHECK constraint và kiểm chứng các grant ATS/CRM còn nguyên.
- Kiểm tra capability, chủ thể, phạm vi đội hiện tại và loại trường/tệp ở middleware, server loader, API, truy vấn, export và background job. Ẩn giao diện không thay thế kiểm tra quyền. Thu hồi quyền hiệu lực ở request tiếp theo.
- D1 lưu cấu trúc; R2 riêng tư lưu tệp. Không dùng EmDash public media hoặc candidate file route cho HRM. Không URL bucket public, không PII trong client bundle/log/analytics/prompt/fixture. Endpoint tải file kiểm tra quyền và no-store; kiểm tra MIME, size, cách ly và kiểm tra nội dung theo khả năng thật.
- Hồ sơ, ngân hàng, thuế, phụ thuộc, COI, lương và tệp có phạm vi riêng. Danh bạ/manager/buddy không được đọc thêm nhờ liên kết todo. Export giới hạn cột/phạm vi, audit và chống CSV formula injection.
- CRM token/API/MCP không truy cập HRM. HRM không gửi dữ liệu qua Lark CRM. Tích hợp agent HRM không thuộc điều kiện hoàn thành lõi; chỉ làm nếu có yêu cầu thực, với scope riêng và phê duyệt mutation nhạy cảm.
- Mỗi mutation có actor, server timestamp, revision và idempotency khi cần. Snapshot hợp đồng/tài liệu/chính sách/kỳ lương đã phát hành bất biến. Không tạo dữ liệu giả để bù giá trị chưa biết.

P1 — HỒ SƠ VÀ CỔNG NHÂN VIÊN

Hoàn thiện hồ sơ cá nhân/công việc, liên hệ khẩn cấp, ảnh, CCCD/hộ chiếu, tài khoản nhận lương, thuế/bảo hiểm, người phụ thuộc, tệp và lịch sử hiệu lực theo §4–5. Nhân viên xem của mình, tự sửa trường rủi ro thấp và đề nghị sửa trường cần xác minh; HR duyệt với diff cũ/mới, bằng chứng và chống stale. Có danh bạ tối thiểu, tìm kiếm/phân trang server-side, trạng thái thiếu dữ liệu, import có preview và lỗi theo dòng nếu dùng.

Contract Gate: schema + migration + permission map + liên kết danh tính + file custody + routes EN/VI + chiến lược retention đã rõ.
Integration Gate: HRM-01–05, 16, 18, 20 trên Worker/D1/R2 thật với EmDash sessions; không rò giữa A/B; thu hồi quyền có tác dụng; regression ATS/CRM đạt.

P2 — HỢP ĐỒNG, LEGAL PAPERS VÀ ONBOARDING TODO

Hoàn thiện hợp đồng/phụ lục/gia hạn, NDA, COI, chính sách và bằng chứng theo §6. Mẫu có review/phiên bản, phát hành giữ snapshot, đủ bên ký, hạn và lịch sử. Phân biệt đã xem, đã xác nhận đọc, bản giấy đã kiểm tra và chữ ký điện tử được xác minh. Không có provider thì hoàn thiện quy trình ký giấy/scan và acknowledgement đã được duyệt; không giả chữ ký điện tử. COI có khai báo, làm rõ, rà soát, biện pháp, hạn theo dõi và quyền riêng.

Chính sách cho phép người có quyền quản lý legal paper tải DOCX làm nguồn; HR cấu hình metadata, rà soát và phát hành phiên bản bất biến gắn checksum. Nhân viên và HR được tải PDF bằng chứng trong đúng phạm vi vấn đề pháp lý/COI/onboarding họ được phép truy cập; tệp cách ly tới khi rà soát. Nút “đã đọc và xác nhận” phải do nhân viên chủ động bấm và lưu EmDash actor, thời điểm UTC phía server, phiên bản/checksum chính xác cùng lịch sử; giao diện hiển thị thời điểm địa phương. Retry không tạo xác nhận thứ hai. Acknowledgement chỉ là xác nhận đã đọc, không giả thành chữ ký điện tử.

Onboarding phải là hệ công việc thật theo §7.1–7.3:
- Mẫu theo vị trí/pháp nhân, kế hoạch riêng mỗi đợt làm việc và snapshot phiên bản.
- Todo nhân viên, HR, quản lý và người hỗ trợ; owner, reviewer, hạn theo lịch, phụ thuộc không chu trình, hướng dẫn, loại bằng chứng, lần nộp, bình luận có scope và audit.
- Checklist trước ngày đầu, ngày đầu, tuần đầu, check-in và kết thúc thử việc; hồ sơ, NDA/COI, tài khoản, tài sản, đào tạo và mục tiêu công việc.
- Cổng todo của nhân viên và hàng chờ HR/manager; blocked, quá hạn, miễn hợp lệ, đổi ngày bắt đầu có preview, đổi người phụ trách, hủy gia nhập và nhắc việc idempotent.
- Nộp CCCD không tự xác minh CCCD; tick todo không tự ký NDA, cấp quyền hoặc quyết định qua thử việc. Trạng thái hoàn tất phải lấy từ bằng chứng nguồn khi có liên kết.

Hoàn thiện chuyển ATS → HRM có quyền hai phía, preview dữ liệu tối thiểu và chống trùng; vòng đời onboard/điều chuyển/offboard/quay lại có lịch sử. ATS retention không xóa giấy tờ HRM đã được chuyển hợp lệ. Offboarding có bàn giao, thu hồi quyền, tài sản, quyết toán và bàn giao tài liệu theo §7.

Contract Gate: mẫu pháp lý/phương thức ký, evidence model, COI scope, onboarding states/dependencies và nghĩa vụ retention được duyệt hoặc đứng chờ tường minh ở tính năng chưa mở. DOCX, PDF evidence, acknowledgement và chữ ký giấy/điện tử phải có trạng thái/actor/thời điểm rõ ràng.
Integration Gate: HRM-08, 10–12, 17–19, 22–25; xác minh quyền upload DOCX/PDF, kiểm tra nội dung tệp, cách ly, phiên bản/checksum, timestamp/idempotency acknowledgement và nhân viên → nộp/ký/xác nhận → reviewer → bằng chứng → tiến độ thật. Nếu làm provider, kiểm tra callback giả/trùng/trễ/hủy trên provider sandbox thật, không chỉ mock.

P3 — LỊCH LÀM VIỆC, CÔNG VÀ NGHỈ PHÉP

Hoàn thiện lịch có múi giờ/hiệu lực, ngày nghỉ, ca, part-time, làm từ xa, ghi công, import/đối soát, sửa công, OT, công tác và chốt kỳ theo §8–9. CSV công dùng UTF-8, giới hạn 512 KB/100 dòng và header cố định; preview đối chiếu lịch/ca, nhân viên, phép, OT, trùng lặp và dòng lỗi. Không ghi công trước khi HR xác nhận; retry idempotent; staging không lưu CSV thô, không giữ PII dòng lỗi, và xóa bản sao sau xác nhận/từ chối; pending import chặn khóa kỳ. Loại nghỉ bắt buộc chứng từ phải chặn duyệt cho tới khi employee/HR nộp PDF được rà soát độc lập, giữ đúng scope, actor, thời điểm, checksum và retention category. Có preview tính phép, loại nghỉ/chính sách phiên bản, số dư/sổ biến động, giữ chỗ, duyệt nhiều bước nếu được cấu hình, người thay thế hợp lệ, rút/hủy/sửa đơn và xử lý sau khóa kỳ. Lịch đội không lộ lý do riêng tư.

Contract Gate: quy tắc lịch/ca/tích lũy/đơn vị/làm tròn/hold đã chốt; input payroll chỉ lấy công/phép đã khóa; mọi mutation concurrency-safe.
Integration Gate: HRM-06–09, 26–28; kiểm chứng CSV lỗi/trùng, stale assignment, pending-import lock guard, confirm/reject/retry và staging minimization; chứng minh loại nghỉ bắt buộc không được duyệt thiếu PDF hoặc trước khi review, PDF được cách ly/giữ kín, retry không trùng, uploader không thể self-review, quyền employee/manager/HR đúng scope, retention/hold áp dụng và amendment tạo snapshot/version mới, tính lại số dư, vô hiệu chứng từ cũ và chặn revision stale. Đã có test tám đơn 480 phút gửi đồng thời vào quota bốn ngày; delegation theo loại duyệt đã test tạo/thu hồi/hết hạn và đổi quản lý khi đơn chờ. Race cùng một đơn giữa hai quyết định duyệt, hai duyệt hủy và hai amendment chỉ cho một lệnh thắng; hai yêu cầu riêng đã giữ chỗ cũng được duyệt đồng thời mà không vượt số dư. Còn kiểm chứng race amendment/review/correction xuyên nhiều đơn, ngày lễ, nửa ngày, part-time, ca đêm, ma trận browser đầy đủ và bộ expected cases do người phụ trách HR kiểm tra; không chỉ test phản ánh cùng thuật toán.

P4 — PAYROLL VÀ PAYSLIP

Hoàn thiện §10: hợp đồng/thu nhập có hiệu lực + công/phép khóa + cấu phần đã được duyệt → tính lương → kiểm tra độc lập → phê duyệt → phát hành → nhân viên xem/tải → khiếu nại/điều chỉnh → xác nhận thanh toán có bằng chứng.

Không dùng float cho tiền; lưu loại tiền/làm tròn/nguồn/quy tắc. Unknown không bằng 0; thiếu dữ liệu phải chặn. Người soạn không tự duyệt kể cả có nhiều role/Admin. Sửa sau duyệt mất approval; bản đã publish bất biến. Trả lương khác phát hành payslip; thanh toán từng phần và điều chỉnh có dấu vết, không chuyển tiền tự động. Khoản commission nhập từ CRM có xác nhận và chống trùng, không lộ khách hàng/ledger.

Contract Gate: chính sách/đầu vào/cấu phần có reviewer chuyên môn, phân tách người chuẩn bị và duyệt, snapshot và correction model đã chốt.
Integration Gate: HRM-09, 13–15 và quyền/tệp tương ứng; chạy một kỳ dữ liệu giả song song với bộ tính độc lập đã được người phụ trách kiểm tra. Mọi chênh lệch phải được giải thích và phê duyệt. Thiếu người/cấu hình/bằng chứng độc lập thì payroll còn BLOCKED hoặc UNPROVEN, không gọi hoàn thành.

P5 — DỊCH VỤ NHÂN VIÊN, VẬN HÀNH VÀ HOÀN THIỆN

Hoàn thiện §11–13: phúc lợi, tài sản và bàn giao, yêu cầu HR/chứng nhận công tác/hoàn ứng, đào tạo/chứng chỉ/đánh giá có bằng chứng, reports theo quyền, việc đến hạn, trung tâm thông báo, outbox retry và hàng chờ thất bại. Không tự khấu trừ lương vì mất tài sản hoặc tự tạo khoản lương từ phúc lợi. Không gọi tác vụ bên ngoài đã xong chỉ vì người dùng tick.

Có runbook cho file lộ, ghép sai người, phát hành nhầm payslip, sai khóa kỳ, job lỗi; retention/legal hold và yêu cầu dữ liệu; export riêng tư; backup/restore gồm D1 và R2; đối soát orphan file và tài liệu thiếu. Định nghĩa mục tiêu phục hồi được owner duyệt và kiểm tra phục hồi bằng dữ liệu giả. Không dùng backup production để seed môi trường test.

Contract Gate: từng chức năng có nguồn dữ liệu, actor, scope, trạng thái, điều kiện hoàn tất và owner vận hành.
Integration Gate: HRM-19–21, regression đầy đủ HRM-01–28 và các module hiện có; chuỗi end-to-end sau đây chạy được thực tế.

CHUỖI END-TO-END VÀ KIỂM TRA

Dùng ít nhất hai nhân viên, một quản lý, HRM Officer, hai người payroll có trách nhiệm tách biệt, Admin và user chỉ có quyền ATS/CRM. Kiểm tra cả việc kết hợp role và rút role. Không đưa thông tin cá nhân thật vào test.

Luồng bắt buộc:
Ứng viên được tuyển → tạo đợt làm việc/link EmDash → hồ sơ/CCCD/phụ thuộc được xác minh → phát hành và hoàn tất hợp đồng/NDA/COI đúng phương thức → onboarding todo và tài sản/đào tạo → lịch/công → xin nghỉ/duyệt/sửa công → khóa công → tính/duyệt/phát hành payslip → xem/tải/khiếu nại/điều chỉnh → xác nhận trả tiền giả có chứng từ giả → nghỉ việc/thu hồi → kiểm tra retention/restore.

- Chạy unit test cần thiết cho permission/scope, tiền, lịch/ca, sổ phép, states, stale và idempotency; không chỉ test snapshot giao diện.
- Integration chạy application client → Worker → D1/R2 thật cục bộ/staging và phiên EmDash thật của test users. Mocks chỉ hỗ trợ trường hợp lỗi; không thay thế gate tích hợp thật.
- Browser kiểm tra EN/VI, 320–430px, 1280px và desktop lớn, bàn phím/focus, contrast, reduced motion, form không JS, overflow, errors/empty/loading/success. Ghi browser/device đã kiểm tra; không suy từ build.
- Chạy npm run lint, npm test, migration test database mới + nâng cấp database có dữ liệu giả, npm run build và integration phù hợp. Thêm coverage có ý nghĩa cho HRM vào CI; không bỏ regression ATS/CRM.
- Kiểm tra file/export trực tiếp bằng URL và session khác, CSRF, MIME, no-store, quyền sau revoke; không chỉ nhìn menu.
- Không gọi phép tính thuế/pháp lý đúng khi mới có unit test. Ghi nguồn chính sách, hiệu lực, reviewer và phần chưa xác minh.

PR, RELEASE VÀ BẰNG CHỨNG

Mỗi phase có PR hẹp, mô tả vấn đề/kết quả, migration, rủi ro, kiểm tra và điều kiện mở. Review diff và kiểm tra hosted trên đúng head SHA trước merge; không bypass required checks, không force-push công việc đồng thời. Nếu hosted check lỗi hạ tầng/billing, giữ lỗi hiển thị và xử lý theo release contract, không chuyển nhãn thành PASS.

Sau merge: xác nhận SHA trên remote main, kiểm tra Cloudflare Workers Builds/deploy đúng commit, migration/restore point nếu có và phiên bản đang phục vụ; chạy smoke phù hợp. Local test, hosted CI, deployment, provider và production business impact là các lớp bằng chứng riêng. Kiểm tra production chỉ read-only với phạm vi được phép; không tạo hợp đồng/lương/giấy tờ thật để thử.

Module/chức năng chỉ mở cho người dùng thật sau gate và cấu hình được owner duyệt. Giữ phần chưa sẵn sàng tắt có chủ đích; nhưng feature flag không biến phần chưa hoàn tất thành hoàn tất. Nếu có rollback, giữ migration additive và dữ liệu đã tạo, kiểm chứng phiên bản cũ không hỏng ATS/CRM; không tự restore/xóa dữ liệu production.

ĐIỀU KIỆN KẾT THÚC

Chỉ báo hoàn thành khi:
1. Toàn bộ yêu cầu §1–13 và HRM-01–28 được map và đạt; P1–P5 đều có Contract Gate và Integration Gate. Không còn scaffold/TODO hoặc chức năng bắt buộc âm thầm bị thay bằng demo.
2. Chuỗi end-to-end thật chạy được, quyền A/B/team/private-file/payroll/revoke được chứng minh và ATS/CRM không hồi quy.
3. EN/VI và browser accessibility đạt ở các viewport yêu cầu; không có claim chưa được chứng minh.
4. Chính sách bắt buộc, phương thức ký và phép tính có xác nhận đúng chuyên môn; giới hạn/tích hợp tùy chọn được ghi rõ, không giả capability.
5. Các PR phase đã merge với bằng chứng đúng SHA, main remote xác nhận, deploy/migration/smoke được kiểm chứng và runbook vận hành/restore có proof.
6. STATUS.md, hướng dẫn nhân viên/HR/quản lý/payroll, cấu hình và runbook đủ để người khác vận hành, xử lý lỗi và tiếp tục phát triển.

Nếu một phụ thuộc cần owner/provider/credential/pháp lý ngăn gate, hoàn thành phần độc lập, ghi rõ yêu cầu còn thiếu và câu hỏi quyết định tối thiểu. Không kết luận toàn bộ module đã hoàn thành khi còn FAIL/UNPROVEN/BLOCKED ở phạm vi bắt buộc.

Báo cáo cuối bằng tiếng Việt: hành vi đã dùng được, đường dẫn/tài liệu, PR và SHA, bằng chứng từng lớp, thay đổi production và phần còn thiếu. Không chỉ liệt kê số file/test hoặc tuyên bố “full E2E” từ mock/build.
```

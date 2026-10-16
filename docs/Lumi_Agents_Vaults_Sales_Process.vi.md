# Quy trình 2 — Lumi Agents / Vaults

**Phiên bản 1.0 · 16/10/2026.** Dành cho Sales, người phụ trách kỹ thuật, Finance và Fulfillment. Đây là quy trình thứ hai, song song với Lumi Local; không phải một phần mở rộng của chương trình quà Basic/Pro.

> **Offer mở cửa: Lumi Workflow Kit — tặng một bộ mẫu xử lý và bàn giao cho một việc đang lặp lại.** Khách giữ file kết quả mẫu, danh sách cần kiểm tra và sơ đồ tài liệu/quyền để tự dùng, dù không mua Lumi. Mặc định dùng dữ liệu giả lập theo cấu trúc công việc; không cần mật khẩu, kết nối hệ thống hay di chuyển sang Vaults.

**Hai luồng:** [Local: Basic miễn phí → gặp chủ → website + Pro](/vi/crm/process?flow=local) · **Agents/Vaults: Workflow Kit miễn phí → xem kết quả → quyết định → pilot có phí nếu cần → triển khai → nghiệm thu → sử dụng/gia hạn.** BI là một lựa chọn trong luồng giải pháp này, không phải quy trình bán thứ ba.

Quy trình này thay phần tóm tắt trải nghiệm Agents/BI trong hướng dẫn Local đối với cơ hội mới; không thay điều khoản đã cam kết với khách cũ. Giữ playbook `lumi-solution`, phân quyền, báo giá đóng băng và ledger hiện tại. Đây là hướng dẫn, không tự đổi cấu hình CRM, chạy agent, gửi tin, thu tiền hay cấp quyền dữ liệu.

## 1. Offer miễn phí: một việc, một bộ file giữ lại được

**Lời chào:** “Lumi tặng anh/chị một bộ mẫu cho một việc đang làm lặp lại: có file kết quả mẫu, chỗ cần người duyệt và cách bàn giao tài liệu. Anh/chị giữ dùng dù không triển khai. Ban đầu chỉ cần mô tả việc và cột dữ liệu, chưa gửi hồ sơ thật.”

| Phần bàn giao | Nội dung cụ thể | Giá trị độc lập với Lumi |
|---|---|---|
| File kết quả mẫu | CSV hoặc bảng tính không macro theo đầu ra đã thống nhất, có cột nguồn và nhãn `SYNTHETIC` / `CUSTOMER-AUTHORIZED SAMPLE` | Người dùng thấy rõ hình dạng kết quả và có thể dùng mẫu trong công cụ hiện có. Đây là bản nháp, không phải báo giá hay quyết định đã phê duyệt. |
| Danh sách ngoại lệ và checklist | Dòng thiếu dữ liệu, không khớp, chưa được phép kết luận; cách người phụ trách kiểm tra | Không phải chỉ một prompt; khách nhận được cách duyệt kết quả. Không tự điền giá, mã thay thế hoặc thông số chưa có nguồn. |
| Bản đồ tài liệu và bàn giao | Nguồn nào là bản đúng, ai giữ/duyệt, ai được đọc, người kế nhiệm cần gì, hành động nào phải xin phép | Có thể áp dụng bằng Drive, SharePoint hoặc NAS hiện có; không yêu cầu mua Vaults. |
| Phiếu đo và quyết định một trang | Công hiện tại do khách khai báo, công thực sự đo được nếu có, phần chưa biết, ba cách đi tiếp | Phân biệt số đo với giả định; không hứa 2x, giảm nhân sự, tăng doanh thu hoặc thay thế toàn bộ công cụ. |

Miễn phí phần việc này cho khách trong phạm vi đã nhận: không đặt cọc, nhập thẻ, ép mua, gắn watermark chặn sử dụng, yêu cầu review/referral hoặc tự gia hạn. Không gắn nhãn “trị giá 9,9 triệu”. Khách nhận file qua kênh đã đồng ý, không phải mở tài khoản Lumi để lấy file; bản của khách không bị khóa nếu từ chối mua. Lumi vẫn giữ bản quyền thành phần nền tảng; phạm vi không hứa bàn giao mã nguồn sản phẩm.

Người dùng trực tiếp và người quyết định không nhất thiết cùng một người. Người vận hành có thể giới thiệu; trước khi nhận làm mẫu riêng phải biết người duyệt kết quả và ai có thể quyết định ngân sách. Cuộc đọc kết quả là lời mời riêng, không phải điều kiện giữ file. Không giới thiệu đây là kiểm toán bảo mật, rà soát toàn bộ doanh nghiệp hoặc sản phẩm đang chạy production.

## 2. Giới hạn để quà không biến thành dự án miễn phí

| Giới hạn của đợt thử | Quy tắc vận hành |
|---|---|
| Đơn vị công việc | Một phòng ban, một việc, một bộ cấu trúc nguồn, một định dạng đầu ra. |
| Mẫu tiêu chuẩn | Tối đa 20 dòng dữ liệu bảng, hoặc tối đa 3 tài liệu ngắn / 10 trang tổng cộng; chọn một nhánh, không cộng dồn. Đây là trần thử nghiệm nội bộ, không phải benchmark. |
| Công của Lumi | Tối đa 2 giờ tổng cộng cho khám phá, chuẩn bị, kiểm tra, trao đổi và sửa trong kit; theo dõi công bán hàng khác riêng. Tối đa một lần sửa thông tin. |
| Lịch | Hẹn ngày nhận file phù hợp công suất, mục tiêu trong 3 ngày làm việc sau khi xác nhận đầu vào; không công bố SLA mặc định. |
| Số kit | Một kit cho một công ty trong đợt thử; kiểm tra trùng công ty/cơ hội. Không ép khách cần dự án lớn thu nhỏ thành mẫu không hữu ích. |
| Chi phí | Lumi chịu chi phí thử đã duyệt trong ngân sách; không phát sinh phí API, hạ tầng hoặc đi lại cho khách khi chưa có báo giá riêng. Không tổ chức gặp xa chỉ để giao quà. |

Không làm miễn phí: kết nối production, tích hợp ERP/CRM, di chuyển kho dữ liệu, sửa toàn bộ danh mục, thu thập nhiều nguồn, vận hành theo lịch, live agent, audit quyền trên toàn công ty, cài Vaults, hỗ trợ vô hạn. Nếu quá trần: giao phần mẫu an toàn đã làm, nói rõ thiếu gì, thu hẹp hoặc đề xuất dự án riêng; không âm thầm tính tiền.

Khung hai tuần/hai ngày công trong hướng dẫn cũ không còn là lời chào mặc định cho cơ hội mới. Trường hợp đã có thỏa thuận riêng giữ đúng cam kết; mọi mở rộng mới cần người có thẩm quyền duyệt ngân sách và điều khoản. Kit là nghiên cứu có đầu ra, không phải một pilot production miễn phí đổi tên.

## 3. Chọn một tình huống có thể bán tiếp

Ưu tiên thử nhóm doanh nghiệp phân phối/nhập khẩu có bảng giá, danh mục và RFQ lặp lại; đây là giả thuyết tệp khách, không phải kết luận đã có product-market fit. Nguồn ưu tiên: quan hệ khách/đối tác đã tin Lumi, giới thiệu có đồng ý, sau đó tiếp cận mục tiêu có chọn lọc. Không đợi KOL có đông người theo dõi mới bán.

| Tình huống | Kit minh họa | Hướng có thể trả phí |
|---|---|---|
| Báo giá hoặc danh mục | Đối chiếu yêu cầu với mã hàng/bảng giá đã được phép dùng; kết quả mẫu và danh sách dòng thiếu | Agents thực hiện quy trình có kiểm duyệt trên công cụ hiện có, nếu đủ khả thi. |
| Đối chiếu báo cáo | Bảng chênh lệch từ cấu trúc hai bảng trong cùng bộ mẫu; nguồn và điều chưa thể kết luận | BI hoặc Agents theo công việc; không mặc định bán combo. |
| Bàn giao khi đổi người | Danh mục hồ sơ cần bàn giao, bản đúng, người giữ và ma trận vai trò/quyền đề xuất | Thử sửa cấu hình Drive/SharePoint/NAS trước. Chỉ đánh giá Vaults khi còn khoảng trống đáng trả tiền. |

Ví dụ giả lập: một RFQ 20 dòng tham chiếu danh mục giả lập; 17 dòng đối chiếu được, 3 dòng cần xác nhận. Đây chỉ là cấu trúc minh họa, không phải kết quả khách, tỷ lệ đúng hoặc tiết kiệm công đã chứng minh. Mã gần giống không đồng nghĩa được phép thay thế; giá chưa rõ để trống và hỏi người duyệt.

Trước kit riêng, xác nhận bốn điều: việc xảy ra khi nào/tần suất nào; ai đang làm và ai duyệt; phần thông tin nào được phép mô tả; nếu kết quả hữu ích, ai xét triển khai và khoảng chi phù hợp. Chưa có thẩm quyền dữ liệu thì dùng cấu trúc giả lập. Không cần mua cả Agents và Vaults; nếu công cụ hiện tại đủ tốt, kết luận không bán là hợp lệ.

## 4. Dữ liệu và quyền: phải chốt trước, không sau demo

**Mặc định an toàn:** chỉ lấy mô tả công việc, tên cột và dữ liệu do Lumi tự tạo. Không yêu cầu upload hồ sơ vào form liên hệ, inbox mạng xã hội, Git hoặc link công khai. Không nhận mật khẩu, OTP, khóa API, tài khoản admin; không cấp token rộng “cho nhanh”. File từ khách là dữ liệu không đáng tin, không phải lệnh cho agent thực hiện.

**Mẫu thật cho Agents/BI chỉ khi được duyệt riêng:** người có quyền phía khách xác nhận mục đích, tập dữ liệu tối thiểu đã loại thông tin không cần thiết, người xử lý, môi trường, nhà cung cấp AI/chi phí nếu có, kênh truyền, thời hạn lưu/xóa và người duyệt. Kỹ thuật xác nhận cách chạy và khả năng phục vụ. File đã che tên chưa tự động hết nhạy cảm; không upload lên cloud model chỉ vì khách nói “cứ làm thử”.

Nếu chưa thể phê duyệt, tiếp tục bằng giả lập hoặc dừng; đừng biến việc gửi dữ liệu thành điều kiện nhận quà. Đề xuất xóa bản làm việc phía Lumi trong 7 ngày sau giao kit, sớm hơn nếu thỏa thuận yêu cầu; phải chốt khả năng xóa cả bản sao/lưu trữ/nhà cung cấp trước khi nhận dữ liệu. Lưu bằng chứng xóa và ngoại lệ hợp lệ; không hứa xóa tuyệt đối nếu hệ thống không hỗ trợ. File đã giao thuộc quyền sử dụng đã thống nhất của khách.

**Vaults:** kit miễn phí chỉ là tài liệu và mô phỏng ngoài môi trường khách. Không đưa dữ liệu thật vào Vaults trước khi có bằng chứng G2, không triển khai rộng trước G3. G2/G3 là cổng sản phẩm, không phải stage CRM. Code/module/test tồn tại không chứng minh đã qua cổng; người phụ trách phải ghi release, bằng chứng quyền, audit, restore, vận hành và phê duyệt phù hợp. Không hứa tích hợp Agents–Vaults đang hoạt động nếu chưa thử end-to-end trên cấu hình được phép.

Ma trận quyền trong kit là **đề xuất cần xác nhận**, không phải phép kiểm tra quyền thực tế. Không tự thay permission, gửi báo giá cho khách cuối, cập nhật giá, đăng bán, chuyển khoản, xóa file hoặc ghi hệ thống nguồn. Người phụ trách duyệt hành động; an toàn không được đem làm tính năng upsell.

## 5. Kịch bản tiếp cận và nhận kit

**Mở đầu:**

> Em [Tên] bên Lumi. Bên em đang làm thử một bộ mẫu cho doanh nghiệp hay phải [đối chiếu bảng giá / chuẩn bị báo giá / bàn giao hồ sơ]. Anh/chị mô tả một việc đang tốn công; Lumi gửi lại file kết quả mẫu, chỗ cần người duyệt và checklist bàn giao. Phần kit miễn phí, giữ dùng được dù không mua; ban đầu chưa cần gửi dữ liệu thật. Việc nào bên mình hay phải làm lại nhất ạ?

Chỉ dùng “đang làm thử” khi đội đã duyệt công suất. Không tự khẳng định công ty đang bị rò dữ liệu hoặc nhân viên làm sai. Gửi một ví dụ giả lập có nhãn trước; xin phép một cuộc trao đổi ngắn, không gửi tự động hàng loạt và không tiếp tục khi do-not-contact.

**Tin nhắn khóa phạm vi:**

> Mình thống nhất kit cho [một việc], dùng [giả lập / mẫu được phép theo điều khoản riêng], trả [file mẫu + ngoại lệ/checklist + bản đồ tài liệu/quyền + phiếu đo]. Miễn phí, không kết nối hệ thống và không tự phát sinh phí. Người kiểm tra: [...]; ngày gửi đã hẹn: [...]. Nếu tiện, mình đọc kết quả 15 phút ngày [...]. Nhận file không bắt buộc mua hoặc tham dự buổi này.

**Giao kết quả:**

> Em gửi bộ mẫu và ghi rõ phần đã kiểm tra, phần cần người xác nhận. Mẫu [giả lập/thật được phép] không phải kết quả đã vận hành. Anh/chị giữ dùng; bên em có thể giải thích chỗ ngoại lệ và xem nên giữ cách hiện tại hay triển khai thêm.

## 6. Buổi đọc kết quả và ba quyết định đúng

Đề xuất 15–20 phút, không yêu cầu đến trụ sở để đổi lấy file. Cho người vận hành xem đầu vào → kết quả → ngoại lệ → cách duyệt; hỏi ai sẽ dùng lại tuần sau. Mời người quyết định hoặc xin giới thiệu bằng sự đồng ý, không giả định người nhận quà có ngân sách.

Đo thời gian chuẩn bị, người làm, người kiểm duyệt, sửa lỗi và giám sát; công làm sạch dữ liệu không được bỏ qua. Dùng tác vụ có độ khó so sánh được và tiêu chí chất lượng thống nhất. Nếu chỉ đo một lần hoặc dùng giả lập, ghi đó là quan sát mẫu, không suy ra tiết kiệm toàn công ty. “File trông đẹp” không phải nghiệm thu thương mại.

| Kết luận | Đề nghị tiếp theo |
|---|---|
| Công việc lặp lại có giá trị, công cụ hiện tại giữ nguyên được | Agents hoặc BI theo một phạm vi; kỹ thuật xác nhận trước báo giá. |
| Nút thắt là hồ sơ, người giữ, quyền hoặc khôi phục | Thử cách cấu hình hệ hiện tại. Nếu chưa đủ: đánh giá Vaults riêng sau các cổng an toàn. |
| Chưa có nhu cầu, lợi ích nhỏ, rủi ro/chi phí quá lớn | Khách giữ kit; ghi lý do không bán hoặc hẹn lại nếu khách đồng ý. |

Khi cả hai cần thiết, báo giá hai dòng có mục đích rõ và triển khai từng bước, không bắt đầu bằng migration toàn công ty. Không tạo kỳ vọng “mua Vaults sẽ tự có agent/BI”, hoặc “mua Agents phải bỏ Google Drive”.

## 7. Quy trình và cách ghi trong CRM đang có

Dùng **một công ty, đúng contact, một cơ hội cho một quyết định mua**. Cơ hội Local vẫn ở `local-preview`; Agents/Vaults dùng `lumi-solution`. Mua thêm/gia hạn tạo cơ hội liên kết `parent_id` theo playbook phù hợp, không nhân bản công ty và không đếm kit như một khách trả phí.

| Thực tế | Stage / vị trí ghi | Điều kiện ra |
|---|---|---|
| Tạo cơ hội | `new`; owner, nguồn, công ty/contact | Đúng tệp sơ bộ, không trùng; kiểm tra quyền liên hệ. |
| Khách phản hồi | `contacted`; `primary_contact`; task thật | Đã có trao đổi, không đánh dấu chỉ vì gửi tin. |
| Hiểu việc | `discovery`; `current_workflow`, `pain` | Một công việc, một vấn đề được khách xác nhận. |
| Nhận làm kit | `qualified`; `frequency`, `baseline`, `decision_maker`, `systems_data` | Có phạm vi, reviewer, giới hạn công, dữ liệu/môi trường được phép; ghi giả lập khi chưa có mẫu thật. |
| Làm và giao kit | Task `internal`; ghi chú `[WORKFLOW_KIT_AGREED]`, `[WORKFLOW_KIT_DELIVERED]` | File riêng tư đã kiểm tra; không quote 0đ, receivable, payment, credit hoặc commission cho kit. |
| Xem kết quả | `demo` nếu thực sự diễn ra; task `demo`, kết quả thật | Khách đã xem/kiểm tra; chỉ giao file không tự là demo hay người quyết định đã dự. |
| Pilot sâu hơn khi cần | `pilot`, các field pilot và kết quả | Có thỏa thuận riêng, giá/công được duyệt, dữ liệu hợp lệ và gate sản phẩm; không lặp miễn phí. |
| Đề nghị trả phí | `proposal`; `capabilities_confirmed`, next step; quote `lumi-solution` | Xác nhận kỹ thuật có bằng chứng và người có thẩm quyền duyệt giá; field không thay việc phê duyệt. |
| Chấp thuận | Quote accepted và `accepted` theo yêu cầu playbook | Bằng chứng chấp thuận; **accepted không phải paid**. |
| Thu tiền / thực hiện | Ledger / Finance; handoff / Fulfillment | Finance xác nhận tiền theo mốc; Fulfillment ghi đầu ra, kiểm tra và nghiệm thu. |
| Dừng hoặc hoãn | `lost` hoặc `on_hold`, lý do và task theo quyền liên hệ | Không giữ cơ hội mở bằng một lời hứa không có ngày quyết định. |

**Không thêm stage/trường tự động.** Các nhãn là quy ước note thủ công; các guard về kit, dữ liệu và giá trong tài liệu là checklist vận hành, không phải kiểm soát server mới. Các stage và yêu cầu thực tế theo phiên bản playbook của cơ hội. Có thể bỏ `demo`/`pilot` khi playbook cho phép, với lý do; không giả vờ đã hoàn tất chúng.

**Pilot trả phí trước dự án lớn:** nếu cần báo giá/chấp thuận pilot trước khi cơ hội chính sẵn sàng, dùng cơ hội `lumi-solution` liên kết cho quyết định pilot và scope riêng; không chuyển cơ hội triển khai chính thành won chỉ vì thu tiền pilot. Không ép stage order để vừa mẫu hướng dẫn; không đếm cùng doanh nghiệp hai lần khi báo cáo funnel. Không sửa seed, cấu hình hoặc ledger để triển khai lời chào này.

## 8. Báo giá và thanh toán: không trộn miễn phí, dịch vụ và ARR

| Hạng mục | Cách sử dụng nguồn giá |
|---|---|
| Workflow Kit | Miễn phí theo phạm vi đã nhận; không phải tín dụng 9,9 triệu, không đổi quyền lợi Trust Kit của Local. |
| Agents / BI | Nguồn Agents hiện ghi 9,9 triệu một lần cho từng hạng mục, 19,8 triệu nếu chọn cả hai; bảo trì 6,9 triệu/năm hoặc đào tạo/cải tiến 3 / 6 triệu/tháng. Đây là tham chiếu theo scope, không bằng chứng mọi kết nối đã sẵn sàng. |
| Vaults | File pricing vẫn ghi **đề xuất nội bộ, chưa phải báo giá đang bán**: pilot 9,9 triệu; Team 3,9 triệu/tháng + setup 9,9 triệu; Company 6,9 triệu/tháng + setup 19,9 triệu. Không đưa số này thành quote cho khách trước phê duyệt giá và release. |
| Bên thứ ba / vận hành | Model/API, phần mềm, thiết bị, backup, hỗ trợ, di chuyển, thuế và công riêng phải xác định ai trả; không tự cộng hay giấu dưới chữ “miễn phí”. |

Nguồn giá hiện hành và quote được duyệt quan trọng hơn số sao chép trong hướng dẫn. CRM `lumi-solution` là offer tùy chỉnh, không tự có bảng giá Agents/Vaults. Admin lưu phiên bản mới nếu cần; không sửa snapshot đã chấp thuận, không áp giá mới hồi tố.

Giữ khung thương lượng Agents/BI của hướng dẫn trước: **50% khi ký, 50% khi nghiệm thu**, chỉ khi được ghi trong thỏa thuận và kỹ thuật xác nhận khả thi. Không tự áp lịch này cho Vaults; pilot và thuê bao có mốc riêng được duyệt. Không thu cọc một khả năng chưa chứng minh làm được. Không coi im lặng là nghiệm thu. Finance xác nhận tiền thực nhận; Partner không thu/xử lý tiền; không tài khoản cá nhân.

CRM có thể ghi receivable cho toàn bộ scope khi quote được chấp thuận; một khoản cọc là **partial payment**, không phải paid toàn hợp đồng. Hạn/mốc thanh toán ghi theo hợp đồng và tác vụ; hướng dẫn không thêm bộ chia kỳ tự động. Không lập hai receivable cho cùng một khoản. Kit không tạo payment 0đ, doanh thu, tín dụng hoặc hoa hồng.

**Miễn phí → trả phí** là một quyết định mua mới, không phải hệ thống tự kích hoạt sau demo. Chi phí setup/pilot một lần không là ARR; đào tạo là doanh thu dịch vụ; chỉ annualize phần định kỳ thực sự có hợp đồng và hiệu lực. Pilot → triển khai phải tách loại tiền, không cộng trùng tín dụng.

## 9. Checklist trước pilot/triển khai trả phí và bàn giao

Sales + kỹ thuật + người có thẩm quyền phía khách xác nhận: bài toán, nguồn/đích, quyền dữ liệu, hệ hiện tại, phạm vi/vòng sửa, ai duyệt, môi trường/model, chi phí, tiêu chí nghiệm thu, hỗ trợ, thuế, hủy/hoàn, xuất/xóa dữ liệu và ngày quyết định. Nếu dùng Vaults: thêm release, quyền server, audit, backup/restore đã thử, vận hành và phê duyệt G2/G3 tương ứng.

Bàn giao thực hiện bằng công cụ hiện có và người có quyền Fulfillment: nhận scope từ quote đóng băng, đầu ra đã thử, hướng dẫn chạy/duyệt, ngoại lệ, giới hạn, chủ dữ liệu và người hỗ trợ. Dữ liệu khách không ở Git; file CRM là riêng tư, không tạo public share link cho dữ liệu hoặc bản kết quả nhạy cảm. Không gắn tài liệu có secret vào notes phát ra thông báo nhóm.

Chỉ ghi nghiệm thu khi có bằng chứng đáp ứng tiêu chí và xác nhận khách; phần lỗi/thiếu còn mở có người và hạn xử lý. Không dùng nghiệm thu của kit hoặc một demo để đóng trạng thái giao hàng production. Theo dõi dùng lại ở các mốc đã hẹn, ví dụ ngày 7 và 30; upsell/gia hạn dựa trên dùng thật, công hỗ trợ và lợi ích, không chỉ số agent chạy.

## 10. Phiếu kit có thể sao chép vào ghi chú riêng tư

```text
[WORKFLOW_KIT_AGREED] Company / opportunity: [...]
Workflow / current tools / repeated frequency: [...]
Operator / reviewer / budget decision-maker: [...]
Sample: SYNTHETIC (default) / CUSTOMER-AUTHORIZED SAMPLE [approval ref]
Input schema and limits / output format / safe environment: [...]
Artifacts: output draft; exceptions + checklist; source/access/handover map; decision sheet.
Work cap: 2 hours total; one correction; no production connection/migration.
Cost to customer: 0 within agreed kit; no purchase, card or review obligation.
Delivery date agreed / optional result discussion: [...]
Retention and deletion terms / evidence location / responsible person: [...]
Outcome: delivered / stopped with reason; actual hours and costs: [...]
[WORKFLOW_KIT_REVIEWED] Only after an actual review; attendees / corrections: [...]
Next: existing tools / Agents-BI / Vaults gated / combined staged / no purchase.
```

Đây là mẫu vận hành, không phải thỏa thuận xử lý dữ liệu đầy đủ. Không điền thông tin thật vào file Git. Ghi baseline do khách ước tính là `self-reported`; số đo là `measured`; chưa biết là `unknown`, không ghi 0.

## 11. Đo đúng hiệu quả và giới hạn tiếp tục

Bắt đầu với 10 doanh nghiệp phù hợp có người phụ trách xác định; làm theo lô nhỏ, không phát 100 kit trước khi có phản hồi. Trong tuần đầu: chọn tình huống, dựng một ví dụ giả lập, mời trao đổi, nhận tối đa 3 kit đủ điều kiện và đọc kết quả. Kit cần sản phẩm chưa sẵn sàng thì giữ ở mô phỏng; không tăng trưởng bằng lời hứa.

Theo dõi riêng: công ty được tiếp cận → phản hồi đúng người → kit được đồng ý → đã giao → đọc kết quả → đề nghị trả phí → pilot đã thu tiền → triển khai đã thu tiền → đã nghiệm thu → dùng lại/gia hạn. Khử trùng theo công ty khi tính conversion; cơ hội pilot và triển khai vẫn là hai giao dịch riêng. 70% ký charter cũ, số người nhận kit và số view **không phải** paid conversion.

Mọi công nghiên cứu, làm mẫu, họp và cơ hội thua là chi phí thu hút khách: dùng `research`, `preview`, `sales`, `travel`; phần thực hiện hợp đồng dùng category giao hàng phù hợp. Nếu cần quy đổi chi phí công, không ghi 0 cho unknown; tránh đếm hai lần thời gian task/cost. Báo cáo cohort Local hiện không tự hiểu Workflow Kit hoặc funnel solution; dùng tổng hợp thủ công từ CRM/tài liệu riêng tư, không tuyên bố dashboard mới đã có.

Thước đo: **đóng góp thực thu trên tổng giờ bán + giao**, có dự phòng hỗ trợ; tách kỳ vọng khỏi quan sát. Ví dụ giả định: 10 kit × 2 giờ × 350.000đ/giờ = 7.000.000đ công, chưa gồm prospecting/model/triển khai. Có một đơn 9,9 triệu không tự chứng minh có lãi.

Ngưỡng thử do đội duyệt, không benchmark: sau 10 kit được nhận làm và hoàn tất hoặc dừng có lý do, ít nhất 3 cuộc đọc kết quả có người có quyền mua hoặc được họ ủy quyền, ít nhất 1 bước trả phí phù hợp đã có tiền xác nhận và khả năng giao có đóng góp dương. Nếu chưa qua gate sản phẩm thì không chào bước trả phí chỉ để đạt ngưỡng; ghi readiness blocker và dừng mở rộng.

Dừng tăng kit nếu vượt trần 2 giờ lặp lại, chỉ có người xin tài liệu, không tìm được người mua, dữ liệu không được phép, hoặc hai trường hợp liên tiếp phát hiện không thể giao khả năng đã hứa. Sửa tệp/phạm vi hoặc dừng; không kéo free pilot vô hạn. Kiểm tra dùng lại và mua tiếp trước khi tuyển thêm sales. So sánh Local với solution bằng tiền/công thật, không bằng số quà.

## 12. Nguồn và trách nhiệm

- Yêu cầu chủ sản phẩm **16/10/2026**: thêm offer miễn phí và quy trình Agents/Vaults, giữ đúng hai luồng bán. Phạm vi kit, trần công và ngưỡng thử ở đây là thiết kế để kiểm chứng, không phải thành tích đã đạt.
- [CRM: mô hình và phân quyền](https://github.com/RunLumi/www.runlumi.app/blob/main/docs/crm/README.md); [stage và field đang có](https://github.com/RunLumi/www.runlumi.app/blob/main/src/lib/crm/seed.ts); [quy tắc quote/ledger](https://github.com/RunLumi/www.runlumi.app/blob/main/src/lib/crm/commercial.ts).
- [Giá và ranh giới Agents](https://github.com/RunLumi/agents.runlumi_app/blob/main/pricing.md); [giá Vaults: đề xuất nội bộ](https://github.com/RunLumi/lumi-vaults/blob/main/docs/gtm/pricing.md); [cổng an toàn Vaults](https://github.com/RunLumi/lumi-vaults/blob/main/docs/gtm/06-trust-gates.md). Kiểm tra release cụ thể, không dựa vào snapshot cũ hoặc ảnh demo.
- [Google: shared drives](https://support.google.com/a/users/answer/7212025?hl=en&rd=1) và [Microsoft: agent trong SharePoint](https://learn.microsoft.com/en-gb/sharepoint/manage-access-agents-in-sharepoint), đọc 16/10/2026: công cụ hiện có đã có quyền và quyền sở hữu nhóm; không dùng tuyên bố “đối thủ không làm được ACL”.
- [OWASP: Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/), đọc 16/10/2026: giới hạn chức năng/quyền/tự chủ và phê duyệt hành động; đây không phải chứng nhận bảo mật cho Lumi.

**Sales** giữ đúng phạm vi và nhật ký; **kỹ thuật** xác minh khả năng/môi trường; **chủ dữ liệu và reviewer** duyệt đầu vào/kết quả; **Admin/người phê duyệt thương mại** duyệt offer/giá; **Finance** xác nhận tiền; **Fulfillment** bàn giao và nghiệm thu. Không ai dùng một trường tick hoặc quà miễn phí để vượt quyền của người khác.

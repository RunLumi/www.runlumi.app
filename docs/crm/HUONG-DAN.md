# Hướng dẫn sử dụng CRM Lumi

Địa chỉ: `https://runlumi.app/vi/workspace` (Tổng quan) và `https://runlumi.app/vi/crm` (CRM). Thêm `/vi` để dùng tiếng Việt; bỏ `/vi` để dùng tiếng Anh. Đăng nhập bằng tài khoản EmDash. Admin phải cấp vai trò trước thì bạn mới vào được: Nhân viên bán hàng, Cộng tác viên, Quản lý bán hàng, Tài chính hoặc Bàn giao. Vai trò Nhân sự (HR) dùng phân hệ Tuyển dụng.

**Quy trình bán hàng** đọc ở *CRM → Quy trình bán hàng* (`/vi/crm/process`). Trang hiển thị trực tiếp file `docs/Lumi_Quy_Trinh_Ban_Hang.md`: muốn sửa quy trình thì sửa file Markdown này rồi deploy.

**Thanh điều hướng.**
- Hàng trên cùng chuyển giữa các phân hệ: Tổng quan, Tuyển dụng, CRM, Quản trị.
- Trong CRM, menu bên trái chia nhóm: *Bán hàng* (Hôm nay, Cơ hội, Tạo cơ hội, Giới thiệu khách), *Khách hàng* (Công ty, Liên hệ), *Kết quả* (Báo cáo, Hoa hồng), *Vận hành* (Bàn giao, Phân công và cohort), *Cấu hình* (Playbook, Gói và giá), *Hướng dẫn và công cụ* (Quy trình bán hàng, Kết nối AI agent).
- Trên điện thoại, bấm *Menu* để mở danh sách này.
- Bạn chỉ thấy những mục vai trò của mình được phép mở.

CRM chỉ để ghi chép và điều phối công việc. CRM không tự gửi tin cho khách, không mua tên miền, không xuất bản website, không thu tiền và không tính hoa hồng.

## Người bán hàng (Nhân viên bán hàng và Cộng tác viên)

Phần này áp dụng cho cả Nhân viên bán hàng và Cộng tác viên. Những điểm riêng của Cộng tác viên nằm ở mục ngay sau.

1. **Hôm nay.** Mở trang này đầu mỗi ngày. Trang cho thấy:
   - việc quá hạn và việc đến hạn hôm nay;
   - lịch ghé thăm, cuộc hẹn, demo trong 7 ngày tới;
   - cơ hội đang thiếu bước tiếp theo;
   - credit Trust Kit sắp hết hạn;
   - các khoản gia hạn sắp tới.
2. **Tạo mới.** Chọn quy trình bán, kênh và khách hàng theo một trong hai cách:
   - **Khách có sẵn:** chọn người liên hệ trong danh sách (nhóm theo công ty). CRM gắn cơ hội vào công ty và người liên hệ đó, không tạo bản ghi mới. Trên trang *Công ty* và *Liên hệ* có link "Tạo cơ hội" mở sẵn khách đó.
   - **Khách mới:** nhập tên doanh nghiệp và người liên hệ. CRM tự tạo công ty và người liên hệ rồi gắn vào cơ hội. Nếu bạn đã có công ty trùng tên, CRM nhắc chọn khách có sẵn. Muốn tạo riêng (ví dụ chi nhánh khác), đánh dấu "Vẫn tạo công ty mới".

   Các thông tin khám phá nhu cầu sẽ hiện ra khi cơ hội tới đúng giai đoạn.
3. **Chuyển giai đoạn.** Hệ thống báo trước còn thiếu gì để sang bước sau.
   - Bước được đánh dấu "có thể bỏ qua" (preview, demo, pilot) chỉ bỏ được khi ghi lý do.
   - Chuyển sang "không phù hợp", "thua" hoặc "tạm hoãn" cũng phải ghi lý do.
   - Ghé thăm không gặp chủ, hẹn lại, khách không đến: ghi làm **kết quả của việc**, không phải giai đoạn.
4. **Chưa biết thì để trống.** Đừng điền 0 hoặc tự đoán giá trị, ngân sách hay nhu cầu.
5. **Báo giá và chấp thuận.**
   - Chọn gói, CRM chụp lại giá và điều kiện tại thời điểm báo giá. Sau này đổi giá cũng không ảnh hưởng báo giá đã gửi.
   - Khi khách đồng ý, bấm "Ghi nhận khách chấp thuận" và ghi bằng chứng (tin nhắn, chữ ký).
   - **Chấp thuận chưa phải là đã thanh toán.**
6. **Thanh toán.** Khi nhận tiền, bấm "Báo cáo đã nhận thanh toán" và ghi mã giao dịch. Khoản này ở trạng thái **chờ xác nhận** cho tới khi người có quyền tài chính xác nhận.
7. **Nâng cấp Trust Kit → Starter.**
   - Mở "cơ hội tiếp nối" loại *Nâng cấp* ngay trên giao dịch Trust Kit. Không tạo khách mới.
   - Nếu Trust Kit đã được xác nhận thanh toán trong 30 ngày (tính cả ngày thứ 30), báo giá Starter tự trừ credit 399.000đ. Khách trả 1.591.000đ.
   - Mỗi khoản Trust Kit chỉ được credit một lần.
8. **Gia hạn và mở rộng.**
   - *Gia hạn*: dùng cho năm thứ hai trở đi. Cần đặt kỳ dịch vụ ở giao dịch gốc trước.
   - *Mở rộng*: dùng khi khách Local có vấn đề lặp lại thật và có quyết định mua riêng (giải pháp Lumi).
   - Không tự thêm CRM, đặt lịch hay tự động hóa vào gói Starter.
9. **Bàn giao.**
   - Sau khi khách chấp thuận, điền thông tin bàn giao: nội dung chủ đã xác nhận, hình ảnh được phép dùng, tên miền, phạm vi chỉnh sửa, ngày giao, nơi nhận yêu cầu từ website và người phản hồi.
   - Phạm vi lấy từ báo giá. Người bán không tự tăng phạm vi và không thay chủ xác nhận duyệt.
10. **Không liên hệ.**
    - Nếu chủ yêu cầu ngừng liên hệ, đặt "Không liên hệ" kèm lý do trên trang doanh nghiệp.
    - Yêu cầu này áp dụng cho **mọi kênh và mọi quy trình**. Không đổi sang kênh khác để liên hệ lại.
11. **Chuyển ngôn ngữ.** Nút ngôn ngữ giữ nguyên hồ sơ và bộ lọc đang xem.

Bạn chỉ thấy các cơ hội được giao cho mình. Nếu một doanh nghiệp có cơ hội của người khác, bạn không thấy cơ hội đó.

## Dashboard bán hàng (trang Hôm nay)

- **Trên mỗi cơ hội** ghi hai ước tính:
  - **Giá trị HĐ mong đợi** (VND).
  - **Tỉ lệ thành công mong đợi** (0–100%).

  Chưa biết thì để trống; CRM không coi ô trống là 0.
- **Trang `/vi/crm`** mở đầu bằng *Tổng quan bán hàng*:
  - **Các ô số liệu:** số cơ hội đang mở, tổng giá trị HĐ mong đợi, dự báo theo tỉ lệ (giá trị × tỉ lệ, chỉ tính cơ hội có đủ cả hai), tỉ lệ thắng 90 ngày, giá trị deal đã thắng 90 ngày. Giá trị deal đã thắng **chưa phải tiền đã thu**.
  - **Biểu đồ giá trị đang mở** theo sản phẩm, hoặc theo giai đoạn khi đã chọn một sản phẩm.
  - **Biểu đồ cơ hội mới và cơ hội thắng** trong 6 tháng, kèm bảng số liệu.
  - Mỗi số liệu ghi rõ bao nhiêu cơ hội đã có giá trị và tỉ lệ.
- **Ai thấy gì:**
  - Nhân viên bán hàng và Cộng tác viên chỉ thấy số liệu của chính mình.
  - Quản lý bán hàng và Admin thấy toàn công ty, có thể lọc theo nhân viên và sản phẩm (quy trình bán), và có thêm bảng *Theo nhân viên*.

## Thông báo trên Lark

- **CRM gửi vào nhóm Lark của đội bán hàng gần như mọi hoạt động:**
  - **Cơ hội:** cơ hội mới, giao cơ hội, chuyển giai đoạn (nổi bật **Thắng** và **Thua**), sửa giá trị, tỉ lệ thành công, bước tiếp theo hoặc tên cơ hội (ghi trước → sau).
  - **Ghi chú và thông tin khám phá:** ghi chú mới; trường thông tin khám phá vừa cập nhật.
  - **Báo giá và tiền:** báo giá mới, rút hoặc được chấp thuận; báo đã nhận tiền, tài chính xác nhận, hoàn tiền.
  - **Lịch hẹn và việc:** lịch hẹn, việc xong và kết quả, khách xác nhận hẹn, việc cần hỗ trợ.
  - **Bàn giao:** bắt đầu bàn giao, website đã live, khách nghiệm thu, bàn giao bị chặn.
  - **Công ty:** công ty mới, thêm người liên hệ, giao công ty.
  - **Không liên hệ:** khách yêu cầu không liên hệ.
- **Nội dung tự động che:**
  - Ghi chú chỉ gửi đoạn trích ngắn; số điện thoại và email trong đó tự được che.
  - Thông tin khám phá chỉ báo tên trường đã sửa, không gửi nội dung.
  - Không bao giờ gửi số điện thoại hay email của người liên hệ.
- Bấm *Mở trong CRM* để xem chi tiết; trang này vẫn cần đăng nhập.
- **Tóm tắt buổi sáng** lúc 8:37, từ thứ Hai đến thứ Bảy:
  - pipeline đang mở và dự báo;
  - số liệu 24 giờ qua;
  - việc quá hạn và việc hôm nay;
  - những gì cần chú ý.
- Cách thiết lập: xem [RUNBOOK §13](RUNBOOK.md).

## Công ty và người liên hệ

- **Một công ty có nhiều người liên hệ.** Mỗi cơ hội gắn với **một công ty và một người liên hệ** của công ty đó.
- **Tạo trước, bán sau.**
  - Vào *CRM → Công ty* để thêm công ty, có thể kèm người liên hệ đầu tiên.
  - Thêm người liên hệ ở *CRM → Liên hệ* hoặc trên trang công ty.
  - Khi có nhu cầu, mở cơ hội ngay trên trang công ty: chọn người liên hệ, quy trình bán và kênh.
- **Người quản lý.** Mỗi công ty và mỗi người liên hệ có một người quản lý. Bạn quản lý những gì mình tạo. Quản lý bán hàng và Admin giao lại công ty (có thể chuyển kèm người liên hệ) và từng người liên hệ.
- **Ai thấy gì.**
  - Quản lý bán hàng và Admin thấy mọi công ty và người liên hệ.
  - Những người khác thấy: người liên hệ mình quản lý, người liên hệ của công ty mình quản lý, và người liên hệ gắn với cơ hội của mình.
- **Giao cơ hội.** Quản lý bán hàng mở cơ hội và giao cho nhân viên. Nhân viên mở cơ hội cho chính mình.
- **Không liên hệ.** Người liên hệ hoặc công ty đã yêu cầu không liên hệ thì không mở được cơ hội mới. Số điện thoại đó cũng không thêm lại được.

## API và agent AI

- **Hướng dẫn từng bước:** *CRM → Hướng dẫn và công cụ → Kết nối AI agent* (`/vi/crm/api`).
- **Tạo token.** Trên trang đó, tạo token *chỉ đọc* hoặc *đọc và ghi*, thời hạn 30, 90 hoặc 365 ngày.
- **Lưu ngay.** Token chỉ hiện **một lần**. Lưu vào trình quản lý mật khẩu hoặc biến môi trường. Không dán vào chat, tài liệu hay mã nguồn.
- **Quyền.** Agent hành động với đúng quyền của bạn: chỉ thấy và sửa những gì bạn thấy và sửa được. Lịch sử ghi rõ thay đổi nào đến từ API và từ token nào.
- **Agent làm được:** tìm và đọc dữ liệu, tạo công ty, người liên hệ và cơ hội, cập nhật thông tin, ghi trường khám phá nhu cầu, chuyển giai đoạn khi đủ điều kiện, thêm ghi chú, ghi nhận yêu cầu không liên hệ.
- **Agent không làm được:** thanh toán, báo giá, bàn giao, hoa hồng, giao người phụ trách, cấu hình, tuyển dụng.
- **Kết nối Claude Code hoặc Codex:** dùng lệnh trên trang *Kết nối AI agent*. Chi tiết kỹ thuật xem [API.md](API.md).
- **Mất token hoặc nghi bị lộ:** bấm *Thu hồi* ngay rồi tạo token mới.

## Cộng tác viên (vai trò "Cộng tác viên")

Cộng tác viên là người ngoài công ty, hưởng hoa hồng theo kết quả. Có hai cách làm việc:

1. **Tự bán.** Tạo cơ hội ở *Tạo mới* và làm như người bán ở trên. Bạn chỉ thấy cơ hội của mình.
2. **Giới thiệu khách.** Mở *CRM → Giới thiệu khách*, điền tên doanh nghiệp, người liên hệ, số điện thoại/Zalo và nhu cầu theo lời khách.
   - Bắt buộc xác nhận **khách đã đồng ý để Lumi liên hệ**. Không có sự đồng ý thì đừng gửi.
   - Số đã yêu cầu ngừng liên hệ sẽ bị từ chối.
   - Quản lý bán hàng sẽ giao khách cho người phụ trách. Bạn được ghi là **người giới thiệu**, kể cả khi người khác bán.
   - Sau khi giao, bạn chỉ thấy giai đoạn và kết quả, không thấy ghi chú, liên hệ hay thanh toán. Điều này bảo vệ dữ liệu khách.

Điều Cộng tác viên **không** làm:
- Không nhận tiền thay Lumi và không báo cáo thanh toán. Khách chuyển khoản thẳng cho Lumi; nhân viên ghi nhận.
- Không hứa giá, giảm giá, thứ hạng Google hay số khách; không xin mật khẩu hay quyền Google.
- Không vào được phân hệ Tuyển dụng, trang Vận hành hay dữ liệu của người khác.

Hoa hồng của bạn hiện ở trang *Hoa hồng* sau khi admin khai báo loại người bán (bán trọn hoặc giới thiệu) và chính sách đã được duyệt.

## Tài chính (quyền "Tài chính")

- **Xác nhận hoặc từ chối thanh toán.** Mở mục *Thanh toán chờ xác nhận* trong Báo cáo, hoặc phần thương mại của từng cơ hội. Muốn từ chối phải ghi lý do.
- **Hoàn tiền.** Mỗi lần hoàn không được vượt số tiền còn lại của khoản thanh toán. Chưa có chính sách hoàn tiền chung, nên chỉ ghi khoản hoàn đã thực sự thỏa thuận.
- **Điều chỉnh sai sót.** Bấm *Hủy dòng* để vô hiệu dòng ghi sai. Dòng gốc vẫn hiển thị, nhưng báo cáo sẽ bỏ qua nó.
- **Phải thu theo kỳ.** Ví dụ phí hằng tháng của giải pháp: ghi phải thu kèm kỳ dịch vụ.

## Bàn giao (quyền "Bàn giao")

- **Theo dõi.** Mở trang *Bàn giao*. Trạng thái Local đi theo thứ tự: chờ đủ thông tin → đang làm → chờ chủ duyệt → sẵn sàng xuất bản → đã live → đã nghiệm thu.
- **Điều kiện chuyển bước.**
  - Muốn sang "sẵn sàng xuất bản" phải ghi nhận **chủ đã duyệt**, kèm bằng chứng từ chính chủ.
  - Muốn sang "đã live" phải kiểm tra đủ: Gọi, Zalo, Maps, form gửi đến đúng nơi, QR, HTTPS và hiển thị di động. Mỗi mục đánh dấu đạt hoặc không áp dụng.
- **Bị chặn.** Đánh dấu bị chặn kèm nguyên nhân. Mục này sẽ hiện trên trang Hôm nay của người phụ trách.

## Hoa hồng

- **Trước khi duyệt:** chính sách ở trạng thái *đề xuất*. Chỉ admin và tài chính thấy số mô phỏng.
- **Sau khi duyệt:** mỗi người bán thấy các khoản của mình tại *Hoa hồng*, kèm trạng thái: chờ thu/bàn giao, đang giữ, đã đủ điều kiện.
- **Cách tính:** hoa hồng chỉ tính trên khách đã thu đủ, đã bàn giao và còn ở lại sau thời gian giữ. Hoàn tiền làm mất khoản tương ứng.
- **Chi trả:** tài chính chi ngoài CRM, rồi ghi nhận lại theo bảng kê.
- **Chi tiết:** xem [COMMISSION.md](COMMISSION.md).

## Quản lý bán hàng (Sales Manager)

- Thấy mọi cơ hội của cả đội và giao lại cho người khác. Giao lại không đổi người bán được ghi công.
- Trang *Vận hành* gồm hàng chờ yêu cầu từ website, **khách được giới thiệu chờ phân công** và cohort. Giao khách được giới thiệu cho một người bán; người giới thiệu vẫn giữ ghi công.
- Không sửa được playbook, gói, chính sách hoa hồng hay người dùng; các việc đó thuộc về Admin.

## Admin

- **Cấp quyền.**
  - Tạo hoặc mời tài khoản trong EmDash trước.
  - Vào *Quản trị → Người dùng và vai trò*, cấp vai trò bằng email. Vai trò gồm: Nhân sự (HR), Quản lý bán hàng, Nhân viên bán hàng, Cộng tác viên, Tài chính, Bàn giao; có thể kết hợp nhiều vai trò.
  - Với Cộng tác viên, khai báo thêm loại người bán ở *Hoa hồng → Loại người bán*. Trang người dùng nhắc khi còn thiếu.
  - Không cần nâng ai lên admin EmDash.
  - Vai trò CRM không mở được hồ sơ ứng viên, và HR không vào được CRM.
- **Thu hồi.**
  - Có hiệu lực ngay từ yêu cầu kế tiếp, và được ghi vào nhật ký thay đổi quyền.
  - Hồ sơ vẫn còn: vào *Cơ hội*, lọc "người phụ trách không hoạt động" để giao lại.
- **Yêu cầu từ website.** Yêu cầu gửi từ local.runlumi.app vào hàng chờ, chưa giao cho ai. Hãy *giao* cho người phụ trách, hoặc *bỏ qua* nếu là spam (phải ghi lý do). Yêu cầu chưa phải thanh toán, chưa phải tài khoản và chưa phải khách đủ điều kiện.
- **Playbook và gói.**
  - Lưu thay đổi luôn tạo phiên bản mới. Cơ hội cũ giữ phiên bản đang dùng.
  - Đổi giá cần ghi nguồn quyết định và ngày hiệu lực.
  - Gói không bao giờ bị xóa, chỉ ngừng dùng cho báo giá mới.
- **Cohort.**
  - Tạo cohort (STRATEGY: 30 doanh nghiệp), gắn cơ hội vào cohort, ghi thời gian và chi phí.
  - Chỉ đánh dấu "đã đủ chi phí" khi đã định giá giờ công và có cách phân bổ chi phí chung. Trước đó, contribution và CAC hiển thị "chưa đủ dữ liệu".
- **Cổng đánh giá.** Cổng là quyết định nội bộ. Đạt ngưỡng **không** tự tăng nhân sự, đổi giá hay mở chiến dịch.

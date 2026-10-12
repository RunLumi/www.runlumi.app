# Quy trình bán hàng Lumi — Lumi Local & Lumi Agents / BI

| | |
|---|---|
| **Đơn vị** | Công ty TNHH Cloudjet Solutions · MST 0312033924 |
| **Áp dụng cho** | Founder, CTO, Founding Growth & GTM Specialist, Cộng tác viên (Lumi Partner), Kế toán |
| **Kênh chính thức** | gtm@runlumi.vn |
| **Phiên bản** | v1.0 · 12/10/2026 · xem lại sau 30 ngày có dữ liệu thật |

> **Một câu tóm tắt:** Lumi Local bán bằng **bản xem thử miễn phí → thu 100% trước khi đưa lên mạng**. Lumi Agents / BI bán bằng **trải nghiệm miễn phí có giới hạn → cọc 50% → nghiệm thu → thu 50%**. Không bao giờ bàn giao sản phẩm cuối trước khi tiền về tài khoản công ty.

---

## 0. Bảy nguyên tắc không đổi

1. **Tiền trước, bàn giao sau.** Bản xem thử và trải nghiệm thì miễn phí; tên miền chính thức, file QR, dashboard bàn giao và quyền truy cập cuối cùng chỉ giao khi đã nhận đủ tiền theo mốc.
2. **Mọi khoản tiền vào tài khoản công ty.** Không thu tiền mặt, không nhận chuyển khoản vào tài khoản cá nhân, kể cả của nhân viên hay CTV.
3. **Nói đúng sự thật.** Giao diện và số liệu trên website là minh họa. Không hứa thứ hạng Google, lượng khách, doanh thu hay tỷ lệ tiết kiệm chưa đo.
4. **Mỗi cơ hội có một chủ.** Ghi vào CRM trước khi liên hệ; CTV đăng ký theo hợp đồng CTV trước khi khách liên hệ Cloudjet.
5. **Giá theo bảng giá.** Giảm giá hay điều khoản khác bảng giá cần CTO hoặc CEO duyệt bằng email trước khi nói với khách.
6. **Mỗi bước có điều kiện ra.** Chưa đạt điều kiện ra thì chưa chuyển bước, dù khách nói "để anh suy nghĩ".
7. **Ghi lý do thắng, thua.** Một dòng mỗi cơ hội. Đây là dữ liệu quý nhất để sửa sản phẩm và kịch bản bán.

---

## 1. Hai luồng bán khác nhau

| | **Lumi Local** | **Lumi Agents / BI** |
|---|---|---|
| Khách hàng | Chủ cơ sở kinh doanh địa phương: spa/salon, gara, điện lạnh, quán cà phê | Nhà bán hàng TMĐT, chuỗi bán lẻ, nhà phân phối có dữ liệu bảng tính hoặc phần mềm bán hàng |
| Người quyết định | Thường chỉ một người (chủ) | Chủ hoặc giám đốc, cộng thêm người vận hành dữ liệu |
| Giá (chưa VAT, theo website 01/10/2026) | Trust Kit 399.000 · Starter 1.990.000 năm đầu · duy trì 599.000–999.000/năm | Triển khai BI hoặc Agents 9,9 tr · combo 19,8 tr · bảo trì 6,9 tr/năm · đào tạo 3–6 tr/tháng |
| Chu kỳ bán | 1–7 ngày | 2–6 tuần |
| "Mồi" để bắt đầu | Bản xem thử website trong 48 giờ | Trải nghiệm trên một phần dữ liệu thật, phạm vi khóa trước |
| Thanh toán | **Không cọc**, thu 100% trước khi xuất bản | **Cọc 50%** khi ký, 50% khi nghiệm thu |
| Kênh chính | Gặp trực tiếp, gọi, Zalo, Google Maps, giới thiệu | Giới thiệu, cộng đồng nhà bán hàng, form website, Zalo/LinkedIn |
| Rủi ro lớn nhất | Làm nhiều bản xem thử mà không ai trả tiền | Trải nghiệm miễn phí biến thành tư vấn miễn phí kéo dài |

**Trạng thái sản phẩm cần nói đúng với khách:**

- **Lumi BI** đã có một triển khai thực tế kết nối phần mềm bán hàng Nhanh.vn. Đây là điểm vào mạnh nhất cho khách đang dùng Nhanh. Chỉ nêu tên khách hàng khi đã có đồng ý bằng văn bản.
- **Lumi Agents (Catalog)** đang phát triển. Chỉ nhận **trao đổi nhu cầu và trải nghiệm**. **Không nhận cọc** cho đến khi CTO xác nhận bằng email rằng đã thực hiện được cho đúng bài toán đó.

---

## 2. Các giai đoạn pipeline (dùng chung trong CRM)

| Mã | Giai đoạn | Điều kiện để sang bước sau |
|---|---|---|
| S0 | Lead mới | Có tên cơ sở hoặc công ty và một kênh liên hệ |
| S1 | Đã liên hệ | Khách đã phản hồi (đồng ý nghe, hẹn gặp, hoặc từ chối) |
| S2 | Đủ điều kiện | Đúng ICP; đã nói chuyện với người quyết định; vấn đề được khách xác nhận |
| S3 | Xem thử / Trải nghiệm | Khách đã xem bản xem thử (Local) hoặc đã có buổi trình bày kết quả trải nghiệm (Agents/BI) |
| S4 | Báo giá | Đã gửi báo giá hoặc phiếu xác nhận chính thức |
| S5 | Chốt | Khách đồng ý bằng văn bản **và** tiền về: 100% (Local) hoặc cọc 50% (Agents/BI) |
| S6 | Thực hiện | Đủ thông tin, quyền truy cập; đã kick-off |
| S7 | Bàn giao / Nghiệm thu | Khách xác nhận bàn giao hoặc ký biên bản nghiệm thu |
| S8 | Thu đủ & hóa đơn | Đã thu đủ tiền; hóa đơn điện tử đã gửi khách |
| S9 | Khách hàng hoạt động | Theo dõi sử dụng, gia hạn, upsell, xin giới thiệu |
| X | Thua | Ghi một trong các lý do: giá · chưa cần · đã có giải pháp · không liên lạc được · không đúng ICP · khác |

**Cột tối thiểu trong CRM** (Google Sheet là đủ lúc đầu): mã cơ hội · ngày tạo · chủ cơ hội · nguồn (tự tìm / CTV / inbound / giới thiệu) · tên cơ sở · ngành · khu vực · người quyết định · SĐT/Zalo · sản phẩm · giai đoạn · bước tiếp theo · ngày hẹn bước tiếp theo · giá trị · ngày tiền về · lý do thắng/thua.

> **Quy tắc vận hành:** cơ hội nào **không có "ngày hẹn bước tiếp theo"** là cơ hội chết. Mỗi tối thứ Sáu, chủ cơ hội điền ngày hẹn, hoặc chuyển sang X kèm lý do.

---

## 3. Luồng Lumi Local

### Bước 1 — Tìm lead

**ICP ưu tiên:** spa/salon, gara/sửa xe, điện lạnh, quán cà phê và ăn uống nhỏ, là các ngành đã có mẫu giao diện. Ngành khác chỉ làm khi đã có trên 10 khách ở 4 ngành chính.

**Chấm điểm nhanh (khoảng 2 phút mỗi lead trên Google Maps):**

| Tín hiệu | Điểm |
|---|---|
| Chưa có website, hoặc website hỏng hay cũ | +2 |
| Có dưới 30 đánh giá Google, hoặc đánh giá cũ hơn 6 tháng | +2 |
| Thiếu giờ mở cửa, bảng giá hoặc ảnh thật | +1 |
| Có Facebook hoặc Zalo đang hoạt động (chủ có quan tâm khách online) | +1 |
| Đánh giá trung bình dưới 3,5 sao | −2 (vấn đề ở dịch vụ, không phải ở website) |

**A** = từ 4 điểm: liên hệ trong tuần. **B** = 2–3 điểm: đưa vào danh sách nuôi. **C**: bỏ.

**Nguồn lead:** Google Maps theo phường × ngành (thu thập thủ công từ thông tin công khai; không dùng công cụ cào dữ liệu vi phạm điều khoản của Google) · đi bộ một tuyến phố · giới thiệu từ khách cũ · nhóm Zalo/Facebook của chủ cơ sở · CTV.

**Nhịp làm việc gợi ý cho một người:** mỗi tuần 50 lead loại A, theo cụm 1–2 phường để có thể ghé trực tiếp.

### Bước 2 — Liên hệ

- **Thứ tự kênh hiệu quả nhất:** ghé trực tiếp vào giờ vắng khách (thường 14:00–16:00) → gọi điện → Zalo.
- **Giới hạn chạm:** tối đa 3 lần trong 14 ngày. Dừng ngay khi khách từ chối. Tuân thủ quy định về chống tin nhắn rác và cuộc gọi rác (Nghị định 91/2020/NĐ-CP): chỉ liên hệ trong giờ hành chính.
- **Mồi duy nhất:** *làm thử miễn phí trang của chính cơ sở, gửi xem trên điện thoại trong 48 giờ, ưng mới làm.*
- **Xin ngay trong lần gặp:** tên cơ sở chính xác, 3–5 ảnh thật, bảng giá hoặc danh sách dịch vụ, giờ mở cửa, số Zalo, vị trí trên Maps.

**Điều kiện sang S2:** chủ đồng ý nhận bản xem thử **và đã gửi thông tin, ảnh**. Chủ chưa gửi ảnh nghĩa là chưa thật sự quan tâm, nên chưa làm bản xem thử.

### Bước 3 — Bản xem thử (demo)

- Dựng trên địa chỉ tạm dạng `ten-co-so.runlumi.app`, có dòng **"Bản xem thử"** trên trang, trong **48 giờ** kể từ khi đủ thông tin.
- Chỉ dùng nội dung và ảnh chủ cơ sở cung cấp hoặc xác nhận; ảnh minh họa phải ghi chú.
- Gửi qua Zalo kèm **video quay màn hình 30 giây** lướt trang trên điện thoại. Chủ cơ sở bận, video dễ xem hơn link.
- **Nhắc lại:** ngày +1 (hỏi cảm nhận), ngày +3 (hỏi điểm muốn sửa), ngày +7 (lần cuối). Sau đó chuyển sang nuôi và tắt bản xem thử sau 30 ngày.

**Giới hạn công suất:** mỗi người bán tối đa **10 bản xem thử mỗi tuần**, chỉ cho lead loại A đã gửi đủ thông tin. Bản xem thử là chi phí thật của công ty, không phải tài liệu marketing miễn phí.

**Điều kiện sang S4:** chủ nói "ưng" hoặc "làm đi".

### Bước 4 — Chốt (không cọc, thu 100% trước khi xuất bản)

**Vì sao không cọc:** giá nhỏ, và bản xem thử đã làm thay việc của tiền cọc là lọc khách nghiêm túc. Nếu đòi cọc, khách phải chuyển tiền hai lần cho một đơn 2 triệu, làm tăng ma sát mà không giảm rủi ro. Rủi ro được kiểm soát bằng nguyên tắc **chưa thanh toán thì chưa xuất bản, chưa gửi file QR**.

**Gửi Phiếu xác nhận dịch vụ qua Zalo** (mẫu ở mục 8.3). Khách trả lời "Đồng ý" và chuyển khoản là xong; tin nhắn điện tử có giá trị như văn bản theo pháp luật về giao dịch điện tử.

- **Chuyển khoản:** vào tài khoản công ty, mã VietQR in sẵn, nội dung `LUMI L-YYMM-### [tên cơ sở]`.
- **Trust Kit 399.000:** thu trước, gửi file QR trong 24 giờ. Nâng cấp lên Starter trong 30 ngày được trừ đủ 399.000, khách chỉ trả thêm 1.591.000.
- **Không giảm giá.** Ưu đãi hợp lệ duy nhất là khoản trừ Trust Kit.

### Bước 5 — Thực hiện và bàn giao

- **Thời hạn:** 03 ngày làm việc kể từ khi tiền về và đủ thông tin. Bao gồm 01 vòng chỉnh sửa nội dung cơ bản.
- **Checklist bàn giao** (gửi qua Zalo, khách trả lời "Đã nhận"):
  - [ ] Link website chính thức mở được trên điện thoại, có SSL
  - [ ] Nút Gọi gọi đúng số, nút Zalo mở đúng tài khoản
  - [ ] Nút Chỉ đường mở đúng vị trí chủ đã xác nhận
  - [ ] Dịch vụ, giá, giờ mở cửa đúng như chủ duyệt
  - [ ] File QR đánh giá Google (PDF sẵn để in) và hướng dẫn đặt ở quầy
  - [ ] Ngày hết hạn năm đầu và phí duy trì năm 2 (không tự động trừ tiền)
- Lưu vào CRM: link web, ngày bàn giao, ngày hết hạn.

### Bước 6 — Hóa đơn

- Dịch vụ thu tiền trước thì **lập hóa đơn điện tử tại thời điểm thu tiền**, trong ngày tiền về, rồi gửi PDF qua email hoặc Zalo.
- Khách là hộ kinh doanh hay cá nhân không có mã số thuế vẫn được xuất hóa đơn.
- Thông tin cần xin ngay ở Phiếu xác nhận: tên người mua, mã số thuế (nếu có), địa chỉ, email nhận hóa đơn.

### Bước 7 — Sau bán, giới thiệu, upsell

| Thời điểm | Việc | Mục tiêu |
|---|---|---|
| Ngày +7 | Hỏi đã in và đặt QR ở quầy chưa; gửi lại file nếu cần | Giá trị thật đến từ đánh giá, mà đánh giá chỉ có khi QR được đặt |
| Ngày +30 | Hỏi số đánh giá mới, cuộc gọi qua web; **xin giới thiệu 2 cơ sở quen** | Giới thiệu là nguồn lead rẻ nhất |
| Trong 30 ngày | Khách Trust Kit: đề xuất nâng lên Starter, trừ 399.000 | Upsell tự nhiên nhất |
| 30 ngày trước hết hạn | Nhắc gia hạn 599.000, hoặc 999.000 kèm tên miền riêng | Giữ khách; không tự động trừ tiền nên phải nhắc |
| Khi khách có nhiều chi nhánh hoặc nhiều mặt hàng | Giới thiệu Lumi BI | Hiếm, chỉ khi đúng nhu cầu |

---

## 4. Luồng Lumi Agents / BI

### Bước 1 — Tìm lead

**ICP ưu tiên, theo mức độ sẵn sàng của sản phẩm:**

1. **Lumi BI — khách đang dùng Nhanh.vn**, có người ra quyết định xem số hằng tuần, đang gặp chênh lệch giữa báo cáo quảng cáo và đơn thực, tồn kho, lãi lỗ theo kênh. Đây là nơi đã có tích hợp chạy thật.
2. **Lumi BI — dữ liệu ở Excel hoặc Google Sheets** từ nhiều nguồn. Làm được nhưng mất công hơn; cần CTO ước lượng trước khi báo giá.
3. **Lumi Agents (Catalog)** — nhà bán đa sàn nhiều mã hàng, nhận bảng hàng từ nhà cung cấp. **Chỉ trao đổi và trải nghiệm** cho đến khi CTO xác nhận.

**Nguồn lead:**
- Form trên agents.runlumi.app (đổ về kênh Discord nội bộ). Ghi vào CRM và phản hồi **trong 01 ngày làm việc**.
- Giới thiệu từ khách BI.
- Cộng đồng và sự kiện nhà bán hàng.
- Đối tác: agency TMĐT, dịch vụ kế toán, đơn vị triển khai phần mềm bán hàng.
- Liên hệ trực tiếp chủ hoặc trưởng vận hành qua Zalo/LinkedIn.

### Bước 2 — Liên hệ và cuộc gọi tìm hiểu (30 phút)

**Bốn câu hỏi bắt buộc để đủ điều kiện (S2):**

1. Công việc dữ liệu nào **lặp lại hằng tuần**, mất bao nhiêu giờ, ai đang làm?
2. Dữ liệu nằm ở đâu (Nhanh, sàn, Excel), và công ty **có cho phép** Lumi truy cập một phần không?
3. **Ai quyết định** mua, và ai sẽ duyệt kết quả?
4. Nếu kết quả trải nghiệm đạt tiêu chí, khoản **9,9 triệu trong 30 ngày tới** có khả thi không?

Thiếu một trong bốn câu trả lời thì chưa làm trải nghiệm. Gửi email tóm tắt trong ngày (mẫu ở mục 8.5).

### Bước 3 — Trải nghiệm thử miễn phí (demo trên dữ liệu thật)

**Phiếu thống nhất trải nghiệm** (mẫu ở mục 8.6), ký hoặc xác nhận qua email **trước khi nhận dữ liệu**:
- **Một** bài toán, **một** nguồn dữ liệu, mẫu dữ liệu đã loại bỏ thông tin mật.
- **Tối đa 2 tuần** lịch và **2 ngày công** của đội Cloudjet.
- **Tiêu chí thành công đo được** (ví dụ: dashboard đối chiếu đơn quảng cáo với đơn xác nhận cho 4 tuần gần nhất, sai lệch được liệt kê theo từng đơn).
- **Ngày trình bày kết quả** có **người quyết định tham dự**, và ngày ra quyết định không quá 05 ngày làm việc sau đó.
- Điều khoản bảo mật và xử lý dữ liệu: dữ liệu dùng vào việc gì, ai được truy cập, xóa khi nào.

> **Quy tắc quan trọng nhất của luồng này:** người quyết định không cam kết tham dự buổi trình bày kết quả thì **không bắt đầu trải nghiệm**. Đây là cách duy nhất để trải nghiệm miễn phí không biến thành tư vấn miễn phí.

### Bước 4 — Đề xuất và chốt (có cọc)

- **Báo giá theo bảng giá:** BI 9,9 tr, Agents 9,9 tr, combo 19,8 tr. Bảo trì và đào tạo là dòng riêng. Chi phí bên thứ ba (API mô hình AI, hạ tầng, bản quyền) ghi rõ ai trả và cách tính. Gửi trong 02 ngày làm việc sau buổi kết quả.
- **Hợp đồng dịch vụ**, có phụ lục phạm vi và **tiêu chí nghiệm thu** lấy từ Phiếu thống nhất trải nghiệm.
- **Thanh toán:**

| Mốc | Tỷ lệ | Điều kiện |
|---|---|---|
| Ký hợp đồng | **Đặt cọc 50%** | Bắt đầu làm khi tiền cọc về |
| Nghiệm thu | **50% còn lại** | Trong 07 ngày kể từ biên bản nghiệm thu |
| Bảo trì năm | 100% trả trước | Trước ngày bắt đầu kỳ bảo trì |
| Đào tạo tháng | Trả trước từng tháng | Trước ngày 05 hằng tháng |

**Vì sao có cọc:** mỗi dự án tốn công tùy biến thật. Cọc lọc khách nghiêm túc và giữ dòng tiền.

**Ngoại lệ không cọc:** chỉ khi CEO duyệt bằng email cho khách chiến lược, ví dụ đồng ý làm case study có tên. Khi đó thu 100% trong 07 ngày sau nghiệm thu, và **tối đa 01 dự án không cọc đang chạy** cùng lúc.

### Bước 5 — Thực hiện và bàn giao

1. **Kick-off** trong 03 ngày làm việc sau khi nhận cọc. Chốt nguồn dữ liệu, quyền truy cập, người duyệt và lịch.
2. **Cập nhật hằng tuần** bằng một tin nhắn: đã làm gì · tuần tới làm gì · cần khách làm gì.
3. **Thay đổi phạm vi:** mọi yêu cầu ngoài phụ lục đều báo giá bổ sung bằng email trước khi làm.
4. **Nghiệm thu:** demo trên dữ liệu thật theo đúng tiêu chí đã ký. Khách có 05 ngày làm việc để góp ý; quá hạn không phản hồi thì coi là đã nghiệm thu (điều này phải ghi trong hợp đồng).
5. **Bàn giao:**
   - [ ] Dashboard hoặc quy trình chạy trên dữ liệu thật
   - [ ] Tài liệu hướng dẫn sử dụng
   - [ ] Buổi đào tạo 60 phút cho người dùng chính
   - [ ] Danh sách quyền truy cập và người phụ trách phía khách
   - [ ] Kênh hỗ trợ và phạm vi hỗ trợ
   - [ ] Biên bản nghiệm thu đã ký

### Bước 6 — Thanh toán và hóa đơn

- **Khoản cọc:** ghi đúng tên **"đặt cọc bảo đảm thực hiện hợp đồng"** trong hợp đồng. Theo quy định hóa đơn hiện hành, khoản đặt cọc bảo đảm thường không phải lập hóa đơn khi thu, còn khoản **trả trước** cho dịch vụ thì phải lập hóa đơn tại thời điểm thu. Kế toán cần xác nhận cách xử lý trước hợp đồng đầu tiên.
- **Khi nghiệm thu:** lập hóa đơn điện tử cho giá trị dịch vụ đã hoàn thành, rồi thu 50% còn lại.
- **Bảo trì và đào tạo trả trước:** lập hóa đơn tại thời điểm thu tiền.

### Bước 7 — Upsell và giữ khách

| Thời điểm | Việc |
|---|---|
| Buổi nghiệm thu | Đề xuất bảo trì 6,9 tr/năm, hoặc đào tạo 3 tr/tháng nếu đội khách còn yếu |
| Ngày +30 | **Đo mức sử dụng thật**: ai mở dashboard, bao nhiêu lần mỗi tuần, quyết định nào đã dùng số liệu. Chỉ upsell khi khách đang dùng đều |
| Khi đang dùng đều | Đề xuất hạng mục thứ hai: BI thêm Agents hoặc ngược lại, thành combo |
| Mỗi quý | Buổi rà soát 30 phút; xin case study hoặc giới thiệu khi đã có kết quả đo được, kèm đồng ý bằng văn bản |
| 30 ngày trước hết hạn bảo trì | Nhắc gia hạn |

> Khách không dùng thì không gia hạn. Ở luồng này, upsell tốt nhất là làm cho khách **dùng thật** trong 30 ngày đầu.

---

## 5. Thanh toán, hóa đơn, công nợ (chung cho hai luồng)

- **Chỉ nhận tiền vào tài khoản công ty:** [SỐ TÀI KHOẢN] — [NGÂN HÀNG] — CÔNG TY TNHH CLOUDJET SOLUTIONS.
- **Mã đơn:** `L-YYMM-###` cho Local, `A-YYMM-###` cho Agents/BI. Bắt buộc ghi trong nội dung chuyển khoản.
- **Xác nhận tiền về:** kế toán đánh dấu trên CRM **trong 01 ngày làm việc**. Đây là tín hiệu để bắt đầu làm, để xuất hóa đơn và để tính hoa hồng.
- **Nhắc công nợ:**

| Mốc sau hạn | Việc | Người làm |
|---|---|---|
| +1 ngày | Nhắc nhẹ qua Zalo hoặc email, kèm mã QR | Chủ cơ hội |
| +7 ngày | Gọi điện | Chủ cơ hội |
| +15 ngày | Thông báo tạm ngưng hỗ trợ hoặc bảo trì theo hợp đồng | CTO |
| +30 ngày | CEO xử lý trực tiếp | CEO |

- **Hoàn tiền Local:** hoàn 100% nếu Lumi không bàn giao được trong 14 ngày vì lỗi của Lumi. Không hoàn khi đã bàn giao đúng nội dung khách duyệt.
- **Hoa hồng CTV:** tính trên tiền đã về, theo Hợp đồng CTV (chốt cuối tháng, bảng kê ngày 05, chi trả ngày 10, khấu trừ 10% thuế TNCN).

---

## 6. Vai trò và cam kết thời gian

| Vai trò | Phụ trách chính |
|---|---|
| **CEO** | Duyệt giảm giá và ngoại lệ không cọc; xử lý công nợ trên 30 ngày; khách chiến lược |
| **CTO** | Xác nhận khả năng thực hiện Agents/BI; ước lượng; nghiệm thu kỹ thuật; duyệt giá ngoài khung |
| **GTM Specialist** | Tìm lead, liên hệ, gọi tìm hiểu, bản xem thử, chốt; giữ CRM sạch; họp pipeline hằng tuần |
| **CTV (Lumi Partner)** | Tìm và giới thiệu hoặc tự chốt theo Hợp đồng CTV; đăng ký cơ hội trước |
| **Kế toán** | Xác nhận tiền về, xuất hóa đơn, khấu trừ thuế, chi hoa hồng |

| Việc | Thời hạn |
|---|---|
| Phản hồi lead inbound | Local: 2 giờ làm việc · Agents/BI: 01 ngày làm việc |
| Bản xem thử Local | 48 giờ từ khi đủ thông tin |
| Báo giá Agents/BI | 02 ngày làm việc sau buổi kết quả |
| Bàn giao Local | 03 ngày làm việc từ khi tiền về |
| Kick-off Agents/BI | 03 ngày làm việc từ khi nhận cọc |
| Xác nhận tiền về | 01 ngày làm việc |
| Xuất hóa đơn | Trong ngày phát sinh nghĩa vụ lập hóa đơn |

---

## 7. Chỉ số và họp pipeline hằng tuần

**Họp 30 phút mỗi tuần** (GTM Specialist cùng CTO):
1. Số cơ hội ở mỗi giai đoạn, so với tuần trước.
2. Các cơ hội **kẹt quá 14 ngày** ở một giai đoạn: chốt bước tiếp theo, hoặc chuyển sang X.
3. Lý do thua của tuần.
4. **Một** thử nghiệm cho tuần tới (kịch bản, ngành, khu vực, kênh).

**Mục tiêu khởi điểm** — đây là **giả thuyết**, cần hiệu chỉnh sau 4 tuần có dữ liệu thật:

| Lumi Local (mỗi tuần, một người) | | Lumi Agents / BI (mỗi tháng) | |
|---|---|---|---|
| Lead loại A | 50 | Cuộc gọi tìm hiểu | 10 |
| Phản hồi | 15 | Đủ điều kiện | 5 |
| Bản xem thử | 8 | Trải nghiệm | 3 |
| Chốt | 3 | Chốt | 1 |
| **Chỉ số chính** | Tỷ lệ xem thử → trả tiền (mục tiêu ≥ 35%) | **Chỉ số chính** | Tỷ lệ trải nghiệm → trả tiền (mục tiêu ≥ 33%) |

**Tín hiệu cần dừng lại để xem xét:**
- Local: chốt dưới 20% bản xem thử sau 4 tuần → xem lại ICP, kịch bản hoặc giá, đừng tăng số bản xem thử.
- Agents/BI: hai trải nghiệm liên tiếp không ra quyết định đúng hạn → siết điều kiện người quyết định phải tham dự.

---

## 8. Mẫu dùng ngay

### 8.1 Tin nhắn hoặc lời mở đầu — Local

> Chào anh/chị [Tên], em là [Tên] bên Lumi. Em thấy [tên cơ sở] trên Google Maps được khách khen [điểm tốt cụ thể], nhưng khách mới tìm thì chưa thấy rõ bảng giá và nút gọi nhanh. Em làm thử miễn phí một trang riêng cho tiệm, gửi anh/chị xem trên điện thoại trong 2 ngày; ưng thì làm, không ưng cũng không sao. Anh/chị gửi em 3–5 ảnh thật và bảng giá được không ạ?

### 8.2 Gửi bản xem thử — Local

> Anh/chị [Tên] ơi, đây là bản xem thử trang của [tên cơ sở]: [link]. Em gửi kèm video 30 giây để anh/chị lướt nhanh. Anh/chị xem giúp em giá và giờ mở cửa đã đúng chưa, muốn sửa chỗ nào em sửa luôn ạ.

### 8.3 Phiếu xác nhận dịch vụ — Local (gửi qua Zalo)

```
PHIẾU XÁC NHẬN DỊCH VỤ LUMI LOCAL — Mã đơn: L-YYMM-###
Cơ sở: …………………    Người đại diện: …………………
Gói: ☐ Trust Kit 399.000đ   ☐ Starter 1.990.000đ (năm đầu)   [giá chưa/đã gồm VAT: …]
Gồm: website riêng, nút Gọi/Zalo, chỉ đường, file QR đánh giá Google, hosting, SSL,
     bảo trì năm đầu, 01 vòng chỉnh sửa nội dung cơ bản. Chưa gồm in ấn, chân đế.
Địa chỉ web: ……….runlumi.app   ☐ Tên miền riêng: ………
Duy trì từ năm 2: 599.000đ/năm (địa chỉ RunLumi) hoặc 999.000đ/năm (tên miền riêng).
  Không tự động trừ tiền; Lumi nhắc trước 30 ngày.
Không cam kết thứ hạng Google, lượng khách hay doanh thu.
Thanh toán: chuyển khoản 100% vào TK công ty [STK – Ngân hàng – CÔNG TY TNHH CLOUDJET SOLUTIONS],
  nội dung: LUMI L-YYMM-### [tên cơ sở]. Lumi xuất bản và gửi file QR sau khi nhận tiền.
Bàn giao: trong 03 ngày làm việc kể từ khi nhận tiền và đủ thông tin.
Hóa đơn điện tử gửi về: tên người mua ……… · MST (nếu có) ……… · email ………
→ Anh/chị trả lời "ĐỒNG Ý" để xác nhận.
```

### 8.4 Tin nhắn bàn giao — Local

> Trang của [tên cơ sở] đã chạy chính thức: [link]. Em gửi kèm file QR đánh giá để anh/chị in đặt ở quầy, cùng hóa đơn điện tử. Năm đầu dùng đến [ngày]; trước hạn 30 ngày em sẽ nhắc. Anh/chị kiểm tra giúp em nút Gọi, Zalo và Chỉ đường rồi trả lời "Đã nhận" nhé.

### 8.5 Email sau cuộc gọi tìm hiểu — Agents/BI

```
Tiêu đề: [Lumi] Tóm tắt trao đổi ngày dd/mm và đề xuất trải nghiệm

Chào anh/chị [Tên],
Cảm ơn anh/chị đã trao đổi. Em tóm tắt để mình thống nhất:
- Việc đang tốn công: [mô tả] — khoảng [x] giờ/tuần, do [ai] làm.
- Dữ liệu: [nguồn], có thể chia sẻ [phần dữ liệu] đã loại thông tin mật.
- Người quyết định: [tên]; người duyệt kết quả: [tên].
- Kết quả mong muốn: [tiêu chí đo được].
Đề xuất: trải nghiệm miễn phí tối đa 2 tuần, trình bày kết quả ngày [dd/mm] với [người quyết định].
Nếu đạt, chi phí triển khai theo bảng giá là [9,9 / 19,8] triệu (chưa VAT), cọc 50% khi ký.
Anh/chị xác nhận giúp em để em gửi Phiếu thống nhất trải nghiệm nhé.
```

### 8.6 Phiếu thống nhất trải nghiệm — Agents/BI (khung)

| Mục | Nội dung |
|---|---|
| Bài toán (01) | |
| Nguồn dữ liệu (01) và phần được phép dùng | |
| Tiêu chí thành công đo được | |
| Thời gian | Từ … đến … (tối đa 2 tuần) |
| Ngày trình bày kết quả · người quyết định tham dự | |
| Ngày ra quyết định | ≤ 05 ngày làm việc sau buổi kết quả |
| Bảo mật dữ liệu | Mục đích sử dụng · người truy cập · xóa trong 30 ngày nếu không triển khai |
| Giá nếu triển khai | Theo bảng giá; cọc 50% khi ký |
| Xác nhận | Khách hàng (email) · Cloudjet (email) |

### 8.7 Biên bản nghiệm thu — Agents/BI (khung)

Mã hợp đồng · hạng mục · từng tiêu chí nghiệm thu với kết quả đạt hoặc chưa đạt · tồn đọng và hạn xử lý · tài liệu đã bàn giao · số tiền còn lại và hạn thanh toán (07 ngày) · chữ ký hai bên.

### 8.8 Nhắc gia hạn

> Anh/chị [Tên] ơi, trang [link] sẽ hết hạn năm đầu ngày [dd/mm]. Phí duy trì năm 2 là 599.000đ (giữ địa chỉ hiện tại) hoặc 999.000đ (kèm tên miền riêng dạng tencoso.vn). Lumi không tự động trừ tiền; anh/chị chọn gói nào để em gửi mã thanh toán ạ?

### 8.9 Nhắc công nợ

> Chào anh/chị [Tên], khoản [số tiền] cho đơn [mã đơn] đến hạn ngày [dd/mm]. Em gửi lại mã QR thanh toán ở đây. Nếu anh/chị đã chuyển, gửi em ảnh xác nhận để em đối chiếu nhé.

---

## 9. Không làm

- Không bàn giao tên miền chính thức, file QR, dashboard cuối hay quyền truy cập trước khi nhận đủ tiền theo mốc.
- Không nhận tiền ngoài tài khoản công ty.
- Không hứa thứ hạng Google, lượng khách, doanh thu, hay tỷ lệ tiết kiệm chưa đo.
- Không nhận cọc cho Lumi Agents (Catalog) khi CTO chưa xác nhận khả năng thực hiện.
- Không bắt đầu trải nghiệm khi người quyết định chưa cam kết dự buổi kết quả.
- Không làm bản xem thử khi khách chưa gửi ảnh và thông tin.
- Không giảm giá ngoài bảng giá khi chưa có email duyệt.
- Không nêu tên hay số liệu của khách hàng hiện có khi chưa có đồng ý bằng văn bản.

---

## 10. Cần chốt trước khi chạy quy trình

| # | Việc | Người chốt |
|---|---|---|
| 1 | **Giá Lumi Local đã gồm VAT hay chưa?** Khách địa phương thường hiểu 1.990.000 là giá trọn gói. Website chỉ ghi "chưa VAT" cho Lumi Agents | CEO + Kế toán |
| 2 | Số tài khoản công ty và mã VietQR in sẵn | Kế toán |
| 3 | Phần mềm hóa đơn điện tử; cách xử lý hóa đơn cho khoản đặt cọc | Kế toán |
| 4 | Công cụ CRM (Google Sheet theo cột ở mục 2 là đủ cho 3 tháng đầu) | GTM Specialist |
| 5 | **Ai dựng bản xem thử, và công suất mỗi tuần là bao nhiêu?** Đây là điểm nghẽn thật của luồng Local | CTO |
| 6 | Hợp đồng dịch vụ mẫu cho khách Agents/BI, có phụ lục phạm vi, tiêu chí nghiệm thu, điều khoản im lặng là nghiệm thu, và bảo mật dữ liệu | CEO |
| 7 | Hộp thư gtm@runlumi.vn có người trực hằng ngày | CEO |

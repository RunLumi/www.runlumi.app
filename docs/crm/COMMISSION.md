# Hoa hồng bán Lumi Local: phân tích và đề xuất

> **Trạng thái: ĐỀ XUẤT — chưa được duyệt.**
>
> STRATEGY.md:68 ghi rõ mức hoa hồng vẫn là thử nghiệm chưa được duyệt. Tài liệu này đưa ra một phương án có căn cứ để founder quyết định.
>
> CRM lưu phương án dưới dạng chính sách có phiên bản `local-commission@1` ở trạng thái `proposed`. Ở trạng thái này, CRM chỉ tính số dự kiến cho admin/tài chính xem. Cộng tác viên không thấy con số, và CRM không ghi nhận chi trả cho tới khi admin duyệt một phiên bản.

Nguồn giá và cổng đánh giá: `RunLumi/local.runlumi` PRICING.md và STRATEGY.md @ `3a6024e`. Số liệu thuế, lương và bảo hiểm tra cứu ngày 2026-10-07 (nguồn ở §8). **Kế toán/luật sư cần xác nhận trước khi ký hợp đồng.**

## 1. Kết luận ngắn

| | Cộng tác viên bán trọn (partner) | Cộng tác viên giới thiệu (referral) | Nhân viên (employee) |
|---|---:|---:|---:|
| Trust Kit đã thu đủ và đã bàn giao | 100.000đ | 30.000đ | 40.000đ |
| Starter bán thẳng: khi website live | 300.000đ | 100.000đ | 120.000đ |
| Starter: sau 60 ngày vẫn live, không hoàn tiền | +100.000đ | +50.000đ | +30.000đ |
| Nâng cấp Trust Kit → Starter: khi live | 200.000đ | 70.000đ | 80.000đ |
| Nâng cấp: sau 60 ngày | +100.000đ | +50.000đ | +30.000đ |
| **Tổng cho một doanh nghiệp thành Starter** (dù đi đường nào) | **400.000đ** | **150.000đ** | **150.000đ** |
| Gia hạn năm 2+ (người trực tiếp gia hạn) | 10% tiền thu | 0 | 5% tiền thu |
| Lead inbound do admin giao | 50% các mức trên | — | 50% các mức trên |
| Lương cứng | không | không | có (§4) |

**Ba nguyên tắc:**

1. **Tổng cho một doanh nghiệp không phụ thuộc đường đi.** Bán Starter thẳng và đi đường Trust Kit rồi nâng cấp đều cho cùng 400.000đ (partner). Vì vậy không ai có lợi khi chia nhỏ giao dịch hay "bán Trust Kit rồi bỏ đi".
2. **Chỉ trả trên tiền đã thu, đã bàn giao và còn giữ.** Không trả cho enquiry, preview, cuộc hẹn hay lời hứa. Đây đúng là điều STRATEGY yêu cầu: "reward paid, correctly scoped delivery rather than QR volume".
3. **Tuyển partner trước, chưa tuyển nhân viên bán hàng có lương cứng.** Với giá hiện tại, một người có lương cứng chỉ đạt cổng CAC ≤600.000đ khi bán khoảng 15–17 Starter/tháng (§4), một mức chưa ai chứng minh được. Theo STRATEGY, chỉ tăng người sau khi cohort 2 lặp lại được doanh số Starter.

## 2. Kinh tế một doanh nghiệp (trước hoa hồng)

Mọi chi phí dưới đây là **giả định để ra quyết định**, không phải số đã đo. CRM sẽ thay bằng số thực từ cohort (thời gian và chi phí đã ghi).

| Giả định | Giá trị | Căn cứ |
|---|---:|---|
| Giá trị một giờ công nội bộ | 100.000đ/giờ | Giả định; cần founder chốt |
| Công thực hiện Starter | 120 phút → 200.000đ | Trần trung vị trong cổng STRATEGY |
| Công thực hiện Trust Kit | 30 phút → 50.000đ | Giả định |
| Hosting, SSL, tạo nội dung (năm 1) | 30.000đ | Giả định (chi phí biên trên Cloudflare) |
| Dự phòng hỗ trợ năm đầu (Starter) | 100.000đ | Giả định: 1 giờ |
| Tên miền riêng năm 1 | 0đ (subdomain) hoặc ~350.000đ | Chưa có giá; PRICING yêu cầu xác nhận chi phí trước khi thu tiền |

| Một doanh nghiệp | Tiền thu năm 1 | Chi phí thực hiện | Đóng góp trước hoa hồng |
|---|---:|---:|---:|
| Chỉ Trust Kit | 399.000đ | 50.000đ | **349.000đ** |
| Starter, subdomain | 1.990.000đ | 330.000đ | **1.660.000đ** |
| Starter, tên miền riêng | 1.990.000đ | 680.000đ | **1.310.000đ** |
| Trust Kit → Starter (399.000 + 1.591.000) | 1.990.000đ | 380.000đ | **1.610.000đ** |

**Cổng mở rộng của STRATEGY:** CAC biến đổi ≤600.000đ cho mỗi Starter, và contribution năm đầu phải dương sau khi trừ dự phòng.

- Với partner, hoa hồng 400.000đ chiếm 2/3 ngân sách CAC. Phần còn lại, 200.000đ/Starter, dành cho preview thất bại, thời gian nghiên cứu, các chuyến đi không ra đơn, và hoa hồng Trust Kit của những doanh nghiệp không nâng cấp.
- Mức cao hơn 400.000đ chỉ hợp lý khi tỷ lệ chuyển đổi đã được chứng minh tốt hơn.

**Kiểm tra độ nhạy, theo cổng tiếp tục của STRATEGY (30 doanh nghiệp: 2 Starter, 4 chỉ Trust Kit):**

| Khoản | Giá trị |
|---|---|
| Hoa hồng partner | 2 × 400k + 4 × 100k = 1.200.000đ |
| Hoa hồng tính trên mỗi Starter (cách bảo thủ: dồn hết chi phí tìm khách cho Starter) | 600.000đ — đúng bằng trần, chưa tính chi phí khác |
| Tiền thu | 2 × 1.990k + 4 × 399k = 5.576.000đ |
| Đóng góp trước hoa hồng | 2 × 1.660k + 4 × 349k = 4.716.000đ |
| Sau hoa hồng | ≈ 3.516.000đ |
| Còn phải trừ | thời gian founder: nghiên cứu ~30 × 4 phút, preview ~20 × 5 phút, các buổi gặp |

Kết luận: ở tỷ lệ tối thiểu của cổng, Trust Kit "lẻ" (khách không nâng cấp) kéo CAC lên. Vì vậy hoa hồng Trust Kit nên giữ thấp (25% giá) và **không có thưởng theo số lượng**.

## 3. Cộng tác viên (partner): thiết kế chi tiết

**Hai loại partner:**
- **Bán trọn:** tự tìm, gặp chủ, cho xem preview, chốt, bàn giao thông tin cho đội thực hiện. Partner tự chịu chi phí đi lại.
- **Giới thiệu:** chỉ giới thiệu một doanh nghiệp, người khác chốt. Nhận khoảng 37% mức bán trọn (150.000đ so với 400.000đ cho một Starter). Trong CRM, admin đặt *người giới thiệu* trên cơ hội.

**Điều kiện được tính:**
- Báo giá đã chấp thuận.
- Đã **thu đủ**, tức thanh toán đã được tài chính xác nhận.
- Đã **bàn giao**: website live, hoặc Trust Kit đã nghiệm thu.
- Phần giữ lại chỉ được tính sau **60 ngày** kể từ khi live, khi vẫn chưa có hoàn tiền.

**Các quy tắc khác:**
- **Thu hồi:** nếu hoàn tiền sau khi đã chi, số đã chi được trừ vào kỳ sau. CRM hiển thị số dư âm.
- **Giảm giá:** hoa hồng giảm theo tỷ lệ giá thực tế so với giá niêm yết. Credit nâng cấp không tính là giảm giá.
- **Lead inbound** (khách tự gửi yêu cầu, admin giao cho partner): 50% mức trên, vì Lumi đã trả chi phí tạo lead.
- **Gia hạn:** 10% tiền gia hạn thực thu (59.900đ hoặc 99.900đ) cho người trực tiếp làm việc gia hạn. Mức này cố ý thấp, vì khách phải ở lại nhờ giá trị, không phải nhờ người bán.
- **Không trả cho:** enquiry, preview, cuộc hẹn, Trust Kit chưa thu tiền, hay cam kết ngoài phạm vi. Nếu partner hứa thứ hạng, khách hoặc doanh thu, hoặc xin mật khẩu Google, hoa hồng của giao dịch đó bị giữ lại để xem xét.
- **Chi trả:** hằng tháng, theo bảng kê từ CRM, sau khi tài chính đối chiếu.

**Pháp lý và thuế (cần kế toán xác nhận):**
- **Khấu trừ thuế:** khi doanh nghiệp chi cho cá nhân không ký hợp đồng lao động, phải khấu trừ **10% thuế TNCN nếu mỗi lần chi từ 2.000.000đ trở lên**. Có đề xuất nâng ngưỡng lên 3 triệu năm 2026 nhưng chưa thấy văn bản chính thức.
  - Bảng kê tháng của một partner tích cực sẽ thường vượt 2 triệu.
  - **Không chia nhỏ lần chi để né ngưỡng.**
  - Partner đủ điều kiện có thể nộp mẫu cam kết 08/CK-TNCN.
- **Rủi ro phân loại sai:** nếu Lumi quản lý partner như nhân viên (giờ làm cố định, chỉ tiêu bắt buộc, giám sát hằng ngày), quan hệ có thể bị coi là hợp đồng lao động và phát sinh nghĩa vụ BHXH. Hợp đồng cộng tác nên chỉ quy định kết quả, phạm vi lời hứa được phép (COPY.md) và quy tắc bảo vệ dữ liệu khách.

## 4. Nhân viên (employee): khi nào hợp lý

**Chi phí cố định tối thiểu mỗi tháng** (tính trên lương đóng BHXH):

| Lương cơ bản | + BHXH/BHYT/BHTN phía doanh nghiệp 21,5% | + kinh phí công đoàn 2% | Tổng chi phí/tháng |
|---:|---:|---:|---:|
| 6.000.000đ (trên mức tối thiểu vùng I 5.310.000đ) | 1.290.000đ | 120.000đ | **7.410.000đ** |
| 8.000.000đ | 1.720.000đ | 160.000đ | **9.880.000đ** |

**Số Starter cần bán mỗi tháng để CAC ≤600.000đ** (nhân viên hưởng 150.000đ/Starter):

| Lương cơ bản | Phép tính | Starter/tháng cần đạt |
|---:|---|---:|
| 6 triệu | 7,41tr / (600k − 150k) | **≈ 16,5** |
| 8 triệu | 9,88tr / 450k | **≈ 22** |

Mục tiêu ca trong FIELD_PLAYBOOK là 0–1 khách trả tiền mỗi ca, và chưa được chứng minh. Vì vậy **chưa nên tuyển nhân viên chỉ để bán**.

Nhân viên hợp lý khi một người làm cả **bán hàng và vận hành giao hàng**: nghiên cứu, làm preview, hỗ trợ bàn giao, gia hạn. Khi đó lương trả cho cả phần công việc thực hiện, và chỉ phần bán hàng tính vào CAC theo tỷ lệ thời gian đã ghi trong CRM.

**Vì sao hoa hồng nhân viên thấp hơn partner (150k so với 400k cho mỗi Starter):**
- Nhân viên có lương, bảo hiểm và được dùng lead, công cụ, xe/chi phí đi lại của công ty.
- Partner tự chịu toàn bộ chi phí và rủi ro không có thu nhập.
- Hoa hồng nhân viên là thu nhập tiền lương: chịu thuế lũy tiến, và phải ghi trong hợp đồng lao động hoặc quy chế lương. Giữ tỷ lệ trả theo cột mốc (live, 60 ngày) giống partner để cùng hướng tới khách giữ lại.

## 5. Lumi Ops và giải pháp

**Chưa đặt mức.** Giải pháp/workflow AI chưa có giá niêm yết. Nếu partner giới thiệu một cơ hội Ops, đề xuất là **thỏa thuận bằng văn bản theo từng cơ hội trước khi bắt đầu**, ví dụ 10% tiền thực thu năm đầu, có trần. CRM không tự tính khoản này.

## 6. Cách CRM áp dụng (đã triển khai)

- **Chính sách `local-commission`:** có phiên bản, trạng thái `proposed` hoặc `approved`. Admin sửa mức tại *Hoa hồng*. Mỗi lần lưu tạo phiên bản mới. Phiên bản cũ không bị sửa.
- **Loại người bán:** mỗi thành viên có một loại (partner bán trọn / partner giới thiệu / nhân viên / không hưởng hoa hồng) kèm ngày hiệu lực. Giao dịch dùng loại có hiệu lực tại ngày khách chấp thuận. Founder và admin để "không hưởng".
- **Ai được tính:** người bán là người được ghi công trên cơ hội (`seller_id`). Giao lại cho người khác không đổi ghi công. Người giới thiệu do admin đặt trên cơ hội.
- **Cách tính:** CRM tính từ sổ thương mại (thu, hoàn, credit), trạng thái bàn giao và ngày live. Mỗi dòng có trạng thái: *chờ thu/bàn giao*, *chờ hết thời gian giữ*, *đã đủ điều kiện*, *chưa khai báo loại người bán*.
- **Chi trả:** CRM **không chi tiền**. Khi chính sách đã duyệt, tài chính ghi nhận "đã chi theo bảng kê" (số tiền, kỳ, bằng chứng). CRM hiện số dư từng người; số dư âm nghĩa là phải thu hồi.
- **Quyền xem:** trước khi duyệt, chỉ admin/tài chính thấy số dự kiến. Sau khi duyệt, mỗi cộng tác viên thấy dòng của chính mình.

## 7. Quyết định cần founder

1. Chốt giá trị giờ công nội bộ, cách tính chi phí tên miền năm 1, và có duyệt khung trong §1 hay không. Nếu duyệt, lưu phiên bản `approved` trong CRM.
2. Thời gian giữ là 60 hay 90 ngày. Bản lưu trữ cũ đề xuất 90 ngày, đổi lại tiền đến tay partner chậm hơn.
3. Có dùng partner giới thiệu hay không.
4. Thử với tối đa 3 partner trong cohort 2, rồi đối chiếu CAC thực tế với cổng ≤600.000đ trước khi mở rộng.

## 8. Nguồn

- Giá và cổng: local.runlumi PRICING.md:10–21, STRATEGY.md:47–56, 68; đề xuất cũ (chỉ tham khảo) docs/archive/STRATEGY-RESEARCH-2026-10.md:253–258.
- Khấu trừ 10% TNCN với khoản chi ≥2 triệu/lần, và đề xuất nâng ngưỡng 3 triệu: [MVA](https://mva.vn/thu-nhap-tu-cong-tac-vien-co-phai-khau-tru-10-thue-tncn/), [KHD Law](https://khdlaw.vn/cach-tinh-thue-tncn-doi-voi-hop-dong-cong-tac-vien-2026/).
- Lương tối thiểu vùng I 2026 là 5.310.000đ (Nghị định 293/2025/NĐ-CP): [LuatVietnam](https://luatvietnam.vn/lao-dong-tien-luong/muc-luong-toi-thieu-vung-cua-34-tinh-thanh-tu-01-01-2026-562-103349-article.html).
- Tỷ lệ đóng BHXH/BHYT/BHTN phía doanh nghiệp 21,5%: [MISA AMIS](https://amis.misa.vn/?p=292831).

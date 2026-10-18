# Finance — quy tắc tài chính

[English](FINANCIAL-RULES.md)

**Trạng thái: yêu cầu ĐỀ XUẤT, 18/10/2026.** Các mặc định dưới đây là đề xuất thiết kế, chưa phải chính sách kế toán được chủ sở hữu phê duyệt. Tài liệu định nghĩa phép tính và ý nghĩa báo cáo; không triển khai sổ cái, bộ máy tính thuế hoặc báo cáo pháp định. Mọi ví dụ đều dùng số liệu giả lập.

## 1. Phạm vi báo cáo và cơ sở dữ liệu

**FIN-R01.** Một bộ sổ quản trị đại diện cho một pháp nhân được xác định rõ và dùng một đồng tiền báo cáo. Mặc định đề xuất: VND, năm tài chính bắt đầu tháng 1, múi giờ Asia/Ho_Chi_Minh. Cấu hình trước khi có giá trị đầu tiên; thay đổi về sau cần phương án chuyển đổi được rà soát riêng. Một năm tài chính gồm 12 tháng dương lịch thực, kể cả khi đi qua tháng 12. V1 không quy đổi ngoại tệ hoặc hợp nhất nhiều pháp nhân.

Tách biệt ba nhóm đầu vào:

| Nhóm | Ý nghĩa | Tổng hợp nhiều tháng |
| --- | --- | --- |
| P&L | Thu nhập và chi phí được ghi nhận | Cộng phát sinh |
| Dòng tiền trực tiếp | Tiền thu, chi với bên ngoài | Cộng phát sinh |
| Tình hình tài chính | Số dư cuối tháng | Lấy số dư tại ngày kết thúc |

Thời điểm ghi nhận doanh thu gắn với việc hoàn thành hàng hóa, dịch vụ đã cam kết và có thể khác thời điểm nhận tiền; xem [tổng quan IFRS 15 của IFRS Foundation](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/). Chính sách cụ thể cho từng mảng kinh doanh vẫn cần chủ sở hữu quyết định. Giá trị CRM đã chấp nhận, đã xuất hóa đơn, doanh thu ghi nhận và tiền đã xác nhận thu được là các đầu vào khác nhau.

Dùng tên **P&L quản trị**, **Dòng tiền quản trị**, **Snapshot tình hình tài chính**. Các báo cáo giới hạn này không chứng minh tuân thủ IFRS; [tổng quan IAS 1](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements/) nêu các báo cáo và yêu cầu đầy đủ đằng sau tuyên bố đó.

## 2. Số tiền, mức hoàn chỉnh và kỳ báo cáo

**FIN-R02.** Lưu số nguyên có dấu theo đơn vị tiền nhỏ nhất; với bộ sổ VND đề xuất, không nhận phần thập phân. Từ chối độ chính xác vượt mức, dấu phân cách mơ hồ, đồng tiền khác và giá trị vượt giới hạn an toàn của ứng dụng trong mô hình dữ liệu. Làm tròn hiển thị không đổi giá trị lưu hoặc kết quả đối soát. Bảng nhập và tệp xuất luôn thể hiện đơn vị, đồng tiền.

Mỗi giá trị thuộc một tháng, nhóm đầu vào, định nghĩa dòng ổn định, phiên bản và phân khúc phù hợp. Ghim tập đầu vào kỳ vọng theo dòng × phân khúc × tháng hiệu lực. Mặc định mỗi dòng P&L chỉ cần ô Chưa phân bổ; chỉ kích hoạt ô phân khúc khi chủ động tách, không nhân mọi dòng với mọi phân khúc. Tổng phụ chỉ được đọc. Doanh thu/chi phí âm cần lý do điều chỉnh; chiều thu hoặc chi được khai báo rõ.

**FIN-R03.** Giữ riêng ba trạng thái:

- **Thiếu:** chưa có đầu vào được xác nhận; không chuyển thành 0.
- **Số 0 xác nhận:** người nhập xác nhận không có số tiền.
- **Không áp dụng:** quyết định áp dụng được ghi nhận rõ; không có số tiền và có lý do.

Mức hoàn chỉnh tính trên các ô kỳ vọng có áp dụng, không chỉ đếm dòng đã tồn tại. Chỉ cho phép N/A khi quy tắc áp dụng đã ghim của dòng cho phép, kèm lý do; không dùng cho số dư quan sát, số dư đầu kỳ hoặc giá trị kiểm soát đối soát. Không phát sinh thì xác nhận 0. Tổng và tỷ lệ chính thức chưa khả dụng khi thiếu thành phần bắt buộc. Bản xem trước có thể hiện phần đã biết kèm mức bao phủ và nhãn chưa hoàn chỉnh. Biểu đồ giữ khoảng trống. Đánh dấu hàng loạt ô bằng 0 cần xem trước và ghi nhật ký.

Hai phía đối chiếu phải cùng tháng và phạm vi. Chuỗi chốt liên tục bắt đầu tại tháng chuyển sang theo dõi được khai báo, với số đầu kỳ tại đầu tháng đó. Khi chưa bổ sung các tháng tài chính trước, ghi **Từ <tháng bắt đầu> / năm tài chính chưa đủ**, không gọi là YTD đầy đủ hoặc tạo số 0 cho lịch sử thiếu. YTD đầy đủ luôn bắt đầu từ đầu năm tài chính và dùng cùng đoạn liên tục đã chốt ở hai phía; không bắt đầu lại phía sau tháng mở hoặc thiếu. Cho phép bản nháp thực tế tháng hiện tại; từ chối nhập/import thực tế tháng tương lai; chỉ chốt sau khi tháng kết thúc theo múi giờ bộ sổ. Số dư lấy tại cuối kỳ; tỷ lệ tính lại từ các thành phần tổng hợp.

## 3. Lợi nhuận và phân loại chi phí

**FIN-R04.** Quy ước `R`: doanh thu ghi nhận sau giảm giá/hoàn doanh thu đã phân loại riêng; `C`: chi phí trực tiếp; `O`: chi phí hoạt động; `I`: thu nhập hoạt động khác; `FI`: thu nhập tài chính; `FC`: chi phí tài chính; `T`: chi phí thuế thu nhập. Chi phí thông thường nhập số dương.

| Chỉ tiêu | Quy tắc chính xác |
| --- | --- |
| Lợi nhuận gộp | `R − C` |
| Lợi nhuận hoạt động | `R − C − O + I` |
| Lợi nhuận trước thuế | `Lợi nhuận hoạt động + FI − FC` |
| Lợi nhuận sau thuế | `Lợi nhuận trước thuế − T` |
| Biên lợi nhuận gộp | `(R − C) / R`, chỉ có khi `R > 0` |
| Biên hoạt động/sau thuế | Lợi nhuận tương ứng chia `R`, chỉ khi `R > 0` |

Khấu hao/phân bổ tài sản chỉ xuất hiện một lần trong nhóm chi phí đã cấu hình. Chi phí thuế thu nhập và tiền nộp thuế là hai giá trị riêng. Xác định nhất quán quy ước giá trị đã gồm/chưa gồm thuế trước khi nhập; v1 không tính thuế suất, điều kiện khấu trừ hoặc nghĩa vụ kê khai.

**FIN-R05.** Trang Revenue và Costs dùng lại cùng dữ liệu, định nghĩa. Danh mục mẫu có thể gồm dự án, bảo trì, SaaS, sản phẩm, lương triển khai, nhà thầu phụ, hosting/AI trực tiếp, hàng hóa, marketing, lương dùng chung, phần mềm, thuê văn phòng, dịch vụ chuyên môn, khấu hao và tài chính. Không tạo sẵn số tiền.

Tính chất **cố định/biến đổi** độc lập với **thuộc phân khúc/chưa phân bổ** và **trực tiếp/hoạt động**. Chi phí triển khai cố định vẫn có thể thuộc một phân khúc. Chi phí chung hiện ở phần chưa phân bổ; v1 không có bộ máy tự phân bổ. Chuyển khoản giữa chưa phân bổ và phân khúc cụ thể phải giữ nguyên tổng bộ sổ, có bằng chứng và không tính thêm bản sao nguồn. Doanh thu phân khúc trừ chi phí trực tiếp được gán gọi là lợi nhuận gộp phân khúc, không phải lợi nhuận sau mọi chi phí. Tổng bộ sổ tính mỗi phân khúc và khoản chưa phân bổ đúng một lần. Không tự vốn hóa chi phí phát triển hoặc suy ra MRR/EBITDA từ đầu vào thiếu.

## 4. Kế hoạch gốc, kịch bản và dự báo

**FIN-R06.** Kế hoạch gốc cả năm đã công bố là bất biến. Kế hoạch chứa 12 giá trị tháng cho các dòng P&L và dòng tiền trực tiếp bắt buộc, có áp dụng; tổng phát sinh năm được tính từ tháng. Công bố dự báo hoặc kịch bản không ghi đè kế hoạch gốc. Bản nháp có thể thiếu; công bố cần đủ đầu vào bắt buộc và ghim phiên bản định nghĩa.

Công bố kế hoạch gốc hoặc chốt bất kỳ kỳ thực tế nào sẽ khóa ý nghĩa các dòng cho năm tài chính đó. Có thể thêm tên hiển thị hiện tại qua phiên bản, nhưng báo cáo/tệp xuất lịch sử giữ nhãn đã ghim; không đổi phân loại, thành phần công thức hoặc cách tổng hợp. Dùng dòng Khác và Chưa phân bổ đã tạo sẵn, kèm giải thích cho phát sinh ngoài dự kiến. Chỉ đổi định nghĩa ở năm tài chính tương lai chưa có thao tác khóa; v1 không cần bộ máy ánh xạ lịch sử.

Để chia năm, dùng tổng nguyên có dấu `T` và trọng số hữu tỷ thập phân không âm, tổng lớn hơn 0. Phân bổ `abs(T)` theo tỷ lệ, lấy phần nguyên từng ô; chia đơn vị tiền còn dư cho các phần lẻ lớn nhất, hòa thì ưu tiên tháng tài chính sớm hơn; khôi phục dấu của `T`. Từ chối trọng số âm/không hợp lệ hoặc tổng bằng 0. Chia đều dùng trọng số bằng nhau. Sao chép/điền hiển thị ô bị tác động và số bị thay. Kịch bản có giả định riêng, không tự gán xác suất. Hoãn công cụ tự tính tăng trưởng.

**FIN-R07.** Với tháng cắt `k`:

`Ước tính cả năm = Σ thực tế đã chốt đến k + Σ dự báo được chọn sau k`.

Ghim phiên bản thực tế, tháng cắt, kế hoạch gốc, dự báo, giá trị thiết lập gồm sàn tiền, tập áp dụng, danh sách tài khoản và bộ quy tắc tính. Sửa thiết lập về sau không đổi báo cáo được tái lập. Thiếu đầu vào thì ước tính chưa hoàn chỉnh. Dùng ngân sách còn lại là lựa chọn riêng, mang tên **Thực tế + ngân sách còn lại**, không âm thầm bù từng ô thiếu. Thiếu tháng tài chính quá khứ thì ước tính cả năm vẫn chưa đủ; không thay bằng ngân sách. Dự báo tiền vẫn có thể bắt đầu từ kỳ chốt đã xác minh kể từ tháng chuyển sang theo dõi. Thu/chi cần giả định thời điểm riêng. Tiền cuối kỳ kế hoạch tính từ tiền đầu và dòng tiền, không phải ô số dư độc lập để sửa lần nữa. Không suy ra toàn bộ tình hình tài chính tương lai chỉ từ P&L.

## 5. Chênh lệch và cách diễn giải

**FIN-R08.** Với thực tế `A` và kế hoạch `P` đầy đủ, cùng phạm vi:

- Chênh lệch tuyệt đối: `A − P`.
- Chênh lệch tỷ lệ: `(A − P) / abs(P)` khi `P != 0`.
- `P = 0, A != 0`: hiện **Ngoài ngân sách** và chênh lệch tiền; không có tỷ lệ.
- `P = 0, A = 0`: chênh lệch 0; tỷ lệ chưa khả dụng.
- Thiếu ô kế hoạch gốc/số đối chiếu: **Không thể đối chiếu / chưa lập kế hoạch**, không âm thầm coi bằng 0. Chỉ số 0 kế hoạch được xác nhận mới dùng phép tính Ngoài ngân sách ở trên.
- Chênh lệch biên lợi nhuận: biên thực tế trừ biên kế hoạch, tính bằng **điểm phần trăm**.

Thuận lợi/bất lợi là ý nghĩa riêng: cải thiện doanh thu/lợi nhuận dùng `A − P`; tiết kiệm chi phí dùng `P − A`. Nợ, nguồn vốn và số dư không tự có chiều “tốt”. Mức hoàn thành mục tiêu chỉ dùng với mục tiêu dương có ý nghĩa, không dùng cho kế hoạch lỗ. Ngưỡng chênh lệch trọng yếu phải cấu hình và giữ nhãn đề xuất đến khi được duyệt.

## 6. Dòng tiền, thanh khoản và đối soát tài khoản

**FIN-R09.** Phân loại tiền với bên ngoài theo hoạt động, đầu tư hoặc tài trợ. [Tổng quan IAS 7 của IFRS Foundation](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/) giải thích ba nhóm, cách trình bày thu/chi trực tiếp và đối chiếu với số dư tiền. V1 dùng quy ước quản trị được ghi rõ, không tuyên bố trình bày pháp định.

`CFO = thu hoạt động − chi hoạt động`.

`CFI = thu đầu tư − chi đầu tư`.

`CFF = thu tài trợ − chi tài trợ`.

`Tiền cuối kỳ kỳ vọng = tiền đầu kỳ + CFO + CFI + CFF`.

`Tiền cuối kỳ quan sát = Σ số dư cuối kỳ tài khoản tiền đủ điều kiện`.

`Chênh lệch đối soát = tiền cuối kỳ quan sát − tiền cuối kỳ kỳ vọng`.

Số dư quan sát là nguồn của số tiền thực tế trên báo cáo; chênh lệch khác 0 là lỗi chưa xử lý, không phải một số dư thay thế. Đầu kỳ đầu tiên cần bằng chứng; các kỳ sau bằng số cuối kỳ của phiên bản đã chốt hiện hành trước đó. Mỗi tài khoản cần số dư cuối kỳ, phần bị hạn chế sử dụng và tham chiếu bằng chứng. Tiền bị hạn chế nằm trong khoảng 0 đến số dư đủ điều kiện của tài khoản. Số dư ngân hàng âm/thấu chi cần phân loại rõ giữa tiền và khoản vay; không cắt về 0 hoặc âm thầm đưa vào tiền khả dụng. Chưa giải quyết phân loại thì chưa được chốt.

Chuyển giữa tài khoản nội bộ có tổng ròng bằng 0, không tính vào dòng tiền bên ngoài. Vay nhận được và vốn chủ góp là tài trợ, không phải doanh thu. Trả gốc tách khỏi lãi. Biến động thấu chi cần khoản nhận/trả tài trợ tương ứng có bằng chứng; số dư quan sát không tự ghi dòng tiền đó lần nữa. Mua tài sản là chi đầu tư, tách khỏi khấu hao ghi nhận. Không thêm khoản điều chỉnh tiền không giải thích được để ép khớp.

**FIN-R10.** `Tiền không bị hạn chế = tiền cuối kỳ đủ điều kiện − tiền bị hạn chế`. Phần hạn chế trong dự báo và sàn tiền tối thiểu là đầu vào rõ ràng. Runway là tháng dự báo đầu tiên có tiền cuối kỳ không bị hạn chế **thấp hơn** sàn. Bằng sàn chưa vi phạm. Không vi phạm trong phạm vi dự báo thì ghi **Chưa có thiếu hụt trong phạm vi dự báo hiển thị**, không ghi runway vô hạn. Thiếu thành phần dự báo thì không đưa kết luận này. Ước tính theo tháng không chứng minh thanh khoản ở mọi ngày trong tháng.

## 7. Công nợ và tình hình tài chính

**FIN-R11.** AR/AP v1 là snapshot tuổi nợ cuối tháng, không phải sổ hóa đơn. Mỗi loại gồm chưa quá hạn, quá hạn 1–30, 31–60, 61–90 và trên 90 ngày. Nhóm đầu gồm khoản đến hạn đúng ngày snapshot. Các nhóm phải chia hết tổng, không trùng nhau; ghi nguồn và quy ước tuổi nợ. Không có ngày hóa đơn thì ứng dụng không được tự tạo tuổi nợ tính toán.

Tuổi nợ phản ánh phải thu/phải trả thương mại gộp, cùng cơ sở hóa đơn/thuế đã khai báo với số kiểm soát trên tình hình tài chính. Đối soát tuổi nợ AR với **phải thu gộp**; nhập dự phòng riêng, tính `phải thu thuần = phải thu gộp − dự phòng` vào tổng tài sản. Ứng trước nhà cung cấp là tài sản trả trước riêng, không phải nhóm tuổi nợ AP âm. Nghĩa vụ lương/cơ quan thuế, khoản vay và doanh thu chưa thực hiện tách khỏi tuổi nợ thương mại; điều này không loại phần thuế thu hộ trên hóa đơn khỏi số dư thương mại.

Thu/chi kỳ vọng trên Working Capital tham chiếu **cùng dữ liệu dòng tiền dự báo** của Cash Flow, hoặc chỉ là ghi chú không số. Không cộng thêm lần thứ hai vào dự báo và không ghi thành tiền thực tế.

**FIN-R12.** Bắt buộc kiểm tra:

- `Tài sản − Nợ phải trả − Vốn chủ sở hữu = 0`.
- Tiền trên snapshot bằng tổng số dư quan sát của các tài khoản.
- Phải thu/phải trả thương mại gộp bằng tổng tuổi nợ tương ứng; phải thu thuần tính sau dự phòng.
- `Vốn cuối kỳ = vốn đầu kỳ + lợi nhuận sau thuế + góp vốn bằng tiền + góp vốn phi tiền tệ − phân phối bằng tiền − phân phối phi tiền tệ + biến động vốn khác đã giải thích`.

Góp/phân phối vốn bằng tiền tham chiếu dữ liệu tài trợ đúng một lần. Vốn đầu kỳ và biến động vốn phi tiền tệ/khác là giá trị kiểm soát có bằng chứng riêng, không cộng thêm vào P&L/dòng tiền/số dư cuối kỳ. Tổng CFF không phải biến động vốn chủ vì còn gồm khoản vay. Biến động phi tiền tệ không vào dòng tiền.

Số dư đầu kỳ cần bằng chứng. Lợi nhuận tích lũy và kỳ hiện tại phải xử lý đúng ranh giới năm tài chính, không đếm lợi nhuận hai lần. Dung sai đối soát bằng 0 đơn vị nhỏ nhất lưu trữ; đề xuất dung sai khác cần thay đổi chính sách được ghi nhận. Không tính ngược một khoản vốn chủ để ép cân. Phép tính khớp không chứng minh nguồn chính xác.

## 8. Chốt kỳ, điều chỉnh và tái lập báo cáo

**FIN-R13.** Chốt toàn tháng cần đủ các phần P&L, tiền, tình hình tài chính và tuổi nợ, gồm số 0 có áp dụng, nguồn tham chiếu và kiểm tra đối soát/nối kỳ đều đạt. Hoàn tất một phần không phải chốt toàn tháng. Phiên bản đã chốt và ghi chú đầu vào là bất biến. Sửa số liệu bằng bản nháp điều chỉnh có lý do; công bố bản mới thay phiên bản hiện hành mà không xóa lịch sử. Bình luận sau chốt là chú thích chỉ được thêm, gắn với phiên bản, không sửa ghi chú đầu vào đã đóng băng.

Điều chỉnh phải chỉ ra đầu kỳ và dự báo về sau bị ảnh hưởng. Kỳ hiện hành phía sau không còn nối đúng số liệu phải mang trạng thái **cần điều chỉnh**, không âm thầm coi là đã đối soát. Dự báo dựa trên phiên bản thực tế đã bị thay phải mang nhãn cũ và được xác thực/công bố lại; không âm thầm nhận số tiền đầu kỳ mới. Phiên bản đã chốt và tệp xuất cũ vẫn tái lập được. Báo cáo chỉ rõ phiên bản thực tế, kế hoạch, định nghĩa và phép tính đã dùng. “Đã chốt” nghĩa là hoàn tất và đóng băng theo các kiểm tra này, không phải đã kiểm toán.

## 9. Ví dụ giả lập để nghiệm thu

Các số dưới đây dùng đơn vị báo cáo nguyên tùy ý; dữ liệu thật lưu theo đơn vị tiền nhỏ nhất. Khoản P&L/dòng tiền không nêu trong ví dụ tính toán được giả định xác nhận bằng 0, không phải mặc định khi nhập thật.

| Tình huống | Đầu vào | Kết quả bắt buộc |
| --- | --- | --- |
| Kế hoạch bằng 0 | `P=0; A=12` | Chênh lệch `+12`; Ngoài ngân sách; không có tỷ lệ |
| Kế hoạch âm | Lợi nhuận `P=−20; A=−10` | Chênh lệch `+10`; tỷ lệ `+50%`; cải thiện thuận lợi; không tính mức hoàn thành mục tiêu |
| Chi phí vượt kế hoạch | Chi phí `P=100; A=110` | Chênh lệch `+10`, `+10%`; vượt chi bất lợi `10` |
| Thiếu đầu vào | Doanh thu `100`; thiếu chi phí trực tiếp; chi phí hoạt động `20` | Chưa có lợi nhuận/biên; không chốt. Xác nhận chi phí trực tiếp `0` thì lợi nhuận hoạt động `80` |
| Phân khúc có chủ đích | Hai phân khúc; lương dùng chung `100` chỉ nhập vào ô Chưa phân bổ thuộc tập kỳ vọng | Tổng lương `100`; không tự tạo ô lương thiếu/0 cho các phân khúc hoặc đếm lặp tổng |
| Lợi nhuận khác tiền | Tiền đầu `50`; thu dịch vụ năm `120`; ghi nhận tháng này `10`; chi phí/tiền hoạt động `4`; nhận vay `30`; mua tài sản `24` | Giả định không có khoản P&L khác: lợi nhuận `6`, CFO `116`, CFI `−24`, CFF `30`, tiền cuối kỳ kỳ vọng/quan sát `172` |
| Giả định ghi nhận | Ví dụ trước giả định cung cấp dịch vụ đều trong 12 tháng | `10/tháng` là giả định của ví dụ, không phải chính sách doanh thu chung |
| Đối soát thấu chi | Tiền đầu `5`; chi hoạt động `15`; ngân hàng quan sát `−10`; nhận tài trợ có bằng chứng `10` | CFO `−15`, CFF `10`, tiền cuối đủ điều kiện `0`, nợ `10`; số quan sát không ghi thêm khoản vay lần nữa |
| Phải thu gộp/thuần | Tuổi nợ/số kiểm soát gộp `100`; dự phòng `10` | Đối soát gộp `100 = 100`; phải thu thuần trong tài sản `90`; không sửa tuổi nợ nguồn thành `90` |
| Dùng chung dự báo tiền | Thu kỳ vọng `100` xuất hiện ở Working Capital và Cash Flow | Một khoản thu dự báo `100`, không phải `200` |
| Thuế thu hộ | Doanh thu ghi nhận `100`; thu tiền `110`, gồm nghĩa vụ `10` | Lợi nhuận `100`, CFO `110`, nợ thuế `10`; sau đó trả `10` làm giảm tiền/nợ, không thêm chi phí thuế thu nhập; không giả định thuế suất thực |
| Chia năm chính xác | Trọng số đều 12 tháng; tổng `100`, rồi `−100` | Bốn tháng tài chính đầu `9`, tám tháng sau `8`; trường hợp âm `−9`/`−8`; giữ đúng tổng có dấu |
| Tổng hợp số dư | Tiền cuối tháng 1 `100`; tháng 2 `110` | Tiền cuối tháng 2/YTD là `110`, không phải `210` |
| Sàn tiền | Sàn `20`; tiền không hạn chế dự báo `35, 20, 19` | Vi phạm đầu tiên ở tháng dự báo 3; không kết luận về từng ngày trong tháng |
| Công nợ không khớp | Tổng nhóm AR `40`; AR trên snapshot `42` | Chênh lệch `2`; chưa được chốt |

# Finance — quy tắc tài chính

[English](FINANCIAL-RULES.md)

**Trạng thái: quy tắc tính đã triển khai trong v1, 18/10/2026.** Bằng chứng phát hành và triển khai thực tế nằm trong [STATUS.md](STATUS.md). Cấu hình mặc định là lựa chọn khởi đầu, không thay cho phê duyệt chính sách kế toán của pháp nhân. Module phục vụ kế hoạch và báo cáo quản trị; không có sổ cái tổng hợp, bộ máy tính thuế hoặc báo cáo pháp định. Mọi ví dụ đều dùng số liệu giả lập.

## 1. Phạm vi báo cáo và cơ sở dữ liệu

**FIN-R01.** Một bộ sổ quản trị đại diện cho một pháp nhân được xác định rõ và dùng một đồng tiền báo cáo. Thiết lập khởi đầu dùng VND, năm tài chính bắt đầu tháng 1 và múi giờ Asia/Ho_Chi_Minh. Chọn lịch, tháng bắt đầu theo dõi và múi giờ trước khi tạo kế hoạch, kỳ hoặc đợt import; đồng tiền và độ chính xác không đổi sau khi đã có giá trị. Thay đổi về sau cần phương án chuyển đổi được rà soát riêng. Năm tài chính gồm 12 tháng dương lịch và mang tên năm bắt đầu: FY2026 bắt đầu tháng 10 là tháng 10/2026–9/2027. V1 không quy đổi ngoại tệ hoặc hợp nhất nhiều pháp nhân.

Tách biệt ba nhóm đầu vào:

| Nhóm | Ý nghĩa | Tổng hợp nhiều tháng |
| --- | --- | --- |
| P&L | Thu nhập và chi phí được ghi nhận | Cộng phát sinh |
| Dòng tiền trực tiếp | Tiền thu, chi với bên ngoài | Cộng phát sinh |
| Tình hình tài chính | Số dư cuối tháng | Lấy số dư tại ngày kết thúc |

Thời điểm ghi nhận doanh thu gắn với việc hoàn thành hàng hóa, dịch vụ đã cam kết và có thể khác thời điểm nhận tiền; xem [tổng quan IFRS 15 của IFRS Foundation](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/). Chính sách cụ thể cho từng mảng kinh doanh vẫn cần chủ sở hữu quyết định. Giá trị CRM đã chấp nhận, đã xuất hóa đơn, doanh thu ghi nhận và tiền đã xác nhận thu được là các đầu vào khác nhau.

Dùng tên **P&L quản trị**, **Dòng tiền quản trị**, **Snapshot tình hình tài chính**. Các báo cáo giới hạn này không chứng minh tuân thủ IFRS; [tổng quan IAS 1](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements/) nêu các báo cáo và yêu cầu đầy đủ đằng sau tuyên bố đó.

## 2. Số tiền, mức hoàn chỉnh và kỳ báo cáo

**FIN-R02.** Lưu số nguyên có dấu theo đơn vị tiền nhỏ nhất trong D1, giới hạn từ `−9.007.199.254.740.991` đến `+9.007.199.254.740.991`. Độ chính xác cấu hình là 0–6 chữ số thập phân; VND mặc định là 0. Chuyển đổi đầu vào thập phân chính xác; dùng số nguyên độ chính xác tùy ý khi cộng, phân bổ và xét trọng yếu. Từ chối quá độ chính xác, dấu phân nhóm hàng nghìn, dạng số mũ, đồng tiền khác hoặc đầu vào/tổng vượt giới hạn. Làm tròn hiển thị không đổi số lưu và đối soát. Luôn hiện đơn vị, đồng tiền; CSV báo cáo dùng số tiền chính xác theo đơn vị tiền chính và ghi riêng tỷ lệ dưới dạng số thập phân.

Mỗi giá trị thuộc một tháng, nhóm đầu vào, định nghĩa dòng ổn định, phiên bản và phân khúc phù hợp. Ghim tập đầu vào kỳ vọng theo dòng × phân khúc × tháng hiệu lực. Mặc định mỗi dòng P&L chỉ cần ô Chưa phân bổ; chỉ kích hoạt ô phân khúc khi chủ động tách, không nhân mọi dòng với mọi phân khúc. Tổng phụ chỉ được đọc. Doanh thu/chi phí âm cần lý do điều chỉnh; chiều thu hoặc chi được khai báo rõ.

**FIN-R03.** Giữ riêng ba trạng thái:

- **Thiếu:** chưa có đầu vào được xác nhận; không chuyển thành 0.
- **Số 0 xác nhận:** người nhập xác nhận không có số tiền.
- **Không áp dụng:** quyết định áp dụng được ghi nhận rõ; không có số tiền và có lý do.

Mức hoàn chỉnh tính mọi ô kỳ vọng có áp dụng, kể cả ô có cờ chính sách nhập `required=false`. Cờ này không biến số thiếu thành 0 hoặc làm tổng phụ thuộc trở nên đầy đủ. N/A chỉ được dùng khi quy tắc P&L đã ghim cho phép, kèm lý do; không dùng cho số dư quan sát, số đầu kỳ hoặc giá trị kiểm soát. Không phát sinh thì xác nhận 0. Thiếu thành phần tính toán thì chưa có tổng chính thức và chưa công bố/chốt; bản nháp có thể hiện phần đã biết với độ bao phủ chưa đủ. Biểu đồ giữ khoảng trống. Sao chép/điền cho xem trước giá trị bị tác động và ghi nhật ký; không tự điền 0.

Hai phía đối chiếu phải cùng tháng và phạm vi. Chuỗi chốt bắt đầu tại tháng chuyển sang theo dõi, với số đầu kỳ tại đầu tháng đó. V1 từ chối thực tế trước `firstPeriod`; khi thiết lập phải chọn tháng sớm nhất cần nhập lịch sử. Muốn mở rộng về trước sau khi đã dùng cần phương án chuyển đổi được rà soát, không có nút nhập lùi vượt mốc trong ứng dụng. Bắt đầu giữa năm thì giữ nhãn **Từ <tháng bắt đầu> / năm tài chính chưa đủ**, không tạo số 0 cho lịch sử. YTD đầy đủ luôn bắt đầu từ đầu năm tài chính, dùng cùng đoạn liên tục đã chốt ở hai phía và không bắt đầu lại sau tháng mở, đang điều chỉnh hoặc thiếu. Báo cáo phân khúc dùng điều kiện chốt của toàn sổ để xác định đoạn này. Cho phép nháp tháng hiện tại, từ chối thực tế tháng tương lai và chỉ chốt sau cuối tháng theo múi giờ bộ sổ. Cộng phát sinh; số dư lấy tại điểm cuối đầy đủ; tỷ lệ tính lại từ thành phần tổng hợp.

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

Tính chất **cố định/biến đổi/hỗn hợp/chưa phân loại** là thuộc tính riêng của định nghĩa, độc lập với **thuộc phân khúc/chưa phân bổ** và **trực tiếp/hoạt động**. Danh mục khởi tạo dùng **chưa phân loại**, không tự đặt chính sách chi phí doanh nghiệp. Chi phí triển khai cố định vẫn có thể thuộc phân khúc. Chi phí chung hiện ở phần chưa phân bổ; không có bộ máy tự phân bổ. Chuyển phân bổ phải giữ tổng sổ, có bằng chứng, không tính thêm bản sao. Lợi nhuận gộp phân khúc dùng chi phí trực tiếp được gán; kết quả phân khúc chưa bao gồm khoản còn ở Chưa phân bổ, không phải lợi nhuận sau mọi chi phí. Không lấy lợi nhuận phân khúc thay vào đối soát vốn chủ toàn sổ. Không tự vốn hóa phát triển hoặc suy ra MRR/EBITDA từ đầu vào thiếu.

## 4. Kế hoạch gốc, kịch bản và dự báo

**FIN-R06.** Kế hoạch gốc cả năm đã công bố là bất biến, gồm 12 giá trị tháng cho các ô P&L và dòng tiền trực tiếp có áp dụng; tổng phát sinh năm tính từ tháng. Dự báo/kịch bản không ghi đè kế hoạch gốc. Nháp có thể thiếu; công bố cần đủ mọi thành phần tính báo cáo và ghim định nghĩa, kể cả ô có áp dụng được gắn cờ tùy chọn trong chính sách nhập. Tập kế hoạch mặc định gồm P&L, dòng tiền trực tiếp và kiểm soát tiền dự báo; không tự tạo AR/AP hoặc số dư tài chính tương lai.

Công bố bất kỳ kế hoạch nào, gồm kịch bản hoặc dự báo, hoặc chốt thực tế sẽ ghim ý nghĩa định nghĩa cho năm tài chính. V1 cũng ngăn sửa định nghĩa khi đã có giá trị nháp dùng bộ đó; cần cấu hình danh mục và phân khúc trước. Báo cáo/tệp xuất lịch sử giữ nhãn, phân loại, thành phần công thức và cách tổng hợp đã ghim. Dùng dòng Khác và Chưa phân bổ, kèm giải thích cho phát sinh ngoài dự kiến. Cấu hình định nghĩa thay đổi ở năm chưa dùng; không có bộ máy phân loại lại/ánh xạ lịch sử.

Chia năm áp dụng cho dòng phát sinh của ngân sách/kịch bản cả năm còn sửa được, với đúng 12 trọng số. Dùng tổng nguyên có dấu `T`, trọng số hữu tỷ thập phân không âm có tổng dương, hỗ trợ tối đa 18 chữ số phần lẻ. Phân bổ `abs(T)` theo tỷ lệ, lấy phần nguyên; chia đơn vị còn dư cho phần lẻ lớn nhất, hòa thì ưu tiên tháng tài chính sớm hơn; khôi phục dấu. Từ chối trọng số âm/không hợp lệ hoặc tổng bằng 0. Chia đều dùng trọng số bằng nhau. Sao chép/điền cho xem trước số bị thay và chỉ chép ô có áp dụng ở tháng đích; số kiểm soát đầu kỳ được chuyển riêng. Nhập trực tiếp phần tháng còn lại của dự báo, không trải tổng năm qua phần thực tế đã chốt. Kịch bản có giả định riêng, không gán xác suất. Công cụ tự tính tăng trưởng nằm ngoài v1.

**FIN-R07.** Với tháng cắt `k`:

`Ước tính cả năm = Σ thực tế đã chốt đến k + Σ dự báo được chọn sau k`.

Ghim phiên bản thực tế, tháng cắt, kế hoạch gốc, dự báo, thiết lập gồm sàn tiền/ngưỡng trọng yếu, tập áp dụng, danh sách tài khoản và phiên bản phép tính. Sửa thiết lập về sau không đổi báo cáo tái lập. Thiếu đầu vào thì ước tính chưa đủ. Muốn dùng ngân sách còn lại, chủ động tạo dự báo sao chép từ nguồn đó và ghi rõ giả định **Thực tế + ngân sách còn lại**; không âm thầm bù từng ô. Nguồn thực tế trước tháng cắt bị thiếu/chưa chốt vẫn là thiếu dù tồn tại số kế hoạch đã sao chép. Thiếu tháng tài chính quá khứ thì ước tính năm chưa đủ. Dự báo tiền có thể bắt đầu từ kỳ chốt đã xác minh kể từ mốc theo dõi; nguồn chưa xác minh hoặc đã lỗi thời không được tạo chuỗi tiền tương lai có vẻ hợp lệ. Thu/chi cần giả định thời điểm riêng. Tiền cuối kế hoạch tính từ đầu kỳ và dòng tiền, không phải ô số dư riêng; P&L không tự tạo đủ bảng tình hình tài chính tương lai.

## 5. Chênh lệch và cách diễn giải

**FIN-R08.** Với thực tế `A` và kế hoạch `P` đầy đủ, cùng phạm vi:

- Chênh lệch tuyệt đối: `A − P`.
- Chênh lệch tỷ lệ: `(A − P) / abs(P)` khi `P != 0`.
- `P = 0, A != 0`: hiện **Ngoài ngân sách** và chênh lệch tiền; không có tỷ lệ.
- `P = 0, A = 0`: chênh lệch 0; tỷ lệ chưa khả dụng.
- Thiếu ô kế hoạch gốc/số đối chiếu: **Không thể đối chiếu / chưa lập kế hoạch**, không âm thầm coi bằng 0. Chỉ số 0 kế hoạch được xác nhận mới dùng phép tính Ngoài ngân sách ở trên.
- Chênh lệch biên lợi nhuận: biên thực tế trừ biên kế hoạch, tính bằng **điểm phần trăm**.

Thuận lợi/bất lợi là ý nghĩa riêng: cải thiện doanh thu/lợi nhuận dùng `A − P`; tiết kiệm chi phí dùng `P − A`. Nợ, nguồn vốn và số dư không tự có chiều “tốt”. Không diễn giải kế hoạch lỗ bằng tỷ lệ hoàn thành mục tiêu dương.

Ngưỡng trọng yếu do chủ sở hữu cấu hình tùy chọn, mặc định chưa đặt. Có thể dùng số tiền `M` theo đơn vị nhỏ nhất, tỷ lệ `B` theo số nguyên điểm cơ bản (`100 bps = 1%`), hoặc cả hai. Với chỉ tiêu tiền, chênh lệch trọng yếu khi **ít nhất một** điều kiện đạt: `abs(A−P) >= M`, hoặc khi `P != 0`, `abs(A−P) × 10000 >= B × abs(P)`. So sánh tích số nguyên chính xác, gồm cả giá trị bằng ngưỡng. Chỉ có ngưỡng tỷ lệ mà `P=0` thì chưa kết luận trọng yếu; ngưỡng tiền nếu có vẫn áp dụng. Thiếu số đối chiếu/chưa cấu hình thì chưa khả dụng. Không áp ngưỡng này cho chênh lệch biên tính theo điểm phần trăm. Dùng chính sách đã ghim của phiên bản thực tế được chọn, hoặc kỳ thực tế cuối của khoảng báo cáo; nếu không có thì dùng chính sách kế hoạch đã ghim/thiết lập nháp hiện tại.

## 6. Dòng tiền, thanh khoản và đối soát tài khoản

**FIN-R09.** Phân loại tiền với bên ngoài theo hoạt động, đầu tư hoặc tài trợ. [Tổng quan IAS 7 của IFRS Foundation](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/) giải thích ba nhóm, cách trình bày thu/chi trực tiếp và đối chiếu với số dư tiền. V1 dùng quy ước quản trị được ghi rõ, không tuyên bố trình bày pháp định.

`CFO = thu hoạt động − chi hoạt động`.

`CFI = thu đầu tư − chi đầu tư`.

`CFF = thu tài trợ − chi tài trợ`.

`Tiền cuối kỳ kỳ vọng = tiền đầu kỳ + CFO + CFI + CFF`.

`Tiền cuối kỳ quan sát = Σ số dư cuối kỳ tài khoản tiền đủ điều kiện`.

`Chênh lệch đối soát = tiền cuối kỳ quan sát − tiền cuối kỳ kỳ vọng`.

Số dư quan sát là nguồn của tiền thực tế; chênh lệch khác 0 vẫn là vấn đề chưa xử lý. Tại tháng đầu, từng tài khoản hoạt động cần số đầu tháng có bằng chứng; kỳ sau dùng cuối kỳ đã chốt hiện hành trước đó. Dùng danh sách tài khoản đã ghim của kỳ trước, kể cả tài khoản ngừng dùng về sau. Mỗi tài khoản hiện hoạt động cần số cuối kỳ, phần bị hạn chế và bằng chứng tại ngày cuối tháng dương lịch. Tiền hạn chế từ 0 đến số đủ điều kiện. Giữ số dư nguồn ngân hàng âm và phân loại rõ là khoản vay: tiền đủ điều kiện bằng 0, số vay quan sát phải nằm trong nợ vay trên tình hình tài chính. Chưa xử lý phân loại âm thì không chốt; không âm thầm cắt số nguồn hoặc cộng vào tiền khả dụng.

Chuyển giữa tài khoản nội bộ có tổng ròng bằng 0, không tính vào dòng tiền bên ngoài. Vay nhận được và vốn chủ góp là tài trợ, không phải doanh thu. Trả gốc tách khỏi lãi. Biến động thấu chi cần khoản nhận/trả tài trợ tương ứng có bằng chứng; số dư quan sát không tự ghi dòng tiền đó lần nữa. Mua tài sản là chi đầu tư, tách khỏi khấu hao ghi nhận. Không thêm khoản điều chỉnh tiền không giải thích được để ép khớp.

**FIN-R10.** `Tiền không bị hạn chế = tiền cuối kỳ đủ điều kiện − tiền bị hạn chế`. Phần hạn chế dự báo và sàn tiền không âm là đầu vào rõ ràng; chưa đặt sàn thì không kết luận theo ngưỡng. Runway là tháng dự báo đầu tiên có tiền cuối kỳ không bị hạn chế **thấp hơn** sàn; bằng sàn chưa vi phạm. Không vi phạm thì ghi **Chưa có thiếu hụt trong phạm vi dự báo hiển thị**, không ghi vô hạn. Thiếu đầu vào, chưa đối soát hoặc nguồn dự báo lỗi thời thì không đưa kết luận. Tiền/tiền khả dụng dự kiến âm là thiếu hụt vốn cần thấy rõ, không phải quan sát ngân hàng hoặc tự ghi khoản vay. Ước tính tháng không chứng minh thanh khoản ở mọi ngày.

## 7. Công nợ và tình hình tài chính

**FIN-R11.** AR/AP v1 là snapshot tuổi nợ cuối tháng, không phải sổ hóa đơn. Mỗi loại gồm chưa quá hạn, quá hạn 1–30, 31–60, 61–90 và trên 90 ngày. Nhóm đầu gồm khoản đến hạn đúng ngày snapshot. Các nhóm phải chia hết tổng, không trùng nhau; ghi nguồn và quy ước tuổi nợ. Không có ngày hóa đơn thì ứng dụng không được tự tạo tuổi nợ tính toán.

Tuổi nợ phản ánh phải thu/phải trả thương mại gộp, cùng cơ sở hóa đơn/thuế đã khai báo với số kiểm soát trên tình hình tài chính. Đối soát tuổi nợ AR với **phải thu gộp**; nhập dự phòng riêng, tính `phải thu thuần = phải thu gộp − dự phòng` vào tổng tài sản. Ứng trước nhà cung cấp là tài sản trả trước riêng, không phải nhóm tuổi nợ AP âm. Nghĩa vụ lương/cơ quan thuế, khoản vay và doanh thu chưa thực hiện tách khỏi tuổi nợ thương mại; điều này không loại phần thuế thu hộ trên hóa đơn khỏi số dư thương mại.

Thu/chi kỳ vọng trên Working Capital tham chiếu **cùng dữ liệu dòng tiền dự báo** của Cash Flow, hoặc chỉ là ghi chú không số. Không cộng thêm lần thứ hai vào dự báo và không ghi thành tiền thực tế.

**FIN-R12.** Bắt buộc kiểm tra:

- `Tài sản − Nợ phải trả − Vốn chủ sở hữu = 0`.
- Tiền trên snapshot bằng tổng số dư quan sát của các tài khoản.
- Phải thu/phải trả thương mại gộp bằng tổng tuổi nợ tương ứng; phải thu thuần tính sau dự phòng.
- `Vốn cuối kỳ = vốn đầu kỳ + lợi nhuận sau thuế + góp vốn bằng tiền + góp vốn phi tiền tệ − phân phối bằng tiền − phân phối phi tiền tệ + biến động vốn khác đã giải thích`.

Góp/phân phối vốn bằng tiền tham chiếu dữ liệu tài trợ đúng một lần. Vốn đầu kỳ và biến động vốn phi tiền tệ/khác là kiểm soát riêng, không cộng thêm vào P&L/dòng tiền/số dư. `equity.opening` tại tháng bắt đầu phải có tham chiếu bằng chứng riêng dù xác nhận bằng 0; từng khoản góp, phân phối phi tiền tệ hoặc biến động vốn khác có giá trị khác 0 cũng cần nguồn cụ thể. Biến động Khác cần giải thích. Nguồn cấp báo cáo không thay các kiểm soát này. Thiếu bằng chứng vẫn cho làm nháp nhưng chưa chốt. Tổng CFF không phải biến động vốn chủ vì còn khoản vay; biến động phi tiền tệ không vào dòng tiền.

Số dư đầu kỳ cần bằng chứng. Lợi nhuận tích lũy và kỳ hiện tại phải xử lý đúng ranh giới năm tài chính, không đếm lợi nhuận hai lần. Dung sai đối soát bằng 0 đơn vị nhỏ nhất lưu trữ; đề xuất dung sai khác cần thay đổi chính sách được ghi nhận. Không tính ngược một khoản vốn chủ để ép cân. Phép tính khớp không chứng minh nguồn chính xác.

## 8. Chốt kỳ, điều chỉnh và tái lập báo cáo

**FIN-R13.** Chốt toàn tháng cần đủ các phần P&L, tiền, tình hình tài chính và tuổi nợ, gồm số 0 có áp dụng, nguồn tham chiếu và kiểm tra đối soát/nối kỳ đều đạt. Hoàn tất một phần không phải chốt toàn tháng. Phiên bản đã chốt và ghi chú đầu vào là bất biến. Sửa số liệu bằng bản nháp điều chỉnh có lý do; công bố bản mới thay phiên bản hiện hành mà không xóa lịch sử. Bình luận sau chốt là chú thích chỉ được thêm, gắn với phiên bản, không sửa ghi chú đầu vào đã đóng băng.

Điều chỉnh chỉ ra các số đầu kỳ và dự báo bị ảnh hưởng. Kỳ phía sau nối sai số liệu mang trạng thái **cần điều chỉnh**, không coi đã đối soát. Dự báo dựa trên thực tế đã bị thay phải báo lỗi thời và cần phiên bản mới được xác minh; không âm thầm nhận tiền đầu kỳ mới. Biên nhận xuất lưu trạng thái đã chọn và thời điểm tạo để sửa dữ liệu, thiết lập, ghi chú hoặc cờ lỗi thời về sau không đổi nội dung tệp tái xuất. CSV gồm thực tế/kế hoạch chính xác, chênh lệch/thuận lợi/trọng yếu, chính sách nguồn đã ghim và tham chiếu phiên bản; từ chối rõ phiên bản phép tính không hỗ trợ. “Đã chốt” là hoàn tất, đóng băng theo kiểm tra này, không phải đã kiểm toán.

## 9. Ví dụ giả lập để nghiệm thu

Các số dưới đây dùng đơn vị báo cáo nguyên tùy ý; dữ liệu thật lưu theo đơn vị tiền nhỏ nhất. Khoản P&L/dòng tiền không nêu trong ví dụ tính toán được giả định xác nhận bằng 0, không phải mặc định khi nhập thật.

| Tình huống | Đầu vào | Kết quả bắt buộc |
| --- | --- | --- |
| Kế hoạch bằng 0 | `P=0; A=12` | Chênh lệch `+12`; Ngoài ngân sách; không có tỷ lệ |
| Kế hoạch âm | Lợi nhuận `P=−20; A=−10` | Chênh lệch `+10`; tỷ lệ `+50%`; cải thiện thuận lợi; không tính mức hoàn thành mục tiêu |
| Chi phí vượt kế hoạch | Chi phí `P=100; A=110` | Chênh lệch `+10`, `+10%`; vượt chi bất lợi `10` |
| Ngưỡng trọng yếu | `P=100; A=105; B=500 bps`; không có ngưỡng tiền | Trọng yếu đúng tại `5%`; `A=104` chưa đạt; `P=0` không kết luận theo ngưỡng tỷ lệ đơn lẻ |
| Ô tùy chọn | Ô doanh thu sản phẩm có áp dụng, `required=false` nhưng chưa nhập | Độ bao phủ và doanh thu vẫn thiếu; không chốt/công bố bằng cách coi ô trống là 0 |
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

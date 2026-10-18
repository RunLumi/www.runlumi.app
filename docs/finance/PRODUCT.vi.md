# Yêu cầu sản phẩm Finance

[English](PRODUCT.md) · [Mục lục](README.vi.md) · **ĐỀ XUẤT — chưa triển khai** · 2026-10-18

## 1. Kết quả cần đạt và ranh giới

Super Admin trả lời được: Đã dự kiến điều gì? Thực tế xảy ra thế nào? Vì sao chênh lệch đáng chú ý? Có bao nhiêu tiền dùng được? Tháng nào sắp tới cần can thiệp? Mỗi câu trả lời phải ghi rõ kỳ, phạm vi báo cáo, tiền tệ, trạng thái nguồn số liệu và phiên bản.

Phiên bản đầu là **quy trình báo cáo quản trị theo tháng**, dùng số tổng hợp và số dư được nhập. Không cần xây trước sổ hóa đơn, tích hợp ngân hàng, máy tính lương hoặc nền tảng kế toán hoàn chỉnh. Các hệ thống đó có thể cung cấp đầu vào được rà soát sau này; chúng không được âm thầm quyết định ý nghĩa của con số.

Ban đầu chỉ có một sổ quản trị với pháp nhân/phạm vi được cấu hình rõ, một tiền tệ cơ sở và mười hai tháng lịch trong mỗi năm tài chính. Schema giữ mã sổ để tránh bản ghi mơ hồ; v1 chưa có hợp nhất nhiều công ty hoặc quy đổi ngoại tệ. Mặc định đề xuất ở [README](README.vi.md), chưa phải chính sách đã xác minh của công ty.

**Quyền độc quyền:** mọi trang, nhập liệu, tải xuống và báo cáo chỉ dành cho System Super Admin đang hoạt động. CRM Finance, Sales Manager, HRM Admin và Payroll Officer không phải người dùng module này. Không mở rộng người xem để làm module thuận tiện hơn.

## 2. Cấu trúc các trang

Đây là đường dẫn đề xuất, chưa phải chức năng đang hoạt động. Mỗi đường dẫn có bản `/vi`. Thanh chọn dùng chung gồm sổ, năm tài chính, tháng/khoảng kỳ, kế hoạch gốc, scenario/forecast và phân khúc phù hợp. Trang tiền/tài sản không giả vờ áp dụng bộ lọc phân khúc P&L lên tiền hoặc tài sản toàn công ty.

| Trang EN / VI | Đường dẫn | Nội dung và thao tác thiết yếu |
|---|---|---|
| Overview / Tổng quan | `/finance` | Doanh thu, lãi gộp/lãi hoạt động, tiền khả dụng theo tháng và YTD; thực tế so kế hoạch; nguy cơ dưới mức tiền tối thiểu; cảnh báo thiếu số/đối soát; mở tới dòng nguồn. |
| Financial plan / Kế hoạch tài chính | `/finance/plans` | Danh sách năm/phiên bản; lưới 12 tháng cho P&L, dòng tiền và số dư dự kiến khi có; giả định, chia ngân sách năm/sao chép, scenario, kế hoạch gốc và forecast phần năm còn lại. |
| Monthly actuals / Số thực tế tháng | `/finance/actuals` | Danh sách kỳ và nơi nhập chung: doanh thu/chi phí ghi nhận, thu chi tiền, số dư và tuổi nợ; nháp, kiểm tra, xem trước CSV, nguồn số, chốt kỳ và điều chỉnh. |
| Profit and loss / Lãi lỗ | `/finance/pnl` | Từ doanh thu tới lợi nhuận sau thuế; tháng/quý/YTD; kế hoạch/thực tế/chênh lệch; so cùng kỳ; thay đổi biên lợi nhuận theo điểm phần trăm; chi tiết và giải trình. |
| Cash flow / Dòng tiền | `/finance/cash-flow` | Tiền đầu/cuối kỳ, thu chi vận hành/đầu tư/tài trợ, số dư tài khoản, tiền bị hạn chế sử dụng, đối soát, tiền tương lai và mức tối thiểu đã cấu hình. |
| Revenue / Doanh thu | `/finance/revenue` | Doanh thu ghi nhận theo dòng/phân khúc; định kỳ/một lần khi đã phân loại rõ; chênh lệch kế hoạch và phần còn lại sau chi phí trực tiếp. Tiền thu là chỉ số riêng. |
| Costs / Chi phí | `/finance/costs` | Chi phí trực tiếp/vận hành, cố định/biến đổi khi biết, lương tổng hợp và tiền đã trả, chênh lệch ngân sách, chi phí chung/chưa phân bổ và giải thích. |
| Working capital / Vốn lưu động | `/finance/working-capital` | Số tổng hợp tuổi nợ phải thu/phải trả cuối tháng, chưa đến hạn/quá hạn, ngày nguồn số, dự kiến thu/trả và đối soát số dư. Các nghĩa vụ khác phân loại riêng. |
| Financial position / Tình hình tài chính | `/finance/position` | Tài sản, nợ phải trả và vốn cuối tháng; liên kết tiền/phải thu/phải trả; chênh lệch phương trình cân đối và biến động vốn; trạng thái đủ/thiếu số. |
| Settings / Thiết lập | `/finance/settings` | Sổ, bộ định nghĩa theo năm, tài khoản tiền, lịch tài chính, dữ liệu bắt buộc, chính sách ghi nhận/phân bổ, mức tiền tối thiểu và ngưỡng chênh lệch. |
| Audit / Lịch sử | `/finance/audit` | Ai/lúc nào/vì sao sửa, import, công bố kế hoạch, chốt, mở lại và xuất; xem trước/sau và phiên bản được ghim; bộ lọc và phân trang. |

Doanh thu, Chi phí, P&L và Tổng quan đọc cùng bộ số gốc. Một số tháng chỉ có một nơi để sửa. Báo cáo dẫn tới editor đó, không tạo bản số thứ hai để nhập. Xuất báo cáo nằm ngay tại trang liên quan, không cần xây thêm phân hệ trùng lặp.

## 3. Các quy trình chính

### A. Khởi tạo sổ

1. Xác nhận phạm vi, độ chính xác tiền tệ, múi giờ, tháng bắt đầu năm tài chính và tháng ghi nhận đầu tiên.
2. Rà danh mục khởi đầu và các tọa độ cần nhập. Mỗi dòng P&L ban đầu chỉ cần Chưa phân bổ; muốn chia thì bật đúng phân khúc/tháng đã chọn, không lấy mọi tổ hợp dòng × phân khúc. Ghim bản đồ áp dụng, giữ các dòng Khác có quy tắc rõ và không vượt giới hạn số ô tháng được hỗ trợ.
3. Nhập số dư đầu kỳ và tiền thực tế cùng nguồn/ngày. Muốn có lịch sử phải nhập từng tháng; không tạo sẵn con số tài chính.
4. Ghi cách ghi nhận, phân loại chi phí trực tiếp/chung và thu hộ/chi hộ. Cấu hình ngưỡng, hoặc để trạng thái chưa cấu hình hiện rõ.

Có thể lưu setup chưa hoàn tất. Module chỉ rõ còn thiếu gì để coi báo cáo là đầy đủ. Định nghĩa nghiệp vụ của năm được đóng băng khi công bố kế hoạch gốc hoặc chốt tháng đầu tiên; v1 dùng Khác/Chưa phân bổ kèm giải thích cho hoạt động mới, không diễn giải lại lịch sử. Xem [Mô hình dữ liệu](DATA-MODEL.vi.md).

### B. Lập và giữ nguyên kế hoạch theo tháng

Editor có 12 cột tháng; dòng luồng như doanh thu/chi phí có tổng năm, dòng số dư có giá trị cuối kỳ. Cho nhập trực tiếp, sao chép tháng, sao chép năm trước thành nháp, chia số năm đều/theo trọng số và nhân bản phiên bản. Bước xem trước chỉ rõ ô bị đổi, số dư do làm tròn và số cũ sẽ bị thay. Tổng và tỷ lệ tự tính, không nhập tay.

Giả định là văn bản gắn với dòng hoặc phiên bản. Scenario thay số cụ thể hoặc dùng quy tắc phân bổ ngân sách năm xác định tại FIN-R06. Công cụ tăng trưởng để sau, khi đã đặc tả chính xác đầu vào/làm tròn. Không thêm biểu thức tùy ý, SQL, script, số do AI tự sinh hoặc máy thực thi spreadsheet.

Lưu nháp khác với công bố kế hoạch gốc. Công bố kiểm tra đủ đầu vào bắt buộc và đóng băng phiên bản. Một Super Admin có thể công bố việc mình làm; nhãn là **Đã công bố**, không giả là đã có người độc lập phê duyệt. Sửa kế hoạch chính thức phải thành phiên bản/phương án có nhãn riêng; kế hoạch gốc vẫn thấy được và phép so hiệu quả mặc định không tự đổi mốc.

### C. Nhập, kiểm tra và chốt tháng

Editor tháng chia phần P&L, dòng tiền, số dư và công nợ. Mỗi tọa độ bắt buộc có số, số 0, trạng thái thiếu hoặc không áp dụng được bộ định nghĩa đã ghim cho phép. N/A không vượt được yêu cầu số dư tài khoản, đầu kỳ hoặc kiểm soát đối soát. Lưu được nháp còn thiếu. Hiện riêng thay đổi chưa lưu, lỗi, nguồn, ngày dữ liệu nguồn, giải thích và kết quả ghi; không báo thành công khi ghi thất bại. Được lưu nháp tháng hiện tại; từ chối nhập/import thực tế tháng tương lai. Chỉ được chốt sau khi tháng kết thúc theo múi giờ sổ.

Luồng CSV: tải mẫu → tải lên → kiểm tra → xem chênh lệch → xác nhận từng tháng → biên nhận. Import dùng mã ổn định, quy ước số thập phân đã ghi, đúng sổ và phiên bản kỳ vọng. Từ chối cột/mã lạ, tọa độ trùng, sai tiền tệ và số mơ hồ. Số dư từng tài khoản dùng form riêng trong v1. File nhiều tháng được tạm xử lý và ghi từng tháng, có kết quả riêng; tháng lỗi chưa được ghi. Giới hạn và tính nguyên tử ở [Mô hình dữ liệu](DATA-MODEL.vi.md).

Chốt tháng hiện danh sách thiếu và kết quả đối soát, rồi đóng băng revision hoàn chỉnh. Chốt toàn tháng cần đủ P&L, tiền, tuổi nợ và số dư, cùng mọi đầu vào áp dụng/phép đối soát bắt buộc trong [Quy tắc tài chính](FINANCIAL-RULES.vi.md). Xong một phần chỉ là tiến độ, chưa phải chốt tháng. Không tự tạo số để cân bằng. Chốt nghĩa là đã qua kiểm tra của module, không phải được kế toán kiểm toán.

Mở lại cần lý do và tạo revision nháp mới. Giữ nguyên bản đã chốt cùng bản xuất cũ. Trang hiện tại phải báo kỳ đang điều chỉnh; tiền đầu kỳ/forecast phụ thuộc cần đánh dấu hoặc kiểm tra lại trước khi trình bày là số đã chốt hiện hành. Hóa đơn nhà cung cấp đến muộn đi qua quy trình điều chỉnh này.

### D. Đối chiếu và cập nhật forecast

So tháng/quý/YTD dùng cùng tập kỳ, tiền tệ, định nghĩa tương thích và kế hoạch gốc. YTD đầy đủ bắt đầu từ đầu năm tài chính tới tháng đã chốt liên tục gần nhất; không bắt đầu lại sau một tháng thiếu. Số nháp là chế độ xem trước riêng có nhãn. Tháng thiếu không thành 0; ngân sách tương lai không vào chênh lệch YTD. Sổ bắt đầu giữa năm được hiện “Từ tháng bắt đầu báo cáo” kèm khoảng kỳ; YTD/cả năm vẫn chưa đầy đủ tới khi bổ sung thực tế những tháng trước. Dự báo tiền vẫn có thể dùng lần chốt đã đối soát mới nhất trong chuỗi từ mốc bắt đầu được khai báo.

Dự kiến cả năm ghép các revision thực tế đã chốt được ghim tới cutoff với dự báo rõ ràng cho tháng còn lại. Nếu dùng ngân sách còn lại thì ghi đúng tên đó. Không âm thầm lấy ngân sách điền ô forecast thiếu. Dự báo tiền bắt đầu từ tiền thực tế đã đối soát và thời điểm thu/trả được nhập. Góc nhìn 12 tháng tới có thể cần kế hoạch của hai năm tài chính; chỉ hiện đúng phần đã có dữ liệu và đánh dấu khoảng thiếu, không tuyên bố có đủ 12 tháng.

Chênh lệch đáng chú ý có thể ghi nguyên nhân, hành động tiếp theo và ghi chú bởi Super Admin, ghim đúng baseline, revision thực tế, kỳ, chỉ số/dòng và phân khúc. Sau chốt, đây là annotation audit chỉ thêm, không sửa giải thích đầu vào đã đóng băng. Ghi chú nằm trong module, không giao việc hoặc gửi thông báo cho người khác. Tổng quan ưu tiên lỗi tiền/đối soát chưa xử lý, sau đó chênh lệch vượt ngưỡng. Màu tốt/xấu theo ý nghĩa chỉ số, không chỉ theo việc số tăng/giảm.

## 4. Báo cáo và xuất dữ liệu

Mọi báo cáo/bản xuất ghi phạm vi, tiền tệ/đơn vị, kỳ, thời điểm tạo, baseline/version, tập revision thực tế, cutoff, độ đầy đủ và chi phí chưa phân bổ. Ghim cả tập dòng/phân khúc/tài khoản, snapshot chính sách/cấu hình, mức tiền tối thiểu và phiên bản phép tính; cấu hình sau này không đổi báo cáo tái lập. Giữ số chính xác dù màn hình rút gọn thành triệu đồng. Xuất đúng bộ lọc/trạng thái đang xem; bản nháp vẫn có nhãn nháp.

V1 xuất CSV có giới hạn và bản in qua trình duyệt. Phân quyền ở máy chủ, vô hiệu hóa công thức trong trường văn bản CSV, tên file an toàn, không dùng URL object công khai. File báo cáo tải xuống không phải bản backup toàn bộ lịch sử. Không lưu số vào localStorage, IndexedDB, JSON tĩnh công khai hoặc cache service worker.

## 5. Yêu cầu UX và chất lượng

- Dùng `WorkspaceShell`, `DESIGN.md`, form/link gốc và bộ icon hiện có. Lưới tháng có nhãn dòng/header cố định và vùng cuộn ngang riêng; không kéo giãn cả trang.
- Mobile nhập một tháng với bộ chọn tháng rõ. Desktop có kế hoạch 12 cột. Luồng sửa/lưu/chốt cốt lõi có form render ở server; dán hàng loạt nâng cao là tùy chọn.
- Nhãn, lỗi, trạng thái và định dạng Anh/Việt ngang nhau. Đổi ngôn ngữ giữ đúng sổ/kỳ/phiên bản, không diễn giải lại số và ngày.
- Dùng được bàn phím; field có nhãn, lỗi gắn đúng field, focus rõ, trạng thái thuận/bất lợi có chữ. Biểu đồ có bảng số đi kèm; số thiếu tạo khoảng trống.
- Chưa có số: setup hoặc empty state. Thiếu số: tỷ lệ đầy đủ và dòng thiếu. Revision cũ: báo xung đột, giữ nội dung chưa lưu để xem lại. Dịch vụ lỗi: hướng dẫn thử lại, không lộ số hoặc báo đã lưu.

## 6. Phạm vi để sau

V1 chưa gồm ngoại tệ/FX, hợp nhất tập đoàn, bút toán/sổ cái kép, hóa đơn và đối chiếu giao dịch ngân hàng, khai thuế/báo cáo luật định, tính lương, tự khấu hao/ghi nhận doanh thu, tự đồng bộ/ghi CRM/HRM, khẳng định MRR/ARR khi thiếu nguồn hợp đồng subscription, dự báo AI, chia sẻ công khai, gửi báo cáo theo lịch hoặc chuyển/thanh toán tiền. Dự báo tiền theo tuần có thể làm sau để thấy thiếu tiền trong tháng; bảng tháng không chứng minh từng ngày đến hạn đều đủ tiền.

**Phản đối mạnh nhất:** nhập tổng hợp có thể trùng việc đã làm ở nơi khác và vẫn sai. Kiểm tra rẻ nhất là chạy một bộ số giả lập cùng một tháng được phép sử dụng đã chuẩn bị ngoài app, đo công nhập và đối soát kết quả. Nếu chưa có nguồn số tháng đáng tin, cải thiện nguồn và định nghĩa trước khi thêm dashboard. Ngưỡng nghiệm thu và tiếp tục ở [Triển khai](DELIVERY.vi.md).

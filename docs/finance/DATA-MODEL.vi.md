# Mô hình dữ liệu Finance

[English](DATA-MODEL.md) · [Tổng quan Finance](README.vi.md) · [Quy tắc tài chính](FINANCIAL-RULES.vi.md) · [Kiến trúc](ARCHITECTURE.vi.md)

**Trạng thái: yêu cầu đề xuất, chưa triển khai schema.** Các tên dưới đây mô tả trách nhiệm và ràng buộc, không phải migration có thể chạy. Finance dùng binding `DB` hiện có (`lumi-jobs`), với các bảng `finance_*` riêng. EmDash tiếp tục là nguồn danh tính. Không tự động sao chép dữ liệu khách hàng, nhân viên, thanh toán hoặc payroll.

## 1. Phạm vi sổ, kỳ và cách đo

V1 có một sổ quản trị cho một pháp nhân, dùng một đồng tiền cơ sở. Đề xuất ban đầu là VND, không có phần thập phân. Xác định pháp nhân, đồng tiền, tháng bắt đầu năm tài chính và múi giờ báo cáo trước khi nhập số. Khóa đồng tiền và độ chính xác sau giá trị đầu tiên. Không được đổi lịch để diễn giải lại các kỳ đã lưu; thay đổi lịch cần thiết kế chuyển tiếp được rà soát riêng.

Khóa kỳ chuẩn là `YYYY-MM` được kiểm tra hợp lệ, không phải timestamp UTC hoặc tên tháng theo ngôn ngữ. Nhãn năm tài chính và thứ tự tháng theo lịch đã chốt của sổ. Timestamp sự kiện dùng UTC; kỳ kinh doanh dùng lịch đã cấu hình.

Từ chối nhập trực tiếp/import số thực tế của tháng tương lai. Tháng hiện tại được lưu nháp với nhãn chưa hoàn tất; chỉ được chốt sau khi tháng đó kết thúc theo múi giờ của sổ. Kỳ vọng thuộc kế hoạch/forecast. Nhập lịch sử phải theo mốc số dư đầu kỳ và quy tắc liên tục giữa các kỳ.

Tách các cơ sở dữ liệu: kết quả kinh doanh (P&L), dòng tiền bên ngoài, số dư tài sản/nợ/vốn và tuổi nợ phải thu/phải trả. Nhập doanh thu không tự tạo tiền thu. Số dư là giá trị tại cuối tháng, không phải dòng phát sinh trong tháng. [Quy tắc tài chính](FINANCIAL-RULES.vi.md) quy định cách phân loại và đối chiếu.

Mỗi phiên bản kế hoạch và lần sửa số thực tế ghim một bộ định nghĩa đã công bố: mã dòng, dòng nhập/tính, cơ sở báo cáo, quy ước dấu và mã phép tính hỗ trợ. Khóa ý nghĩa bộ định nghĩa của năm khi công bố ngân sách gốc hoặc chốt tháng đầu tiên. V1 từ chối so sánh các bộ không tương thích, không tự ánh xạ. Năm mới có thể sao chép rồi sửa định nghĩa; phân loại lại lịch sử cần thiết kế ánh xạ được rà soát riêng.

## 2. Các bảng khái niệm

ID không mang ý nghĩa nghiệp vụ; toàn bộ số liệu thuộc sổ đã cấu hình. Danh sách 14 bảng định hướng quy mô, không yêu cầu sao chép nguyên xi mọi cột.

| Bảng | Trách nhiệm và ràng buộc chính |
| --- | --- |
| `finance_books` | Một sổ: pháp nhân, đồng tiền/độ chính xác, đầu năm tài chính, múi giờ, phiên bản cấu hình. Khóa cách đo sau khi sử dụng. |
| `finance_definition_sets` | Phiên bản ngữ nghĩa draft/published, phiên bản quy tắc tính và danh sách đầu vào dòng × phân khúc × tháng hiệu lực. Bộ published bất biến. |
| `finance_lines` | Khóa `(definition_set_id, line_code)`; cơ sở báo cáo/control, loại nhập/tính, số dư/phát sinh, nhãn lịch sử, quy tắc áp dụng/N/A, mã phép tính cố định. Không lưu công thức thực thi tùy ý. |
| `finance_segments` | Mã phân khúc ổn định và thời gian áp dụng; một chiều phân khúc P&L tùy chọn. Dành mã không-null `unallocated` và `all`. Ngừng sử dụng thay vì xóa phân khúc đã được tham chiếu. |
| `finance_periods` | Duy nhất `(book_id, period)`; phiên bản chống ghi đè, con trỏ tới lần chốt có hiệu lực và bản đang nhập nếu có. Con trỏ phải thuộc đúng kỳ/sổ. |
| `finance_plan_versions` | Budget/forecast/scenario, năm/khoảng kế hoạch, draft/published, phiên bản, định nghĩa, giả định, kế hoạch/số thực tế nguồn, snapshot thiết lập báo cáo. Tối đa một ngân sách gốc chính thức mỗi năm. |
| `finance_plan_values` | Duy nhất `(plan_version_id, period, line_code, segment_code)`; số/trạng thái, ghi chú lưu bền, chứng cứ và thao tác nguồn. Sổ, tiền tệ, định nghĩa theo phiên bản cha. |
| `finance_actual_revisions` | Lần sửa draft/closed của kỳ, phiên bản, định nghĩa, nguồn/số dư đầu kỳ, người/lý do chốt/mở lại; manifest khối/nguồn, phạm vi, danh sách tài khoản và thiết lập báo cáo đã khóa. |
| `finance_actual_values` | Duy nhất `(actual_revision_id, line_code, segment_code)`; đầu vào P&L/tiền/số dư/tuổi nợ/control có kiểu, trạng thái, ghi chú lưu bền, chứng cứ và thao tác nguồn. |
| `finance_cash_accounts` | Mã tài khoản tiền ổn định, đồng tiền cơ sở, thời gian sử dụng và nhãn. Không lưu thông tin đăng nhập ngân hàng; không tích hợp ngân hàng. Không xóa tài khoản đã tham chiếu. |
| `finance_balance_observations` | Duy nhất `(actual_revision_id, account_id, observation_kind)` cho quan sát đầu/cuối kỳ; số nguồn, phân loại tiền/khoản vay, phần bị hạn chế, chứng cứ và ngày dữ liệu nguồn. |
| `finance_import_batches` | Đích, manifest xem trước có phiên bản/giới hạn, ngày dữ liệu nguồn/chứng cứ từng khối, hash, phiên bản kỳ vọng, biên nhận từng tháng. Không lưu file gốc hoặc dữ liệu nhị phân. |
| `finance_write_operations` | Khóa idempotency duy nhất theo phạm vi, hash yêu cầu chuẩn, người thực hiện, đích, phiên bản kết quả, kết quả trả lại có giới hạn. Ghi cùng giao dịch với thay đổi nghiệp vụ. |
| `finance_audit_events` | Lịch sử chỉ thêm người/thời gian/hành động/đích/trước-sau/lý do/thao tác; ghi chú rà soát ghim phiên bản, kỳ, dòng/chỉ số/phân khúc. Cùng ranh giới Finance. |

Ưu tiên khóa ngoại cha/khóa ghép thay vì lưu độc lập `book_id`, kỳ hay định nghĩa có thể mâu thuẫn. Nếu cần dữ liệu lặp để truy vấn, ràng buộc sự đồng nhất trong database hoặc điều kiện ghi nguyên tử. Không tạo khóa ngoại tới database EmDash khác: giữ ID người thực hiện ổn định và nhãn lịch sử tối thiểu.

## 3. Đơn vị một bản ghi và độ đầy đủ

Với P&L, `unallocated` là số tiền chưa gán phân khúc; các phân khúc có tên chia cùng một tổng. `all` dành cho cơ sở báo cáo không phân khúc hoặc tổng tính toán. Không lưu tổng P&L rồi cộng thêm các dòng phân khúc của chính tổng đó. Chuyển số giữa phân khúc là một thao tác nguyên tử.

Manifest đầu vào đã ghim quy định các tọa độ dòng × phân khúc × tháng hiệu lực được phép/bắt buộc. Mặc định mỗi dòng P&L chỉ bắt buộc `unallocated`; thao tác phân chia rõ ràng kích hoạt danh sách tọa độ của dòng/tháng đó. Không tạo tích Descartes của mọi dòng và mọi phân khúc. Sửa manifest phải theo chính sách khóa định nghĩa năm. Giới hạn v1 đề xuất: **200 tọa độ số liệu được ghi mỗi tháng**, tính mọi nhóm kể cả control, và **20 tài khoản tiền đang sử dụng**. Quan sát tiền tính riêng: tối đa 20 số dư cuối kỳ và 20 số dư đầu kỳ tại mốc bắt đầu. Kiểm tra giới hạn trong setup, ghi thủ công và xem trước CSV.

Phân biệt ba trường hợp:

- **Chưa có số:** không có bản ghi hoặc trường chưa hoàn tất; database và báo cáo không chuyển thành zero.
- **Đã nhập:** số nguyên, gồm cả zero được chủ động nhập.
- **Không áp dụng:** dòng được phép không áp dụng, số tiền null và lý do không rỗng.

Chỉ cho phép N/A theo quy tắc dòng đã ghim. Không dùng N/A với đầu vào đối chiếu cốt lõi, quan sát tài khoản bắt buộc hoặc số đầu kỳ để làm tháng có vẻ đầy đủ. Không phát sinh phải nhập zero. Lưu ghi chú văn bản có giới hạn cho N/A, số nhập âm và dòng thuộc nhóm Khác; tách giải thích khỏi tham chiếu nguồn.

Các trường tạo khóa nghiệp vụ, kể cả phân khúc, phải `NOT NULL`. SQLite coi các null là khác nhau trong ràng buộc unique; để phân khúc nullable có thể tạo nhiều bản ghi tổng trùng nhau. Ràng buộc số tiền phải phân biệt rõ trạng thái đã nhập/không áp dụng; chỉ có `CHECK` không đồng nghĩa `NOT NULL`. [Ràng buộc bảng SQLite](https://www.sqlite.org/lang_createtable.html)

Dòng tính toán không có số nhập ghi trực tiếp. Tổng, biên lợi nhuận, chênh lệch và tiền khả dụng được tính từ đầu vào. Danh mục seed là gợi ý trước sử dụng, không phải bằng chứng về tài khoản Lumi. Mã đã tham chiếu không được đổi ý nghĩa. Ngừng sử dụng thay vì xóa; ghim nhãn lịch sử. Tên hiển thị hiện tại có phiên bản riêng không được đổi báo cáo/export cũ.

Seed `Doanh thu khác`, `Chi phí trực tiếp khác`, `Chi phí vận hành khác` để nhập hoạt động mới phát sinh giữa năm vào đúng phần báo cáo, bắt buộc giải thích, dùng `unallocated` khi cần. Đây là cách tiếp nhận nghiệp vụ mới trong giới hạn v1, không cho phép tạo định nghĩa khi import hoặc âm thầm phân loại lại số cũ.

Tuổi nợ AR/AP dùng các nhóm loại trừ nhau và tổng đối chiếu nguồn. Các nhóm AR khớp **phải thu gộp**; khoản dự phòng riêng tính ra **phải thu thuần** dùng trong tài sản (`100 gộp − 10 dự phòng = 90 thuần`). Không cộng cả gộp lẫn thuần như hai tài sản. Tiền ứng trước nhà cung cấp là tài sản trả trước, không phải nhóm tuổi nợ AP âm. Số dư tiền khớp quan sát tài khoản. Thu/chi dự kiến trên Vốn lưu động hiển thị chính các số forecast dòng tiền dùng ở Dòng tiền, không ghi thêm lần thứ hai.

Các **đầu vào kiểm soát (control)** có kiểu nằm trong bảng số liệu hiện có, không tham gia cộng tổng P&L, dòng tiền bên ngoài hoặc số dư tài sản/nợ/vốn thông thường:

- `forecast.restricted_cash` là control số dư cuối tháng để tính tiền khả dụng/runway, không phải tài sản hoặc khoản chi bổ sung.
- `equity.opening` và control số dư đầu kỳ tại mốc bắt đầu là nguồn tại một thời điểm, không cộng như phát sinh hàng tháng.
- Góp/rút vốn bằng tiền tham chiếu một lần tới số dòng tiền tài trợ hiện có. `equity.noncash_contributions`, `equity.noncash_distributions`, `equity.other_movements` có chứng cứ bổ sung phần còn lại của đối chiếu vốn chủ sở hữu; không tạo dòng tiền. Không suy biến động vốn từ tổng dòng tiền tài trợ.

Mỗi control có vai trò tính, nguồn và quy tắc tổng hợp cố định. Đây vẫn là số liệu tổng hợp tháng, không có sổ hóa đơn hoặc sổ cái.

## 4. Phiên bản, chốt kỳ và điều chỉnh lịch sử

Công bố kế hoạch khóa số liệu, ghi chú đầu vào, giả định, định nghĩa, phiên bản nguồn và snapshot thiết lập báo cáo. Không ghi đè ngân sách gốc bằng forecast. Forecast/scenario được sao chép sang ID mới. Báo cáo ghim ID ngân sách/forecast/số thực tế, bối cảnh nguồn, phiên bản tính và mọi đầu vào ngoài số tiền ảnh hưởng kết quả, gồm ngưỡng tiền tối thiểu, giả định tiền hạn chế và thiết lập áp dụng. Lưu giá trị đã khóa hoặc phiên bản bất biến còn tra được; đọc thiết lập hiện tại không được đổi báo cáo cũ.

Một kỳ có thể đang nhập lần đầu, có một bản chốt có hiệu lực, hoặc có cả bản chốt cũ và bản nháp điều chỉnh. Xác định trạng thái thống nhất từ con trỏ và trạng thái revision. Chỉ lưu nếu con trỏ tới bản đang nhập và phiên bản kỳ vọng vẫn khớp.

Chốt đầy đủ cần các khối P&L, tiền, tuổi nợ và tình hình tài chính, mọi đầu vào bắt buộc đang áp dụng và mọi đối chiếu bắt buộc. Hoàn tất một phần không được mang trạng thái `closed`. Chốt khóa nháp, ghi sự kiện, chuyển con trỏ có hiệu lực và xóa con trỏ bản đang nhập một cách nguyên tử. Snapshot các tọa độ bắt buộc, phạm vi khối/phân khúc và nhãn, danh sách tài khoản tiền, ngày dữ liệu nguồn, chứng cứ/phạm vi từng khối, thiết lập/quy tắc tính/ngưỡng tiền tối thiểu. Sửa cấu hình sau này không được viết lại độ đầy đủ của quá khứ.

Mở lại cần lý do và tạo nháp mới từ bản đã chốt, không mở khóa bản cũ. Chốt lại chuyển con trỏ có hiệu lực và giữ snapshot trước. Bình luận sau chốt là chú thích audit chỉ thêm, ghim `baseline_id`, `actual_revision_id`, kỳ, dòng/chỉ số, phân khúc, cùng văn bản nguyên nhân/việc tiếp theo/nhận xét có giới hạn. Không sửa ghi chú đầu vào đã khóa; điều chỉnh số tài chính phải qua bản đang nhập mới.

Số dư tiền đầu kỳ tại thời điểm bắt đầu sử dụng cần chứng cứ. Đầu kỳ tiếp theo tham chiếu lần chốt trước đang có hiệu lực và giữ số tiền/ID nguồn đã dùng. Mỗi tài khoản tiền đang áp dụng cần quan sát cuối kỳ, kể cả zero. Bắt buộc `0 ≤ tiền hạn chế ≤ số đủ điều kiện là tiền`; tiền khả dụng được tính. Giữ số âm từ nguồn ngân hàng và phân loại khoản vay rõ ràng trước khi chốt. Thấu chi là khoản nợ riêng, không phải tiền âm âm thầm đưa vào runway.

Đối chiếu tổng tiền đầu kỳ cộng dòng tiền bên ngoài với tổng tiền cuối kỳ quan sát. Chuyển nội bộ giữa các tài khoản trong phạm vi tự triệt tiêu, không thành dòng thu/chi bên ngoài. Khi sửa tháng trước, các tháng sau đã chốt giữ nguồn đầu kỳ cũ và hiển thị trạng thái đối chiếu không còn cập nhật. Mở/chốt lại chuỗi bị ảnh hưởng một cách rõ ràng; không gắn nhãn đã đối chiếu hoặc tính runway từ chuỗi đó.

## 5. Tiền chính xác và ràng buộc database

Lưu tiền bằng số nguyên theo đơn vị nhỏ nhất. Nhận chuỗi thập phân chuẩn, áp dụng chính xác độ chính xác đã khóa và từ chối phần lẻ vượt mức; không nhân số dấu phẩy động để chuyển đầu vào. Dùng phép tính nguyên/hữu tỷ chính xác và quy tắc làm tròn được ghi rõ khi kết quả có phần lẻ của đơn vị nhỏ nhất.

D1 lưu số nguyên có dấu 64-bit, nhưng Workers API hiện không hỗ trợ bind `BigInt`; số JavaScript chỉ an toàn tới `9,007,199,254,740,991`. Kiểm tra giá trị lưu, trung gian, tổng và kết quả trả về trong phạm vi hỗ trợ. Đầu vào an toàn không bảo đảm tổng an toàn. Có thể tính chính xác bằng `BigInt` nội bộ; chỉ chuyển sau khi kiểm tra giới hạn, dùng chuỗi thập phân cho tiền tại ranh giới JSON. [Chuyển kiểu D1](https://developers.cloudflare.com/d1/worker-api/)

Không đổi sang SQLite `total()` để tránh overflow vì hàm này trả số dấu phẩy động. `sum()` với số nguyên có thể tràn 64-bit; kết quả cũng có thể vượt phạm vi JavaScript trước khi tới giới hạn SQLite. Cộng số nguyên chính xác trong ứng dụng hoặc trả tổng SQL dưới dạng text trước khi chuyển số, kiểm tra cả hai giới hạn. Kiểm tra kết quả JavaScript sau khi mất độ chính xác là quá muộn. [Hàm tổng SQLite](https://www.sqlite.org/lang_aggfunc.html)

Dùng bảng `STRICT` khi được hỗ trợ, cùng `CHECK`, `UNIQUE`, `NOT NULL`, khóa ngoại để kiểm tra trạng thái, kỳ, phiên bản không âm và nguồn hợp lệ. D1 thực thi khóa ngoại; hoãn kiểm tra chỉ có hiệu lực tới cuối giao dịch, không tắt tính toàn vẹn hoặc xóa dây chuyền. [Khóa ngoại D1](https://developers.cloudflare.com/d1/sql-api/foreign-keys/) · [Bảng STRICT](https://www.sqlite.org/stricttables.html)

## 6. Ghi nguyên tử và nhập CSV

Đơn vị nguyên tử gồm số liệu nghiệp vụ, phiên bản/con trỏ cha, audit và kết quả idempotency. Máy chủ xác định người thực hiện từ xác thực. Mỗi lần ghi kiểm tra phiên bản kỳ vọng, bản đang nhập/trạng thái draft, kỳ, sổ, bộ định nghĩa và loại dòng ngay trong cùng giao dịch.

Chia kế hoạch cả năm hoặc sao chép có thể tạo nháp theo các phần có giới hạn. Công bố là một lần chuyển trạng thái nguyên tử, kiểm tra phiên bản và chỉ thực hiện sau khi toàn bộ kế hoạch hợp lệ. Không để người xem nhầm bản nháp chưa nhập đủ với kế hoạch đã công bố.

D1 `batch()` rollback cả chuỗi khi một câu lệnh thất bại. Tuy nhiên, `UPDATE ... WHERE version = expected` không khớp dòng nào vẫn là SQL thành công; câu ghi audit hoặc bảng khác sau đó vẫn có thể commit. Kiểm tra `meta.changes` sau batch không hoàn tác được commit. Cần điều kiện SQL đã được kiểm thử, gây lỗi ràng buộc khi tiền điều kiện sai, hoặc thiết kế tương đương buộc mọi lần ghi phụ thuộc vào thay đổi thành công. Thử nghiệm kỹ thuật trước triển khai phải chứng minh hành vi này. [Batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) · [UPDATE không khớp dòng](https://www.sqlite.org/lang_update.html)

Kiểm tra xác thực hiện tại, quyền Super Admin và readiness **trước** khi tra/trả kết quả yêu cầu lặp. Sau đó, khóa idempotency theo người/sổ/hành động/đích trả kết quả cũ khi nội dung chuẩn khớp; khác nội dung là xung đột. Xử lý replay trước điều kiện trạng thái/phiên bản của thao tác mới, để người còn quyền vẫn lấy biên nhận lần lưu đã commit sau khi tháng được chốt. Hash gồm phiên bản kỳ vọng, số chuẩn hóa, ghi chú và bối cảnh nguồn. Giữ ID import/dấu vân tay nội dung-đích để phát hiện nhập lại bằng khóa mới. Ghi thay số phải qua xem trước, không tự đoán phép cộng.

CSV là cách nhập thay thế có giới hạn; quan sát tài khoản tiền vẫn nhập thủ công. Các cột: `period,line_code,segment_code,value_state,amount,currency,evidence_ref,note`. `value_state` khi import chỉ nhận `entered` hoặc `not_applicable`; entered với số 0 là zero được xác nhận. Ghi chú bắt buộc theo mục 3. Form xem trước cung cấp `source_as_of` và phạm vi báo cáo/chứng cứ từng khối cho mỗi tháng/khối liên quan; lưu cùng bản xem trước chuẩn hóa và revision được commit. Đích do máy chủ xác định mới có hiệu lực. Từ chối mã lạ, định nghĩa không tương thích, trộn tiền tệ, tọa độ trùng, N/A không được phép và dòng tính toán.

Giới hạn file đề xuất: 256 KiB UTF-8, 2.400 dòng/file, 200 dòng/tháng và 12 tháng trong một năm tài chính. Bản xem trước ghim số liệu chuẩn, hash, `manifest.version` và phiên bản đích kỳ vọng. Mỗi xác nhận commit áp dụng nguyên tử cho một tháng. Xung đột cần xem trước lại; tháng đã commit vẫn giữ kết quả và hiển thị riêng. Không tuyên bố nguyên tử cho nhiều lần commit tháng.

Import kế hoạch nhiều tháng dùng chung `plan.version`. Khi một tháng của chính manifest đó commit thành công, cùng giao dịch ghi biên nhận, tăng phiên bản kế hoạch/manifest và cập nhật phiên bản kế hoạch kỳ vọng của các tháng chờ **chỉ qua commit trước đó đã biết của manifest này**. Chỉ cập nhật điều kiện phiên bản; số, ghi chú, bối cảnh nguồn đã xem và hash nội dung giữ nguyên. Sửa bên ngoài, manifest khác hoặc thay đổi phiên bản không giải thích được đều cần xem trước lại; không tự thay phiên bản cũ bằng phiên bản mới nhất. Đích số thực tế từng tháng giữ phiên bản revision/kỳ độc lập. Các commit đồng thời cũng kiểm tra `manifest.version`, không được tăng hai lần.

Ô không xuất hiện trong file giữ nguyên. Hành động xóa số riêng chỉ đổi giá trị nháp đang nhập thành chưa có số, kèm audit trước/sau; không xóa nguồn lịch sử hoặc số đã chốt. Hủy/hết hạn chỉ tác động payload xem trước chưa commit. Giữ biên nhận tháng đã commit, dấu vân tay nội dung-đích, tham chiếu nguồn và liên kết thao tác/audit dù hủy các tháng còn lại. Đây không phải dữ liệu nháp mồ côi để dọn bỏ.

Kiểm chứng các mức này trong thử nghiệm kỹ thuật. D1 hiện cho tối đa 100 tham số bind/câu lệnh, áp dụng giới hạn lên từng câu trong batch; giới hạn truy vấn mỗi invocation vẫn có hiệu lực. Chia câu lệnh không được âm thầm chia giao dịch của một tháng. [Giới hạn D1](https://developers.cloudflare.com/d1/platform/limits/)

## 7. Đọc, chỉ mục và khôi phục

V1 đọc Finance từ primary. Nếu bổ sung read replication, dùng session/bookmark để đọc thấy kết quả vừa ghi và dùng dữ liệu primary cho quyết định chốt/mở lại. Session D1 bảo đảm sequential consistency, không phải giao dịch kéo dài qua nhiều request trình duyệt. Tạo báo cáo trong một đơn vị đọc nhất quán, ghim nguồn; không ghép tổng từ các snapshot đang thay đổi độc lập. [Session D1](https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession)

Đánh chỉ mục revision theo kỳ/trạng thái; số liệu theo revision cha và dòng/phân khúc; kế hoạch theo phiên bản/kỳ; quan sát theo revision/tài khoản; audit theo đích/thời gian; import theo trạng thái/ngày tạo. Khóa unique hỗ trợ chống ghi đè và trùng. Phân trang lịch sử/audit, giới hạn khoảng báo cáo. Ngừng sử dụng định nghĩa/tài khoản/kế hoạch đã tham chiếu; cấm xóa dây chuyền số đã chốt, audit hoặc ngân sách gốc published.

Khôi phục database và thời hạn giữ hồ sơ là hai việc riêng. Time Travel D1 hỗ trợ 30 ngày ở Paid hoặc 7 ngày ở Free; restore ghi đè database tại chỗ, gồm các module khác dùng chung binding. Đây không phải lưu trữ tài chính dài hạn. Xác định thời hạn theo loại hồ sơ, mục đích và nghĩa vụ được duyệt, gồm audit/export; không tự đặt thời hạn pháp luật. Backup/export dài hạn cần đích riêng được bảo vệ, chính sách truy cập và diễn tập khôi phục. [Time Travel D1](https://developers.cloudflare.com/d1/reference/time-travel/) · [Giới hạn D1](https://developers.cloudflare.com/d1/platform/limits/)

Trước rollout: kiểm tra binding và migration mới nhất; chỉ thêm bảng/chỉ mục; xác minh khóa ngoại; chỉ seed cấu hình; kiểm chứng xung đột/chốt/import/overflow/khôi phục bằng dữ liệu giả lập; ghi restore point và diễn tập trên database cô lập. Công việc tài liệu này không cho phép chạy migration hoặc restore production. Không đưa số liệu/audit Finance vào dữ liệu public, ví dụ trong repository hoặc luồng thông báo CRM.

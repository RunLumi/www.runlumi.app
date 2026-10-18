# Finance — triển khai và nghiệm thu

[English](DELIVERY.md) · [Mục lục](README.vi.md) · **ĐỀ XUẤT — chưa có runtime** · 2026-10-18

## 1. Truy vết yêu cầu

Các mã dưới đây là yêu cầu nghiệm thu ổn định. Quy tắc tính dùng mã `FIN-Rxx` trong [Quy tắc tài chính](FINANCIAL-RULES.vi.md); bằng chứng triển khai ghi tại [Trạng thái](STATUS.md). Có tài liệu hoặc build ứng dụng thành công không chứng minh kiểm thử Finance runtime đã đạt.

| Mã | Hành vi cần có | Đặc tả quyết định | Bằng chứng cần thu khi triển khai |
|---|---|---|---|
| FIN-01 | Chỉ System Super Admin đang hoạt động được đọc/ghi Finance | Kiến trúc §§3–5 | Kiểm thử từ chối từng role và kết hợp role; hai ngôn ngữ; API/export/audit trực tiếp |
| FIN-02 | Một danh tính, Workspace shell dùng chung, ẩn menu không có quyền | Kiến trúc §§1–4 | Phiên EmDash, quay lại đúng trang sau đăng nhập, không query/serialize số cho người không có quyền |
| FIN-03 | D1 lưu số, cấu hình, phiên bản và audit | Mô hình dữ liệu | Migration D1 local, còn số sau reload/restart, FK/unique và lưu trữ danh mục |
| FIN-04 | Đủ trang quan trọng ở EN/VI | Sản phẩm §2 | Đủ 11 route dùng loader thật, bộ lọc đúng và trạng thái trống/lỗi |
| FIN-05 | Kế hoạch 12 tháng và chia ngân sách năm chính xác | Sản phẩm §3B; FIN-R06 | Năm không bắt đầu tháng 1, copy/preview, phần dư làm tròn, kế hoạch gốc bất biến |
| FIN-06 | Nhập thực tế tháng phân biệt thiếu/0/N/A | Sản phẩm §3C; FIN-R02–03 | Lưu/đọc lại từng trạng thái; không tổng đầy đủ giả; xác nhận việc điền 0 |
| FIN-07 | Đối chiếu tháng/quý/YTD đúng | FIN-R03, FIN-R08 | Cùng tập kỳ; mục tiêu 0/âm; biên lợi nhuận; loại tháng nháp khỏi mặc định |
| FIN-08 | Tách ghi nhận doanh thu/chi phí và tiền | FIN-R01, FIN-R04, FIN-R09 | Ví dụ trả trước, vay, capex, lương và chuyển tiền nội bộ |
| FIN-09 | Tiền, tuổi nợ, số dư và nối kỳ đối soát được | FIN-R09–12 | Không lệch đơn vị tiền lưu nào chưa giải thích; thiếu bằng chứng không chốt |
| FIN-10 | Ngân sách công bố/thực tế đã chốt bất biến | FIN-R06, FIN-R13; Mô hình dữ liệu | Chặn ghi trực tiếp, giữ bản cũ, điều chỉnh có người/lý do |
| FIN-11 | Forecast/scenario tách khỏi baseline | Sản phẩm §3D; FIN-R07, FIN-R10 | Ghim cutoff/revision thực tế, không tự fallback ngân sách, phát hiện forecast cũ |
| FIN-12 | Doanh thu/chi phí dùng chung số; hiện chi phí chung | FIN-R05 | Không đếm hai lần hoặc sửa tổng; bảo toàn tổng phân bổ |
| FIN-13 | Import có giới hạn, preview và idempotency | Kiến trúc §§5–6; Mô hình dữ liệu | Chặn CSV trùng/sai phạm vi/xung đột; nguyên tử từng tháng; biên nhận retry |
| FIN-14 | Tiền chính xác, kỳ chuẩn, định nghĩa có phiên bản | FIN-R02, FIN-R06; Mô hình dữ liệu | Precision, overflow, locale, ranh giới năm; không phân loại lại lịch sử |
| FIN-15 | Mọi thay đổi có người/lý do/lịch sử bền vững | Kiến trúc §§3,6; Mô hình dữ liệu | Audit/write/idempotency cùng commit hoặc rollback; không xóa lịch sử |
| FIN-16 | Xuất riêng tư, tái lập được và cache đúng | Kiến trúc §§4–5; Sản phẩm §4 | Đúng số theo revision; text CSV không chạy công thức; mọi phản hồi no-store |
| FIN-17 | Độc lập với CRM/HRM và người xem rộng hơn | Kiến trúc §7 | Không lộ qua CRM token/MCP/Lark; không vượt gate HRM; giữ kiểm thử quyền cũ |
| FIN-18 | Dùng được và vận hành được | Sản phẩm §5; tài liệu này | Bàn phím/mobile/locale, query có giới hạn, diễn tập backup/restore |

## 2. Các giai đoạn

| Giai đoạn | Sản phẩm bàn giao | Điều kiện kết thúc |
|---|---|---|
| F0 — công việc lần này | Yêu cầu song ngữ, hiện trạng mã nguồn, mô hình dữ liệu/API đề xuất và tiêu chí nghiệm thu | Tài liệu nhất quán; link đúng; rà soát độc lập xong; có PR tài liệu; không đổi ứng dụng |
| F1 — quy trình tháng có phân quyền | Mô hình D1 additive, quyền Finance không grantable, setup được bảo vệ, form kế hoạch/thực tế, kiểm tra P&L/tiền/số dư, đóng băng kế hoạch, chốt một tháng và CSV tối thiểu tái lập được | Đi hết một sổ/năm/tháng giả lập, còn số sau reload; FIN-01/02/03/06/08/09/10/14/15/16/17 đạt trong phạm vi này; tính năng mặc định tắt |
| F2 — hoàn chỉnh v1 | Đủ 11 trang, công cụ lập kế hoạch chính xác, chênh lệch, doanh thu/chi phí, tuổi nợ/số dư, forecast/scenario, CSV preview/commit, xuất và lọc audit | FIN-01–18 đạt tại cùng revision ứng viên; không trang placeholder/số giả; EN/VI ngang nhau |
| F3 — sẵn sàng production | Xác nhận cấu hình/chính sách báo cáo, số đầu kỳ được phép dùng, runbook/khôi phục, diễn tập migration, quyền và build | Owner chấp thuận phạm vi phát hành/kích hoạt cụ thể; đủ gate; có người theo dõi và khôi phục |
| Sau v1 — phạm vi riêng | Adapter CRM/HRM được rà, đối chiếu từng giao dịch, dự báo tiền theo tuần, FX/hợp nhất hoặc tích hợp kế toán | Có nhu cầu thực và ánh xạ nguồn đáng tin cho từng phần; giữ các ranh giới hiện tại |

Không gọi F1 là đã xong Finance. Cũng không để quy trình tháng có ích phụ thuộc vào tích hợp chưa được yêu cầu. PR triển khai phải nêu đúng giai đoạn, mã yêu cầu đã đạt và bằng chứng còn thiếu.

## 3. Ma trận nghiệm thu các tình huống dễ sai

Dùng dữ liệu giả lập trên Worker/D1 local cùng phiên EmDash kiểm thử thật. Không lấy số tài chính, hồ sơ ứng viên, nhân viên hoặc khách hàng production để trình diễn tính đúng.

| Tình huống | Kết quả phải có |
|---|---|
| Chưa đăng nhập/hết phiên/tài khoản vô hiệu; Super Admin hạ quyền nhưng còn hoạt động | Nhóm đầu nhận trang login hoặc API 401; tài khoản còn hoạt động nhưng mất quyền nhận 403; không trả số và tab mở sẵn không ghi được |
| CRM Finance, Sales Manager, HRM Admin, Payroll Officer, toàn bộ role grantable cộng lại | Chặn trang/API/export/audit; không menu, query Overview hoặc số bị cache |
| CRM bearer token/MCP của chính Super Admin | Không xác thực được request Finance |
| Giả book/period/revision, field lạ, Origin chéo/opaque | Từ chối hoặc lỗi validation trước mutation; không redirect không an toàn |
| Hai tab lưu cùng version | Một thành công, một conflict; không mất cập nhật hoặc audit mồ côi |
| Lưu đồng thời với chốt/mở lại | Guard trạng thái/version trong transaction quyết định; không ghi vào bản bất biến |
| UPDATE có điều kiện trúng 0 dòng | Toàn transaction domain/audit/idempotency liên quan thất bại, không commit các câu lệnh khác |
| Mất kết nối sau commit rồi retry | Kiểm tra quyền/trạng thái hiện tại trước; cùng key/payload trả biên nhận cũ kể cả tháng đã chốt sau đó; người mất quyền không replay được; payload khác bị conflict |
| SQL lỗi ở giữa import | Không dòng nào của tháng đó thành số chính thức; tháng trước đã thành công vẫn có trong manifest |
| Import tháng 1 và 2 vào cùng kế hoạch năm | Tháng 1 cập nhật version cha/manifest cho phần preview còn lại của chính import; tháng 2 chạy được nếu không có sửa ngoài; sửa ngoài bắt xem trước lại |
| Commit tháng 1 rồi bỏ tháng 2 còn chờ | Giữ biên nhận, fingerprint, operation và nguồn của tháng 1; chỉ bỏ staging tháng 2 chưa ghi |
| Dòng Khác, điều chỉnh âm và N/A được phép | Lưu giải thích qua preview/lưu/reload/xuất; thiếu ghi chú hoặc N/A không được phép thì từ chối tháng |
| Import chứa mã/tiền tệ/định nghĩa mới hoặc dòng trùng | Từ chối; không tự tạo định nghĩa hoặc đổi tiền tệ |
| Thiếu chi phí tháng 2; tháng hiện tại/tương lai | Tháng 2 chưa đủ tổng. Ngày 18/10 theo múi giờ sổ: được nháp tháng 10, chặn thực tế tháng 11, chưa chốt tháng 10 tới sau cuối tháng |
| Bắt đầu sổ giữa năm hoặc thiếu tháng trong năm | YTD không bắt đầu lại sau khoảng thiếu; so một phần ghi rõ kỳ; không lấp thực tế quá khứ bằng ngân sách; tiền đã đối soát từ cutover vẫn làm gốc forecast |
| Hai phân khúc doanh thu nhưng lương chung chỉ ở Chưa phân bổ | Tọa độ bắt buộc theo bản đồ áp dụng đã ghim, không mọi tổ hợp; không bắt điền 0 giả hoặc đếm lương hai lần |
| Thiếu baseline, baseline 0, mục tiêu lợi nhuận âm | Đúng nhãn Không so sánh/Ngoài ngân sách/cải thiện; không chia 0 hoặc tỷ lệ đạt gây hiểu nhầm |
| Mua tài sản, vay, khách trả trước cả năm | Tiền và P&L phân loại riêng; tính đúng ví dụ FIN-R09 và bảng fixture |
| Tiền/tuổi nợ/vốn lệch 1 đơn vị lưu | Chặn chốt; không tự điền số cân bằng hoặc dung sai ngầm |
| Phải thu gross 100, dự phòng 10, phải thu net 90 | Tuổi nợ đối chiếu gross 100; tài sản tính net 90; ứng trước nhà cung cấp là tài sản trả trước, không nằm âm trong nhóm phải trả |
| Dự kiến thu 100 cùng hiện ở Vốn lưu động và Dòng tiền | Hai trang tham chiếu một số forecast; tiền thu hoạt động là 100, không thành 200 |
| Tiền đầu kỳ 5, chi hoạt động 15, ngân hàng còn −10 | Khoản vay rút 10 được ghi rõ để tiền đủ điều kiện về 0 và nợ thành 10; không kẹp số, thiếu nguồn vay hoặc đếm vay hai lần |
| Điều chỉnh một tháng đã chốt trước đó | Bản cũ/bản xuất không đổi; phần phụ thuộc hiện cảnh báo tới khi đối soát; forecast cũ có nhãn |
| Năm tài chính qua tháng 12, tháng 2 nhuận, đổi locale | Giữ period key và số; thứ tự tháng tài chính đúng |
| Giới hạn integer; nhiều số riêng lẻ an toàn nhưng tổng tràn | Từ chối hoặc tính chính xác có kiểm tra; không mất precision âm thầm |
| Danh mục đóng băng, dòng archive, hoạt động mới ngoài dự kiến | Lịch sử không đổi; dùng Khác/Chưa phân bổ có giải thích; CSV không phân loại lại |
| Sửa subtotal; tổng năm số dư; tổng năm tỷ suất | Không sửa tổng; số dư lấy cuối kỳ; tỷ suất tính từ thành phần |
| Ghi chú giống công thức trong CSV; phản hồi thành công/lỗi/redirect | Text được vô hiệu công thức, giữ số tài chính gốc; mọi nhánh private/no-store |
| Đổi mức tiền tối thiểu hoặc ngừng tài khoản sau khi xuất | Tái lập báo cáo bằng cấu hình, danh sách tài khoản, revision và kết luận cũ; chính sách mới của góc nhìn hiện tại có nhãn riêng |
| HRM tắt; sinh event Finance | Nhập tay Finance vẫn hoạt động; không vượt gate HRM; không số Finance trong Lark/CRM/MCP/thông báo HRM |
| DB mới hoặc D1 không truy cập được | Setup trống hoặc lỗi an toàn; không doanh thu mẫu, thành công giả hoặc fallback công khai |

Số dư ngân hàng âm phải theo phân loại tiền/khoản vay trong Quy tắc tài chính; không được bỏ qua âm thầm. Ngân sách có định nghĩa không tương thích không được tự ghép để so sánh. Kiểm thử các lỗi nghiệp vụ này cùng với phép tính thông thường.

## 4. Ngưỡng chất lượng và sử dụng

**Gate tính đúng:** không đọc/ghi trái phép trong ma trận quyền; không chênh lệch đối soát chưa giải thích khi chốt; không mất cập nhật hoặc import hai lần; mọi tổng bằng nguồn giả lập ở độ chính xác lưu. Xuất lại cùng revision được ghim phải ra cùng giá trị và định nghĩa.

**Mục tiêu sử dụng đề xuất:** với 50 số đầu vào tháng đã chuẩn bị, Super Admin có thể nhập/import, thấy lỗi, đối chiếu kế hoạch và chốt tháng sạch trong 15 phút sau setup. Đo trong diễn tập; đây là mục tiêu sản phẩm, chưa phải lợi ích đã quan sát. Nếu phải dựng lại nguồn số hàng giờ, đo riêng phần đó, không nói app đã giải quyết.

Kiểm tra mobile 320–430px, desktop 1280px và màn hình rộng, hai ngôn ngữ, bàn phím/focus, phóng to chữ, reduced motion, trạng thái trống/thiếu/lỗi và cuộn lưới trong khung. Trạng thái không phụ thuộc riêng màu. Không JavaScript vẫn có form lưu/chốt thiết yếu; tương tác grid nâng cao có đường dự phòng.

Đo thao tác ghi/xuất tháng điển hình và tối đa được hỗ trợ trên môi trường ghi rõ. PR triển khai ghi query count, rows read/written, giới hạn statement/binding và thời gian phản hồi. Chọn index theo query thật. Không khẳng định SLA từ mục tiêu chưa đo hoặc mở rộng kiểm thử khi không còn rủi ro cụ thể cần giải quyết.

## 5. Phát hành và khôi phục

Quy tắc phát hành nằm tại [AGENTS.md](../../AGENTS.md), [script release](../../scripts/release.mjs) và [runbook CRM](../crm/RUNBOOK.md). Main tự phát hành production. Build cho PR tài liệu không cấp quyền triển khai/kích hoạt Finance.

Trước một lần phát hành runtime sau này:

1. Đọc lại main mới nhất, chọn số migration tiếp theo, giữ nguyên bảng/grant hiện có. Không đặt trước số migration trong đặc tả này.
2. Chạy migration additive trên DB rỗng và DB schema trước đó với số giả. Kiểm tra constraint Finance và quyền/số ATS/CRM/HRM không đổi.
3. Chạy `npm run ci:verify` theo repo và các ca tích hợp Worker/D1 Finance đúng phạm vi. Ghi commit, môi trường, kết quả; phân biệt setup lỗi với hành vi sản phẩm sai.
4. Giữ menu/tính năng mặc định tắt tới khi có triển khai và setup đúng. Setup được bảo vệ vẫn phải dùng được theo Kiến trúc; HRM tắt không phải lý do vượt gate.
5. Diễn tập khôi phục, xác nhận người chịu trách nhiệm backup, chính sách lưu/xử lý và mục tiêu restore. Khôi phục D1 khác lưu lịch sử nghiệp vụ.
6. Đưa bản phát hành cụ thể qua quy trình phê duyệt vốn áp dụng, sau kích hoạt kiểm tra deployment/build thực và quyền riêng tư. Không báo thành công chỉ vì PR đã merge.

`DB` dùng chung nên Time Travel toàn DB có thể lùi cả ATS/CRM/HRM. Khi Finance lỗi, trước tiên tắt truy cập/ghi Finance và rollback mã ứng dụng tương thích. Ưu tiên bản sửa tiến đã rà; không restore toàn DB như thể chỉ tác động Finance. Giữ revision vô hiệu và nguồn gốc, không xóa bằng chứng. Restore và nhập số thật cần đúng phạm vi được cho phép.

## 6. Điều kiện dừng và tiếp tục

Dừng kích hoạt production khi có lộ quyền, đối soát chưa giải thích, phép tính tiền không an toàn, trộn revision, diễn tập khôi phục thất bại, thiếu chính sách báo cáo hoặc lỗi nghiêm trọng chưa giải quyết. Tiếp tục phần tài liệu/công việc độc lập và chỉ rõ gate nào thất bại.

Chỉ làm tích hợp tiếp theo khi vòng tháng đã đáng tin và người dùng chứng minh công việc nào adapter có thể giảm. Nếu một tháng nguồn đã chuẩn bị vẫn không cân, hành động tiếp theo là tìm dòng thiếu/sai phân loại, không thêm biểu đồ. V1 thành công khi Super Admin đi hết quy trình tháng thật và giải thích được kết quả từ bằng chứng.

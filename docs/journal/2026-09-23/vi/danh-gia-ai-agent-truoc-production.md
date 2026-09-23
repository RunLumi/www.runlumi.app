## Thử đúng công việc agent sẽ làm

Một bản demo mượt có thể che ba lỗi: agent chọn sai công cụ, dùng đúng công cụ trên sai hồ sơ, hoặc dừng sau khi thử thực hiện một hành động mà không kiểm tra kết quả. Đánh giá trước khi đưa vào vận hành phải bao trùm cả quy trình: đầu vào, quyền truy cập, lần gọi công cụ, điểm bàn giao cho người, kết quả trên hệ thống ngoài và khả năng khôi phục. Câu trả lời của mô hình chỉ là một mắt xích.

Hướng dẫn [đánh giá agent của OpenAI](https://developers.openai.com/api/docs/guides/agent-evals) đề xuất xem dấu vết gồm lời gọi mô hình, công cụ, chốt kiểm soát và lần bàn giao, rồi dùng các trường hợp lặp lại để tìm lỗi hồi quy. Tài liệu [thực hành đánh giá](https://developers.openai.com/api/docs/guides/evaluation-best-practices) của họ cũng cho rằng quyết định tách nhiều agent cần dựa trên kết quả đo được. Đây là phương pháp kỹ thuật hữu ích, nhưng một dấu vết trên nền tảng chưa tự chứng minh bản ghi kinh doanh sau lượt chạy đã đúng.

## Một bộ trường hợp nhỏ nhưng khó

Hãy bắt đầu từ việc đội ngũ đã làm hằng ngày. Với ví dụ minh họa là đối soát hóa đơn nhà cung cấp, bộ thử cần có: hóa đơn khớp hoàn toàn; lệch số tiền; trùng mã tham chiếu; nhà cung cấp đổi tài khoản ngân hàng; hệ thống nguồn không đáp ứng; và một hóa đơn chứa câu lệnh dụ agent bỏ qua bước duyệt. Dùng dữ liệu đã loại thông tin riêng hoặc dữ liệu giả lập cho bộ thử, và ghi rõ tính chất ấy. Mỗi trường hợp cần kết quả mong đợi được người phụ trách duyệt, kể cả lý do phải dừng.

Chạy từng trường hợp từ đầu đến cuối bằng công cụ và chính sách quyền dự định dùng thật. Kiểm tra agent có mở đúng bản ghi, nhận ra ngoại lệ, không đụng tới quyền đổi tài khoản ngân hàng và để lại nhật ký mà kế toán có thể dùng hay không. Đừng chỉ chấm câu kết luận. [Hướng dẫn OWASP cho ứng dụng agent năm 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) nêu nguy cơ dùng sai công cụ và chỉ dẫn đối kháng; bộ thử nên chạm tới các ranh giới ấy bằng trường hợp thực tế nhưng không tạo tác động nguy hiểm.

Giữ phiên bản của bộ thử. Sửa prompt, đổi mô hình hay cập nhật kết nối đều tạo ra một ứng viên mới, phải chạy lại trên cả những lỗi cũ. Khi vận hành phát hiện trường hợp suýt sai, bỏ dữ liệu riêng rồi bổ sung vào bộ thử. Nhờ đó đội ngũ biết vì sao hệ thống tốt hơn, thay vì chỉ nhớ bản demo mới “có vẻ ổn”.

## Chấm đúng nơi sai lầm gây thiệt hại

Tỷ lệ hoàn thành quan trọng nhưng chưa đủ. Cần theo dõi chất lượng bằng chứng, lần duyệt sai, ngoại lệ bị bỏ qua, lời gọi công cụ vượt quyền, khôi phục sau khi hết thời gian chờ, thời gian người kiểm tra và tổng chi phí cho một việc hoàn tất. Tách bản nháp sai khỏi hành động ghi sai lên hệ thống ngoài. Bản nháp có thể sửa; khoản thanh toán hay tin nhắn gửi khách hàng có thể khó thu hồi.

Với ví dụ hóa đơn, một cửa kiểm thử có thể là không có lần ghi vượt quyền trong bộ trường hợp đã rà soát, mọi trường hợp dừng đều có lý do rõ, và tổng thời gian của nhân viên trên trường hợp đơn giản giảm sau khi tính cả bước duyệt. Đó là ngưỡng minh họa cho một quy trình, không phải chuẩn chung của ngành. Người chịu hậu quả nên chốt ngưỡng trước khi xem kết quả mô hình; mọi thay đổi sau đó cần có lý do lưu lại.

[Phân tích của Anthropic](https://www.anthropic.com/research/trustworthy-agents) nhấn mạnh hành vi agent phụ thuộc vào bộ quy tắc, công cụ và môi trường bên cạnh mô hình. Vì vậy, thử bằng công cụ giả an toàn chưa đại diện hết cho kết nối thật. Trước khi mở thêm quyền, cần chạy thử có kiểm soát với ranh giới quyền và cách khôi phục đã định. Bài về [agent có giới hạn](/vi/blog/agent-ai-co-gioi-han) bàn ranh giới ấy; bài về [hạ tầng chạy agent](/vi/blog/agent-ai-chay-dai-va-ha-tang) bàn việc dở dang và thử lại.

## Bộ thử không thể nhìn thấy mọi tình huống

Không có tập trường hợp hữu hạn nào chứng minh một agent mở hoàn toàn là an toàn. Nó có thể bỏ sót mẫu hóa đơn mới, tổ hợp quyền ít gặp hoặc câu lệnh độc hại trong một trường tài liệu khác. Phản biện mạnh nhất với điểm số đẹp là chính đội ngũ xây hệ thống cũng chọn câu hỏi kiểm tra. Sai lệch chọn mẫu có thể khiến kết quả trông tốt hơn thực tế.

Hãy dùng đánh giá làm cửa cho một nhiệm vụ có phạm vi, rồi tiếp tục theo dõi công việc thật. Người rà soát cần báo được nguồn sai, nhật ký khó hiểu hay lần suýt gây lỗi. Khi tín hiệu đó xuất hiện, thu hẹp phạm vi và thêm trường hợp kiểm tra. Trước khi đưa vào vận hành, câu hỏi thực sự là đội ngũ có giải thích được agent được làm gì, phát hiện khi nó sai và khôi phục mà không bắt khách hàng gánh cuộc thử nghiệm hay không.

## Nguồn

- [OpenAI: Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)
- [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [OWASP: Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [Anthropic: Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents)

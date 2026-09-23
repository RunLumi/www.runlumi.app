## Công việc thất lạc ở khoảng giữa

Một doanh nghiệp có thể dùng phần mềm kế toán ổn định, quản lý khách hàng cẩn thận và lưu tài liệu khá đầy đủ, nhưng sáng thứ Hai vẫn phải hỏi lại chuyện gì đã xảy ra tuần trước. Con số nằm một nơi; ngoại lệ giải thích nó nằm nơi khác; người có quyền xử lý lại chưa thấy cả hai. Trong bài này, “lớp vận hành AI” chỉ một cách thiết kế để nối ngữ cảnh doanh nghiệp, bằng chứng có thể kiểm tra và công việc có ranh giới. Đây là mô tả một kiến trúc cần được chứng minh, không phải lời khẳng định rằng một dòng sản phẩm đã giải quyết xong vấn đề.

Một chatbot có thể trả lời dựa trên bảng tính được dán vào cửa sổ trò chuyện. Một lớp vận hành hữu ích phải biết bảng nào là nguồn chính, ai được xem từng dòng dữ liệu, dữ liệu cập nhật lúc nào và câu trả lời có thể dẫn tới hành động gì. Tài liệu [Agents của OpenAI](https://developers.openai.com/api/docs/guides/agents) phân biệt phản hồi của mô hình với hạ tầng quản lý công cụ, trạng thái và công việc dài hơn một lượt hỏi đáp. [Phân tích về agent đáng tin cậy của Anthropic](https://www.anthropic.com/research/trustworthy-agents) cũng xem mô hình, bộ quy tắc vận hành, công cụ và môi trường là các nguồn rủi ro khác nhau. Đó là mô tả về hệ thống agent, chưa phải bằng chứng rằng một sản phẩm cụ thể vận hành tốt trong doanh nghiệp.

## Một lần bàn giao có thể kiểm tra

Hãy lấy một tình huống minh họa: trưởng bộ phận tài chính thấy biên lợi nhuận giảm dù số đơn tăng. Đầu vào gồm đơn hàng đã duyệt, chiết khấu, hàng trả lại, bảng giá vốn và định nghĩa biên lợi nhuận mà bộ phận tài chính đang dùng. Trợ lý có thể gom các bản ghi được phép truy cập, so hai kỳ tương đương, chỉ ra thành phần biến động và soạn một lời giải thích ngắn. Nó phải dẫn tới các dòng dữ liệu gốc và đánh dấu phần giá vốn còn thiếu. Người phụ trách tài chính quyết định có thay đổi giá hay không; trợ lý không tự sửa giá.

Ranh giới của ví dụ này cố ý hẹp. Hệ thống chỉ đọc năm nguồn đã nêu; nó được soạn phân tích, nhưng không được sửa bảng giá vốn hay gửi thông báo cho khách hàng. Một lần chạy đạt yêu cầu tạo ra phép so sánh có thể làm lại và danh sách ngoại lệ. Khi khái niệm biên lợi nhuận chưa thống nhất hoặc dữ liệu chưa đủ, nó dừng lại. Câu trả lời trôi chảy nhưng không tìm được giả định phía sau sẽ không giúp người chịu trách nhiệm ra quyết định.

Bài về [BI có bằng chứng](/vi/blog/tri-tue-kinh-doanh-co-bang-chung) đi sâu vào đường đi từ chỉ số tới bản ghi. Bài về [agent có giới hạn](/vi/blog/agent-ai-co-gioi-han) bàn về quyền hành động. Có thể bắt đầu theo thứ tự: chốt nghĩa của chỉ số, truy nguồn dữ liệu, xác định ai chịu trách nhiệm, rồi mới tự động hóa phần lặp lại.

## Tính liên tục đáng được quan tâm

Hạ tầng agent đang thay đổi. OpenAI mô tả [phiên làm việc giữ cuộc hội thoại và kết quả đã lưu qua nhiều lượt](https://developers.openai.com/api/docs/guides/agents-api/sessions). Báo cáo [Economic Index tháng 6/2026 của Anthropic](https://www.anthropic.com/research/economic-index-june-2026-report) cho biết các phiên Claude ngày càng có nhiều công việc agent kéo dài, khiến họ phải điều chỉnh cách nghiên cứu dữ liệu sử dụng. Đây là quan sát trên sản phẩm và mẫu dữ liệu của Anthropic, không phải số đo mức độ ứng dụng AI ở mọi doanh nghiệp. Nó vẫn cho thấy lý do những bước bàn giao giữa chừng cần được thiết kế rõ.

Với doanh nghiệp, tính liên tục nghĩa là công việc có thể bị ngắt mà không mất người phụ trách, nguồn dữ liệu hay điểm cần phê duyệt. Nhật ký phải phân biệt việc dự định làm, đã thử làm, đã hoàn tất và đã kiểm chứng. Nếu một API báo hết thời gian chờ, chạy lại không thể mặc nhiên tạo thêm một khoản thanh toán. Lớp vận hành chỉ đáng tồn tại khi con người hiểu và khôi phục được công việc.

## Phản biện mạnh nhất

Thêm một lớp có thể thành thêm một hệ thống phải quản trị. Nó dễ sao chép dữ liệu, tạo bộ thuật ngữ không ai dùng hoặc làm quyền truy cập khó kiểm toán hơn. Nếu đội ngũ đã trả lời một câu hỏi lặp lại nhanh và đáng tin ngay trong phần mềm hiện có, một lớp mới chỉ tăng chi phí.

Phép thử rẻ nhất là chọn một quyết định diễn ra hằng tuần và chỉ định một người chịu trách nhiệm. Ghi lại thời gian hiện dùng để tìm bằng chứng, số lần phải sửa sau khi rà soát và độ trễ trước hành động tiếp theo. Cho trợ lý chạy song song quy trình cũ trong vài chu kỳ. Chỉ mở rộng nếu kết quả dễ kiểm tra hơn và tổng công, tính cả thời gian duyệt và sửa lỗi, giảm mà không tăng sai sót quan trọng. Không cần thay toàn bộ phần mềm chỉ để bản demo trông mạch lạc.

## Nguồn

- [OpenAI: Agents overview](https://developers.openai.com/api/docs/guides/agents)
- [OpenAI: Run and continue sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [Anthropic: Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents)
- [Anthropic Economic Index report: Cadences, tháng 6/2026](https://www.anthropic.com/research/economic-index-june-2026-report)

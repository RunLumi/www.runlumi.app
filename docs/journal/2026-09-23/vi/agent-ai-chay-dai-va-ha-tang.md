## Công việc có thể dài hơn một lượt trả lời

Dấu hiệu đầu tiên của một agent làm việc thật thường rất bình thường: API hết thời gian chờ, người phê duyệt rời văn phòng, hoặc một tệp phải đợi cập nhật. Bản demo một lượt có thể bỏ qua. Quy trình doanh nghiệp thì không. Hạ tầng chạy quanh mô hình phải giữ đủ trạng thái để tiếp tục đúng việc, đúng quyền và không lặp lại tác động bên ngoài.

[Phiên làm việc của Agents API](https://developers.openai.com/api/docs/guides/agents-api/sessions) được OpenAI mô tả như nơi giữ cuộc hội thoại và kết quả qua nhiều lượt. Hướng dẫn [rút gọn ngữ cảnh](https://developers.openai.com/api/docs/guides/compaction) của họ bàn cách giữ phần cần thiết khi công việc kéo dài. Anthropic, trong bài [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), nhấn mạnh rằng thêm thật nhiều ngữ cảnh không mặc nhiên tốt hơn; hệ thống phải chọn thông tin có ích cho bước kế tiếp. Đây là các cách triển khai, còn doanh nghiệp vẫn phải tự xác định trạng thái công việc của mình.

## Ba loại hồ sơ không nên trộn

Trạng thái công việc cho biết đang chờ xử lý, thu thập bằng chứng, đợi duyệt, thực hiện, xác minh hay đã dừng. Hồ sơ ngữ cảnh giữ những dữ kiện và giả định cần để tiếp tục. Nhật ký làm việc ghi công cụ quan trọng, quyết định và kết quả. Nhét cả ba vào một cuộc trò chuyện dài khiến việc khôi phục chậm, đồng thời dễ che mất một hành động bên ngoài mới làm được nửa chừng.

Điểm tiếp tục nên giữ người phụ trách, phạm vi và quyền còn hiệu lực, mốc đã xác minh cuối cùng, ngoại lệ chưa xử lý và mã nhận diện những hành động đã thử trên hệ thống khác. Nó không cần giữ thêm dữ liệu cá nhân thô nếu không phục vụ nhiệm vụ. Sau một quãng dừng, quyền và độ mới nguồn dữ liệu có thể phải kiểm tra lại. Lời dặn lưu từ hôm qua không phải giấy phép mới để chuyển tiền hôm nay.

## Một lần đối soát phải tạm dừng

Hãy hình dung việc rà soát đơn hàng và hóa đơn hằng tuần như một ví dụ minh họa. Agent đọc những bản ghi đã được phép, đối chiếu chúng rồi lập danh sách ngoại lệ. Nó dừng để người phụ trách tài chính duyệt một sửa đổi trên hồ sơ nội bộ. Trong lúc chờ, hệ thống hóa đơn ngừng đáp ứng. Một lượt chạy có khả năng khôi phục sẽ lưu đúng sửa đổi đề xuất và bằng chứng kèm theo, thay vì để lại lời nhắc mơ hồ “làm tiếp”. Khi dịch vụ trở lại, nó kiểm tra phê duyệt còn hiệu lực và sửa đổi đã được áp dụng hay chưa.

Nếu API báo hết thời gian chờ sau khi yêu cầu ghi dữ liệu được gửi đi, lượt chạy phải kiểm tra hồ sơ đích trước. Thử lại mù quáng có thể tạo bản ghi trùng. Nhật ký nên phân biệt “đã gửi yêu cầu”, “hệ thống đã xác nhận” và “bản ghi gốc đã ở trạng thái mong muốn”. Người rà soát cần thấy những mốc ấy mà không phải đọc từng token nội bộ của mô hình.

Điều này không biến mất khi có nhiều agent hỗ trợ. [Hướng dẫn điều phối của OpenAI](https://developers.openai.com/api/docs/guides/agents/orchestration) phân biệt bàn giao quyền trả lời với việc một agent chính gọi chuyên gia phụ. Người chịu trách nhiệm trong doanh nghiệp vẫn cần một nơi để biết kết quả thuộc về ai.

## Phản biện: nhiều việc không cần hạ tầng này

Một tác vụ ngắn, ổn định có thể chạy bằng chương trình định kỳ rẻ và dễ kiểm soát hơn. Hạ tầng agent chạy dài chỉ đáng đầu tư khi công việc thật sự phải qua nhiều công cụ, ngữ cảnh thay đổi hoặc có quyết định của con người ở giữa. Không nên kéo dài một tác vụ chỉ để hợp lý hóa công nghệ.

Chọn một việc hiện hay đứt đoạn. Ghi đường hoàn thành bình thường, lỗi hết thời gian chờ có khả năng xảy ra, nguy cơ ghi trùng và điểm phải duyệt. Ban đầu chỉ cho agent đọc và soạn nháp. Chỉ mở rộng khi đội ngũ có thể tiếp tục từ mốc lưu, hủy hành động đang chờ và giải thích mọi tác động ra ngoài. Bài về [agent có giới hạn](/vi/blog/agent-ai-co-gioi-han) xác định quyền; bài [đánh giá agent](/vi/blog/danh-gia-ai-agent-truoc-production) giúp thử lần gián đoạn; còn ở đây trọng tâm là công việc có đi qua thời gian an toàn hay không.

## Nguồn

- [OpenAI: Run and continue sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [OpenAI: Compaction](https://developers.openai.com/api/docs/guides/compaction)
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [OpenAI: Orchestration and handoffs](https://developers.openai.com/api/docs/guides/agents/orchestration)

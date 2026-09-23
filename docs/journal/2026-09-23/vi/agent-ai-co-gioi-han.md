## Nhìn vào hậu quả của hành động

AI agent có ích khi nó đẩy một công việc đã xác định tiến lên. Câu hỏi khó là nó được đi đến đâu trước khi con người phải quyết định. Đọc hóa đơn, lập danh sách sai lệch và chuyển tiền là ba quyền khác nhau, dù cùng nằm trong một quy trình. Chỉ nên giao hai việc đầu khi đội ngũ nói rõ agent được chạm vào dữ liệu nào, phải tạo ra kết quả gì và sẽ phát hiện sai sót bằng cách nào.

Anthropic mô tả agent là hệ thống lập kế hoạch, hành động, xem kết quả rồi điều chỉnh, trong một bộ quy tắc, công cụ và môi trường cụ thể. Bài [Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents) cho thấy vì sao quyền đọc lịch khác quyền gửi lời mời. Hướng dẫn [phê duyệt của OpenAI](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) cũng đặt điểm dừng ngay trước lời gọi công cụ có thể tạo hậu quả. Đây là cách thiết kế của từng nhà cung cấp, không phải chứng nhận an toàn chung. Nguyên tắc thực dụng là lời nhắc “hãy cẩn thận” không thay được kiểm tra quyền ở nơi hệ thống thật sự đổi trạng thái.

## Bốn mức quyền cần tách ra

Một chính sách dễ hiểu tách quyền đọc, quyền chuẩn bị, quyền sửa có thể hoàn tác và quyền tạo hậu quả lớn. Đọc có thể gồm hóa đơn hay đơn hàng trong phạm vi người phụ trách cho phép. Chuẩn bị có thể là bản đối soát hoặc thư nháp. Sửa có thể hoàn tác có thể là thêm ghi chú nội bộ với lịch sử thay đổi. Nhóm cuối gồm gửi tin ra ngoài, đổi giá, duyệt hoàn tiền hoặc giải ngân.

Quyền phải gắn với đối tượng và hành động. “Được vào CRM” quá rộng; “được đọc các hồ sơ khách hàng này cho phiên rà soát tuần” rõ hơn. Cùng một công cụ có thao tác tương đối an toàn và thao tác nguy hiểm. Quyền xem danh sách không kéo theo quyền xóa. Khi có thể, cấp thông tin xác thực có thời hạn và phạm vi hẹp cho từng việc, để phần mềm lưu dữ liệu gốc vẫn là nơi thực thi giới hạn cuối cùng.

[OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) liệt kê các nguy cơ như dùng sai công cụ và chỉ dẫn đối kháng trong quy trình agent. Khung này giúp lập danh sách điều cần kiểm tra, không chứng minh một bộ quy tắc đủ cho mọi môi trường. Email, tài liệu và trang web có thể chứa câu lệnh độc hại; chúng vẫn là dữ liệu đầu vào, không được thừa hưởng quyền của người giao việc.

## Một lần đối soát công nợ

Trong ví dụ minh họa, agent được đọc danh sách hóa đơn và đơn mua hàng do bộ phận tài chính chỉ định. Nó so nhà cung cấp, số tiền và mã tham chiếu để lập danh sách chênh lệch kèm đường dẫn tới bản ghi. Hóa đơn khớp có thể được đưa vào hàng chờ rà soát. Nếu xuất hiện tài khoản ngân hàng mới, thiếu đơn mua hàng hoặc số tiền không khớp, nó dừng và báo người phụ trách. Chuyển tiền không nằm trong nhiệm vụ.

Nhật ký làm việc phải ghi việc đã định làm, lần tra cứu nào thành công, bản ghi nào đã so, ngoại lệ nào được nêu và phần nào chưa xác minh. “Xong” có nghĩa là kết quả đối soát đã qua bước kiểm tra quy định, không phải agent vừa viết một đoạn kết luận đầy tự tin. Nếu API hết thời gian chờ sau khi thử ghi dữ liệu, chỉ thử lại sau khi kiểm tra lần ghi đầu có hiệu lực hay chưa. Phân biệt “đã thử” và “đã xác nhận” càng quan trọng với công việc kéo dài; bài về [hạ tầng chạy agent](/vi/blog/agent-ai-chay-dai-va-ha-tang) giải thích thêm.

## Phản biện: duyệt quá nhiều sẽ mất lợi ích

Nếu bước nào cũng phải bấm duyệt, hệ thống có thể chậm hơn làm tay. Cách giải không phải là cho agent toàn quyền. Hãy đặt phê duyệt ở nơi hành động đổi trạng thái bên ngoài hoặc khó hoàn tác, còn phần chuẩn bị ít rủi ro được chạy trong phạm vi hẹp. Có thể duyệt cả lô khi người duyệt nhìn được từng mục và công cụ chỉ thực hiện đúng các mục đã duyệt. Sự chấp thuận đó không được tự mở rộng sang hồ sơ mới tìm thấy giữa chừng.

Chạy thử một việc lặp lại có ngoại lệ thật. So tổng thời gian, công sức người duyệt, ngoại lệ bỏ sót và lần gọi công cụ vượt phạm vi với quy trình hiện có. Bài [đánh giá agent trước khi vận hành](/vi/blog/danh-gia-ai-agent-truoc-production) có cách lập bộ trường hợp kiểm tra. Dừng mở rộng nếu agent gọi công cụ ngoài quyền, nhật ký không phân biệt được hành động đã thử với đã hoàn tất, hoặc người duyệt không hiểu thay đổi được đề xuất từ dữ liệu gốc. Ranh giới tốt cho phép giao phần việc có thể kiểm tra, trong khi trách nhiệm vẫn ở đúng người.

## Nguồn

- [Anthropic: Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents)
- [OpenAI: Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)
- [OWASP: Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)

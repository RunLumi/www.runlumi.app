## Chỉ số thay đổi là điểm bắt đầu

“Doanh thu tăng” có thể đúng mà người quản lý vẫn chưa biết phải quyết định gì. Số đơn tăng, cơ cấu khách hàng đổi, giá bán mới, hàng trả lại ghi nhận muộn hay cách tính báo cáo thay đổi đều có thể tạo ra cùng một bề mặt. Một câu trả lời BI tốt giữ được đường đi từ con số tới các bản ghi tạo nên nó. Người đọc phải có thể phản biện cách giải thích mà không phải tự dựng lại toàn bộ phép tính.

Đường đi ấy được xác định trước khi mô hình AI viết câu trả lời. Tài liệu [semantic view của Snowflake](https://docs.snowflake.com/en/user-guide/views-semantic/overview) yêu cầu làm rõ thực thể kinh doanh, quan hệ, chỉ số và chiều phân tích, rồi mới ánh xạ chúng xuống bảng dữ liệu và công thức. Hướng dẫn [Cortex Analyst](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst) dùng lớp nghĩa đó cùng các câu hỏi và truy vấn đã kiểm tra để hỗ trợ hỏi dữ liệu bằng ngôn ngữ thường. Đây là cách triển khai của một nhà cung cấp, không phải bằng chứng rằng truy vấn do AI tạo ra luôn đúng. Điều có thể rút ra là ý nghĩa của chỉ số cần được quản lý bên ngoài câu trả lời.

## Viết “hợp đồng” cho chỉ số

Trước khi hỏi vì sao biên lợi nhuận biến động, tài chính và vận hành phải thống nhất đơn vị tính, công thức, kỳ thời gian, khoản loại trừ và người sở hữu định nghĩa. “Doanh thu” là đơn đã chốt, đơn đã giao hay hóa đơn đã thu tiền? Hàng hoàn được tính vào ngày bán hay ngày trả? Tỷ giá nào được dùng? Mô hình có thể viết truy vấn SQL rất thuyết phục trong khi âm thầm chọn một câu trả lời khác ở bất kỳ chỗ nào.

Nghiên cứu [Spider 2.0](https://arxiv.org/abs/2411.07763) xây dựng bộ thử từ các công việc truy vấn dữ liệu doanh nghiệp, nơi nhiều câu hỏi đòi hỏi đọc metadata, tài liệu và mã nguồn trên cơ sở dữ liệu phức tạp. Kết quả của họ áp dụng cho bộ thử và các hệ thống được đánh giá, không dự báo độ đúng trong kho dữ liệu của bạn. Bài học thực dụng hơn: một câu SQL nhìn có vẻ hợp lý chưa chứng minh được thuật ngữ kinh doanh đã được hiểu đúng.

Với mỗi câu hỏi lặp lại, nên có một bản ghi ngắn: tên chỉ số và người phụ trách; công thức và cấp độ mỗi dòng; múi giờ và kỳ so sánh; nguồn và độ mới dữ liệu; khoản loại trừ; hai ví dụ đã đối chiếu. Khi định nghĩa thay đổi, ghi ai duyệt và báo cáo lịch sử nào phải tính lại. Bản ghi này có ích ngay cả khi chưa dùng AI.

## Một cuộc điều tra minh họa

Giả sử báo cáo tuần cho thấy doanh thu tăng còn biên lợi nhuận gộp giảm. Trợ lý trước hết kiểm tra hai chỉ số có cùng tập đơn và cùng ngày chốt hay không. Sau đó nó tách biến động theo giá, chiết khấu, cơ cấu sản phẩm và giá vốn, rồi dẫn tới các đơn hàng và bản ghi chi phí của yếu tố có ảnh hưởng lớn nhất. Nếu giá mua từ nhà cung cấp chưa về đủ, nó ghi rõ kết luận chỉ là tạm thời. Người phụ trách tài chính xem các dòng gốc trước khi đổi quy tắc chiết khấu.

Có nhiều kết quả hợp lệ. Phân tích có thể tìm ra một thay đổi chiết khấu thật. Nó cũng có thể phát hiện lô hoàn tiền ghi nhận muộn hoặc lỗi nối bảng làm đếm trùng đơn. Và đôi khi nó phải nói dữ liệu hiện có chưa phân biệt được các giả thuyết. Câu trả lời cuối cùng vẫn có ích nếu nó ngăn một quyết định sai.

Chuỗi bằng chứng nên đủ ngắn để lần theo: chỉ số quan sát được → nguyên nhân có thể → bản ghi gốc → quyết định. Bài về [lớp vận hành AI](/vi/blog/lop-van-hanh-ai-cho-doanh-nghiep) đặt quyết định ấy trong quy trình rộng hơn. [Giới hạn quyền agent](/vi/blog/agent-ai-co-gioi-han) trở nên quan trọng khi phân tích dẫn tới đề nghị sửa quy tắc hay gửi thông báo.

## Khi nào cần đi đến tận bản ghi?

Phản biện mạnh nhất là không phải câu hỏi nào trên dashboard cũng cần điều tra như kiểm toán. Một buổi họp định hướng ít rủi ro có thể bắt đầu từ câu trả lời nhanh. Nhưng câu trả lời ấy vẫn phải nói rõ phần chưa kiểm tra. Khi kết quả sẽ đổi giá, ngân sách hay lời hứa với khách hàng, đường dẫn về nguồn là một phần của quyết định.

Hãy chọn ba câu hỏi lặp lại vốn đã dẫn tới hành động. Lưu một câu trả lời đã được kiểm tra cho mỗi câu, gồm dòng dữ liệu gốc và định nghĩa chỉ số. So lời giải thích của trợ lý với các trường hợp đó; ghi lại khi nó chọn sai kỳ, nối sai cấp độ dữ liệu hoặc biến giả thuyết thành kết luận. Nếu đội ngũ chưa thống nhất cách tính, hãy giải quyết việc đó trước. Giao diện hỏi đáp tự nhiên hơn không thể chữa một định nghĩa đang bị tranh cãi.

## Nguồn

- [Snowflake: Overview of semantic views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- [Snowflake: Cortex Analyst](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst)
- [Lei và cộng sự: Spider 2.0](https://arxiv.org/abs/2411.07763)

export type BlogSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  quote?: string;
};

export type BlogPost = {
  lang: "en" | "vi";
  slug: string;
  alternateSlug: string;
  title: string;
  description: string;
  category: string;
  date: string;
  updated: string;
  readTime: string;
  author: string;
  intro: string;
  sections: BlogSection[];
  faq: Array<{ question: string; answer: string }>;
  related: string[];
};

const enPosts: BlogPost[] = [
  {
    lang: "en",
    slug: "ai-operating-layer-for-business",
    alternateSlug: "lop-van-hanh-ai-cho-doanh-nghiep",
    title: "What an AI operating layer actually does for a growing company",
    description:
      "An AI operating layer connects company context, decisions and bounded actions across the software a growing business already uses.",
    category: "Company operations",
    date: "2026-09-23",
    updated: "2026-09-23",
    readTime: "8 min read",
    author: "Lumi editorial",
    intro:
      "Most companies do not have a software shortage. They have a coordination shortage. The number lives in one place, the reason lives in another, and the next action is waiting in someone’s inbox. An AI operating layer is useful when it closes that gap without asking the company to replace every system it already relies on.",
    sections: [
      {
        heading: "The work between systems is the real operating problem",
        paragraphs: [
          "An accounting system can record a sale. A CRM can record a customer conversation. A spreadsheet can hold a forecast. None of those systems, by itself, owns the question a leader asks on Monday morning: what changed, why did it change, and who needs to do something next?",
          "That missing layer is not another dashboard. It is the context that connects people, records, decisions and permissions. The goal is to make the handoff visible enough that a person can judge it, and structured enough that repeatable work can move without another round of explanation.",
        ],
        quote: "The value is not another place to store work. It is less work lost between the places that already store it.",
      },
      {
        heading: "A useful operating layer has four jobs",
        paragraphs: [
          "The phrase AI operating system can sound larger than the product it describes. The practical version is smaller and more demanding. It should help a company connect its working context, understand the evidence, decide with the right people, and carry out bounded actions.",
        ],
        bullets: [
          "Connect the systems and documents that contain the relevant context.",
          "Explain what changed and show the records behind the explanation.",
          "Keep decisions, owners and commitments in a shared operating view.",
          "Run repeatable jobs with explicit limits, approvals and a worklog.",
        ],
      },
      {
        heading: "Why replacement is usually the wrong first move",
        paragraphs: [
          "A business has already paid for its systems in money, training and habit. Replacing them to make room for an AI product creates a second problem before the first one is understood. It also makes adoption depend on a large organisational change, which is a poor starting condition for a founder-led or mid-market deployment.",
          "A better first step is one workflow with a clear owner and a visible cost. A weekly margin review, a customer-risk handoff or a recurring reconciliation is enough. Connect only what that workflow needs, define what a useful result looks like, and expand after the result survives a real review.",
        ],
      },
      {
        heading: "The standard is inspectable work",
        paragraphs: [
          "A fluent answer is not the same as a reliable answer. People need to know which source was used, when it was updated, what the system was allowed to access, and where human judgment is still required. The same distinction matters for actions: planned, attempted, completed and verified are different states.",
          "That is why an operating layer should make evidence and authority visible. The best interface is often quiet. It shows the question, the relevant context, the proposed next step and the point where a responsible person needs to decide.",
        ],
      },
    ],
    faq: [
      {
        question: "What is an AI operating layer?",
        answer:
          "It is a context and action layer that connects people, evidence, decisions and bounded workflows across the business software a company already uses.",
      },
      {
        question: "Does an AI operating layer replace ERP or CRM software?",
        answer:
          "It should not need to. A practical first deployment connects the systems that already hold the work and improves the decisions and handoffs between them.",
      },
      {
        question: "How should a company start?",
        answer:
          "Choose one recurring workflow, agree on its inputs and boundaries, and measure a useful result before expanding to more work.",
      },
    ],
    related: ["business-intelligence-with-evidence", "bounded-ai-agents-for-business"],
  },
  {
    lang: "en",
    slug: "business-intelligence-with-evidence",
    alternateSlug: "tri-tue-kinh-doanh-co-bang-chung",
    title: "Business intelligence should show the reason, not only the number",
    description:
      "Good business intelligence connects a changed metric to its drivers, source records and the decision that should follow.",
    category: "Business intelligence",
    date: "2026-09-23",
    updated: "2026-09-23",
    readTime: "7 min read",
    author: "Lumi editorial",
    intro:
      "A number can be correct and still be operationally useless. A revenue chart may show movement while leaving the team to hunt through products, channels, discounts and messages to understand what happened. Business intelligence becomes valuable when it reduces that distance without hiding the evidence that makes the explanation credible.",
    sections: [
      {
        heading: "A metric is the beginning of an investigation",
        paragraphs: [
          "The first question is usually short: what changed? The useful follow-up is longer: which dimensions moved, which records explain the movement, and which part is signal rather than noise? A dashboard that stops at the first answer pushes the difficult work back onto the person who needs to make a decision.",
          "An evidence-led BI workflow keeps the path from metric to driver to source record intact. It does not turn every business question into a data-science project. It gives an operator enough context to decide whether the explanation is plausible and what to check next.",
        ],
      },
      {
        heading: "The evidence chain should be visible",
        paragraphs: [
          "Trust grows when the explanation can be inspected. That means naming the metric, showing the relevant time window, identifying the driver, and making the source and freshness easy to find. It also means saying when the available data is incomplete or the conclusion is only a working hypothesis.",
        ],
        bullets: [
          "Metric: what moved and over which comparable period?",
          "Driver: which product, channel, customer group or cost changed with it?",
          "Record: which source rows or documents support the explanation?",
          "Decision: what should the owner review, change or leave alone?",
        ],
        quote: "The answer is stronger when the second question is easy to ask.",
      },
      {
        heading: "Natural language is an interface, not a proof",
        paragraphs: [
          "Asking a BI system a question in ordinary language can remove friction. It should not remove the need to inspect the result. A natural-language answer is a route into the data, not a replacement for the data. The interface should make it easy to move from an explanation to the underlying records and to correct an assumption when the evidence disagrees.",
          "This distinction matters even more when the answer is used outside the analyst’s desk. A finance lead, a sales operator and a CEO need to see the same reasoning at different levels of detail. The source trail is what lets the conclusion travel without losing its meaning.",
        ],
      },
      {
        heading: "Start with one decision that comes back every week",
        paragraphs: [
          "The best BI pilot is rarely a request for every dashboard the company could imagine. Pick one recurring decision where the team already knows the vocabulary and the cost of delay. Define the comparison, the drivers that matter and the person who owns the next step. Then improve the path from question to evidence until it is worth repeating.",
        ],
      },
    ],
    faq: [
      {
        question: "What makes business intelligence evidence-led?",
        answer:
          "An evidence-led BI workflow connects a changed metric to its drivers, source records, freshness and the decision that follows.",
      },
      {
        question: "Can natural-language BI replace analysts?",
        answer:
          "Natural-language interfaces can reduce the effort of asking questions, but they do not replace judgment, source review or responsibility for the decision.",
      },
      {
        question: "What is a good BI pilot?",
        answer:
          "A recurring decision with a clear owner, a known data path and a measurable cost of delay is usually a stronger pilot than a broad dashboard rebuild.",
      },
    ],
    related: ["ai-operating-layer-for-business", "bounded-ai-agents-for-business"],
  },
  {
    lang: "en",
    slug: "bounded-ai-agents-for-business",
    alternateSlug: "agent-ai-co-gioi-han",
    title: "How to use AI agents without handing over the keys",
    description:
      "Business AI agents become useful when their goal, tools, permissions, approvals and verification steps are explicit.",
    category: "AI agents",
    date: "2026-09-23",
    updated: "2026-09-23",
    readTime: "8 min read",
    author: "Lumi editorial",
    intro:
      "The strongest case for an AI agent is not that it can do everything. It is that a defined job can move forward without being re-explained every time. That requires a narrower design: a goal, a permitted set of tools, a success condition, a worklog, and a clear point where a person must approve the consequence.",
    sections: [
      {
        heading: "Autonomy needs a boundary",
        paragraphs: [
          "A business process has a shape. It has inputs, decisions, side effects and a definition of done. If an agent is given only a vague instruction, it has to invent too much of that shape. The result may look capable while being difficult to review or repeat.",
          "Bounded autonomy starts by making the job smaller. Prepare a reconciliation. Check a set of records. Draft a follow-up. Gather exceptions for a human review. The boundary is not a limitation to apologise for; it is the reason the result can be trusted.",
        ],
        quote: "The right question is not ‘can the agent act?’ It is ‘what is the agent allowed to change?’",
      },
      {
        heading: "Five controls make an agent usable",
        paragraphs: [
          "The controls do not need to be complicated, but they do need to be explicit. A team should be able to answer these questions before a run begins:",
        ],
        bullets: [
          "Goal: what job is being attempted?",
          "Tools: which systems, files and actions are available?",
          "Permission: what data can the agent read or change?",
          "Approval: which consequences require a person to say yes?",
          "Verification: how will the team know the result is actually complete?",
        ],
      },
      {
        heading: "A worklog is part of the product",
        paragraphs: [
          "If a result matters, the team needs more than a final sentence. It needs a compact account of what the agent attempted, what it found, what it changed and what it could not verify. That record supports review, recovery and improvement. It also makes it easier to distinguish an unsuccessful attempt from a completed job.",
          "A worklog is not a theatrical transcript. It is an operational record. Keep the material steps, the decisions, the tool outcomes and the evidence needed for a person to understand the result without reading every internal thought.",
        ],
      },
      {
        heading: "Pilot the job before you expand the agent",
        paragraphs: [
          "Choose a task the team already performs and can evaluate. Run it inside a narrow scope. Compare the output with the current process. Record the failures that matter, especially incorrect actions and silent omissions. Expand only when the team can explain why the agent is safe enough for the next boundary.",
          "This is slower than a demo and faster than a production incident. It also builds the asset that compounds over time: a record of which workflows are well-defined, which approvals are necessary and which checks catch errors early.",
        ],
      },
    ],
    faq: [
      {
        question: "What is a bounded AI agent?",
        answer:
          "It is an agent assigned a defined job with explicit tools, data permissions, approval points and a way to verify the result.",
      },
      {
        question: "Should an AI agent be allowed to send or change things automatically?",
        answer:
          "Only when the action is within a documented scope and the team has decided that the consequence does not require human approval. Consequential actions should stop for review.",
      },
      {
        question: "What should an agent worklog contain?",
        answer:
          "It should record the material goal, tools used, important outcomes, attempted and completed steps, exceptions and verification status.",
      },
    ],
    related: ["ai-operating-layer-for-business", "business-intelligence-with-evidence"],
  },
];

const viPosts: BlogPost[] = [
  {
    lang: "vi",
    slug: "lop-van-hanh-ai-cho-doanh-nghiep",
    alternateSlug: "ai-operating-layer-for-business",
    title: "Lớp vận hành AI thực sự làm gì cho một doanh nghiệp đang lớn lên?",
    description:
      "Lớp vận hành AI nối ngữ cảnh, quyết định và công việc có giới hạn trên những phần mềm doanh nghiệp đang dùng.",
    category: "Vận hành doanh nghiệp",
    date: "2026-09-23",
    updated: "2026-09-23",
    readTime: "8 phút đọc",
    author: "Ban biên tập Lumi",
    intro:
      "Phần lớn doanh nghiệp không thiếu phần mềm. Họ thiếu một lớp nối việc. Con số nằm ở một nơi, lý do nằm ở nơi khác, còn bước tiếp theo đang chờ trong hộp thư của ai đó. Lớp vận hành AI có ích khi nó nối được khoảng cách ấy mà không bắt doanh nghiệp bỏ đi mọi hệ thống đang dùng.",
    sections: [
      {
        heading: "Công việc nằm giữa các hệ thống mới là vấn đề vận hành thật",
        paragraphs: [
          "Hệ thống kế toán có thể ghi nhận một giao dịch. CRM có thể giữ lịch sử trao đổi với khách hàng. Bảng tính có thể chứa dự báo. Nhưng không hệ thống nào tự mình trả lời câu hỏi người điều hành đặt ra vào sáng thứ Hai: điều gì thay đổi, vì sao thay đổi và ai cần làm gì tiếp theo?",
          "Khoảng trống đó không cần thêm một dashboard. Nó cần ngữ cảnh nối con người, dữ liệu, quyết định và quyền hạn. Mục tiêu là làm cho khâu bàn giao đủ rõ để người có trách nhiệm xem xét, và đủ có cấu trúc để công việc lặp lại không phải giải thích lại từ đầu.",
        ],
        quote: "Giá trị không nằm ở một nơi mới để cất công việc. Giá trị nằm ở việc công việc không còn thất lạc giữa những nơi đang cất nó.",
      },
      {
        heading: "Một lớp vận hành hữu ích có bốn việc",
        paragraphs: [
          "Cụm từ hệ điều hành AI đôi khi nghe lớn hơn sản phẩm thật. Phiên bản thực tế nhỏ hơn và đòi hỏi kỷ luật hơn. Nó phải giúp doanh nghiệp nối ngữ cảnh, hiểu bằng chứng, quyết định cùng đúng người và thực hiện công việc có phạm vi rõ.",
        ],
        bullets: [
          "Nối các hệ thống và tài liệu đang chứa ngữ cảnh liên quan.",
          "Giải thích điều gì thay đổi và đưa ra bản ghi đứng sau lời giải thích.",
          "Giữ quyết định, người phụ trách và cam kết trong một góc nhìn chung.",
          "Chạy công việc lặp lại với giới hạn, phê duyệt và nhật ký rõ ràng.",
        ],
      },
      {
        heading: "Vì sao thay thế toàn bộ hệ thống thường là bước đầu sai",
        paragraphs: [
          "Doanh nghiệp đã trả tiền, đào tạo và hình thành thói quen quanh những hệ thống hiện có. Thay chúng chỉ để đưa một sản phẩm AI vào sẽ tạo thêm một bài toán trước khi hiểu bài toán cũ. Việc áp dụng cũng trở nên phụ thuộc vào một cuộc thay đổi tổ chức quá lớn.",
          "Bước đầu tốt hơn là một workflow có người phụ trách và chi phí nhìn thấy được. Có thể là buổi xem lại biên lợi nhuận, khâu bàn giao rủi ro khách hàng hay một lần đối soát lặp lại. Chỉ kết nối dữ liệu cần thiết, thống nhất thế nào là kết quả có ích, rồi mở rộng sau khi kết quả chịu được một lần xem xét thật.",
        ],
      },
      {
        heading: "Tiêu chuẩn là công việc có thể kiểm tra",
        paragraphs: [
          "Một câu trả lời trôi chảy không đồng nghĩa với một câu trả lời đáng tin. Người dùng cần biết nguồn nào đã được dùng, dữ liệu cập nhật đến đâu, hệ thống được phép truy cập gì và chỗ nào vẫn cần phán đoán của con người. Với hành động cũng vậy: dự kiến, đã thử, đã làm và đã kiểm chứng là những trạng thái khác nhau.",
          "Vì vậy, lớp vận hành cần làm cho bằng chứng và quyền hạn hiện ra đúng lúc. Giao diện tốt thường rất yên. Nó cho thấy câu hỏi, ngữ cảnh liên quan, bước tiếp theo được đề xuất và nơi người chịu trách nhiệm cần quyết.",
        ],
      },
    ],
    faq: [
      { question: "Lớp vận hành AI là gì?", answer: "Đó là lớp nối ngữ cảnh và hành động giữa con người, bằng chứng, quyết định và workflow có giới hạn trên những phần mềm doanh nghiệp đang dùng." },
      { question: "Lớp vận hành AI có thay ERP hoặc CRM không?", answer: "Không nhất thiết. Một lần triển khai thực tế nên bắt đầu bằng việc nối những hệ thống đang giữ công việc và cải thiện khâu quyết định, bàn giao giữa chúng." },
      { question: "Doanh nghiệp nên bắt đầu thế nào?", answer: "Chọn một workflow lặp lại, thống nhất dữ liệu đầu vào và giới hạn, rồi đo một kết quả có ích trước khi mở rộng." },
    ],
    related: ["tri-tue-kinh-doanh-co-bang-chung", "agent-ai-co-gioi-han"],
  },
  {
    lang: "vi",
    slug: "tri-tue-kinh-doanh-co-bang-chung",
    alternateSlug: "business-intelligence-with-evidence",
    title: "BI tốt phải chỉ ra lý do, không chỉ đưa ra con số",
    description:
      "BI hữu ích nối một chỉ số vừa thay đổi với yếu tố dẫn dắt, bản ghi nguồn và quyết định cần làm tiếp.",
    category: "Business intelligence",
    date: "2026-09-23",
    updated: "2026-09-23",
    readTime: "7 phút đọc",
    author: "Ban biên tập Lumi",
    intro:
      "Một con số có thể đúng mà vẫn không giúp ích cho việc điều hành. Biểu đồ doanh thu cho thấy chuyển động, nhưng đội ngũ vẫn phải lần qua sản phẩm, kênh, chiết khấu và tin nhắn để hiểu chuyện gì đã xảy ra. BI trở nên đáng giá khi rút ngắn khoảng cách ấy mà không giấu bằng chứng làm cho lời giải thích đáng tin.",
    sections: [
      {
        heading: "Chỉ số là điểm bắt đầu của một cuộc điều tra",
        paragraphs: [
          "Câu hỏi đầu tiên thường ngắn: điều gì thay đổi? Câu hỏi tiếp theo mới là phần có giá trị: chiều nào dịch chuyển, bản ghi nào giải thích cho dịch chuyển đó, và phần nào là tín hiệu chứ không phải nhiễu? Dashboard dừng ở câu hỏi đầu sẽ đẩy phần khó nhất trở lại cho người cần ra quyết định.",
          "Quy trình BI dựa trên bằng chứng giữ nguyên đường đi từ chỉ số đến yếu tố dẫn dắt rồi xuống bản ghi nguồn. Nó không biến mỗi câu hỏi kinh doanh thành một dự án khoa học dữ liệu. Nó đưa đủ ngữ cảnh để người điều hành đánh giá lời giải thích có hợp lý không và nên kiểm tra gì tiếp theo.",
        ],
      },
      {
        heading: "Chuỗi bằng chứng phải hiện ra",
        paragraphs: [
          "Niềm tin tăng lên khi lời giải thích có thể được kiểm tra. Cần gọi đúng tên chỉ số, nêu khoảng thời gian so sánh, xác định yếu tố dẫn dắt và để nguồn cùng độ mới dữ liệu ở gần kết luận. Khi dữ liệu thiếu hoặc kết luận chỉ là giả thuyết đang làm việc, hệ thống cũng cần nói rõ.",
        ],
        bullets: [
          "Chỉ số: điều gì dịch chuyển và so với khoảng thời gian nào?",
          "Yếu tố: sản phẩm, kênh, nhóm khách hàng hay chi phí nào đi cùng chuyển động?",
          "Bản ghi: dòng dữ liệu hoặc tài liệu nào nâng đỡ lời giải thích?",
          "Quyết định: người phụ trách cần xem, đổi hay giữ nguyên điều gì?",
        ],
        quote: "Câu trả lời mạnh hơn khi câu hỏi thứ hai được đặt ra dễ dàng.",
      },
      {
        heading: "Ngôn ngữ tự nhiên là giao diện, không phải bằng chứng",
        paragraphs: [
          "Đặt câu hỏi BI bằng ngôn ngữ hằng ngày có thể giảm ma sát. Nó không được xóa nhu cầu xem lại kết quả. Câu trả lời bằng ngôn ngữ tự nhiên là đường vào dữ liệu, không phải vật thay thế dữ liệu. Người dùng cần đi từ lời giải thích xuống bản ghi và sửa giả định khi bằng chứng không ủng hộ nó.",
          "Điều này càng quan trọng khi kết luận rời khỏi bàn của chuyên viên phân tích. Người phụ trách tài chính, vận hành bán hàng và CEO cần thấy cùng một lập luận ở những mức chi tiết khác nhau. Đường dẫn về nguồn giúp kết luận đi xa mà không mất nghĩa.",
        ],
      },
      {
        heading: "Bắt đầu bằng một quyết định lặp lại mỗi tuần",
        paragraphs: [
          "Pilot BI tốt hiếm khi là yêu cầu xây mọi dashboard có thể tưởng tượng. Hãy chọn một quyết định lặp lại mà đội ngũ đã hiểu ngôn ngữ và đã biết cái giá của việc chậm trễ. Thống nhất cách so sánh, yếu tố cần xem và người sở hữu bước tiếp theo. Sau đó cải thiện đường đi từ câu hỏi đến bằng chứng cho đến khi nó đáng lặp lại.",
        ],
      },
    ],
    faq: [
      { question: "BI dựa trên bằng chứng là gì?", answer: "Đó là quy trình nối chỉ số vừa thay đổi với yếu tố dẫn dắt, bản ghi nguồn, độ mới dữ liệu và quyết định tiếp theo." },
      { question: "BI bằng ngôn ngữ tự nhiên có thay chuyên viên phân tích không?", answer: "Nó có thể giảm công sức đặt câu hỏi, nhưng không thay phán đoán, việc xem nguồn hay trách nhiệm với quyết định." },
      { question: "Pilot BI nên bắt đầu từ đâu?", answer: "Một quyết định lặp lại có người phụ trách, đường dữ liệu đã biết và chi phí chậm trễ đo được thường là điểm bắt đầu tốt." },
    ],
    related: ["lop-van-hanh-ai-cho-doanh-nghiep", "agent-ai-co-gioi-han"],
  },
  {
    lang: "vi",
    slug: "agent-ai-co-gioi-han",
    alternateSlug: "bounded-ai-agents-for-business",
    title: "Dùng AI agent thế nào mà không trao toàn bộ chìa khóa",
    description:
      "AI agent cho doanh nghiệp chỉ đáng dùng khi mục tiêu, công cụ, quyền hạn, phê duyệt và bước kiểm chứng được nói rõ.",
    category: "AI agents",
    date: "2026-09-23",
    updated: "2026-09-23",
    readTime: "8 phút đọc",
    author: "Ban biên tập Lumi",
    intro:
      "Lý do thuyết phục nhất để dùng AI agent không phải là nó làm được mọi thứ. Lý do là một công việc đã định nghĩa có thể đi tiếp mà không cần giải thích lại mỗi lần. Muốn vậy, thiết kế phải hẹp hơn: một mục tiêu, một nhóm công cụ được phép dùng, điều kiện hoàn thành, nhật ký và điểm người có trách nhiệm phải phê duyệt.",
    sections: [
      {
        heading: "Tự chủ phải có ranh giới",
        paragraphs: [
          "Một quy trình kinh doanh có hình dạng. Nó có đầu vào, quyết định, tác động và định nghĩa hoàn thành. Nếu agent chỉ nhận một chỉ thị mơ hồ, nó phải tự bịa quá nhiều phần trong hình dạng ấy. Kết quả có thể trông rất giỏi nhưng khó kiểm tra và khó lặp lại.",
          "Tự chủ có giới hạn bắt đầu bằng việc làm nhỏ công việc. Chuẩn bị một lần đối soát. Kiểm tra một tập bản ghi. Soạn một follow-up. Gom các ngoại lệ để người có trách nhiệm xem. Ranh giới không phải điều cần xin lỗi; đó là lý do kết quả có thể được tin.",
        ],
        quote: "Câu hỏi đúng không phải là agent có thể hành động không, mà là nó được phép thay đổi điều gì.",
      },
      {
        heading: "Năm kiểm soát làm agent có thể dùng được",
        paragraphs: [
          "Các kiểm soát không cần phức tạp, nhưng phải được nói rõ trước khi chạy:",
        ],
        bullets: [
          "Mục tiêu: công việc nào đang được thực hiện?",
          "Công cụ: agent được dùng hệ thống, tệp và hành động nào?",
          "Quyền hạn: agent được đọc hoặc thay đổi dữ liệu gì?",
          "Phê duyệt: hậu quả nào cần người có trách nhiệm nói đồng ý?",
          "Kiểm chứng: làm sao biết kết quả thực sự đã hoàn thành?",
        ],
      },
      {
        heading: "Nhật ký công việc là một phần của sản phẩm",
        paragraphs: [
          "Nếu kết quả quan trọng, đội ngũ cần hơn một câu kết. Họ cần biết agent đã thử gì, tìm thấy gì, thay đổi gì và phần nào không thể xác minh. Bản ghi đó giúp xem lại, khôi phục và cải thiện. Nó cũng phân biệt một lần thử không thành công với một công việc đã hoàn tất.",
          "Nhật ký không phải bản chép lời để tạo cảm giác công nghệ. Nó là hồ sơ vận hành: mục tiêu, bước quan trọng, kết quả công cụ, ngoại lệ và bằng chứng cần thiết để người có trách nhiệm hiểu được kết quả.",
        ],
      },
      {
        heading: "Pilot công việc trước khi mở rộng agent",
        paragraphs: [
          "Chọn một việc đội ngũ đang làm và có thể đánh giá. Chạy trong phạm vi hẹp. So kết quả với cách làm hiện tại. Ghi lại những lỗi thực sự đáng sợ, đặc biệt là hành động sai và phần bị bỏ sót mà không báo. Chỉ mở rộng khi cả đội giải thích được vì sao agent đủ an toàn cho ranh giới tiếp theo.",
          "Cách này chậm hơn một demo và nhanh hơn một sự cố production. Nó còn tạo ra tài sản tích lũy: hồ sơ về workflow nào đã rõ, chỗ nào cần phê duyệt và kiểm tra nào bắt được lỗi sớm.",
        ],
      },
    ],
    faq: [
      { question: "AI agent có giới hạn là gì?", answer: "Đó là agent nhận một công việc rõ với công cụ, quyền dữ liệu, điểm phê duyệt và cách kiểm chứng kết quả được xác định trước." },
      { question: "Có nên cho agent tự gửi hoặc tự thay đổi dữ liệu không?", answer: "Chỉ khi hành động nằm trong phạm vi đã ghi rõ và đội ngũ đã quyết định hậu quả đó không cần phê duyệt. Hành động có tác động lớn nên dừng để người có trách nhiệm xem." },
      { question: "Nhật ký agent cần ghi gì?", answer: "Mục tiêu, công cụ đã dùng, kết quả quan trọng, bước đã thử và đã hoàn thành, ngoại lệ cùng trạng thái kiểm chứng." },
    ],
    related: ["lop-van-hanh-ai-cho-doanh-nghiep", "tri-tue-kinh-doanh-co-bang-chung"],
  },
];

export const blogPosts = [...enPosts, ...viPosts];

export function getBlogPost(lang: "en" | "vi", slug: string) {
  return blogPosts.find((post) => post.lang === lang && post.slug === slug);
}

export function getBlogPosts(lang: "en" | "vi") {
  return blogPosts.filter((post) => post.lang === lang);
}

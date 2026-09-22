export const content = {
  en: {
    lang: "en",
    path: "/",
    switchPath: "/vi",
    switchLabel: "VI",
    meta: {
      title: "Lumi — The AI operating layer for your company",
      description: "Lumi connects to the software, data and workflows your company already uses, then helps people understand, decide and get work done with AI."
    },
    nav: { products: "Products", how: "How it works", trust: "Trust", contact: "Talk to us" },
    hero: {
      eyebrow: "LUMI / AI OPERATING LAYER",
      titleA: "Your company already has software.",
      titleB: "Give it intelligence.",
      body: "Lumi works across the tools, data and workflows you already depend on. Understand the business, coordinate work, delegate to AI staff, and keep people in control.",
      primary: "Explore the Lumi stack",
      secondary: "Talk to us",
      note: "Keep your systems. Add an intelligence layer.",
      systemLabel: "LUMI / OPERATING SYSTEM",
      systemItems: [
        { n: "01", role: "Front door", name: "Autonomous Assistant" },
        { n: "02", role: "Coordinate", name: "AI Workspace" },
        { n: "03", role: "Understand", name: "Lumi BI" },
        { n: "04", role: "Execute", name: "Lumi Agents" }
      ],
      systemFoot: "One context · many tools · human judgment"
    },
    thesis: {
      label: "THE THESIS",
      title: "One operating layer. Four ways to work.",
      body: "AI should not become another isolated app. Lumi gives people a shared place to work with AI, a way to understand the business, agentic staff that can execute, and one assistant that can reach across the whole system."
    },
    loop: {
      label: "THE OPERATING LOOP",
      items: [
        { n: "01", title: "Connect", body: "Bring in the systems and evidence where work already lives." },
        { n: "02", title: "Understand", body: "Turn fragmented signals into shared business context." },
        { n: "03", title: "Decide", body: "Put the right evidence, options and limits in front of a person." },
        { n: "04", title: "Act", body: "Let people and agents execute with permissions, approvals and a worklog." }
      ]
    },
    stack: {
      label: "THE LUMI STACK",
      title: "From a question to an outcome.",
      assistant: {
        name: "Lumi Autonomous Assistant",
        role: "Delegate anything",
        desc: "One front door for work across browser, desktop, files and connected tools."
      },
      products: [
        { name: "Lumi AI Workspace", role: "Coordinate", desc: "People and AI keep decisions, commitments and operating work clear." },
        { name: "Lumi BI", role: "Understand", desc: "Ask business questions and trace answers back to evidence." },
        { name: "Lumi Agents", role: "Execute", desc: "Agentic staff take defined jobs, use tools and return inspectable work." }
      ],
      foundationTitle: "Lumi Company Context",
      foundation: "Memory · evidence · permissions · workflows · models · audit",
      systems: "Your existing software",
      systemsList: "ERP · CRM · Email · Chat · Sheets · Ecommerce · Files · Databases · Browser · APIs"
    },
    day: {
      label: "A DAY WITH LUMI",
      title: "The stack makes sense when the work moves through it.",
      body: "Instead of opening four products, the company experiences one continuous operating loop.",
      moments: [
        { time: "08:05", title: "See what needs attention.", body: "The CEO opens Lumi AI Workspace. Decisions, customer risks and an overdue payment are ranked with sources." },
        { time: "10:20", title: "Understand what changed.", body: "Lumi BI notices margin erosion in an ecommerce channel and traces the change to affected products, promotions and order mix." },
        { time: "10:22", title: "Give the investigation away.", body: "A Lumi Agent checks the relevant records, reconciles the numbers and prepares the exception list for review." },
        { time: "14:40", title: "Delegate in plain language.", body: "“Fix the report and send Nga the updated file.” Lumi Assistant works across files and connected tools, with approval where it matters." }
      ]
    },
    context: {
      label: "ONE COMPANY MEMORY",
      title: "Every Lumi product works from the same business context.",
      body: "Customers, orders, projects, messages and documents stop being separate islands. Lumi connects the context around the work so an answer can become a decision, and a decision can become an action.",
      inputs: ["Customers", "Orders", "Projects", "Messages", "Documents", "Software", "People"],
      center: "Company context",
      outputs: ["Understand", "Decide", "Act"],
      proofTitle: "Evidence stays attached.",
      proofBody: "A useful AI system should show where an answer came from, how fresh it is, and when a person should review it."
    },
    productsLabel: "THE PRODUCTS",
    productsTitle: "Different surfaces. One operating system.",
    products: [
      {
        index: "01", name: "Lumi AI Workspace", kicker: "WORK TOGETHER",
        title: "Where people and AI run the company together.",
        body: "Turn daily operating signals into clear decisions, commitments, risks and next actions. Keep leadership informed without turning the company into a surveillance dashboard.",
        examples: ["CEO operating brief", "Decisions & commitments", "Projects & recurring work", "Source-linked AI insight"],
        demo: {
          label: "OPERATING BRIEF",
          rows: [
            { key: "DECISION", value: "Next action is waiting", meta: "Owner · due · source" },
            { key: "RISK", value: "Customer signal needs review", meta: "Evidence attached" },
            { key: "COMMITMENT", value: "Follow-up is overdue", meta: "Age · owner · next step" }
          ]
        }
      },
      {
        index: "02", name: "Lumi BI", kicker: "UNDERSTAND",
        title: "Ask the business. See the evidence.",
        body: "Connect commerce and operational data, ask questions in plain language and move from a metric to the records behind it. Dashboards become a starting point, not the end of analysis.",
        examples: ["Commerce intelligence", "Natural-language analysis", "Custom dashboards", "Source & freshness trace"],
        demo: {
          label: "TRACE THE ANSWER",
          rows: [
            { key: "METRIC", value: "What changed?", meta: "Revenue · margin · orders" },
            { key: "DRIVERS", value: "Why did it change?", meta: "Products · channels · campaigns" },
            { key: "RECORDS", value: "Show the evidence", meta: "Source · freshness · rows" }
          ]
        }
      },
      {
        index: "03", name: "Lumi Agents", kicker: "EXECUTE",
        title: "Add agentic staff to the team.",
        body: "Give AI workers bounded roles, tools and goals. They can perform repeatable digital work, keep a worklog, surface exceptions and ask for approval before consequential actions.",
        examples: ["Sales operations", "Ads operations", "Finance workflows", "Research & back office"],
        demo: {
          label: "AGENT RUN",
          rows: [
            { key: "GOAL", value: "A bounded job", meta: "Scope · success condition" },
            { key: "TOOLS", value: "Only what the role needs", meta: "Browser · files · apps" },
            { key: "WORKLOG", value: "Every material step", meta: "Attempted · executed · verified" },
            { key: "APPROVAL", value: "Human when it matters", meta: "Safe reject · clear effect" }
          ]
        }
      },
      {
        index: "04", name: "Lumi Autonomous Assistant", kicker: "DELEGATE",
        title: "Give it a job. It uses the tools.",
        body: "The assistant is the front door to the Lumi stack: a direct way to delegate multi-step work across browser, desktop, files and connected systems without needing to know which product should handle each step.",
        examples: ["Browser work", "Desktop & files", "Connected tools", "Human approval"],
        demo: {
          label: "DELEGATE",
          rows: [
            { key: "REQUEST", value: "“Find the cause. Fix the report.”", meta: "Plain language" },
            { key: "ROUTE", value: "BI → Agent → Files", meta: "Lumi chooses the path" },
            { key: "RESULT", value: "Prepared for review", meta: "Evidence · changes · exceptions" }
          ]
        }
      }
    ],
    existing: {
      label: "WORK WITH WHAT YOU HAVE",
      title: "Don't replace the SME software stack. Make it intelligent.",
      body: "Lumi is designed to sit across the tools a company already depends on. Start with one painful workflow, connect the minimum context needed, prove the result, then expand.",
      steps: [
        { n: "01", t: "Connect", d: "Use the existing systems, files and APIs that already contain the work." },
        { n: "02", t: "Understand", d: "Build the business context, definitions and evidence needed to see clearly." },
        { n: "03", t: "Decide", d: "Bring options, limits and source-backed recommendations to the accountable person." },
        { n: "04", t: "Act", d: "Let people and agents execute with explicit permissions, approvals and an audit trail." }
      ]
    },
    trust: {
      label: "TRUST IS PART OF THE PRODUCT",
      title: "Useful enough to act on. Clear enough to verify.",
      items: [
        { title: "Evidence", body: "Keep sources, freshness and uncertainty close to important claims." },
        { title: "Permissions", body: "Agents should only reach the systems and actions their role requires." },
        { title: "Human judgment", body: "Keep approval with a person when money, customers, publishing or other consequential actions are involved." },
        { title: "Inspectable work", body: "Separate planned, attempted, executed and verified. Keep the worklog visible." }
      ]
    },
    cta: {
      label: "START WITH ONE REAL WORKFLOW",
      title: "Show us how the work happens today.",
      body: "We will identify where AI can understand, decide or act without forcing your team to replace the software they already use.",
      primary: "Talk to Lumi",
      secondary: "hello@runlumi.app"
    },
    footer: { line: "AI operating systems for real companies.", rights: "© 2026 Cloudjet Solutions Pte. Ltd." }
  },

  vi: {
    lang: "vi",
    path: "/vi",
    switchPath: "/",
    switchLabel: "EN",
    meta: {
      title: "Lumi — Lớp vận hành AI cho doanh nghiệp",
      description: "Lumi kết nối với phần mềm, dữ liệu và quy trình doanh nghiệp đang dùng để giúp con người hiểu tình hình, ra quyết định và giao việc cho AI."
    },
    nav: { products: "Sản phẩm", how: "Cách hoạt động", trust: "Tin cậy", contact: "Trao đổi với Lumi" },
    hero: {
      eyebrow: "LUMI / LỚP VẬN HÀNH AI",
      titleA: "Doanh nghiệp đã có phần mềm.",
      titleB: "Hãy thêm trí tuệ.",
      body: "Lumi làm việc trên những công cụ, dữ liệu và quy trình doanh nghiệp đang dùng. Hiểu tình hình, phối hợp công việc, giao việc cho nhân sự AI và vẫn để con người kiểm soát.",
      primary: "Khám phá Lumi stack",
      secondary: "Trao đổi với Lumi",
      note: "Giữ hệ thống hiện tại. Thêm một lớp trí tuệ.",
      systemLabel: "LUMI / HỆ VẬN HÀNH",
      systemItems: [
        { n: "01", role: "Cửa vào", name: "Autonomous Assistant" },
        { n: "02", role: "Phối hợp", name: "AI Workspace" },
        { n: "03", role: "Hiểu", name: "Lumi BI" },
        { n: "04", role: "Thực thi", name: "Lumi Agents" }
      ],
      systemFoot: "Một ngữ cảnh · nhiều công cụ · con người phán đoán"
    },
    thesis: {
      label: "LUẬN ĐIỂM",
      title: "Một lớp vận hành. Bốn cách làm việc.",
      body: "AI không nên trở thành thêm một ứng dụng rời rạc. Lumi tạo một nơi chung để con người làm việc cùng AI, một cách để hiểu doanh nghiệp, đội ngũ agent có thể thực thi, và một trợ lý có thể đi xuyên suốt toàn hệ thống."
    },
    loop: {
      label: "VÒNG VẬN HÀNH",
      items: [
        { n: "01", title: "Kết nối", body: "Đưa vào những hệ thống và bằng chứng nơi công việc vốn đang tồn tại." },
        { n: "02", title: "Hiểu", body: "Biến tín hiệu rời rạc thành business context chung." },
        { n: "03", title: "Quyết định", body: "Đưa đúng bằng chứng, lựa chọn và giới hạn đến người chịu trách nhiệm." },
        { n: "04", title: "Hành động", body: "Cho con người và agent thực thi với quyền hạn, phê duyệt và worklog." }
      ]
    },
    stack: {
      label: "LUMI STACK",
      title: "Từ một câu hỏi đến kết quả thực tế.",
      assistant: {
        name: "Lumi Autonomous Assistant",
        role: "Giao bất kỳ việc gì",
        desc: "Một cửa vào duy nhất cho công việc trên trình duyệt, máy tính, tệp và các công cụ kết nối."
      },
      products: [
        { name: "Lumi AI Workspace", role: "Phối hợp", desc: "Con người và AI cùng giữ quyết định, cam kết và công việc vận hành rõ ràng." },
        { name: "Lumi BI", role: "Hiểu", desc: "Hỏi doanh nghiệp bằng ngôn ngữ tự nhiên và truy ngược câu trả lời về bằng chứng." },
        { name: "Lumi Agents", role: "Thực thi", desc: "Nhân sự AI nhận công việc xác định, dùng công cụ và trả lại kết quả có thể kiểm tra." }
      ],
      foundationTitle: "Lumi Company Context",
      foundation: "Bộ nhớ · bằng chứng · quyền hạn · quy trình · mô hình · nhật ký",
      systems: "Phần mềm doanh nghiệp đang dùng",
      systemsList: "ERP · CRM · Email · Chat · Sheets · Ecommerce · Tệp · Cơ sở dữ liệu · Trình duyệt · API"
    },
    day: {
      label: "MỘT NGÀY VỚI LUMI",
      title: "Lumi stack rõ nhất khi công việc chạy xuyên suốt hệ thống.",
      body: "Doanh nghiệp không cần cảm thấy mình đang mở bốn sản phẩm. Trải nghiệm nên là một vòng vận hành liên tục.",
      moments: [
        { time: "08:05", title: "Biết việc gì cần chú ý.", body: "CEO mở Lumi AI Workspace. Các quyết định, rủi ro khách hàng và một khoản thanh toán quá hạn đã được xếp ưu tiên kèm nguồn." },
        { time: "10:20", title: "Hiểu điều gì vừa thay đổi.", body: "Lumi BI phát hiện biên lợi nhuận của một kênh ecommerce giảm và truy nguyên về nhóm sản phẩm, khuyến mãi và cơ cấu đơn hàng." },
        { time: "10:22", title: "Giao phần điều tra cho AI.", body: "Một Lumi Agent kiểm tra dữ liệu liên quan, đối soát số liệu và chuẩn bị danh sách ngoại lệ để con người rà soát." },
        { time: "14:40", title: "Giao việc bằng ngôn ngữ bình thường.", body: "“Sửa báo cáo và gửi file mới cho Nga.” Lumi Assistant làm việc trên tệp và các công cụ đã kết nối, yêu cầu phê duyệt ở nơi cần thiết." }
      ]
    },
    context: {
      label: "MỘT BỘ NHỚ DOANH NGHIỆP",
      title: "Mọi sản phẩm Lumi cùng làm việc trên một business context.",
      body: "Khách hàng, đơn hàng, dự án, tin nhắn và tài liệu không còn là những hòn đảo dữ liệu. Lumi nối ngữ cảnh quanh công việc để một câu trả lời có thể thành quyết định, và quyết định có thể thành hành động.",
      inputs: ["Khách hàng", "Đơn hàng", "Dự án", "Tin nhắn", "Tài liệu", "Phần mềm", "Con người"],
      center: "Company context",
      outputs: ["Hiểu", "Quyết định", "Hành động"],
      proofTitle: "Bằng chứng luôn đi cùng kết luận.",
      proofBody: "Một hệ thống AI hữu ích phải cho biết câu trả lời đến từ đâu, dữ liệu mới đến mức nào và khi nào cần con người kiểm tra."
    },
    productsLabel: "CÁC SẢN PHẨM",
    productsTitle: "Nhiều bề mặt. Một hệ vận hành.",
    products: [
      {
        index: "01", name: "Lumi AI Workspace", kicker: "PHỐI HỢP",
        title: "Nơi con người và AI cùng điều hành công việc.",
        body: "Biến tín hiệu vận hành hằng ngày thành quyết định, cam kết, rủi ro và bước tiếp theo rõ ràng. Giúp lãnh đạo nắm tình hình mà không biến công ty thành dashboard giám sát.",
        examples: ["CEO operating brief", "Quyết định & cam kết", "Dự án & công việc định kỳ", "AI insight có nguồn"],
        demo: {
          label: "OPERATING BRIEF",
          rows: [
            { key: "QUYẾT ĐỊNH", value: "Bước tiếp theo đang chờ", meta: "Owner · hạn · nguồn" },
            { key: "RỦI RO", value: "Tín hiệu khách hàng cần xem", meta: "Có bằng chứng" },
            { key: "CAM KẾT", value: "Follow-up đã quá hạn", meta: "Tuổi · owner · bước tiếp" }
          ]
        }
      },
      {
        index: "02", name: "Lumi BI", kicker: "HIỂU",
        title: "Hỏi doanh nghiệp. Xem bằng chứng.",
        body: "Kết nối dữ liệu thương mại và vận hành, đặt câu hỏi bằng ngôn ngữ tự nhiên và đi từ một chỉ số về tận những bản ghi tạo ra nó. Dashboard là điểm bắt đầu, không phải điểm kết thúc của phân tích.",
        examples: ["Commerce intelligence", "Phân tích bằng ngôn ngữ tự nhiên", "Dashboard tùy biến", "Nguồn & độ mới dữ liệu"],
        demo: {
          label: "TRUY NGƯỢC CÂU TRẢ LỜI",
          rows: [
            { key: "CHỈ SỐ", value: "Điều gì thay đổi?", meta: "Doanh thu · biên · đơn hàng" },
            { key: "ĐỘNG LỰC", value: "Vì sao thay đổi?", meta: "Sản phẩm · kênh · chiến dịch" },
            { key: "BẢN GHI", value: "Xem bằng chứng", meta: "Nguồn · độ mới · dữ liệu" }
          ]
        }
      },
      {
        index: "03", name: "Lumi Agents", kicker: "THỰC THI",
        title: "Thêm nhân sự AI vào đội ngũ.",
        body: "Giao cho AI vai trò, công cụ và mục tiêu có ranh giới rõ. Agent thực hiện công việc số lặp lại, lưu worklog, đưa ngoại lệ lên cho người phụ trách và xin phê duyệt trước hành động quan trọng.",
        examples: ["Sales operations", "Ads operations", "Finance workflows", "Research & back office"],
        demo: {
          label: "AGENT RUN",
          rows: [
            { key: "MỤC TIÊU", value: "Một công việc có ranh giới", meta: "Phạm vi · điều kiện thành công" },
            { key: "CÔNG CỤ", value: "Chỉ những gì vai trò cần", meta: "Browser · file · ứng dụng" },
            { key: "WORKLOG", value: "Mọi bước quan trọng", meta: "Đã thử · thực thi · xác minh" },
            { key: "PHÊ DUYỆT", value: "Con người khi cần", meta: "Từ chối an toàn · hiệu ứng rõ" }
          ]
        }
      },
      {
        index: "04", name: "Lumi Autonomous Assistant", kicker: "GIAO VIỆC",
        title: "Giao một việc. Lumi tự dùng công cụ phù hợp.",
        body: "Assistant là cửa vào của toàn bộ Lumi stack: cách trực tiếp để giao công việc nhiều bước trên trình duyệt, máy tính, tệp và hệ thống kết nối mà người dùng không cần biết mỗi bước thuộc sản phẩm nào.",
        examples: ["Trình duyệt", "Máy tính & tệp", "Công cụ kết nối", "Phê duyệt của con người"],
        demo: {
          label: "GIAO VIỆC",
          rows: [
            { key: "YÊU CẦU", value: "“Tìm nguyên nhân. Sửa báo cáo.”", meta: "Ngôn ngữ bình thường" },
            { key: "ĐỊNH TUYẾN", value: "BI → Agent → Files", meta: "Lumi chọn đường đi" },
            { key: "KẾT QUẢ", value: "Sẵn sàng để rà soát", meta: "Bằng chứng · thay đổi · ngoại lệ" }
          ]
        }
      }
    ],
    existing: {
      label: "LÀM VIỆC VỚI HỆ THỐNG HIỆN CÓ",
      title: "Đừng thay toàn bộ phần mềm SME. Hãy làm nó thông minh hơn.",
      body: "Lumi được thiết kế để nằm trên các công cụ doanh nghiệp đang phụ thuộc. Bắt đầu từ một workflow đau thật, kết nối lượng ngữ cảnh tối thiểu cần thiết, chứng minh kết quả rồi mới mở rộng.",
      steps: [
        { n: "01", t: "Kết nối", d: "Dùng chính hệ thống, tệp và API đang chứa công việc." },
        { n: "02", t: "Hiểu", d: "Xây business context, định nghĩa và bằng chứng cần thiết để nhìn rõ tình hình." },
        { n: "03", t: "Quyết định", d: "Đưa lựa chọn, giới hạn và đề xuất có nguồn đến đúng người chịu trách nhiệm." },
        { n: "04", t: "Hành động", d: "Cho con người và agent thực thi với quyền hạn, phê duyệt và audit trail rõ ràng." }
      ]
    },
    trust: {
      label: "TIN CẬY LÀ MỘT PHẦN CỦA SẢN PHẨM",
      title: "Đủ hữu ích để hành động. Đủ rõ để kiểm tra.",
      items: [
        { title: "Bằng chứng", body: "Đặt nguồn, độ mới và mức bất định gần những kết luận quan trọng." },
        { title: "Quyền hạn", body: "Agent chỉ nên truy cập hệ thống và hành động đúng với vai trò được giao." },
        { title: "Phán đoán của con người", body: "Giữ phê duyệt ở con người khi liên quan tới tiền, khách hàng, xuất bản hoặc hành động có hậu quả đáng kể." },
        { title: "Công việc kiểm tra được", body: "Tách rõ dự kiến, đã thử, đã thực thi và đã xác minh. Worklog luôn có thể xem lại." }
      ]
    },
    cta: {
      label: "BẮT ĐẦU TỪ MỘT WORKFLOW THẬT",
      title: "Cho chúng tôi xem công việc hiện đang diễn ra thế nào.",
      body: "Lumi sẽ tìm nơi AI có thể hiểu, quyết định hoặc hành động mà không bắt đội ngũ thay phần mềm họ đang dùng.",
      primary: "Trao đổi với Lumi",
      secondary: "hello@runlumi.app"
    },
    footer: { line: "Hệ vận hành AI cho doanh nghiệp thực.", rights: "© 2026 Cloudjet Solutions Pte. Ltd." }
  }
} as const;

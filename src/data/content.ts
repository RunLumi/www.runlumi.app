export const content = {
  en: {
    lang: "en",
    path: "/",
    switchPath: "/vi",
    switchLabel: "VI",
    meta: {
      title: "Lumi — Make your company work as one",
      description: "Lumi connects the software, data and daily work you already have, so your team can see clearly, decide faster and get work done."
    },
    nav: { products: "Products", how: "How it works", trust: "Trust", contact: "Talk to us" },
    hero: {
      eyebrow: "LUMI / OPERATING LAYER",
      titleA: "Your company already has the tools.",
      titleB: "Make them work as one.",
      body: "Lumi connects the software, data and daily work you already have, so your team can see clearly, decide faster and get work done.",
      primary: "See how Lumi works",
      secondary: "Talk to us",
      note: "Keep what works. Add Lumi.",
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
      title: "One company. One operating layer.",
      body: "Workspace, BI, agents and assistant share the same context, so work can move from signal to decision to action without falling between tools."
    },
    reality: {
      label: "REAL WORK, NOT A DEMO",
      title: "Lumi belongs where the work already happens.",
      body: "At the counter. In the warehouse. Around the numbers. The technology should disappear behind the job.",
      images: [
        {
          src: "https://images.unsplash.com/photo-1765979831303-0debe3c65b9f?auto=format&fit=crop&w=1600&q=82",
          alt: "Small business worker behind a shop counter",
          caption: "Sales & service",
          credit: "Yunshuo Qu",
          href: "https://unsplash.com/photos/OyIir_3JAAY"
        },
        {
          src: "https://images.unsplash.com/photo-1774273177331-4c19e9912071?auto=format&fit=crop&w=1600&q=82",
          alt: "Person walking through a stocked warehouse aisle",
          caption: "Operations & stock",
          credit: "Tianlei Wu",
          href: "https://unsplash.com/photos/sf6YUxvCoro"
        },
        {
          src: "https://images.unsplash.com/photo-1772588627373-729b0f47e5bb?auto=format&fit=crop&w=1600&q=82",
          alt: "Hands reviewing paperwork with a calculator and laptop",
          caption: "Numbers & decisions",
          credit: "Kelly Sikkema",
          href: "https://unsplash.com/photos/tLqtcDZltPs"
        }
      ]
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
      title: "See the whole company. Move the work.",
      assistant: {
        name: "Lumi Autonomous Assistant",
        role: "Ask. Delegate. Follow through.",
        desc: "One place to ask, delegate and follow work across the tools your team already uses."
      },
      products: [
        { name: "Lumi AI Workspace", role: "Coordinate", desc: "Keep priorities, decisions and commitments clear." },
        { name: "Lumi BI", role: "Understand", desc: "See what changed, why, and the records behind it." },
        { name: "Lumi Agents", role: "Execute", desc: "Give repeatable work a clear owner, boundaries and review." }
      ],
      foundationTitle: "Lumi Company Context",
      foundation: "Memory · evidence · permissions · workflows · audit",
      systems: "Your existing software",
      systemsList: "ERP · CRM · Email · Chat · Sheets · Ecommerce · Files · Databases · Browser · APIs"
    },
    day: {
      label: "A DAY WITH LUMI",
      title: "A normal day, with less chasing.",
      body: "Lumi stays in the flow of work. People do not have to stitch four products together.",
      moments: [
        { time: "08:05", title: "See what needs attention.", body: "The CEO opens Lumi AI Workspace. Decisions, customer risks and an overdue payment are ranked with sources." },
        { time: "10:20", title: "Understand what changed.", body: "Lumi BI notices margin erosion in an ecommerce channel and traces the change to affected products, promotions and order mix." },
        { time: "10:22", title: "Hand off the investigation.", body: "A Lumi Agent checks the records, reconciles the numbers and brings back only the exceptions." },
        { time: "14:40", title: "Delegate in plain language.", body: "“Fix the report and send Nga the updated file.” Lumi Assistant works across files and connected tools, with approval where it matters." }
      ]
    },
    context: {
      label: "ONE COMPANY MEMORY",
      title: "One company memory, shared across the stack.",
      body: "Customers, orders, projects, messages and documents stay connected, so a question can become a decision and a decision can become action.",
      inputs: ["Customers", "Orders", "Projects", "Messages", "Documents", "Software", "People"],
      center: "Company context",
      outputs: ["Understand", "Decide", "Act"],
      proofTitle: "Evidence stays attached.",
      proofBody: "See where an answer came from, how fresh it is, and when a person should review it."
    },
    productsLabel: "THE PRODUCTS",
    productsTitle: "Four surfaces. One flow of work.",
    products: [
      {
        index: "01", name: "Lumi AI Workspace", kicker: "WORK TOGETHER",
        title: "Know what needs attention.",
        body: "Bring decisions, commitments, risks and next actions into one clear operating view.",
        examples: ["CEO operating brief", "Decisions & commitments", "Projects & recurring work", "Source-linked insight"],
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
        title: "Ask the business. Follow the evidence.",
        body: "Ask in plain language, move from a metric to its drivers, then down to the records behind it.",
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
        title: "Give repeatable work a clear owner.",
        body: "Give agents a clear job, the right tools and firm boundaries. Review the worklog and approve when needed.",
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
        title: "Just ask. Lumi finds the path.",
        body: "Ask in plain language. Lumi routes the work across browser, files and connected systems, then brings the result back for review.",
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
      body: "Start with one workflow that wastes time today. Connect only what it needs, prove the result, then expand.",
      steps: [
        { n: "01", t: "Connect", d: "Use the existing systems, files and APIs that already contain the work." },
        { n: "02", t: "Understand", d: "Build the business context, definitions and evidence needed to see clearly." },
        { n: "03", t: "Decide", d: "Bring options, limits and source-backed recommendations to the accountable person." },
        { n: "04", t: "Act", d: "Let people and agents execute with explicit permissions, approvals and an audit trail." }
      ]
    },
    trust: {
      label: "TRUST IS PART OF THE PRODUCT",
      title: "Trust comes from being able to check.",
      items: [
        { title: "Evidence", body: "Keep sources, freshness and uncertainty close to important claims." },
        { title: "Permissions", body: "Agents should only reach the systems and actions their role requires." },
        { title: "Human judgment", body: "Keep approval with a person when money, customers, publishing or other consequential actions are involved." },
        { title: "Inspectable work", body: "Separate planned, attempted, executed and verified. Keep the worklog visible." }
      ]
    },
    cta: {
      label: "START WITH ONE REAL WORKFLOW",
      title: "Start with one workflow that wastes time today.",
      body: "Show us one job that is slow, repetitive or easy to lose between tools. We will start there.",
      primary: "Talk to Lumi",
      secondary: "hello@runlumi.app"
    },
    footer: { line: "One operating layer for real companies.", rights: "© 2026 Cloudjet Solutions Pte. Ltd." }
  },

  vi: {
    lang: "vi",
    path: "/vi",
    switchPath: "/",
    switchLabel: "EN",
    meta: {
      title: "Lumi — Giúp doanh nghiệp vận hành như một thể thống nhất",
      description: "Lumi kết nối phần mềm, dữ liệu và công việc hằng ngày để đội ngũ nhìn rõ hơn, quyết nhanh hơn và làm việc trôi chảy hơn."
    },
    nav: { products: "Sản phẩm", how: "Cách hoạt động", trust: "Tin cậy", contact: "Trao đổi với Lumi" },
    hero: {
      eyebrow: "LUMI / LỚP VẬN HÀNH",
      titleA: "Doanh nghiệp đã có đủ công cụ.",
      titleB: "Lumi giúp chúng cùng làm việc.",
      body: "Lumi kết nối phần mềm, dữ liệu và công việc hằng ngày để đội ngũ nhìn rõ hơn, quyết nhanh hơn và làm việc trôi chảy hơn.",
      primary: "Xem Lumi hoạt động",
      secondary: "Trao đổi với Lumi",
      note: "Giữ hệ thống đang dùng. Thêm Lumi.",
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
      title: "Một doanh nghiệp. Một lớp vận hành.",
      body: "Workspace, BI, agent và assistant dùng chung ngữ cảnh, để công việc đi từ tín hiệu đến quyết định rồi hành động mà không bị đứt đoạn giữa các công cụ."
    },
    reality: {
      label: "CÔNG VIỆC THẬT, KHÔNG PHẢI DEMO",
      title: "Lumi nên hiện diện đúng nơi công việc đang diễn ra.",
      body: "Ở quầy bán hàng. Trong kho. Bên những con số. Công nghệ nên lùi lại để công việc tiến lên.",
      images: [
        {
          src: "https://images.unsplash.com/photo-1765979831303-0debe3c65b9f?auto=format&fit=crop&w=1600&q=82",
          alt: "Người vận hành một cửa hàng nhỏ tại quầy",
          caption: "Bán hàng & phục vụ",
          credit: "Yunshuo Qu",
          href: "https://unsplash.com/photos/OyIir_3JAAY"
        },
        {
          src: "https://images.unsplash.com/photo-1774273177331-4c19e9912071?auto=format&fit=crop&w=1600&q=82",
          alt: "Một người đi giữa lối kho đầy hàng hóa",
          caption: "Vận hành & tồn kho",
          credit: "Tianlei Wu",
          href: "https://unsplash.com/photos/sf6YUxvCoro"
        },
        {
          src: "https://images.unsplash.com/photo-1772588627373-729b0f47e5bb?auto=format&fit=crop&w=1600&q=82",
          alt: "Đôi tay đang xem giấy tờ bên cạnh máy tính cầm tay và laptop",
          caption: "Số liệu & quyết định",
          credit: "Kelly Sikkema",
          href: "https://unsplash.com/photos/tLqtcDZltPs"
        }
      ]
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
      title: "Nhìn rõ toàn công ty. Đẩy công việc đi tiếp.",
      assistant: {
        name: "Lumi Autonomous Assistant",
        role: "Hỏi. Giao việc. Theo đến cùng.",
        desc: "Một nơi để hỏi, giao việc và theo dõi công việc trên những công cụ đội ngũ đang dùng."
      },
      products: [
        { name: "Lumi AI Workspace", role: "Phối hợp", desc: "Giữ ưu tiên, quyết định và cam kết rõ ràng." },
        { name: "Lumi BI", role: "Hiểu", desc: "Biết điều gì thay đổi, vì sao và dữ liệu nào đứng sau." },
        { name: "Lumi Agents", role: "Thực thi", desc: "Giao việc lặp lại với phạm vi rõ và luôn có thể kiểm tra." }
      ],
      foundationTitle: "Lumi Company Context",
      foundation: "Bộ nhớ · bằng chứng · quyền hạn · quy trình · nhật ký",
      systems: "Phần mềm doanh nghiệp đang dùng",
      systemsList: "ERP · CRM · Email · Chat · Sheets · Ecommerce · Tệp · Cơ sở dữ liệu · Trình duyệt · API"
    },
    day: {
      label: "MỘT NGÀY VỚI LUMI",
      title: "Một ngày bình thường, bớt đuổi theo công việc.",
      body: "Lumi nằm trong dòng công việc. Mọi người không cần tự nối bốn sản phẩm với nhau.",
      moments: [
        { time: "08:05", title: "Biết việc gì cần chú ý.", body: "CEO mở Lumi AI Workspace. Các quyết định, rủi ro khách hàng và một khoản thanh toán quá hạn đã được xếp ưu tiên kèm nguồn." },
        { time: "10:20", title: "Hiểu điều gì vừa thay đổi.", body: "Lumi BI phát hiện biên lợi nhuận của một kênh ecommerce giảm và truy nguyên về nhóm sản phẩm, khuyến mãi và cơ cấu đơn hàng." },
        { time: "10:22", title: "Giao phần kiểm tra cho agent.", body: "Lumi Agent kiểm tra dữ liệu, đối soát số liệu và chỉ đưa những ngoại lệ cần người xem." },
        { time: "14:40", title: "Giao việc bằng ngôn ngữ bình thường.", body: "“Sửa báo cáo và gửi file mới cho Nga.” Lumi Assistant làm việc trên tệp và các công cụ đã kết nối, yêu cầu phê duyệt ở nơi cần thiết." }
      ]
    },
    context: {
      label: "MỘT BỘ NHỚ DOANH NGHIỆP",
      title: "Một bộ nhớ chung cho cả doanh nghiệp.",
      body: "Khách hàng, đơn hàng, dự án, tin nhắn và tài liệu được nối lại với nhau, để câu hỏi đi đến quyết định rồi thành hành động.",
      inputs: ["Khách hàng", "Đơn hàng", "Dự án", "Tin nhắn", "Tài liệu", "Phần mềm", "Con người"],
      center: "Company context",
      outputs: ["Hiểu", "Quyết định", "Hành động"],
      proofTitle: "Bằng chứng luôn đi cùng kết luận.",
      proofBody: "Luôn thấy câu trả lời đến từ đâu, dữ liệu mới đến mức nào và khi nào cần người kiểm tra."
    },
    productsLabel: "CÁC SẢN PHẨM",
    productsTitle: "Bốn bề mặt. Một dòng công việc.",
    products: [
      {
        index: "01", name: "Lumi AI Workspace", kicker: "PHỐI HỢP",
        title: "Biết ngay việc gì cần chú ý.",
        body: "Gom quyết định, cam kết, rủi ro và bước tiếp theo vào một góc nhìn vận hành rõ ràng.",
        examples: ["CEO operating brief", "Quyết định & cam kết", "Dự án & công việc định kỳ", "Kết luận có nguồn"],
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
        title: "Hỏi doanh nghiệp. Lần theo bằng chứng.",
        body: "Hỏi bằng ngôn ngữ bình thường, đi từ chỉ số đến nguyên nhân rồi xuống tận dữ liệu gốc.",
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
        title: "Giao việc lặp lại cho agent. Luôn biết việc đang đến đâu.",
        body: "Giao việc rõ, đúng công cụ, đúng phạm vi. Xem worklog và duyệt khi cần.",
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
        title: "Cứ giao việc. Lumi tự tìm đường.",
        body: "Nói như cách vẫn giao việc cho đồng đội. Lumi đi qua trình duyệt, tệp và hệ thống cần thiết rồi mang kết quả về để rà soát.",
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
      title: "Giữ những hệ thống đang chạy tốt. Giúp chúng làm việc cùng nhau.",
      body: "Bắt đầu từ một việc đang làm mất thời gian mỗi ngày. Chỉ kết nối những gì cần, chứng minh hiệu quả rồi mới mở rộng.",
      steps: [
        { n: "01", t: "Kết nối", d: "Dùng chính hệ thống, tệp và API đang chứa công việc." },
        { n: "02", t: "Hiểu", d: "Xây business context, định nghĩa và bằng chứng cần thiết để nhìn rõ tình hình." },
        { n: "03", t: "Quyết định", d: "Đưa lựa chọn, giới hạn và đề xuất có nguồn đến đúng người chịu trách nhiệm." },
        { n: "04", t: "Hành động", d: "Cho con người và agent thực thi với quyền hạn, phê duyệt và audit trail rõ ràng." }
      ]
    },
    trust: {
      label: "TIN CẬY LÀ MỘT PHẦN CỦA SẢN PHẨM",
      title: "Tin cậy vì luôn kiểm tra được.",
      items: [
        { title: "Bằng chứng", body: "Đặt nguồn, độ mới và mức bất định gần những kết luận quan trọng." },
        { title: "Quyền hạn", body: "Agent chỉ nên truy cập hệ thống và hành động đúng với vai trò được giao." },
        { title: "Phán đoán của con người", body: "Giữ phê duyệt ở con người khi liên quan tới tiền, khách hàng, xuất bản hoặc hành động có hậu quả đáng kể." },
        { title: "Công việc kiểm tra được", body: "Tách rõ dự kiến, đã thử, đã thực thi và đã xác minh. Worklog luôn có thể xem lại." }
      ]
    },
    cta: {
      label: "BẮT ĐẦU TỪ MỘT WORKFLOW THẬT",
      title: "Bắt đầu từ một việc đang tốn thời gian mỗi ngày.",
      body: "Cho Lumi xem một việc đang chậm, lặp lại hoặc dễ rơi rớt giữa nhiều công cụ. Ta bắt đầu từ đó.",
      primary: "Trao đổi với Lumi",
      secondary: "hello@runlumi.app"
    },
    footer: { line: "Một lớp vận hành cho doanh nghiệp thực.", rights: "© 2026 Cloudjet Solutions Pte. Ltd." }
  }
} as const;

export const content = {
  en: {
    lang: "en",
    path: "/",
    switchPath: "/vi",
    switchLabel: "VI",
    meta: {
      title: "Lumi — Make your tools work together",
      description: "Lumi connects the tools and work your company already has, so people can see clearly, decide with context and move work forward."
    },
    nav: { products: "What Lumi does", how: "How it works", trust: "Trust", contact: "Talk to us" },
    hero: {
      eyebrow: "LUMI / ONE OPERATING LAYER",
      titleA: "Your company already has the tools.",
      titleB: "Lumi makes them work together.",
      body: "One place to see what matters, understand what changed and move work forward across the systems you already use.",
      primary: "See how Lumi works",
      secondary: "Talk to us",
      note: "Keep what works. Add Lumi.",
      systemLabel: "ONE WAY IN · THREE WAYS TO WORK",
      systemItems: [
        { n: "01", role: "Coordinate", name: "AI Workspace" },
        { n: "02", role: "Understand", name: "Lumi BI" },
        { n: "03", role: "Act", name: "Lumi Agents" }
      ],
      systemFoot: "Shared context · clear authority · evidence attached"
    },
    thesis: {
      label: "THE IDEA",
      title: "One company. One operating layer.",
      body: "The assistant is the front door. Workspace keeps work clear. BI explains what changed. Agents carry out repeatable jobs. Everything shares the same company context."
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
        { n: "01", title: "Connect", body: "Use the systems you already have." },
        { n: "02", title: "Understand", body: "Turn scattered signals into one clear picture." },
        { n: "03", title: "Decide", body: "Put the right evidence in front of the right person." },
        { n: "04", title: "Act", body: "Move the work, with approval where it matters." }
      ]
    },
    stack: {
      label: "HOW LUMI FITS",
      title: "One way in. Three ways to move the work.",
      assistant: {
        name: "Lumi Assistant",
        role: "Ask. Delegate. Follow through.",
        desc: "The front door to Lumi. Ask in plain language; Lumi routes the work."
      },
      products: [
        { name: "Lumi AI Workspace", role: "Coordinate", desc: "Keep priorities, decisions and commitments clear." },
        { name: "Lumi BI", role: "Understand", desc: "See what changed, why, and the records behind it." },
        { name: "Lumi Agents", role: "Act", desc: "Run repeatable work within clear limits, with review when needed." }
      ],
      foundationTitle: "Shared company context",
      foundation: "Memory · evidence · permissions · workflow state",
      gatewayTitle: "Controlled actions",
      gateway: "Permissions · approvals · verification",
      systems: "Your existing systems",
      systemsList: "ERP · CRM · Email · Chat · Sheets · Ecommerce · Files · Databases · Browser · APIs"
    },
    day: {
      label: "A DAY WITH LUMI",
      title: "A normal day, with less chasing.",
      body: "The work moves through Lumi without people having to think about which part does what.",
      moments: [
        { time: "08:05", title: "See what needs attention.", body: "The CEO opens Lumi AI Workspace. Decisions, customer risks and an overdue payment are ranked with sources." },
        { time: "10:20", title: "Understand what changed.", body: "Lumi BI notices margin erosion in an ecommerce channel and traces the change to affected products, promotions and order mix." },
        { time: "10:22", title: "Hand off the investigation.", body: "A Lumi Agent checks the records, reconciles the numbers and brings back only the exceptions." },
        { time: "14:40", title: "Delegate in plain language.", body: "“Fix the report and send Nga the updated file.” Lumi Assistant works across files and connected tools, with approval where it matters." }
      ]
    },
    context: {
      label: "SHARED CONTEXT",
      title: "One company context. Every answer can show its source.",
      body: "Customers, orders, projects, messages and documents stay connected, so Lumi can answer with context and act with evidence.",
      inputs: ["Customers", "Orders", "Projects", "Messages", "Documents", "Software", "People"],
      center: "Shared context",
      outputs: ["Understand", "Decide", "Act"],
      proofTitle: "Evidence stays attached.",
      proofBody: "See where an answer came from, how fresh it is, and when a person should review it."
    },
    productsLabel: "THREE CORE CAPABILITIES",
    productsTitle: "See clearly. Decide together. Get work done.",
    products: [
      {
        index: "01", name: "Lumi AI Workspace", kicker: "WORK TOGETHER",
        title: "Know what needs attention.",
        body: "Decisions, commitments, risks and next actions in one clear operating view.",
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
        body: "Move from a question to the numbers, drivers and source records behind it.",
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
        body: "Set the job, tools and limits. Lumi works through it, keeps a worklog and asks before consequential actions.",
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
      }
    ],
    existing: {
      label: "WORK WITH WHAT YOU HAVE",
      title: "Keep the systems that work. Make them work together.",
      body: "Start with one workflow that wastes time. Connect only what it needs. Prove the result. Then expand.",
      steps: [
        { n: "01", t: "Connect", d: "Use the systems already holding the work." },
        { n: "02", t: "Understand", d: "Build only the context needed to see clearly." },
        { n: "03", t: "Decide", d: "Bring the right evidence to the right person." },
        { n: "04", t: "Act", d: "Execute with clear permissions, approvals and verification." }
      ]
    },
    trust: {
      label: "TRUST IS PART OF THE PRODUCT",
      title: "See what Lumi knows. See what Lumi did.",
      items: [
        { title: "Evidence", body: "Important answers stay linked to their sources." },
        { title: "Authority", body: "Access and actions follow explicit permissions." },
        { title: "Human judgment", body: "People stay in control of consequential decisions." },
        { title: "Verified work", body: "Lumi separates planned, attempted, completed and verified." }
      ]
    },
    cta: {
      label: "START WITH ONE REAL WORKFLOW",
      title: "Show us the work that keeps getting stuck.",
      body: "One slow, repetitive or easy-to-lose workflow is enough to start.",
      primary: "Talk to Lumi",
      secondary: "hello@runlumi.app"
    },
    footer: { line: "One operating layer for the company you already run.", rights: "© 2026 Cloudjet Solutions Pte. Ltd." }
  },

  vi: {
    lang: "vi",
    path: "/vi",
    switchPath: "/",
    switchLabel: "EN",
    meta: {
      title: "Lumi — Giúp những công cụ đang có làm việc cùng nhau",
      description: "Lumi kết nối những công cụ và công việc doanh nghiệp đang có, để mọi người nhìn rõ, quyết đúng ngữ cảnh và đưa việc đi tiếp."
    },
    nav: { products: "Lumi làm gì", how: "Cách hoạt động", trust: "Tin cậy", contact: "Trao đổi với Lumi" },
    hero: {
      eyebrow: "LUMI / MỘT LỚP VẬN HÀNH",
      titleA: "Doanh nghiệp đã có sẵn công cụ.",
      titleB: "Lumi giúp chúng làm việc cùng nhau.",
      body: "Một nơi để biết việc gì đáng chú ý, hiểu điều gì đang thay đổi và đưa công việc đi tiếp trên chính những hệ thống đang dùng.",
      primary: "Xem Lumi hoạt động",
      secondary: "Trao đổi với Lumi",
      note: "Giữ hệ thống đang dùng. Thêm Lumi.",
      systemLabel: "MỘT CỬA VÀO · BA CÁCH LÀM VIỆC",
      systemItems: [
        { n: "01", role: "Phối hợp", name: "AI Workspace" },
        { n: "02", role: "Hiểu", name: "Lumi BI" },
        { n: "03", role: "Hành động", name: "Lumi Agents" }
      ],
      systemFoot: "Chung ngữ cảnh · rõ quyền hạn · luôn có bằng chứng"
    },
    thesis: {
      label: "Ý TƯỞNG",
      title: "Một doanh nghiệp. Một lớp vận hành.",
      body: "Assistant là cửa vào. Workspace giữ việc rõ ràng. BI giúp hiểu điều gì đang xảy ra. Agents nhận những việc lặp lại. Tất cả dùng chung một ngữ cảnh doanh nghiệp."
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
        { n: "01", title: "Kết nối", body: "Dùng chính những hệ thống đang có." },
        { n: "02", title: "Hiểu", body: "Gom tín hiệu rời rạc thành một bức tranh rõ." },
        { n: "03", title: "Quyết định", body: "Đưa đúng bằng chứng đến đúng người." },
        { n: "04", title: "Hành động", body: "Đưa việc đi tiếp, xin duyệt khi cần." }
      ]
    },
    stack: {
      label: "LUMI HOẠT ĐỘNG THẾ NÀO",
      title: "Một cửa vào. Ba cách đưa công việc đi tiếp.",
      assistant: {
        name: "Lumi Assistant",
        role: "Hỏi. Giao việc. Theo đến cùng.",
        desc: "Cửa vào của Lumi. Cứ nói việc cần làm, Lumi tự chuyển đến đúng phần."
      },
      products: [
        { name: "Lumi AI Workspace", role: "Phối hợp", desc: "Giữ ưu tiên, quyết định và cam kết rõ ràng." },
        { name: "Lumi BI", role: "Hiểu", desc: "Biết điều gì thay đổi, vì sao và dữ liệu nào đứng sau." },
        { name: "Lumi Agents", role: "Hành động", desc: "Làm việc lặp lại trong phạm vi rõ, luôn có thể kiểm tra." }
      ],
      foundationTitle: "Ngữ cảnh chung của doanh nghiệp",
      foundation: "Bộ nhớ · bằng chứng · quyền hạn · trạng thái công việc",
      gatewayTitle: "Hành động có kiểm soát",
      gateway: "Quyền hạn · phê duyệt · kiểm chứng",
      systems: "Những hệ thống doanh nghiệp đang dùng",
      systemsList: "ERP · CRM · Email · Chat · Sheets · Ecommerce · Tệp · Cơ sở dữ liệu · Trình duyệt · API"
    },
    day: {
      label: "MỘT NGÀY VỚI LUMI",
      title: "Một ngày bình thường, bớt đuổi theo công việc.",
      body: "Công việc đi qua Lumi liền mạch. Mọi người không cần bận tâm đang dùng phần nào.",
      moments: [
        { time: "08:05", title: "Biết việc gì cần chú ý.", body: "CEO mở Lumi AI Workspace. Các quyết định, rủi ro khách hàng và một khoản thanh toán quá hạn đã được xếp ưu tiên kèm nguồn." },
        { time: "10:20", title: "Hiểu điều gì vừa thay đổi.", body: "Lumi BI phát hiện biên lợi nhuận của một kênh ecommerce giảm và truy nguyên về nhóm sản phẩm, khuyến mãi và cơ cấu đơn hàng." },
        { time: "10:22", title: "Giao phần kiểm tra cho agent.", body: "Lumi Agent kiểm tra dữ liệu, đối soát số liệu và chỉ đưa những ngoại lệ cần người xem." },
        { time: "14:40", title: "Giao việc bằng ngôn ngữ bình thường.", body: "“Sửa báo cáo và gửi file mới cho Nga.” Lumi Assistant làm việc trên tệp và các công cụ đã kết nối, yêu cầu phê duyệt ở nơi cần thiết." }
      ]
    },
    context: {
      label: "NGỮ CẢNH CHUNG",
      title: "Một ngữ cảnh chung. Mỗi câu trả lời đều có thể lần về nguồn.",
      body: "Khách hàng, đơn hàng, dự án, tin nhắn và tài liệu được nối lại, để Lumi hiểu đúng ngữ cảnh và hành động có căn cứ.",
      inputs: ["Khách hàng", "Đơn hàng", "Dự án", "Tin nhắn", "Tài liệu", "Phần mềm", "Con người"],
      center: "Ngữ cảnh chung",
      outputs: ["Hiểu", "Quyết định", "Hành động"],
      proofTitle: "Bằng chứng luôn đi cùng kết luận.",
      proofBody: "Luôn thấy câu trả lời đến từ đâu, dữ liệu mới đến mức nào và khi nào cần người kiểm tra."
    },
    productsLabel: "BA NĂNG LỰC CỐT LÕI",
    productsTitle: "Ba năng lực. Một dòng công việc.",
    products: [
      {
        index: "01", name: "Lumi AI Workspace", kicker: "PHỐI HỢP",
        title: "Biết ngay việc gì cần chú ý.",
        body: "Quyết định, cam kết, rủi ro và bước tiếp theo trong một góc nhìn rõ ràng.",
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
        body: "Đi từ câu hỏi đến con số, nguyên nhân rồi xuống tận dữ liệu gốc.",
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
        body: "Giao rõ việc, công cụ và giới hạn. Lumi làm đến cùng, lưu worklog và xin duyệt khi cần.",
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
      }
    ],
    existing: {
      label: "LÀM VIỆC VỚI HỆ THỐNG HIỆN CÓ",
      title: "Giữ những hệ thống đang dùng tốt. Giúp chúng làm việc cùng nhau.",
      body: "Bắt đầu từ một việc đang tốn thời gian. Chỉ kết nối những gì cần. Chứng minh kết quả rồi mới mở rộng.",
      steps: [
        { n: "01", t: "Kết nối", d: "Dùng chính những hệ thống đang giữ công việc." },
        { n: "02", t: "Hiểu", d: "Chỉ xây ngữ cảnh cần thiết để nhìn rõ." },
        { n: "03", t: "Quyết định", d: "Đưa đúng bằng chứng đến đúng người." },
        { n: "04", t: "Hành động", d: "Thực thi với quyền hạn, phê duyệt và kiểm chứng rõ." }
      ]
    },
    trust: {
      label: "TIN CẬY LÀ MỘT PHẦN CỦA SẢN PHẨM",
      title: "Biết Lumi dựa vào đâu. Biết Lumi đã làm gì.",
      items: [
        { title: "Bằng chứng", body: "Kết luận quan trọng luôn đi cùng nguồn." },
        { title: "Quyền hạn", body: "Ai được xem gì, làm gì đều có ranh giới rõ." },
        { title: "Con người quyết", body: "Việc quan trọng vẫn dừng lại để người có trách nhiệm quyết." },
        { title: "Đã làm, có kiểm chứng", body: "Lumi tách rõ đã dự kiến, đã thử, đã làm và đã kiểm chứng." }
      ]
    },
    cta: {
      label: "BẮT ĐẦU TỪ MỘT WORKFLOW THẬT",
      title: "Cho Lumi xem việc đang hay bị mắc.",
      body: "Chỉ cần một việc chậm, lặp lại hoặc dễ rơi rớt giữa nhiều công cụ. Đó là nơi tốt nhất để bắt đầu.",
      primary: "Trao đổi với Lumi",
      secondary: "hello@runlumi.app"
    },
    footer: { line: "Một lớp vận hành cho chính doanh nghiệp bạn đang điều hành.", rights: "© 2026 Cloudjet Solutions Pte. Ltd." }
  }
} as const;

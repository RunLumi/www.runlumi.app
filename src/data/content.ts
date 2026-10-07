import { company } from "./company";

export const content = {
  en: {
    lang: "en",
    path: "/",
    switchPath: "/vi",
    switchLabel: "VI",
    meta: {
      title: "Lumi — Your company, working as one",
      description:
        "An AI operating layer for your company. Bring decisions, evidence and delegated work together across the systems you already use.",
    },
    nav: {
      products: "What Lumi does",
      how: "How it works",
      trust: "Trust",
      blog: "Journal",
      contact: "Talk to us",
    },
    hero: {
      eyebrow: "AI FOR THE COMPANY YOU RUN",
      titleA: "Your company.",
      titleB: "Working as one.",
      body: "Lumi brings your people, data and tools into one operating layer. Know what needs attention. Understand why. Put the next step in motion.",
      primary: "Follow a real-world workflow",
      secondary: "Talk to us",
      note: "Built around your work. Connected to your existing systems.",
      systemLabel: "ONE REQUEST. A CONNECTED WORKFLOW.",
      systemItems: [
        { n: "01", role: "Coordinate", name: "AI Workspace" },
        { n: "02", role: "Understand", name: "Lumi BI" },
        { n: "03", role: "Act", name: "Lumi Agents" },
      ],
      systemFoot: "Sources in view. People in control.",
    },
    thesis: {
      label: "THE WORK IN BETWEEN",
      title: "The work between the tools is still work.",
      body: "Finding the right number. Repeating the context. Chasing the next step. Lumi is built for the work that falls between your systems, so your team can spend more attention on the decisions that matter.",
    },
    stack: {
      label: "02 / THE OPERATING LAYER",
      title: "One place to ask. A system to follow through.",
      assistant: {
        name: "Lumi Assistant",
        role: "Ask. Delegate. Follow through.",
        desc: "Start with the question or the job. The Assistant connects it to the right capability.",
      },
      products: [
        {
          name: "Lumi AI Workspace",
          role: "Coordinate",
          desc: "Keep priorities, decisions and commitments clear.",
          href: "https://workspace.runlumi.app",
        },
        {
          name: "Lumi BI",
          role: "Understand",
          desc: "See what changed, why, and the records behind it.",
          href: "https://about.bi.runlumi.app",
        },
        {
          name: "Lumi Agents",
          role: "Act",
          desc: "Run repeatable work within clear limits, with review when needed.",
          href: "https://agents.runlumi.app",
        },
      ],
      foundationTitle: "Shared company context",
      foundation: "Memory · evidence · permissions · workflow state",
      gatewayTitle: "Controlled actions",
      gateway: "Permissions · approvals · verification",
      systems: "Your existing systems",
      systemsList: "Business software · Spreadsheets · Files · Databases",
    },
    day: {
      label: "01 / FOLLOW THE WORK",
      title: "From “what changed?” to “here’s the next step.”",
      body: "Consider a weekly sales review. A number has moved. Someone needs to understand it, decide what to do and follow through. Here is the workflow Lumi is designed to bring together.",
      moments: [
        {
          time: "ASK",
          title: "Ask the question once.",
          body: "“Sales are up. Why is margin down?” Start with the business question, through Lumi Assistant.",
        },
        {
          time: "TRACE",
          title: "Follow the numbers to the source.",
          body: "Use Lumi BI to examine product mix, discounts and costs. Check the records behind an explanation before accepting it.",
        },
        {
          time: "DECIDE",
          title: "Give the decision a home.",
          body: "Bring the finding into Workspace with a proposed next step, an owner and the evidence needed to review it.",
        },
        {
          time: "ACT",
          title: "Delegate a bounded job.",
          body: "Ask an Agent to prepare the follow-up report. Define what it may access, what needs approval and how the result will be checked.",
        },
      ],
    },
    context: {
      label: "04 / COMPANY CONTEXT",
      title: "The next question should not start from zero.",
      body: "A decision makes more sense alongside the customer, the order and the conversation behind it. Shared context is the foundation of Lumi’s operating model.",
      inputs: [
        "Customers",
        "Orders",
        "Projects",
        "Messages",
        "Documents",
        "Software",
        "People",
      ],
      center: "Shared context",
      outputs: ["Understand", "Decide", "Act"],
      proofTitle: "Context earns trust when you can inspect it.",
      proofBody:
        "The source, its freshness and the limits of an answer belong beside the answer itself.",
    },
    productsLabel: "03 / THREE CAPABILITIES",
    productsTitle: "Different jobs. The same company context.",
    products: [
      {
        index: "01",
        name: "Lumi AI Workspace",
        href: "https://workspace.runlumi.app",
        linkLabel: "Visit Workspace",
        kicker: "WORK TOGETHER",
        title: "Know what needs attention.",
        body: "Bring the decision, its owner and the next step into the same view. Keep the reason for a commitment close to the work it creates.",
        examples: [
          "Operating brief",
          "Decisions & commitments",
          "Projects & recurring work",
          "Source-linked insight",
        ],
        demo: {
          label: "OPERATING BRIEF",
          rows: [
            {
              key: "DECISION",
              value: "Review the proposed next step",
              meta: "Owner · due · source",
            },
            {
              key: "RISK",
              value: "Check the unresolved issue",
              meta: "Evidence attached",
            },
            {
              key: "COMMITMENT",
              value: "Assign an owner and a due date",
              meta: "Age · owner · next step",
            },
          ],
        },
      },
      {
        index: "02",
        name: "Lumi BI",
        href: "https://about.bi.runlumi.app",
        linkLabel: "Explore Lumi BI",
        kicker: "UNDERSTAND",
        title: "Ask the business. Follow the evidence.",
        body: "Explore a business question in plain language, then inspect the data behind the answer. A useful explanation should stand up to a second look.",
        examples: [
          "Commerce analysis",
          "Natural-language analysis",
          "Custom dashboards",
          "Source & freshness trace",
        ],
        demo: {
          label: "TRACE THE ANSWER",
          rows: [
            {
              key: "METRIC",
              value: "What changed?",
              meta: "Revenue · margin · orders",
            },
            {
              key: "DRIVERS",
              value: "Why did it change?",
              meta: "Products · channels · campaigns",
            },
            {
              key: "RECORDS",
              value: "Show the evidence",
              meta: "Source · freshness · rows",
            },
          ],
        },
      },
      {
        index: "03",
        name: "Lumi Agents",
        href: "https://agents.runlumi.app",
        linkLabel: "Explore Lumi Agents",
        kicker: "EXECUTE",
        title: "Give repeatable work a clear owner.",
        body: "Define the job, the permitted tools and what success means. Review the worklog and the result, with approval for consequential actions.",
        examples: [
          "Sales operations",
          "Ads operations",
          "Finance workflows",
          "Research & back office",
        ],
        demo: {
          label: "AGENT RUN",
          rows: [
            {
              key: "GOAL",
              value: "A bounded job",
              meta: "Scope · success condition",
            },
            {
              key: "TOOLS",
              value: "Only what the role needs",
              meta: "Browser · files · apps",
            },
            {
              key: "WORKLOG",
              value: "Every material step",
              meta: "Attempted · executed · verified",
            },
            {
              key: "APPROVAL",
              value: "Human when it matters",
              meta: "Safe reject · clear effect",
            },
          ],
        },
      },
    ],
    existing: {
      label: "06 / A PRACTICAL START",
      title: "Start small enough to judge the result.",
      body: "Pick a recurring task your team knows well. Agree on the inputs, the boundaries and a useful result before adding more scope.",
      steps: [
        {
          n: "01",
          t: "Bring one workflow",
          d: "A report, a reconciliation or a follow-up that keeps taking more effort than it should.",
        },
        {
          n: "02",
          t: "Check the fit",
          d: "Review the required data, available connections and who needs to approve the work.",
        },
        {
          n: "03",
          t: "Define a useful result",
          d: "Agree on what to compare: time spent, errors caught or follow-ups completed.",
        },
        {
          n: "04",
          t: "Earn the next workflow",
          d: "Review the result together. Expand only when the first workflow earns its place.",
        },
      ],
    },
    trust: {
      label: "05 / THE STANDARD WE BUILD TO",
      title: "Trust should be something you can check.",
      items: [
        {
          title: "Evidence",
          body: "A conclusion should point to its source, with enough context to check it.",
        },
        {
          title: "Authority",
          body: "Define which data and tools a job can use before work begins.",
        },
        {
          title: "Human judgment",
          body: "Make the review point and the responsible person explicit before a consequential action.",
        },
        {
          title: "Verified work",
          body: "Planned, attempted, completed and verified are different states. The record should show which one applies.",
        },
      ],
    },
    blog: {
      label: "THE LUMI JOURNAL",
      title: "Practical notes for the work between systems.",
      body: "Clear writing about AI operating layers, evidence-led business intelligence and bounded agents for real companies.",
      cta: "Read the journal",
    },
    cta: {
      label: "YOUR NEXT WORKING WEEK",
      title: "What would you stop chasing?",
      body: "Think of the report, the handoff or the unanswered question that will come around again next week. Bring that to Lumi. Let’s see what a better way of working could look like.",
      primary: "Discuss your workflow",
      secondary: company.email,
    },
    footer: {
      line: "One operating layer for the company you already run.",
      rights: "© 2026 Cloudjet Solutions Pte. Ltd.",
    },
  },

  vi: {
    lang: "vi",
    path: "/vi",
    switchPath: "/",
    switchLabel: "EN",
    meta: {
      title: "Lumi — Cả doanh nghiệp, cùng một nhịp",
      description:
        "Lớp vận hành AI kết nối con người, dữ liệu và công cụ. Nắm việc cần làm, hiểu rõ căn cứ và theo sát bước tiếp theo cùng Lumi.",
    },
    nav: {
      products: "Lumi làm gì",
      how: "Cách hoạt động",
      trust: "Tin cậy",
      blog: "Góc nhìn",
      contact: "Trao đổi với Lumi",
    },
    hero: {
      eyebrow: "AI CHO CÔNG VIỆC ĐIỀU HÀNH",
      titleA: "Cả doanh nghiệp.",
      titleB: "Cùng một nhịp.",
      body: "Lumi kết nối con người, dữ liệu và công cụ trong một lớp vận hành chung. Nắm việc cần làm, hiểu rõ căn cứ và theo sát bước tiếp theo.",
      primary: "Xem một quy trình cụ thể",
      secondary: "Trao đổi với Lumi",
      note: "Bắt đầu từ công việc. Kết nối với hệ thống bạn đang dùng.",
      systemLabel: "MỘT YÊU CẦU. CÔNG VIỆC NỐI LIỀN.",
      systemItems: [
        { n: "01", role: "Phối hợp", name: "AI Workspace" },
        { n: "02", role: "Hiểu", name: "Lumi BI" },
        { n: "03", role: "Hành động", name: "Lumi Agents" },
      ],
      systemFoot: "Rõ nguồn dữ liệu. Rõ quyền quyết định.",
    },
    thesis: {
      label: "NHỮNG KHOẢNG RỜI RẠC",
      title: "Giữa các công cụ, vẫn còn rất nhiều việc.",
      body: "Tìm lại một con số. Giải thích lại từ đầu. Hỏi xem việc đã đến đâu. Lumi được xây dựng để nối những khoảng rời rạc ấy, dành sự tập trung của đội ngũ cho việc cần suy xét và quyết định.",
    },
    stack: {
      label: "02 / LỚP VẬN HÀNH CHUNG",
      title: "Một nơi để hỏi. Cả hệ thống cùng xử lý.",
      assistant: {
        name: "Lumi Assistant",
        role: "Hỏi. Giao việc. Theo đến cùng.",
        desc: "Bắt đầu bằng câu hỏi hoặc việc cần làm. Assistant kết nối yêu cầu với năng lực phù hợp.",
      },
      products: [
        {
          name: "Lumi AI Workspace",
          role: "Phối hợp",
          desc: "Giữ ưu tiên, quyết định và cam kết rõ ràng.",
          href: "https://workspace.runlumi.app",
        },
        {
          name: "Lumi BI",
          role: "Hiểu",
          desc: "Biết điều gì thay đổi, vì sao và dữ liệu nào đứng sau.",
          href: "https://about.bi.runlumi.app",
        },
        {
          name: "Lumi Agents",
          role: "Hành động",
          desc: "Làm việc lặp lại trong phạm vi rõ, luôn có thể kiểm tra.",
          href: "https://agents.runlumi.app",
        },
      ],
      foundationTitle: "Ngữ cảnh chung của doanh nghiệp",
      foundation: "Bộ nhớ · bằng chứng · quyền hạn · trạng thái công việc",
      gatewayTitle: "Hành động có kiểm soát",
      gateway: "Quyền hạn · phê duyệt · kiểm chứng",
      systems: "Những hệ thống doanh nghiệp đang dùng",
      systemsList: "Phần mềm nghiệp vụ · Bảng tính · Tài liệu · Cơ sở dữ liệu",
    },
    day: {
      label: "01 / THEO MỘT CÔNG VIỆC",
      title: "Từ câu hỏi còn bỏ ngỏ đến bước tiếp theo rõ ràng.",
      body: "Trong buổi xem lại kết quả kinh doanh, một chỉ số thay đổi. Cần người tìm hiểu, người quyết định và người làm tiếp. Đó là quy trình Lumi hướng tới kết nối.",
      moments: [
        {
          time: "HỎI",
          title: "Bắt đầu từ câu hỏi cần lời đáp.",
          body: "“Doanh thu tăng, vì sao biên lợi nhuận lại giảm?” Đặt câu hỏi về công việc qua Lumi Assistant.",
        },
        {
          time: "KIỂM TRA",
          title: "Lần theo con số về dữ liệu gốc.",
          body: "Dùng Lumi BI để xem cơ cấu sản phẩm, chiết khấu và chi phí. Kiểm tra dữ liệu đứng sau một cách giải thích trước khi chấp nhận nó.",
        },
        {
          time: "QUYẾT ĐỊNH",
          title: "Đưa kết quả vào nơi ra quyết định.",
          body: "Đưa nhận định vào Workspace, kèm đề xuất, người phụ trách và căn cứ để cả nhóm xem xét.",
        },
        {
          time: "GIAO VIỆC",
          title: "Giao việc với phạm vi rõ ràng.",
          body: "Giao Agent chuẩn bị báo cáo tiếp theo. Xác định dữ liệu được dùng, bước cần phê duyệt và cách kiểm tra kết quả.",
        },
      ],
    },
    context: {
      label: "04 / NGỮ CẢNH DOANH NGHIỆP",
      title: "Câu hỏi tiếp theo không cần bắt đầu lại từ đầu.",
      body: "Một quyết định sẽ dễ hiểu hơn khi được đặt cạnh đơn hàng, khách hàng và cuộc trao đổi liên quan. Ngữ cảnh chung là nền tảng cho cách Lumi tổ chức công việc.",
      inputs: [
        "Khách hàng",
        "Đơn hàng",
        "Dự án",
        "Tin nhắn",
        "Tài liệu",
        "Phần mềm",
        "Con người",
      ],
      center: "Ngữ cảnh chung",
      outputs: ["Hiểu", "Quyết định", "Hành động"],
      proofTitle: "Có thể kiểm tra mới có cơ sở để tin.",
      proofBody:
        "Nguồn dữ liệu, thời điểm cập nhật và giới hạn của kết luận cần được trình bày ngay bên câu trả lời.",
    },
    productsLabel: "03 / BA NĂNG LỰC",
    productsTitle: "Mỗi phần một việc. Cùng hiểu một doanh nghiệp.",
    products: [
      {
        index: "01",
        name: "Lumi AI Workspace",
        href: "https://workspace.runlumi.app",
        linkLabel: "Mở Workspace",
        kicker: "PHỐI HỢP",
        title: "Biết ngay việc gì cần chú ý.",
        body: "Đặt quyết định, người phụ trách và bước tiếp theo vào cùng một nơi. Giữ lại lý do đằng sau mỗi cam kết để người làm tiếp hiểu đúng.",
        examples: [
          "Bản tin điều hành",
          "Quyết định & cam kết",
          "Dự án & công việc định kỳ",
          "Kết luận có nguồn",
        ],
        demo: {
          label: "BẢN TIN ĐIỀU HÀNH",
          rows: [
            {
              key: "QUYẾT ĐỊNH",
              value: "Xem xét phương án đề xuất",
              meta: "Người phụ trách · thời hạn · nguồn",
            },
            {
              key: "RỦI RO",
              value: "Kiểm tra vấn đề chưa giải quyết",
              meta: "Có bằng chứng",
            },
            {
              key: "CAM KẾT",
              value: "Giao người phụ trách và thời hạn",
              meta: "Thời gian chờ · người phụ trách",
            },
          ],
        },
      },
      {
        index: "02",
        name: "Lumi BI",
        href: "https://about.bi.runlumi.app",
        linkLabel: "Khám phá Lumi BI",
        kicker: "HIỂU",
        title: "Hiểu con số. Kiểm tra căn cứ.",
        body: "Đặt câu hỏi bằng ngôn ngữ hằng ngày, rồi kiểm tra dữ liệu đứng sau câu trả lời. Một lời giải thích hữu ích phải chịu được việc xem xét lại.",
        examples: [
          "Phân tích kinh doanh",
          "Phân tích bằng ngôn ngữ tự nhiên",
          "Bảng theo dõi tùy chỉnh",
          "Nguồn & độ mới dữ liệu",
        ],
        demo: {
          label: "TRUY NGƯỢC CÂU TRẢ LỜI",
          rows: [
            {
              key: "CHỈ SỐ",
              value: "Điều gì thay đổi?",
              meta: "Doanh thu · lợi nhuận · đơn hàng",
            },
            {
              key: "YẾU TỐ",
              value: "Vì sao thay đổi?",
              meta: "Sản phẩm · kênh · chiến dịch",
            },
            {
              key: "BẢN GHI",
              value: "Xem bằng chứng",
              meta: "Nguồn · độ mới · dữ liệu",
            },
          ],
        },
      },
      {
        index: "03",
        name: "Lumi Agents",
        href: "https://agents.runlumi.app",
        linkLabel: "Khám phá Lumi Agents",
        kicker: "THỰC THI",
        title: "Giao được việc. Kiểm tra được kết quả.",
        body: "Xác định việc cần làm, công cụ được dùng và thế nào là hoàn thành. Xem lại nhật ký, kiểm tra kết quả và phê duyệt những hành động quan trọng.",
        examples: [
          "Vận hành bán hàng",
          "Vận hành quảng cáo",
          "Công việc tài chính",
          "Nghiên cứu & hành chính",
        ],
        demo: {
          label: "CÔNG VIỆC CỦA AGENT",
          rows: [
            {
              key: "MỤC TIÊU",
              value: "Một công việc có ranh giới",
              meta: "Phạm vi · điều kiện thành công",
            },
            {
              key: "CÔNG CỤ",
              value: "Chỉ những gì vai trò cần",
              meta: "Trình duyệt · tệp · ứng dụng",
            },
            {
              key: "NHẬT KÝ",
              value: "Mọi bước quan trọng",
              meta: "Đã thử · thực thi · xác minh",
            },
            {
              key: "PHÊ DUYỆT",
              value: "Người có thẩm quyền quyết định",
              meta: "Rõ tác động · có thể từ chối",
            },
          ],
        },
      },
    ],
    existing: {
      label: "06 / BẮT ĐẦU VỪA ĐỦ",
      title: "Bắt đầu đủ nhỏ để thấy rõ kết quả.",
      body: "Chọn một công việc lặp lại mà đội ngũ đã hiểu rõ. Thống nhất dữ liệu cần dùng, giới hạn và kết quả mong đợi trước khi mở rộng.",
      steps: [
        {
          n: "01",
          t: "Chọn một công việc",
          d: "Một báo cáo, một lần đối soát hay một khâu bàn giao đang tốn quá nhiều công sức.",
        },
        {
          n: "02",
          t: "Xem có phù hợp không",
          d: "Rà lại dữ liệu cần dùng, khả năng kết nối và người có quyền phê duyệt.",
        },
        {
          n: "03",
          t: "Thống nhất cách đánh giá",
          d: "Đo thời gian thực hiện, lỗi được phát hiện hoặc những việc đã theo đến cùng.",
        },
        {
          n: "04",
          t: "Có kết quả rồi mở rộng",
          d: "Cùng xem lại kết quả. Chỉ thêm công việc khi bước đầu đã chứng minh được giá trị.",
        },
      ],
    },
    trust: {
      label: "05 / TIÊU CHUẨN CHÚNG TÔI THEO ĐUỔI",
      title: "Niềm tin cần có căn cứ để kiểm tra.",
      items: [
        {
          title: "Bằng chứng",
          body: "Kết luận cần dẫn về nguồn và có đủ thông tin để người đọc kiểm tra lại.",
        },
        {
          title: "Quyền hạn",
          body: "Xác định dữ liệu và công cụ được phép dùng trước khi bắt đầu công việc.",
        },
        {
          title: "Con người quyết",
          body: "Thống nhất bước cần duyệt và người chịu trách nhiệm trước những hành động quan trọng.",
        },
        {
          title: "Đã làm, có kiểm chứng",
          body: "Dự kiến làm, đã thử, đã hoàn thành và đã kiểm chứng là những trạng thái khác nhau. Nhật ký cần phân biệt rõ.",
        },
      ],
    },
    blog: {
      label: "GÓC NHÌN LUMI",
      title: "Những ghi chép về công việc nằm giữa các hệ thống.",
      body: "Bài viết thực tế về lớp vận hành AI, business intelligence có bằng chứng và agent có giới hạn.",
      cta: "Đọc các bài viết",
    },
    cta: {
      label: "CHO TUẦN LÀM VIỆC SẮP TỚI",
      title: "Việc gì bạn muốn thôi phải đốc thúc?",
      body: "Bản báo cáo, khâu bàn giao hay câu hỏi chưa có lời đáp nào sẽ lại xuất hiện vào tuần tới? Hãy bắt đầu từ đó, cùng Lumi tìm một cách làm đáng để thay đổi.",
      primary: "Trao đổi với Lumi",
      secondary: company.email,
    },
    footer: {
      line: "Để công việc nối liền, con người có thêm thời gian suy xét.",
      rights: "© 2026 Cloudjet Solutions Pte. Ltd.",
    },
  },
} as const;

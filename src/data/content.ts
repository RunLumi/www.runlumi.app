import { company } from "./company";

/*
 * Landing copy for RunLumi, the local-first work memory that is now the
 * centre of Lumi. Product copy says "RunLumi"; "RunLumi Core" names only the
 * engine underneath (repo, crate, planned open-source core, MCP, local API). Source of truth for product claims: the runlumi-core
 * repository (README.md, vision.md, docs/features). Core is in early
 * development: describe shipped behaviour of the early build, label direction
 * as direction, and never claim availability, benchmarks or customers.
 */
export const content = {
  en: {
    lang: "en",
    path: "/",
    switchPath: "/vi",
    switchLabel: "VI",
    meta: {
      title: "RunLumi — Your work, remembered",
      description:
        "RunLumi is a local-first memory of the work on your computer. Find what you saw, resume interrupted work and draft timesheets you approve, with your data on your device. In early development.",
    },
    nav: {
      products: "What it does",
      how: "How it works",
      trust: "Privacy",
      blog: "Journal",
      contact: "Join the pilot",
    },
    mail: {
      subject: "RunLumi design-partner pilot",
      body: "Hello Lumi,\n\nMy role:\nHow I track and bill time today:\nComputer and operating system:\nThe apps I work in most:\n",
    },
    hero: {
      eyebrow: "RUNLUMI · LOCAL-FIRST WORK MEMORY",
      titleA: "Your work,",
      titleB: "remembered.",
      body: "RunLumi keeps a private, searchable memory of the work on your computer. Find what you saw, pick up where you left off and turn real activity into a timesheet you approve. Your AI, your choice. Your data, your control.",
      primary: "See how it works",
      secondary: "Join the design-partner pilot",
      note: "In early development. Pilot builds run on macOS, and every capture source stays off until you turn it on.",
      example: {
        label: "AN EXAMPLE WITH RUNLUMI",
        tag: "Illustrative",
        query: "“The quote I sent for the Sen project last week”",
        divider: "FROM MEMORY TO EVIDENCE",
        dock: "Follow the week",
        caption: "Your computer → local memory → your review",
      },
      systemLabel: "AN ILLUSTRATIVE RECALL WITH RUNLUMI",
      systemItems: [
        { n: "01", role: "Found", name: "Recall", detail: "Quote v3 · Tue 14:20 · Sheets" },
        { n: "02", role: "Context", name: "Timeline", detail: "45 min on the Sen project · 3 sources" },
        { n: "03", role: "You decide", name: "Review", detail: "Draft time entry, not yet approved" },
      ],
      systemFoot: "Stored on this device. Nothing sent.",
    },
    thesis: {
      label: "WHERE WORK GOES MISSING",
      title: "The work you did shouldn’t disappear when the tab closes.",
      body: "Work is spread across tabs, meetings, chats, apps and interruptions. Afterwards, people rebuild context from memory, forget what they agreed or under-report the time they spent. RunLumi is built to keep that record for you, on your own machine.",
    },
    stack: {
      label: "02 / HOW IT FITS TOGETHER",
      title: "A memory on your computer. Controls you can see.",
      scopeNote:
        "Architecture of the early build. Each capture source is off by default and needs its own operating-system permission. Features are in development and not yet verified for general release.",
      ariaLabel: "How RunLumi works on your computer",
      assistantMeta: "ON YOUR COMPUTER",
      assistant: {
        name: "RunLumi",
        role: "Remember. Recover. Prepare.",
        desc: "A desktop app with a capture indicator in the menu bar. You decide what it may record, and when.",
      },
      products: [
        {
          name: "Recall",
          role: "Find",
          desc: "Search memories, notes and saved text, each with its source and timestamp.",
        },
        {
          name: "Timeline",
          role: "Review",
          desc: "Browse a day or a week of the activity you allowed.",
        },
        {
          name: "Timesheet",
          role: "Account",
          desc: "Draft client time from reviewed sessions, then export JSON or CSV.",
        },
      ],
      foundationMeta: "ON THIS DEVICE",
      foundationTitle: "Local memory",
      foundation: "RunLumi Core engine · SQLite with full-text search · stored on your device · exportable",
      gatewayMeta: "CONTROLS",
      gatewayTitle: "Capture you control",
      gateway: "Opt-in sources · app allowlists · screen region masks · pause & schedule",
      systems: "Signals you allow",
      systemsList: "App names · screen frames · accessibility text · microphone · browser tab title",
    },
    day: {
      label: "01 / FOLLOW A WORKING WEEK",
      title: "From “what was I doing?” to “here’s my timesheet.”",
      body: "Consider a consultant working for three clients across a dozen apps. Here is the week RunLumi is designed to support.",
      moments: [
        {
          time: "RECALL",
          title: "Find what you saw.",
          body: "Search a phrase, a client or a file and get the moment it appeared, with the app, the time and the source.",
        },
        {
          time: "RESUME",
          title: "Pick up the thread.",
          body: "After a meeting or an interruption, see the last project, document and open question before you start again.",
        },
        {
          time: "ACCOUNT",
          title: "Recover the work you did.",
          body: "At the end of the week, review proposed work sessions by client. Being active at a laptop is never treated as billable time.",
        },
        {
          time: "APPROVE",
          title: "Export only what you approve.",
          body: "Edit, split or exclude entries, then export the approved sessions. Nothing is billable until you say so.",
        },
      ],
    },
    context: {
      label: "04 / BUILT FOR VIETNAM FIRST",
      title: "Built for the way work happens here.",
      body: "Vietnamese and English in the same meeting. Tone marks in names and searches. Modest laptops, browser tabs, spreadsheets and chat. RunLumi is being designed for that work first, then for Southeast Asia.",
      ariaLabel: "Signals you allow become a local memory used to recall, resume and account for work",
      inputs: ["Apps", "Screen", "Browser tabs", "Microphone", "Files", "Notes", "Timers"],
      center: "Your local memory",
      outputs: ["Recall", "Resume", "Account"],
      proofTitle: "Every answer should point back to a source on your device.",
      proofBody:
        "An app, a time and a saved record belong beside the answer. A guess is labelled as a guess.",
    },
    productsLabel: "03 / THREE FIRST JOBS",
    productsTitle: "Recall. Recover. Hand context to your AI.",
    products: [
      {
        index: "01",
        name: "Recall & resume",
        kicker: "RECALL",
        title: "Find it again, with the source.",
        body: "Search what you saved, saw or said. Every result shows where it came from and when, so you can check it before you use it. Designed for work in Vietnamese and English.",
        examples: [
          "Local full-text search",
          "Day & week timeline",
          "On-device OCR on request",
          "Source & time on every result",
        ],
        demo: {
          label: "RECALL RESULT",
          rows: [
            { key: "QUERY", value: "Sen project quote", meta: "Typed search" },
            { key: "SOURCE", value: "Sheets · Quote v3", meta: "Tue 14:20 · saved frame" },
            { key: "CONTEXT", value: "Email draft to the client", meta: "Same session · 6 min later" },
          ],
        },
      },
      {
        index: "02",
        name: "Billable time recovery",
        kicker: "ACCOUNT",
        title: "Recover the work you did, honestly.",
        body: "Review sessions proposed from the apps you allowed, attribute them to clients and projects, and export only what you approve. Observed activity, a suggested client and approved billable time stay separate.",
        examples: [
          "Clients & projects",
          "Work timer you start",
          "Draft billing review",
          "Approved-session CSV export",
        ],
        demo: {
          label: "TIMESHEET DRAFT",
          rows: [
            { key: "OBSERVED", value: "1 h 40 min in allowed apps", meta: "App intervals · Tue" },
            { key: "SUGGESTED", value: "Sen project · 1 h 15 min", meta: "Candidate · needs review" },
            { key: "APPROVED", value: "Sen project · 1 h 00 min", meta: "Edited by you · ready to export" },
          ],
        },
      },
      {
        index: "03",
        name: "Context for your AI",
        kicker: "CONNECT",
        title: "Your AI, your choice.",
        body: "RunLumi Core, the memory engine underneath, gives a coding or chat agent read-only access to your memory over MCP, with bounded excerpts you opt into. No RunLumi server sits in between, and no external AI provider is contacted by default.",
        examples: [
          "Read-only MCP",
          "On-device transcription",
          "Bring your own model (planned)",
          "No RunLumi cloud in the path",
        ],
        demo: {
          label: "AGENT REQUEST",
          rows: [
            { key: "SCOPE", value: "Read-only · last 7 days", meta: "Set by you" },
            { key: "SHARED", value: "Bounded excerpts", meta: "Opt-in per content type" },
            { key: "SENT", value: "Nothing leaves by default", meta: "stdio on this device" },
          ],
        },
      },
    ],
    teams: {
      label: "06 / FOR TEAMS",
      title: "When work needs to be shared, Lumi has a place for it.",
      body: "Lumi AI Workspace, Lumi BI and Lumi Agents are our products for companies. RunLumi does not connect to them automatically. Moving a reviewed timesheet or note into a company system is always a separate, deliberate step.",
      ariaLabel: "Lumi products for companies",
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
    },
    existing: {
      label: "07 / DESIGN-PARTNER PILOT",
      title: "Help us test it on a real week.",
      body: "We are looking for freelancers and small agencies in Vietnam who bill clients for their time and control their own laptop.",
      steps: [
        {
          n: "01",
          t: "Tell us how you work",
          d: "Your role, the apps you use, and how you track and bill time today.",
        },
        {
          n: "02",
          t: "Install an early build",
          d: "On a Mac you control, with only the capture sources you choose.",
        },
        {
          n: "03",
          t: "Reconstruct one week",
          d: "With your consent, review what RunLumi proposes alongside your own records.",
        },
        {
          n: "04",
          t: "Compare the result",
          d: "Did it find legitimate work you missed, or save time on the timesheet? Your feedback decides what we build next.",
        },
      ],
    },
    trust: {
      label: "05 / PRIVACY RULES WE BUILD TO",
      title: "Memory should feel like evidence, not surveillance.",
      items: [
        {
          title: "Visible, opt-in capture",
          body: "Every source starts switched off. The menu bar shows what is being captured, and you can pause it from there.",
        },
        {
          title: "Exclusions before storage",
          body: "App allowlists, private browser windows and masked screen regions are applied before anything is saved.",
        },
        {
          title: "Local by default",
          body: "Your history stays on your machine. Nothing goes to RunLumi or an AI provider unless you choose to send it.",
        },
        {
          title: "No surveillance, no false billing",
          body: "RunLumi is not an employee-monitoring tool. Suggested time is never billable until you approve it.",
        },
      ],
    },
    blog: {
      label: "THE LUMI JOURNAL",
      title: "Notes on memory, evidence and AI at work.",
      body: "Practical writing about keeping evidence beside an answer, bounding what AI may do and keeping people in control.",
      cta: "Read the journal",
    },
    cta: {
      label: "YOUR NEXT WORKING WEEK",
      title: "What did you work on last Tuesday?",
      body: "If the honest answer takes more than a minute, we would like to hear from you. Tell us how you work and how you bill, and we will tell you whether the pilot is a fit.",
      primary: "Join the pilot",
      secondary: company.email,
    },
    footer: {
      line: "Your work, remembered. Your data, your control.",
      rights: "© 2026 Cloudjet Solutions Pte. Ltd.",
    },
  },

  vi: {
    lang: "vi",
    path: "/vi",
    switchPath: "/",
    switchLabel: "EN",
    meta: {
      title: "RunLumi — Việc đã làm, không còn trôi mất",
      description:
        "RunLumi là bộ nhớ công việc chạy ngay trên máy tính của bạn. Tìm lại điều đã thấy, tiếp tục việc dang dở và lập bảng giờ làm do chính bạn duyệt, dữ liệu nằm trên máy bạn. Đang phát triển giai đoạn đầu.",
    },
    nav: {
      products: "Làm được gì",
      how: "Cách hoạt động",
      trust: "Quyền riêng tư",
      blog: "Góc nhìn",
      contact: "Tham gia thử nghiệm",
    },
    mail: {
      subject: "Tham gia thử nghiệm RunLumi",
      body: "Chào Lumi,\n\nVai trò của tôi:\nCách tôi theo dõi và tính giờ hiện nay:\nMáy tính và hệ điều hành:\nCác ứng dụng tôi dùng nhiều nhất:\n",
    },
    hero: {
      eyebrow: "RUNLUMI · BỘ NHỚ CÔNG VIỆC TRÊN MÁY BẠN",
      titleA: "Việc đã làm,",
      titleB: "không còn trôi mất.",
      body: "RunLumi lưu một bộ nhớ riêng tư, tìm kiếm được, về công việc trên máy tính của bạn. Tìm lại điều đã thấy, tiếp tục đúng chỗ đang dở và biến hoạt động thực tế thành bảng giờ làm do bạn duyệt. AI do bạn chọn. Dữ liệu do bạn nắm.",
      primary: "Xem cách hoạt động",
      secondary: "Tham gia chương trình thử nghiệm",
      note: "Đang phát triển giai đoạn đầu. Bản thử nghiệm chạy trên macOS, và mọi nguồn ghi đều tắt cho đến khi bạn bật.",
      example: {
        label: "MỘT VÍ DỤ VỚI RUNLUMI",
        tag: "Minh họa",
        query: "“Bảng báo giá dự án Sen gửi tuần trước”",
        divider: "TỪ TRÍ NHỚ ĐẾN BẰNG CHỨNG",
        dock: "Theo dõi một tuần",
        caption: "Máy của bạn → bộ nhớ trên máy → bạn duyệt",
      },
      systemLabel: "VÍ DỤ MINH HỌA VỀ TÌM LẠI VỚI RUNLUMI",
      systemItems: [
        { n: "01", role: "Đã thấy", name: "Tìm lại", detail: "Báo giá v3 · Thứ Ba 14:20 · Sheets" },
        { n: "02", role: "Ngữ cảnh", name: "Dòng thời gian", detail: "45 phút cho dự án Sen · 3 nguồn" },
        { n: "03", role: "Bạn quyết", name: "Duyệt", detail: "Nháp giờ làm, chưa được duyệt" },
      ],
      systemFoot: "Lưu trên máy này. Không gửi đi đâu.",
    },
    thesis: {
      label: "NƠI CÔNG VIỆC BỊ THẤT LẠC",
      title: "Việc đã làm không nên biến mất khi đóng tab.",
      body: "Công việc rải rác giữa các tab, cuộc họp, tin nhắn, ứng dụng và những lần bị cắt ngang. Sau đó, ta phải nhớ lại ngữ cảnh, quên điều đã thống nhất hoặc khai thiếu thời gian đã bỏ ra. RunLumi được xây dựng để giữ lại những dấu vết đó cho bạn, ngay trên máy của bạn.",
    },
    stack: {
      label: "02 / CÁC PHẦN KẾT NỐI RA SAO",
      title: "Bộ nhớ trên máy bạn. Quyền kiểm soát nhìn thấy được.",
      scopeNote:
        "Kiến trúc của bản đang phát triển. Mỗi nguồn ghi đều tắt mặc định và cần quyền riêng của hệ điều hành. Các tính năng đang được xây dựng, chưa được kiểm chứng để phát hành rộng rãi.",
      ariaLabel: "Cách RunLumi hoạt động trên máy tính của bạn",
      assistantMeta: "TRÊN MÁY BẠN",
      assistant: {
        name: "RunLumi",
        role: "Ghi nhớ. Tìm lại. Chuẩn bị.",
        desc: "Ứng dụng máy tính có biểu tượng trạng thái ghi trên thanh menu. Bạn quyết định được ghi những gì và vào lúc nào.",
      },
      products: [
        {
          name: "Tìm lại",
          role: "Tìm kiếm",
          desc: "Tìm ghi chú, bộ nhớ và văn bản đã lưu, mỗi kết quả kèm nguồn và thời điểm.",
        },
        {
          name: "Dòng thời gian",
          role: "Xem lại",
          desc: "Xem một ngày hay một tuần hoạt động mà bạn đã cho phép ghi.",
        },
        {
          name: "Bảng giờ làm",
          role: "Ghi nhận",
          desc: "Lập nháp giờ làm theo khách hàng từ các phiên đã xem lại, rồi xuất JSON hoặc CSV.",
        },
      ],
      foundationMeta: "TRÊN THIẾT BỊ NÀY",
      foundationTitle: "Bộ nhớ trên máy",
      foundation: "Lõi RunLumi Core · SQLite có tìm kiếm toàn văn · lưu trên máy bạn · xuất ra được",
      gatewayMeta: "KIỂM SOÁT",
      gatewayTitle: "Chỉ ghi những gì bạn cho phép",
      gateway: "Bật từng nguồn · danh sách ứng dụng được phép · vùng che màn hình · tạm dừng & lịch ghi",
      systems: "Tín hiệu bạn cho phép",
      systemsList: "Tên ứng dụng · khung hình màn hình · văn bản trợ năng · micro · tiêu đề tab trình duyệt",
    },
    day: {
      label: "01 / THEO MỘT TUẦN LÀM VIỆC",
      title: "Từ “mình đang làm gì nhỉ?” đến “bảng giờ làm đã xong.”",
      body: "Hình dung một chuyên gia tư vấn làm cho ba khách hàng trên cả chục ứng dụng. Đây là tuần làm việc mà RunLumi được thiết kế để hỗ trợ.",
      moments: [
        {
          time: "TÌM LẠI",
          title: "Tìm điều bạn đã thấy.",
          body: "Tìm theo một cụm từ, tên khách hàng hay tệp tin để thấy đúng lúc nó xuất hiện, kèm ứng dụng, thời điểm và nguồn.",
        },
        {
          time: "TIẾP TỤC",
          title: "Nối lại mạch việc.",
          body: "Sau cuộc họp hay một lần bị cắt ngang, xem lại dự án, tài liệu và câu hỏi còn dở trước khi bắt đầu lại.",
        },
        {
          time: "GHI NHẬN",
          title: "Không bỏ sót việc đã làm.",
          body: "Cuối tuần, xem các phiên làm việc được đề xuất theo từng khách hàng. Chỉ ngồi trước máy không bao giờ được coi là giờ tính phí.",
        },
        {
          time: "DUYỆT",
          title: "Chỉ xuất những gì bạn duyệt.",
          body: "Sửa, tách hoặc loại bỏ từng mục rồi xuất các phiên đã duyệt. Không có gì được tính phí cho đến khi bạn đồng ý.",
        },
      ],
    },
    context: {
      label: "04 / ƯU TIÊN VIỆT NAM",
      title: "Thiết kế cho cách người Việt làm việc.",
      body: "Tiếng Việt lẫn tiếng Anh trong cùng một cuộc họp. Dấu thanh trong tên người và từ khóa tìm kiếm. Laptop cấu hình vừa phải, tab trình duyệt, bảng tính và tin nhắn. RunLumi được thiết kế trước hết cho công việc đó, rồi mới mở rộng ra Đông Nam Á.",
      ariaLabel: "Các tín hiệu bạn cho phép tạo thành bộ nhớ trên máy, dùng để tìm lại, tiếp tục và ghi nhận công việc",
      inputs: ["Ứng dụng", "Màn hình", "Tab trình duyệt", "Micro", "Tệp", "Ghi chú", "Bộ đếm giờ"],
      center: "Bộ nhớ trên máy bạn",
      outputs: ["Tìm lại", "Tiếp tục", "Ghi nhận"],
      proofTitle: "Mỗi câu trả lời cần dẫn về một nguồn trên máy bạn.",
      proofBody:
        "Ứng dụng, thời điểm và bản ghi đã lưu phải nằm ngay cạnh câu trả lời. Điều gì là phỏng đoán thì được ghi rõ là phỏng đoán.",
    },
    productsLabel: "03 / BA VIỆC ĐẦU TIÊN",
    productsTitle: "Tìm lại. Ghi nhận. Trao ngữ cảnh cho AI của bạn.",
    products: [
      {
        index: "01",
        name: "Tìm lại & tiếp tục",
        kicker: "TÌM LẠI",
        title: "Tìm lại được, kèm nguồn gốc.",
        body: "Tìm điều bạn đã lưu, đã thấy hay đã nói. Mỗi kết quả cho biết nó đến từ đâu và lúc nào, để bạn kiểm tra trước khi dùng. Thiết kế cho công việc bằng tiếng Việt và tiếng Anh.",
        examples: [
          "Tìm kiếm toàn văn trên máy",
          "Dòng thời gian theo ngày & tuần",
          "OCR trên máy khi bạn yêu cầu",
          "Nguồn & thời điểm cho mỗi kết quả",
        ],
        demo: {
          label: "KẾT QUẢ TÌM LẠI",
          rows: [
            { key: "TỪ KHÓA", value: "Báo giá dự án Sen", meta: "Tìm bằng từ khóa" },
            { key: "NGUỒN", value: "Sheets · Báo giá v3", meta: "Thứ Ba 14:20 · khung hình đã lưu" },
            { key: "NGỮ CẢNH", value: "Bản nháp email gửi khách", meta: "Cùng phiên · 6 phút sau" },
          ],
        },
      },
      {
        index: "02",
        name: "Ghi nhận giờ làm tính phí",
        kicker: "GHI NHẬN",
        title: "Ghi nhận đúng và đủ việc đã làm.",
        body: "Xem các phiên làm việc được đề xuất từ những ứng dụng bạn cho phép, gắn với khách hàng và dự án, rồi chỉ xuất những gì bạn duyệt. Hoạt động ghi nhận được, khách hàng được gợi ý và giờ tính phí đã duyệt luôn tách biệt.",
        examples: [
          "Khách hàng & dự án",
          "Bộ đếm giờ do bạn bật",
          "Duyệt nháp tính phí",
          "Xuất CSV các phiên đã duyệt",
        ],
        demo: {
          label: "NHÁP BẢNG GIỜ LÀM",
          rows: [
            { key: "GHI NHẬN", value: "1 giờ 40 phút trên ứng dụng được phép", meta: "Khoảng thời gian ứng dụng · Thứ Ba" },
            { key: "GỢI Ý", value: "Dự án Sen · 1 giờ 15 phút", meta: "Đề xuất · cần xem lại" },
            { key: "ĐÃ DUYỆT", value: "Dự án Sen · 1 giờ 00 phút", meta: "Bạn đã sửa · sẵn sàng xuất" },
          ],
        },
      },
      {
        index: "03",
        name: "Ngữ cảnh cho AI của bạn",
        kicker: "KẾT NỐI",
        title: "AI do bạn chọn.",
        body: "RunLumi Core, lõi bộ nhớ bên dưới, cho agent lập trình hoặc trợ lý trò chuyện quyền chỉ đọc vào bộ nhớ của bạn qua MCP, với những đoạn trích có giới hạn mà bạn chủ động bật. Không có máy chủ RunLumi nào đứng giữa, và mặc định không có nhà cung cấp AI bên ngoài nào được gọi đến.",
        examples: [
          "MCP chỉ đọc",
          "Chuyển giọng nói thành văn bản trên máy",
          "Tự chọn mô hình (dự kiến)",
          "Không qua đám mây RunLumi",
        ],
        demo: {
          label: "YÊU CẦU TỪ AGENT",
          rows: [
            { key: "PHẠM VI", value: "Chỉ đọc · 7 ngày gần nhất", meta: "Do bạn đặt" },
            { key: "CHIA SẺ", value: "Đoạn trích có giới hạn", meta: "Bật riêng từng loại nội dung" },
            { key: "GỬI ĐI", value: "Mặc định không rời khỏi máy", meta: "stdio trên máy này" },
          ],
        },
      },
    ],
    teams: {
      label: "06 / CHO DOANH NGHIỆP",
      title: "Khi công việc cần chia sẻ, Lumi có chỗ cho nó.",
      body: "Lumi AI Workspace, Lumi BI và Lumi Agents là các sản phẩm của Lumi dành cho doanh nghiệp. RunLumi không tự động kết nối với chúng. Đưa một bảng giờ làm hay ghi chú đã duyệt vào hệ thống của công ty luôn là một bước riêng, có chủ đích.",
      ariaLabel: "Các sản phẩm Lumi dành cho doanh nghiệp",
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
    },
    existing: {
      label: "07 / CHƯƠNG TRÌNH THỬ NGHIỆM",
      title: "Cùng chúng tôi thử trên một tuần làm việc thật.",
      body: "Chúng tôi đang tìm freelancer và agency nhỏ tại Việt Nam đang tính phí khách hàng theo thời gian làm việc và tự quản lý máy tính của mình.",
      steps: [
        {
          n: "01",
          t: "Kể cách bạn làm việc",
          d: "Vai trò, các ứng dụng bạn dùng, cách bạn theo dõi và tính giờ hiện nay.",
        },
        {
          n: "02",
          t: "Cài bản thử nghiệm",
          d: "Trên máy Mac do bạn quản lý, chỉ với những nguồn ghi bạn chọn.",
        },
        {
          n: "03",
          t: "Dựng lại một tuần",
          d: "Với sự đồng ý của bạn, xem lại những gì RunLumi đề xuất bên cạnh ghi chép của chính bạn.",
        },
        {
          n: "04",
          t: "So sánh kết quả",
          d: "Nó có tìm ra việc hợp lệ bạn đã bỏ sót, hay giúp lập bảng giờ nhanh hơn? Ý kiến của bạn quyết định điều chúng tôi làm tiếp.",
        },
      ],
    },
    trust: {
      label: "05 / NGUYÊN TẮC RIÊNG TƯ",
      title: "Bộ nhớ phải là bằng chứng, không phải công cụ giám sát.",
      items: [
        {
          title: "Ghi công khai, do bạn bật",
          body: "Mọi nguồn đều bắt đầu ở trạng thái tắt. Thanh menu luôn cho biết đang ghi gì, và bạn có thể tạm dừng ngay từ đó.",
        },
        {
          title: "Loại trừ trước khi lưu",
          body: "Danh sách ứng dụng được phép, cửa sổ duyệt web riêng tư và vùng màn hình bị che được áp dụng trước khi bất cứ thứ gì được lưu.",
        },
        {
          title: "Mặc định nằm trên máy",
          body: "Lịch sử nằm trên máy bạn. Không có gì được gửi tới RunLumi hay nhà cung cấp AI, trừ khi bạn chủ động gửi.",
        },
        {
          title: "Không giám sát, không khai khống",
          body: "RunLumi không phải công cụ theo dõi nhân viên. Giờ được gợi ý không bao giờ được tính phí khi bạn chưa duyệt.",
        },
      ],
    },
    blog: {
      label: "GÓC NHÌN LUMI",
      title: "Ghi chép về trí nhớ, bằng chứng và AI trong công việc.",
      body: "Bài viết thực tế về việc đặt bằng chứng cạnh câu trả lời, giới hạn những gì AI được làm và giữ con người ở vị trí quyết định.",
      cta: "Đọc các bài viết",
    },
    cta: {
      label: "CHO TUẦN LÀM VIỆC SẮP TỚI",
      title: "Thứ Ba tuần trước bạn đã làm những gì?",
      body: "Nếu câu trả lời thật lòng mất hơn một phút, chúng tôi muốn nghe từ bạn. Hãy cho biết cách bạn làm việc và tính phí, chúng tôi sẽ cho bạn biết chương trình thử nghiệm có phù hợp hay không.",
      primary: "Tham gia thử nghiệm",
      secondary: company.email,
    },
    footer: {
      line: "Việc đã làm, không còn trôi mất. Dữ liệu do bạn nắm.",
      rights: "© 2026 Cloudjet Solutions Pte. Ltd.",
    },
  },
} as const;

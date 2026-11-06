import { company } from "./company";

/*
 * Landing copy for RunLumi, the local-first work memory at the centre of Lumi.
 * Product copy says "RunLumi"; "RunLumi Core" names only the engine underneath
 * (repo, crate, planned open-source core, MCP, local API). Source of truth for
 * product claims: the runlumi-core repository (README.md, vision.md,
 * docs/features). Core is in early development: describe shipped behaviour of
 * the early build, label direction as direction, and never claim
 * availability, benchmarks or customers.
 *
 * Plain copy only: no slogan triplets, no "not X, but Y" lines, no section
 * numbering, and no feature said twice on the page.
 */
export const content = {
  en: {
    lang: "en",
    path: "/",
    switchPath: "/vi",
    switchLabel: "VI",
    meta: {
      title: "RunLumi: your work, remembered",
      description:
        "RunLumi is a local-first memory of the work on your computer. Search what you saw, pick up interrupted work and draft timesheets you approve. In early development.",
    },
    nav: {
      how: "How it works",
      products: "What it does",
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
      body: "RunLumi keeps a searchable record of what you do on your computer and stores it on that computer. Use it to find something you saw last week, pick up after an interruption, or draft a timesheet that you check and approve.",
      primary: "See how it works",
      secondary: "Join the pilot",
      note: "In early development. Pilot builds run on macOS, and every capture source stays off until you turn it on.",
      systemLabel: "Illustrative search result in RunLumi",
      example: {
        label: "EXAMPLE SEARCH",
        tag: "Illustrative",
        query: "“The quote I sent for the Sen project last week”",
      },
      systemItems: [
        { role: "Match", name: "Sheets · Quote v3", detail: "Tue 14:20" },
        { role: "Context", name: "Email draft to the client", detail: "Same session, 6 min later" },
        { role: "Timesheet", name: "Sen project · 45 min", detail: "Draft entry, not approved" },
      ],
      systemFoot: "Stored on this device. Nothing sent.",
    },
    thesis: {
      label: "THE PROBLEM",
      title: "The work you did shouldn’t disappear when the tab closes.",
      body: "Work is spread across tabs, meetings, chats and apps, and it keeps getting interrupted. Afterwards you rebuild context from memory, forget what was agreed or under-report the hours. RunLumi keeps that record on your own machine.",
    },
    day: {
      label: "HOW IT WORKS",
      title: "A week with RunLumi",
      body: "Take a consultant with three clients and a dozen apps open. This is the week RunLumi is designed for.",
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
          title: "Recover the hours.",
          body: "At the end of the week, review proposed work sessions by client. Being active at a laptop is never treated as billable time.",
        },
        {
          time: "APPROVE",
          title: "Export only what you approve.",
          body: "Edit, split or exclude entries, then export the approved sessions. Nothing is billable until you say so.",
        },
      ],
    },
    productsLabel: "WHAT IT DOES",
    productsTitle: "Three first jobs",
    products: [
      {
        name: "Recall & resume",
        title: "Find it again, with the source.",
        body: "Search what you saved, saw or said. Every result shows where it came from and when, so you can check it before you use it. Designed for work in Vietnamese and English.",
        examples: [
          "Local full-text search",
          "Day & week timeline",
          "On-device OCR on request",
          "Source & time on every result",
        ],
      },
      {
        name: "Billable time recovery",
        title: "Draft a timesheet from what you actually did.",
        body: "Review sessions proposed from the apps you allowed, assign them to clients and projects, and export only what you approve. Observed activity, a suggested client and approved billable time are kept separate.",
        examples: [
          "Clients & projects",
          "Work timer you start",
          "Draft billing review",
          "CSV export of approved sessions",
        ],
      },
      {
        name: "Context for your AI",
        title: "Give your AI tools read-only context.",
        body: "RunLumi Core, the memory engine underneath, lets a coding or chat agent read your memory over MCP, limited to the excerpts you opt into. No RunLumi server sits in between, and no external AI provider is contacted by default.",
        examples: [
          "Read-only MCP",
          "On-device transcription",
          "Bring your own model (planned)",
          "No RunLumi cloud in the path",
        ],
      },
    ],
    trust: {
      label: "PRIVACY",
      title: "You decide what it records.",
      note: "Sources it can record, each off until you turn it on: app names, screen frames, accessibility text, microphone audio and browser tab titles. Everything is stored in a local SQLite database that you can export.",
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
          title: "Not for monitoring staff",
          body: "RunLumi is not an employee-monitoring tool, and suggested time never counts as billable until you approve it.",
        },
      ],
    },
    teams: {
      label: "FOR COMPANIES",
      title: "Lumi’s products for companies",
      body: "Lumi AI Workspace, Lumi BI and Lumi Agents are built for teams. RunLumi does not connect to them automatically. Moving a reviewed timesheet or note into a company system is always a separate step you take yourself.",
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
          desc: "Run repeatable work within set limits, with review when needed.",
          href: "https://agents.runlumi.app",
        },
      ],
    },
    existing: {
      label: "DESIGN-PARTNER PILOT",
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
          d: "Did it find work you had missed, or save time on the timesheet? Your answers decide what we build next.",
        },
      ],
    },
    cta: {
      title: "What did you work on last Tuesday?",
      body: "If the honest answer takes more than a minute, we would like to hear from you. Tell us how you work and how you bill, and we will tell you whether the pilot is a fit.",
      primary: "Join the pilot",
      secondary: company.email,
    },
    footer: {
      line: "Your work, remembered.",
      rights: "© 2026 Cloudjet Solutions Pte. Ltd.",
    },
  },

  vi: {
    lang: "vi",
    path: "/vi",
    switchPath: "/",
    switchLabel: "EN",
    meta: {
      title: "RunLumi: việc đã làm, không còn trôi mất",
      description:
        "RunLumi là bộ nhớ công việc chạy ngay trên máy tính của bạn. Tìm lại điều đã thấy, tiếp tục việc dang dở và lập bảng giờ làm do chính bạn duyệt. Đang phát triển giai đoạn đầu.",
    },
    nav: {
      how: "Cách hoạt động",
      products: "Làm được gì",
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
      body: "RunLumi ghi lại những gì bạn làm trên máy tính, tìm kiếm được, và lưu ngay trên chính máy đó. Dùng nó để tìm lại thứ bạn đã thấy tuần trước, làm tiếp sau khi bị cắt ngang, hoặc lập nháp bảng giờ làm rồi tự kiểm tra và duyệt.",
      primary: "Xem cách hoạt động",
      secondary: "Tham gia thử nghiệm",
      note: "Đang phát triển giai đoạn đầu. Bản thử nghiệm chạy trên macOS, và mọi nguồn ghi đều tắt cho đến khi bạn bật.",
      systemLabel: "Ví dụ minh họa kết quả tìm kiếm trong RunLumi",
      example: {
        label: "VÍ DỤ TÌM KIẾM",
        tag: "Minh họa",
        query: "“Bảng báo giá dự án Sen gửi tuần trước”",
      },
      systemItems: [
        { role: "Khớp", name: "Sheets · Báo giá v3", detail: "Thứ Ba 14:20" },
        { role: "Ngữ cảnh", name: "Bản nháp email gửi khách", detail: "Cùng phiên, 6 phút sau" },
        { role: "Bảng giờ", name: "Dự án Sen · 45 phút", detail: "Nháp giờ làm, chưa duyệt" },
      ],
      systemFoot: "Lưu trên máy này. Không gửi đi đâu.",
    },
    thesis: {
      label: "VẤN ĐỀ",
      title: "Việc đã làm không nên biến mất khi đóng tab.",
      body: "Công việc rải rác giữa các tab, cuộc họp, tin nhắn và ứng dụng, lại hay bị cắt ngang. Sau đó, bạn phải nhớ lại ngữ cảnh, quên điều đã thống nhất hoặc khai thiếu giờ đã làm. RunLumi giữ lại những dấu vết đó ngay trên máy của bạn.",
    },
    day: {
      label: "CÁCH HOẠT ĐỘNG",
      title: "Một tuần làm việc với RunLumi",
      body: "Hình dung một chuyên gia tư vấn làm cho ba khách hàng, mở cả chục ứng dụng. Đây là tuần làm việc RunLumi được thiết kế để hỗ trợ.",
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
          title: "Không bỏ sót giờ đã làm.",
          body: "Cuối tuần, xem các phiên làm việc được đề xuất theo từng khách hàng. Chỉ ngồi trước máy không bao giờ được coi là giờ tính phí.",
        },
        {
          time: "DUYỆT",
          title: "Chỉ xuất những gì bạn duyệt.",
          body: "Sửa, tách hoặc loại bỏ từng mục rồi xuất các phiên đã duyệt. Không có gì được tính phí cho đến khi bạn đồng ý.",
        },
      ],
    },
    productsLabel: "LÀM ĐƯỢC GÌ",
    productsTitle: "Ba việc đầu tiên",
    products: [
      {
        name: "Tìm lại & tiếp tục",
        title: "Tìm lại được, kèm nguồn gốc.",
        body: "Tìm điều bạn đã lưu, đã thấy hay đã nói. Mỗi kết quả cho biết nó đến từ đâu và lúc nào, để bạn kiểm tra trước khi dùng. Thiết kế cho công việc bằng tiếng Việt và tiếng Anh.",
        examples: [
          "Tìm kiếm toàn văn trên máy",
          "Dòng thời gian theo ngày & tuần",
          "OCR trên máy khi bạn yêu cầu",
          "Nguồn & thời điểm cho mỗi kết quả",
        ],
      },
      {
        name: "Ghi nhận giờ làm tính phí",
        title: "Lập bảng giờ từ việc bạn thực sự đã làm.",
        body: "Xem các phiên làm việc được đề xuất từ những ứng dụng bạn cho phép, gắn với khách hàng và dự án, rồi chỉ xuất những gì bạn duyệt. Hoạt động ghi nhận được, khách hàng được gợi ý và giờ tính phí đã duyệt luôn tách biệt.",
        examples: [
          "Khách hàng & dự án",
          "Bộ đếm giờ do bạn bật",
          "Duyệt nháp tính phí",
          "Xuất CSV các phiên đã duyệt",
        ],
      },
      {
        name: "Ngữ cảnh cho AI của bạn",
        title: "Cho công cụ AI của bạn ngữ cảnh, chỉ đọc.",
        body: "RunLumi Core, lõi bộ nhớ bên dưới, cho agent lập trình hoặc trợ lý trò chuyện đọc bộ nhớ của bạn qua MCP, giới hạn trong những đoạn trích bạn chủ động bật. Không có máy chủ RunLumi nào đứng giữa, và mặc định không có nhà cung cấp AI bên ngoài nào được gọi đến.",
        examples: [
          "MCP chỉ đọc",
          "Chuyển giọng nói thành văn bản trên máy",
          "Tự chọn mô hình (dự kiến)",
          "Không qua đám mây RunLumi",
        ],
      },
    ],
    trust: {
      label: "QUYỀN RIÊNG TƯ",
      title: "Bạn quyết định được ghi những gì.",
      note: "Các nguồn có thể ghi, nguồn nào cũng tắt cho đến khi bạn bật: tên ứng dụng, khung hình màn hình, văn bản trợ năng, âm thanh micro và tiêu đề tab trình duyệt. Mọi thứ được lưu trong một cơ sở dữ liệu SQLite trên máy và xuất ra được.",
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
          title: "Không dùng để giám sát nhân viên",
          body: "RunLumi không phải công cụ theo dõi nhân viên, và giờ được gợi ý không bao giờ được tính phí khi bạn chưa duyệt.",
        },
      ],
    },
    teams: {
      label: "CHO DOANH NGHIỆP",
      title: "Các sản phẩm Lumi cho doanh nghiệp",
      body: "Lumi AI Workspace, Lumi BI và Lumi Agents được làm cho các nhóm. RunLumi không tự động kết nối với chúng. Đưa một bảng giờ làm hay ghi chú đã duyệt vào hệ thống của công ty luôn là một bước riêng do bạn tự làm.",
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
          desc: "Làm việc lặp lại trong phạm vi đã đặt, có người duyệt khi cần.",
          href: "https://agents.runlumi.app",
        },
      ],
    },
    existing: {
      label: "CHƯƠNG TRÌNH THỬ NGHIỆM",
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
          d: "Nó có tìm ra việc bạn đã bỏ sót, hay giúp lập bảng giờ nhanh hơn? Câu trả lời của bạn quyết định điều chúng tôi làm tiếp.",
        },
      ],
    },
    cta: {
      title: "Thứ Ba tuần trước bạn đã làm những gì?",
      body: "Nếu câu trả lời thật lòng mất hơn một phút, chúng tôi muốn nghe từ bạn. Hãy cho biết cách bạn làm việc và tính phí, chúng tôi sẽ cho bạn biết chương trình thử nghiệm có phù hợp hay không.",
      primary: "Tham gia thử nghiệm",
      secondary: company.email,
    },
    footer: {
      line: "Việc đã làm, không còn trôi mất.",
      rights: "© 2026 Cloudjet Solutions Pte. Ltd.",
    },
  },
} as const;

/**
 * Internal role drafts, maintained in Git; these are not ATS vacancies.
 * Business context reviewed on 2026-10-18:
 * - AGENTS.md (product, permission and release contracts)
 * - src/lib/crm/seed.ts (configured offer families, not live price approval)
 * - src/lib/crm/business-model.ts (decisions, hypotheses and unknowns)
 * - docs/Lumi_Sales_Process.en.md
 * - docs/Lumi_Agents_Vaults_Sales_Process.en.md
 * - docs/crm/COMMISSION.md (proposed policies are not approved compensation)
 * - docs/hiring/gtm-recruitment-channels-vn.md (existing hiring context)
 * No customer records, personal data, compensation commitments or D1 writes.
 */

export type JobDescriptionLang = "en" | "vi";

export interface JobDescriptionSection {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
  table?: {
    headers: readonly string[];
    rows: readonly (readonly string[])[];
  };
}

export interface JobDescriptionContent {
  title: string;
  subtitle: string;
  summary: string;
  department: string;
  reportsTo: string;
  employment: string;
  location: string;
  sections: readonly JobDescriptionSection[];
}

export interface JobDescription {
  slug: string;
  code: string;
  version: string;
  status: "draft";
  updatedAt: string;
  locales: Record<JobDescriptionLang, JobDescriptionContent>;
}

export const jobDescriptions: readonly JobDescription[] = [
  {
    slug: "coo-head-of-sales-operations",
    code: "LUMI-COO-001",
    version: "1.0",
    status: "draft",
    updatedAt: "2026-10-18",
    locales: {
      en: {
        title: "COO - Head of Sales & Operations",
        subtitle: "Lead sales directly. Build reliable delivery and renewals.",
        summary: "Internal role draft for Lumi: own the path from a qualified buyer to collected cash, accepted delivery and continued use. Scope, targets and employment terms require agreement before hiring.",
        department: "Sales & Operations",
        reportsTo: "CEO / Founder",
        employment: "To be agreed",
        location: "Location, working arrangement and travel to be agreed",
        sections: [
          {
            id: "mission",
            title: "Purpose and business focus",
            paragraphs: [
              "Lumi develops an AI operating layer around Workspace, BI and Agents. This role connects selling with implementation, customer adoption and recurring service. The first responsibility is to sell personally and make a small team effective.",
              "With the CEO, prioritize one or two approved offers: Lumi Local websites and renewals, or a scoped Lumi solution. Respect existing bounded free Basic / Workflow Kit entry offers; deeper pilots and implementation need separate paid terms. Product readiness and buyer demand must be verified. Vaults proposals do not establish release readiness or quote approval.",
            ],
          },
          {
            id: "sales",
            title: "Sales ownership",
            bullets: [
              "Build a focused list of 10–30 qualified prospects; favor relevant introductions and targeted outreach. Identify the user, budget owner, approver, urgent problem and reason to switch.",
              "Lead discovery, demonstrations, proposals, negotiation and follow-up. Record evidence, deal owner, next action and date in CRM; respect contact permissions and opt-outs.",
              "Agree scope, technical feasibility, costs, acceptance and payment milestones before committing. Use current approved offers; do not promise unsupported AI outcomes, integrations or delivery dates.",
              "Pursue paid decisions and renewals. Record losses and objections; improve the offer before adding channels or hiring sellers. Free samples remain bounded by their approved effort budget.",
            ],
          },
          {
            id: "operations",
            title: "Operations ownership",
            bullets: [
              "Coordinate capacity and handover with technical and delivery owners: agreed scope, responsible person, deadline, quality checks and customer acceptance. Escalate scope changes before extra work.",
              "Track implementation, support, collections and renewal dates. Resolve delays and recurring defects; maintain short, usable procedures and clear customer ownership.",
              "Measure selling, delivery and support effort, including unsuccessful prospects. Protect margin and cash; reconcile overdue receivables with accounting without self-confirming payments.",
              "Coach the existing team through real cases. Propose additional people only after repeatable demand, viable economics and a capacity gap are evidenced; obtain budget approval first.",
            ],
          },
          {
            id: "first-90-days",
            title: "Proposed first 90 days",
            paragraphs: [
              "These are draft ramp expectations, not contractual quotas. Confirm targets after reviewing the baseline, sales cycle, product readiness and available capacity.",
            ],
            table: {
              headers: ["Period", "Work and review evidence"],
              rows: [
                ["Days 1–30", "Agree 1–2 offers, a 10–30-prospect cohort and effort budget. Establish baseline metrics, decision owners and dated next steps for active opportunities. CEO and CTO review the first proposals."],
                ["Days 31–60", "Personally seek the first paid pilot or implementation within the agreed cycle; demonstrate scope, accounting-confirmed cash and handover evidence. If none converts, document buyer objections and change or stop the test."],
                ["Days 61–90", "Test a second comparable cohort and review contribution, delivery quality and repeated use. Propose scale only with repeat paid demand and known costs; otherwise narrow, repair or stop. Document procedures another team member can follow."],
              ],
            },
          },
          {
            id: "scorecard",
            title: "Scorecard and evidence",
            paragraphs: [
              "Review weekly; reconcile monthly with accounting. Set numerical targets with the CEO after the baseline. Show unknowns and unavailable denominators explicitly; do not turn them into zero. The following are management definitions, subject to agreed accounting policies.",
            ],
            table: {
              headers: ["Measure", "Definition and guardrail"],
              rows: [
                ["Cash collected", "Customer receipts confirmed by accounting, with refunds and credits shown separately. Deposits are partial payments; bookings and revenue remain separate."],
                ["Bookings / recognized revenue", "Bookings: accepted contractual value. Recognized revenue: amounts earned under the accounting policy. Track both separately by period; signing or payment alone does not establish earned revenue."],
                ["Gross / contribution margin", "Gross profit: recognized revenue less direct delivery costs. Contribution: gross profit less attributable selling and acquisition costs. Divide each by the same revenue basis for percentages; include labor and support, without double counting."],
                ["Qualified pipeline / conversion", "Buyer-confirmed need, authority, feasible scope and dated next step. Count paid buyers against the same prospect cohort and time window; free kit delivery is not paid conversion."],
                ["Retention / renewals", "Renewed contracts divided by contracts due in the period, plus retained recurring value for that cohort. Track repeat use separately. Setup and pilot fees are not recurring revenue; absent renewal cohorts are not 100% retention."],
                ["Delivery / receivables", "Customer-accepted deliveries on time divided by deliveries due; show defects and rework. Age unpaid balances against contractual due dates, with collection owner and next action."],
              ],
            },
          },
          {
            id: "authority",
            title: "Decision boundaries",
            bullets: [
              "COO: prioritize sales and coordinate delivery within approved scope and budget; propose staffing, pricing and process changes.",
              "CEO: retain company strategy, product direction, capital allocation, signing authority, commercial exceptions and strategic-customer sponsorship. Record delegated limits explicitly.",
              "CTO: confirm feasibility, release readiness, technical effort and delivery capacity before quotation. Accounting confirms cash and accounting treatment; HR owns people processes; QC verifies handover quality.",
              "The COO business title grants no application, Workspace Admin, HR or Payroll access. Authorized administrators assign permissions separately; this role cannot self-approve access, compensation or payments.",
            ],
          },
          {
            id: "requirements",
            title: "Evidence of fit",
            bullets: [
              "Can explain B2B deals personally sourced or closed: buyer problem, own contribution, scope, cash outcome, margin and lessons from a loss. Use anonymized examples with permission.",
              "Has coordinated delivery and resolved a difficult handover, overdue payment or renewal. Can distinguish a sales promise from technical and operational capacity.",
              "Works comfortably with CRM, spreadsheets, basic unit economics and AI tools while checking outputs and respecting data permissions.",
              "Communicates clearly in Vietnamese and can work with relevant English documentation. Evidence matters more than degrees, former titles or a large inherited team.",
            ],
          },
          {
            id: "collaboration",
            title: "Working with the team",
            paragraphs: [
              "Maintain one weekly review with the CEO: cash, pipeline changes, delivery risks, decisions needed and next commitments. Coordinate capacity with the CTO; share concise written updates with owners and dates. Escalate material risks promptly. The founder supports strategic deals while the COO owns agreed follow-through.",
            ],
          },
          {
            id: "assessment",
            title: "Proposed hiring assessment",
            paragraphs: [
              "A 45–60-minute exercise using fictional prospects, costs and a delivery constraint: choose an offer, role-play discovery, calculate contribution and explain a handover decision. Share criteria beforehand: buyer understanding, economics, scope discipline, execution and judgment. Score each consistently with written evidence. No real prospecting campaign or unpaid client deliverable is required.",
            ],
          },
          {
            id: "terms",
            title: "Terms to confirm before an offer",
            paragraphs: [
              "Confirm employing entity, employment type, working hours, location, travel, start date and any probation arrangement. Agree salary, variable compensation, eligibility, payment timing, refunds, equity if any, benefits, expense budget and delegated limits in writing. Existing collaborator commission proposals do not define COO compensation. This internal draft does not open a vacancy or make an employment offer.",
            ],
          },
        ],
      },
      vi: {
        title: "COO - Head of Sales & Operations",
        subtitle: "Trực tiếp bán hàng. Xây quy trình bàn giao và gia hạn đáng tin cậy.",
        summary: "Bản mô tả nội bộ cho Lumi: chịu trách nhiệm từ khách phù hợp đến thu tiền, nghiệm thu và tiếp tục sử dụng. Phạm vi, mục tiêu và điều kiện làm việc cần thống nhất trước khi tuyển.",
        department: "Kinh doanh & Vận hành",
        reportsTo: "CEO / Nhà sáng lập",
        employment: "Cần thống nhất",
        location: "Cần thống nhất địa điểm, hình thức làm việc và đi lại",
        sections: [
          {
            id: "mission",
            title: "Mục đích và trọng tâm kinh doanh",
            paragraphs: [
              "Lumi phát triển lớp vận hành AI với Workspace, BI và Agents. Vị trí này kết nối bán hàng, triển khai, sử dụng và dịch vụ định kỳ. Ưu tiên đầu tiên là trực tiếp bán hàng và giúp đội nhỏ làm việc hiệu quả.",
              "Cùng CEO chọn 1–2 gói đã duyệt: website và gia hạn Lumi Local, hoặc giải pháp Lumi có phạm vi rõ. Giữ đúng gói Basic / Workflow Kit miễn phí có giới hạn; pilot sâu hơn và triển khai cần thỏa thuận trả phí riêng. Kiểm chứng nhu cầu và khả năng bàn giao. Đề xuất Vaults chưa xác nhận khả năng triển khai hoặc quyền báo giá.",
            ],
          },
          {
            id: "sales",
            title: "Trách nhiệm kinh doanh",
            bullets: [
              "Chọn 10–30 khách tiềm năng phù hợp; ưu tiên giới thiệu và tiếp cận có chọn lọc. Xác định người dùng, người giữ ngân sách, người duyệt, vấn đề cấp thiết và lý do đổi giải pháp.",
              "Trực tiếp khám phá nhu cầu, demo, đề xuất, đàm phán và theo sát. CRM ghi bằng chứng, người phụ trách, bước tiếp theo và ngày; tôn trọng quyền liên hệ và yêu cầu dừng.",
              "Chốt phạm vi, tính khả thi, chi phí, nghiệm thu và mốc thanh toán trước cam kết. Dùng gói đang được duyệt; không hứa kết quả AI, tích hợp hay ngày giao chưa kiểm chứng.",
              "Theo đuổi quyết định trả tiền và gia hạn. Ghi lý do mất khách; sửa gói trước khi thêm kênh hoặc tuyển người bán. Mẫu miễn phí tuân thủ ngân sách công sức đã duyệt.",
            ],
          },
          {
            id: "operations",
            title: "Trách nhiệm vận hành",
            bullets: [
              "Phối hợp kỹ thuật và triển khai: phạm vi, người chịu trách nhiệm, hạn, kiểm tra chất lượng và nghiệm thu. Báo thay đổi phạm vi trước khi làm thêm.",
              "Theo dõi triển khai, hỗ trợ, thu tiền và hạn gia hạn. Xử lý chậm trễ, lỗi lặp lại; giữ quy trình ngắn, dễ dùng và đầu mối khách hàng rõ ràng.",
              "Đo công bán hàng, bàn giao, hỗ trợ, kể cả khách không mua. Bảo vệ biên lợi nhuận và tiền mặt; đối soát công nợ với kế toán, không tự xác nhận đã thu tiền.",
              "Hướng dẫn đội hiện tại qua việc thật. Chỉ đề xuất thêm người khi có nhu cầu lặp lại, hiệu quả kinh tế và thiếu năng lực thực hiện; xin duyệt ngân sách trước.",
            ],
          },
          {
            id: "first-90-days",
            title: "Đề xuất 90 ngày đầu",
            paragraphs: [
              "Đây là kỳ vọng dự thảo, chưa phải chỉ tiêu hợp đồng. Chốt mục tiêu sau khi xem số liệu nền, chu kỳ bán, độ sẵn sàng sản phẩm và năng lực đội.",
            ],
            table: {
              headers: ["Giai đoạn", "Công việc và bằng chứng đánh giá"],
              rows: [
                ["Ngày 1–30", "Chốt 1–2 gói, nhóm 10–30 khách và ngân sách công sức. Lập số liệu nền, quyền quyết định và bước tiếp theo có hạn cho cơ hội đang mở. CEO, CTO rà đề xuất đầu tiên."],
                ["Ngày 31–60", "Trực tiếp tìm pilot hoặc triển khai trả phí đầu tiên trong chu kỳ đã thống nhất; có phạm vi, tiền kế toán xác nhận và bằng chứng bàn giao. Chưa có khách trả tiền thì phân tích lý do, đổi hoặc dừng thử nghiệm."],
                ["Ngày 61–90", "Thử nhóm khách thứ hai tương đương; rà lợi nhuận đóng góp, chất lượng, sử dụng lặp lại. Chỉ mở rộng khi có nhu cầu trả tiền lặp lại và biết chi phí; nếu chưa đạt thì thu hẹp, sửa hoặc dừng. Viết quy trình người khác làm theo được."],
              ],
            },
          },
          {
            id: "scorecard",
            title: "Chỉ số và bằng chứng",
            paragraphs: [
              "Rà hằng tuần, đối soát kế toán hằng tháng. Cùng CEO đặt mục tiêu số sau khi có dữ liệu nền. Ghi rõ số chưa biết và mẫu số chưa có; không thay bằng 0. Định nghĩa quản trị dưới đây cần khớp chính sách kế toán đã thống nhất.",
            ],
            table: {
              headers: ["Chỉ số", "Định nghĩa và cách dùng"],
              rows: [
                ["Tiền thực thu", "Tiền khách trả được kế toán xác nhận; tách hoàn tiền và credit. Cọc là thanh toán một phần; giá trị ký và doanh thu ghi nhận vẫn tách riêng."],
                ["Giá trị ký / doanh thu ghi nhận", "Giá trị ký: giá trị hợp đồng được chấp thuận. Doanh thu ghi nhận: phần đã thực hiện đủ điều kiện theo chính sách kế toán. Theo dõi riêng theo kỳ; ký hoặc nhận tiền chưa tự tạo doanh thu."],
                ["Biên gộp / biên đóng góp", "Lợi nhuận gộp = doanh thu ghi nhận trừ chi phí bàn giao trực tiếp. Đóng góp trừ tiếp chi phí bán, tìm khách phân bổ. Tỷ lệ dùng cùng mẫu số doanh thu; tính công, hỗ trợ, tránh trùng."],
                ["Cơ hội đủ điều kiện / chuyển đổi", "Khách xác nhận nhu cầu, thẩm quyền, phạm vi khả thi, bước tiếp theo có hạn. Tỷ lệ khách trả tiền dùng cùng nhóm và thời gian; giao kit miễn phí chưa phải chuyển đổi trả tiền."],
                ["Giữ khách / gia hạn", "Số hợp đồng gia hạn chia số đến hạn trong kỳ; kèm giá trị định kỳ giữ lại của cùng nhóm. Theo dõi sử dụng riêng. Phí setup, pilot không phải doanh thu định kỳ; chưa đến hạn không tính giữ khách 100%."],
                ["Bàn giao / công nợ", "Số bàn giao được khách nghiệm thu đúng hạn chia số đến hạn; kèm lỗi và công sửa. Phân tuổi nợ theo hạn hợp đồng, người thu và bước xử lý."],
              ],
            },
          },
          {
            id: "authority",
            title: "Phạm vi quyết định",
            bullets: [
              "COO ưu tiên bán hàng, điều phối bàn giao trong phạm vi và ngân sách đã duyệt; đề xuất nhân sự, giá và quy trình.",
              "CEO giữ chiến lược, hướng sản phẩm, phân bổ vốn, quyền ký, duyệt ngoại lệ thương mại và bảo trợ khách chiến lược. Hạn mức ủy quyền phải ghi rõ.",
              "CTO xác nhận khả thi, phiên bản sẵn sàng, công kỹ thuật và năng lực giao trước báo giá. Kế toán xác nhận tiền, hạch toán; HR phụ trách quy trình nhân sự; QC kiểm tra chất lượng bàn giao.",
              "Chức danh COO không tự cấp quyền ứng dụng, Workspace Admin, HR hay Payroll. Quản trị viên có thẩm quyền cấp riêng; vị trí này không tự duyệt quyền truy cập, thu nhập hay thanh toán.",
            ],
          },
          {
            id: "requirements",
            title: "Bằng chứng phù hợp",
            bullets: [
              "Giải thích được giao dịch B2B tự tìm hoặc chốt: vấn đề, đóng góp cá nhân, phạm vi, tiền thu, biên lợi nhuận và bài học mất khách. Dùng ví dụ ẩn danh được phép chia sẻ.",
              "Đã điều phối bàn giao, xử lý tình huống khó về triển khai, nợ hoặc gia hạn. Phân biệt được lời hứa bán hàng và năng lực thực hiện.",
              "Dùng được CRM, bảng tính, kinh tế đơn vị và AI; biết kiểm tra kết quả, tôn trọng quyền dữ liệu.",
              "Giao tiếp tiếng Việt rõ; đọc được tài liệu tiếng Anh liên quan. Ưu tiên bằng chứng năng lực hơn bằng cấp, chức danh hay đội lớn được bàn giao sẵn.",
            ],
          },
          {
            id: "collaboration",
            title: "Cách phối hợp",
            paragraphs: [
              "Rà với CEO mỗi tuần: tiền, thay đổi cơ hội, rủi ro bàn giao, quyết định cần duyệt, cam kết tiếp theo. Phối hợp năng lực với CTO; cập nhật ngắn có người và hạn. Báo sớm rủi ro lớn. Founder hỗ trợ khách chiến lược; COO theo đến cùng phần đã nhận.",
            ],
          },
          {
            id: "assessment",
            title: "Đề xuất đánh giá tuyển dụng",
            paragraphs: [
              "Bài 45–60 phút với khách, chi phí và giới hạn bàn giao giả lập: chọn gói, diễn tập hỏi nhu cầu, tính đóng góp, giải thích quyết định bàn giao. Công bố trước tiêu chí: hiểu khách, kinh tế, giữ phạm vi, thực thi, phán đoán; chấm nhất quán kèm bằng chứng. Không yêu cầu tìm khách thật hay làm miễn phí cho khách.",
            ],
          },
          {
            id: "terms",
            title: "Điều kiện cần chốt trước đề nghị tuyển",
            paragraphs: [
              "Xác nhận pháp nhân tuyển, loại hợp đồng, giờ, nơi làm, đi lại, ngày bắt đầu và thử việc nếu có. Thống nhất bằng văn bản lương, thưởng, điều kiện hưởng, kỳ chi, hoàn tiền, cổ phần nếu có, phúc lợi, ngân sách và ủy quyền. Đề xuất hoa hồng cộng tác viên không quy định thu nhập COO. Bản nội bộ này chưa mở tuyển hoặc đưa đề nghị làm việc.",
            ],
          },
        ],
      },
    },
  },
];

export function findJobDescription(slug: string): JobDescription | undefined {
  return jobDescriptions.find((description) => description.slug === slug);
}

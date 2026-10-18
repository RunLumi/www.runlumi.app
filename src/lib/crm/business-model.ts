// Business model canvases for the two sales motions. Each statement carries
// how we know it (grade) and where it is written down (sources). This file is
// public source: it holds strategy, prices, rules and hypotheses only. Customer
// names, counts and revenue never go here; the page reads them from the CRM.
// Links to other repositories are pinned to the commit that was reviewed.
import type { Lang } from "./i18n";
import type { Motion } from "./business-evidence";

export interface Text { en: string; vi: string }
export const grades = [
  { key: "observed", tone: "green", name: { en: "Observed", vi: "Đã quan sát" }, meaning: { en: "Happened and was recorded, with a date.", vi: "Đã xảy ra và được ghi lại, có ngày." } },
  { key: "decided", tone: "blue", name: { en: "Decided", vi: "Đã quyết" }, meaning: { en: "An owner decision or written rule. A choice, not proof that it works.", vi: "Quyết định của chủ hoặc quy tắc đã viết. Là lựa chọn, chưa chứng minh là hiệu quả." } },
  { key: "priced", tone: "", name: { en: "Priced", vi: "Có giá" }, meaning: { en: "A list price or price proposal. A price is not proof that anyone pays it.", vi: "Giá niêm yết hoặc giá đề xuất. Có giá chưa có nghĩa là có người trả." } },
  { key: "hypothesis", tone: "amber", name: { en: "Hypothesis", vi: "Giả thuyết" }, meaning: { en: "A belief or target that still has to be tested.", vi: "Niềm tin hoặc mục tiêu còn phải kiểm chứng." } },
  { key: "unknown", tone: "red", name: { en: "Unknown", vi: "Chưa biết" }, meaning: { en: "Not decided or not measured yet.", vi: "Chưa quyết hoặc chưa đo." } },
] as const;
export type Grade = typeof grades[number]["key"];

/** Fill and reading order (customer first, costs last); also the mobile order. */
export const blockOrder = ["segments", "value", "channels", "relationships", "revenue", "resources", "activities", "partners", "costs"] as const;
export type BlockKey = typeof blockOrder[number];
export const blocks: Record<BlockKey, Text> = {
  segments: { en: "Customer segments", vi: "Phân khúc khách hàng" },
  value: { en: "Value propositions", vi: "Giá trị mang lại" },
  channels: { en: "Channels", vi: "Kênh" },
  relationships: { en: "Customer relationships", vi: "Quan hệ khách hàng" },
  revenue: { en: "Revenue streams", vi: "Dòng doanh thu" },
  resources: { en: "Key resources", vi: "Nguồn lực chính" },
  activities: { en: "Key activities", vi: "Hoạt động chính" },
  partners: { en: "Key partners", vi: "Đối tác chính" },
  costs: { en: "Cost structure", vi: "Cấu trúc chi phí" },
};

/**
 * A source is `repo:path` with an optional `#Lstart-Lend`. `www` is this
 * repository (tests check the file and lines exist); other repositories are
 * linked at the reviewed commit below.
 */
export const reviewedOn = "2026-10-18";
export const pinnedCommits = {
  "local.runlumi": "70288e3647305904dbe7fe335edfffb1e7fd627c",
  "agents.runlumi_app": "1a74c86285e4be4c19d60d8cef8bea3ebafac5c5",
  "lumi-vaults": "24b40e831bc3fd435c64d8631fafadca49d097ca",
  "lumi-hq": "a3b0b9c7fae05ecfcfbaf0e83e5cb35cc8e6c48a",
} as const;

export interface Item extends Text { grade: Grade; sources: readonly string[] }
export interface Assumption { belief: Text; test: Text; pass: Text; stop: Text; sources: readonly string[] }
export interface Decision extends Text { sources: readonly string[] }
export interface Canvas {
  id: Motion; playbooks: readonly string[]; name: Text; summary: Text;
  blocks: Record<BlockKey, readonly Item[]>;
  assumptions: readonly Assumption[]; decisions: readonly Decision[];
}

const LOCAL_GUIDE = "www:docs/Lumi_Sales_Process.en.md";
const SOLUTION_GUIDE = "www:docs/Lumi_Agents_Vaults_Sales_Process.en.md";

const local: Canvas = {
  id: "local", playbooks: ["local-preview", "local-renewal"],
  name: { en: "Lumi Local", vi: "Lumi Local" },
  summary: {
    en: "Websites and Google review cards for owner-run local businesses, sold face to face.",
    vi: "Website và bảng đánh giá Google cho cơ sở kinh doanh địa phương do chủ trực tiếp điều hành, bán trực tiếp tại cơ sở.",
  },
  blocks: {
    segments: [
      { grade: "hypothesis", en: "Owner-run local service businesses in Ho Chi Minh City with walk-in customers, a reachable owner and a concrete mobile problem: people cannot find services, prices, directions or a working contact route.", vi: "Cơ sở dịch vụ địa phương ở TP.HCM do chủ trực tiếp điều hành, có khách đến tận nơi, gặp được chủ và có vấn đề cụ thể trên điện thoại: khách không tìm được dịch vụ, giá, đường đi hoặc cách liên hệ còn hoạt động.", sources: ["local.runlumi:STRATEGY.md#L25-L27", `${LOCAL_GUIDE}#L39`] },
      { grade: "decided", en: "Pilot areas: Bình Thạnh and District 4, 30 qualified businesses in total. The owner confirmed the areas on 4 October 2026.", vi: "Khu vực thử: Bình Thạnh và Quận 4, tổng cộng 30 cơ sở đủ điều kiện. Chủ đã xác nhận khu vực ngày 4/10/2026.", sources: ["local.runlumi:docs/PILOT.md#L3-L7", "local.runlumi:STRATEGY.md#L25"] },
      { grade: "hypothesis", en: "First category: independent garages. The strategy calls this a recommendation, not a market fact.", vi: "Ngành đầu tiên: gara độc lập. Chiến lược ghi rõ đây là đề xuất, chưa phải sự thật thị trường.", sources: ["local.runlumi:STRATEGY.md#L25"] },
      { grade: "decided", en: "A business that buys only the website is a valid customer. AI help with operations is offered only when a repeated job appears and the owner wants it.", vi: "Cơ sở chỉ mua website vẫn là khách hàng hợp lệ. Trợ giúp vận hành bằng AI chỉ đề xuất khi có việc lặp lại và chủ muốn dùng.", sources: ["lumi-hq:decisions/0003-small-business-capability.md#L18", "lumi-hq:README.md#L33-L41"] },
    ],
    value: [
      { grade: "decided", en: "Be found, be trusted, be easier to contact. Lumi builds and runs a mobile site that connects the Maps listing, Facebook and Zalo the owner already uses.", vi: "Được tìm thấy, được tin tưởng, được liên hệ dễ hơn. Lumi làm và vận hành website trên điện thoại, nối Maps, Facebook và Zalo mà chủ đang dùng.", sources: ["local.runlumi:README.md#L5", "local.runlumi:STRATEGY.md#L27"] },
      { grade: "decided", en: "A free printed Google review card (Trust Kit Basic) with no purchase condition. The website is the product; Trust Kit Pro comes with Starter.", vi: "Tặng bảng QR đánh giá Google đã in (Trust Kit Basic), không kèm điều kiện mua. Website là sản phẩm chính; Trust Kit Pro đi kèm gói Starter.", sources: [`${LOCAL_GUIDE}#L5`, `${LOCAL_GUIDE}#L13-L15`] },
      { grade: "decided", en: "No promises about rankings, review volume, customers or revenue. No Google passwords or edit access, and no screening of unhappy reviewers.", vi: "Không hứa thứ hạng, số đánh giá, khách hàng hay doanh thu. Không xin mật khẩu hay quyền sửa Google, không lọc người đánh giá không hài lòng.", sources: ["local.runlumi:PRICING.md#L123-L125", `${LOCAL_GUIDE}#L21`] },
      { grade: "unknown", en: "Whether owners need it. The strategy's own strongest objection: Maps, Facebook and Zalo may already bring enough customers, and a polite reaction to a free preview is not willingness to pay.", vi: "Chủ có thật sự cần hay không. Phản biện mạnh nhất trong chính chiến lược: Maps, Facebook và Zalo có thể đã đủ khách, và phản ứng lịch sự với bản xem thử miễn phí không phải là sẵn lòng trả tiền.", sources: ["local.runlumi:STRATEGY.md#L9"] },
    ],
    channels: [
      { grade: "decided", en: "Owner visits in one cluster: ask permission first, bring the free card, show the business's own private draft on a phone.", vi: "Gặp chủ trong một cụm: xin phép trước, mang bảng tặng, cho xem bản nháp riêng của chính cơ sở trên điện thoại.", sources: [`${LOCAL_GUIDE}#L25`, `${LOCAL_GUIDE}#L49`] },
      { grade: "decided", en: "Introductions from customers and neighbouring owners are worked before cold prospects.", vi: "Lời giới thiệu từ khách và chủ tiệm lân cận được làm trước khách lạ.", sources: [`${LOCAL_GUIDE}#L51`] },
      { grade: "observed", en: "Agent-run Facebook prospecting is blocked: Meta's terms require express written permission, and none exists (read on 7 October 2026).", vi: "Không thể để agent tìm khách trên Facebook: điều khoản của Meta yêu cầu văn bản cho phép rõ ràng và hiện chưa có (đọc ngày 7/10/2026).", sources: ["local.runlumi:STRATEGY.md#L66", "local.runlumi:docs/gtm/RESEARCH-2026-10-07.md#L20-L21"] },
      { grade: "observed", en: "Search brings nothing yet: Search Console showed 0 clicks and 0 impressions for 28 September to 4 October 2026.", vi: "Tìm kiếm chưa mang lại gì: Search Console ghi 0 lượt nhấp và 0 lượt hiển thị từ 28/9 đến 4/10/2026.", sources: ["local.runlumi:docs/seo/research/2026-10-07-search-console-snapshot.md#L10"] },
      { grade: "hypothesis", en: "Later channel order: field sales, then pages about real problems, then referral partners, marketplaces and paid ads last.", vi: "Thứ tự kênh về sau: bán trực tiếp, rồi các trang nói về vấn đề thật, rồi đối tác giới thiệu, sàn và quảng cáo trả tiền sau cùng.", sources: ["local.runlumi:docs/google-maps-service-research.md#L199-L205"] },
    ],
    relationships: [
      { grade: "decided", en: "A private draft before any commitment. The owner approves content before publication; one basic revision round is included.", vi: "Bản nháp riêng tư trước mọi cam kết. Chủ duyệt nội dung trước khi đăng; có một vòng sửa cơ bản.", sources: ["local.runlumi:STRATEGY.md#L41", "local.runlumi:docs/PILOT.md#L21-L25"] },
      { grade: "decided", en: "No cold follow-ups; stop on \"not now\" or opt-out; do-not-contact applies on every channel.", vi: "Không nhắn lại khi chủ chưa đồng ý; dừng khi chủ nói \"chưa tiện\" hoặc từ chối; danh sách không liên hệ áp dụng trên mọi kênh.", sources: ["local.runlumi:docs/gtm/MESSAGES_AND_MEETINGS.md#L67-L69", `${LOCAL_GUIDE}#L49`] },
      { grade: "decided", en: "Renewal is a separate decision each year. The domain and data stay the customer's; retention has to come from value.", vi: "Gia hạn là quyết định riêng mỗi năm. Tên miền và dữ liệu thuộc về khách; giữ khách phải bằng giá trị.", sources: [`${LOCAL_GUIDE}#L16`, "lumi-hq:pricing/README.md#L49"] },
    ],
    revenue: [
      { grade: "priced", en: "Starter: 1,990,000 VND for year one, including the website, hosting and SSL, one revision round and one Trust Kit Pro kit.", vi: "Starter: 1.990.000đ năm đầu, gồm website, hosting và SSL, một vòng sửa và một bộ Trust Kit Pro.", sources: [`${LOCAL_GUIDE}#L14`] },
      { grade: "priced", en: "Renewal from year two: 599,000 VND/year on a RunLumi address or 999,000 VND/year with the customer's own domain. Never counted as year-one money.", vi: "Gia hạn từ năm hai: 599.000đ/năm với địa chỉ RunLumi hoặc 999.000đ/năm với tên miền riêng. Không tính vào tiền năm đầu.", sources: [`${LOCAL_GUIDE}#L16`, "local.runlumi:PRICING.md#L12-L13"] },
      { grade: "priced", en: "Paid Trust Kit at 399,000 VND is still configured and still on the public Local site. Buyers keep a 30-day credit of 399,000 VND toward Starter.", vi: "Trust Kit trả phí 399.000đ vẫn được cấu hình và vẫn hiện trên trang Local công khai. Người đã mua giữ quyền trừ 399.000đ khi lên Starter trong 30 ngày.", sources: [`${LOCAL_GUIDE}#L17`, "www:docs/crm/README.md#L52-L55"] },
      { grade: "decided", en: "Full payment before publication and Pro handover. Money counts only after Finance confirms it; Partners never handle payments.", vi: "Thu đủ tiền trước khi đăng website và giao Pro. Tiền chỉ được tính khi Tài chính xác nhận; cộng tác viên không cầm tiền.", sources: [`${LOCAL_GUIDE}#L120`, `${LOCAL_GUIDE}#L112`] },
    ],
    resources: [
      { grade: "decided", en: "This CRM: versioned playbooks and offers, frozen quotes, an append-only ledger, cohort gates and delivery records.", vi: "CRM này: playbook và gói có phiên bản, báo giá cố định, sổ thương mại chỉ ghi thêm, cổng cohort và hồ sơ bàn giao.", sources: ["www:docs/crm/README.md#L28-L44"] },
      { grade: "observed", en: "The Lumi Local marketing site is live on Cloudflare (release recorded 8 October 2026).", vi: "Trang giới thiệu Lumi Local đang chạy trên Cloudflare (bản phát hành ghi ngày 8/10/2026).", sources: ["local.runlumi:docs/seo/STATUS.md#L38-L39"] },
      { grade: "unknown", en: "How fast a personal draft can be made. No automated site process exists yet, and no preview time has been measured.", vi: "Làm một bản nháp riêng mất bao lâu. Chưa có quy trình tạo website tự động và chưa đo thời gian làm bản xem thử nào.", sources: ["local.runlumi:STRATEGY.md#L13"] },
    ],
    activities: [
      { grade: "decided", en: "Qualify a 30-business cluster, make each business's own private draft, print and deliver the free card.", vi: "Chọn lọc 30 cơ sở trong một cụm, làm bản nháp riêng cho từng cơ sở, in và tặng bảng QR.", sources: [`${LOCAL_GUIDE}#L25`, `${LOCAL_GUIDE}#L33`] },
      { grade: "decided", en: "Owner conversation, draft shown, quote, Finance-confirmed payment, then delivery with owner approval and QR checks.", vi: "Trao đổi với chủ, cho xem bản nháp, báo giá, Tài chính xác nhận tiền, rồi bàn giao khi chủ đã duyệt và đã kiểm tra QR.", sources: [`${LOCAL_GUIDE}#L111-L114`] },
      { grade: "decided", en: "A weekly funnel review on one line: drafts, owners attempted, owners met, cards delivered, drafts shown, paid Starters, introductions.", vi: "Rà soát phễu hằng tuần trên một dòng số: bản nháp, chủ đã tiếp cận, chủ đã gặp, bảng đã giao, bản nháp đã xem, Starter trả tiền, lời giới thiệu.", sources: [`${LOCAL_GUIDE}#L183`] },
    ],
    partners: [
      { grade: "unknown", en: "A print supplier for Basic and Pro. Specifications, unit cost and budget are not approved yet.", vi: "Đơn vị in cho Basic và Pro. Quy cách, đơn giá và ngân sách chưa được duyệt.", sources: [`${LOCAL_GUIDE}#L29`] },
      { grade: "decided", en: "Lumi Partners (collaborators) who sell or refer. Their commission is still a proposal; nothing is paid until a version is approved.", vi: "Cộng tác viên Lumi tự bán hoặc giới thiệu khách. Hoa hồng vẫn là đề xuất; chưa chi khoản nào cho tới khi một phiên bản được duyệt.", sources: ["www:docs/crm/COMMISSION.md#L3-L7"] },
      { grade: "decided", en: "Google review links and Maps are platforms Lumi depends on but does not control. Links can change, so no permanent function is promised.", vi: "Link đánh giá Google và Maps là nền tảng Lumi phụ thuộc nhưng không kiểm soát. Link có thể đổi nên không hứa hoạt động vĩnh viễn.", sources: [`${LOCAL_GUIDE}#L21`] },
    ],
    costs: [
      { grade: "decided", en: "Every cohort cost counts: research, drafts, travel, free card printing, founder time and visits that sold nothing. Unknown costs fail the scale gate.", vi: "Mọi chi phí của cohort đều tính: nghiên cứu, bản nháp, đi lại, in bảng tặng, thời gian founder và các lượt ghé không bán được. Chi phí chưa biết thì không qua cổng mở rộng.", sources: ["local.runlumi:STRATEGY.md#L47", `${LOCAL_GUIDE}#L177`] },
      { grade: "decided", en: "Scale only if CAC is at most 600,000 VND per Starter, median delivery at most 120 minutes (p90 at most 240) and year-one contribution stays positive after a support reserve.", vi: "Chỉ mở rộng khi CAC không quá 600.000đ mỗi Starter, thời gian bàn giao trung vị không quá 120 phút (p90 không quá 240) và đóng góp năm đầu vẫn dương sau dự phòng hỗ trợ.", sources: ["local.runlumi:STRATEGY.md#L52", "www:docs/crm/README.md#L60"] },
      { grade: "hypothesis", en: "Unit-cost assumptions disagree: 100,000 VND per labour hour and 30,000 VND hosting a year in the commission analysis, 250,000 VND per hour in HQ pricing. Neither is measured.", vi: "Các giả định chi phí đơn vị đang lệch nhau: 100.000đ một giờ công và 30.000đ hosting mỗi năm trong phân tích hoa hồng, 250.000đ một giờ trong bảng giá HQ. Chưa số nào được đo.", sources: ["www:docs/crm/COMMISSION.md#L37-L41", "lumi-hq:pricing/README.md#L53"] },
      { grade: "unknown", en: "The pilot's cash and time budget and the print cost of Basic and Pro are not set.", vi: "Ngân sách tiền và thời gian của đợt thử, cùng chi phí in Basic và Pro, chưa được chốt.", sources: ["local.runlumi:docs/PILOT.md#L7", `${LOCAL_GUIDE}#L29`] },
    ],
  },
  assumptions: [
    {
      belief: { en: "Owners who already get customers through Maps, Facebook and Zalo will pay 1,990,000 VND for a website.", vi: "Chủ đã có khách qua Maps, Facebook và Zalo vẫn sẽ trả 1.990.000đ cho một website." },
      test: { en: "One 30-business cohort in one cluster: the first 10 visits, then the other 20 only after review.", vi: "Một cohort 30 cơ sở trong một cụm: 10 lượt ghé đầu, rồi 20 cơ sở còn lại chỉ sau khi rà soát." },
      pass: { en: "At least 6 of 30 businesses pay and at least 2 buy Starter.", vi: "Ít nhất 6/30 cơ sở trả tiền và ít nhất 2 cơ sở mua Starter." },
      stop: { en: "No paid Starter after 20 qualified owner conversations: review the problem, segment and pitch before more visits.", vi: "Chưa có Starter trả tiền sau 20 cuộc trao đổi đủ điều kiện: xem lại vấn đề, phân khúc và cách bán trước khi ghé thêm." },
      sources: ["local.runlumi:STRATEGY.md#L9", "local.runlumi:STRATEGY.md#L51", "local.runlumi:STRATEGY.md#L56", `${LOCAL_GUIDE}#L25`],
    },
    {
      belief: { en: "A free printed card gets the owner to talk.", vi: "Bảng QR tặng giúp gặp được chủ để nói chuyện." },
      test: { en: "The weekly funnel: owners attempted, owners met, cards delivered.", vi: "Phễu hằng tuần: chủ đã tiếp cận, chủ đã gặp, bảng đã giao." },
      pass: { en: "No pass rate is set. The guide gives a working target of 30 owner attempts in two weeks, which is effort, not a result.", vi: "Chưa có ngưỡng đạt. Hướng dẫn chỉ đặt mục tiêu làm việc 30 lượt tiếp cận chủ trong hai tuần, đó là công sức, không phải kết quả." },
      stop: { en: "Owners cannot be reached: change the cluster or the visiting hour. Never add gift value.", vi: "Không gặp được chủ: đổi cụm hoặc đổi giờ ghé. Không tăng giá trị quà." },
      sources: [`${LOCAL_GUIDE}#L183`, `${LOCAL_GUIDE}#L185`],
    },
    {
      belief: { en: "Delivery stays small enough to make money at this price.", vi: "Công bàn giao đủ nhỏ để có lãi ở mức giá này." },
      test: { en: "Record minutes and money for every draft and delivery in the first cohort.", vi: "Ghi phút và tiền cho mọi bản nháp và mọi lần bàn giao trong cohort đầu." },
      pass: { en: "Average draft time at most 5 minutes, CAC at most 600,000 VND, median delivery at most 120 minutes, positive contribution after reserve.", vi: "Bản nháp trung bình không quá 5 phút, CAC không quá 600.000đ, bàn giao trung vị không quá 120 phút, đóng góp dương sau dự phòng." },
      stop: { en: "Costs are unknown or paid delivery loses money: pause acquisition and fix the scope.", vi: "Chi phí chưa biết hoặc bàn giao có trả tiền mà vẫn lỗ: dừng tìm khách và sửa phạm vi." },
      sources: ["local.runlumi:STRATEGY.md#L51-L54", "www:docs/crm/README.md#L60"],
    },
  ],
  decisions: [
    { en: "Choose one Local price ladder. Three are in force: a paid Trust Kit at 399,000 VND (CRM and the public site, which also says printing is not included), a free Basic with Starter including Pro (sales guide 2.1), and HQ pricing v2 with Core at 5,900,000 VND for year one.", vi: "Chọn một bảng giá Local. Đang có ba bảng cùng lúc: Trust Kit trả phí 399.000đ (CRM và trang công khai, trang này còn ghi không gồm in ấn), Basic tặng miễn phí với Starter gồm Pro (hướng dẫn 2.1), và bảng giá HQ v2 với Core 5.900.000đ năm đầu.", sources: ["local.runlumi:PRICING.md#L123", `${LOCAL_GUIDE}#L13-L15`, "lumi-hq:decisions/0004-ai-assisted-website-pricing.md#L14"] },
    { en: "Choose the first category: independent garages (Local strategy, 4 October 2026) or HVAC and maintenance (HQ decisions 0001 and 0003). No record reconciles the two.", vi: "Chọn ngành đầu tiên: gara độc lập (chiến lược Local, 4/10/2026) hay điện lạnh và bảo trì (quyết định HQ 0001 và 0003). Chưa có văn bản nào thống nhất hai hướng.", sources: ["local.runlumi:STRATEGY.md#L25", "lumi-hq:decisions/0001-google-maps-ai-sales.md#L21", "lumi-hq:decisions/0003-small-business-capability.md#L32"] },
    { en: "Approve or replace the commission proposal before any Partner sells.", vi: "Duyệt hoặc thay đề xuất hoa hồng trước khi cộng tác viên bắt đầu bán.", sources: ["www:docs/crm/COMMISSION.md#L3-L7"] },
    { en: "Set the pilot's cash and time budget and approve the Basic and Pro print specification and cost.", vi: "Chốt ngân sách tiền và thời gian cho đợt thử, duyệt quy cách và chi phí in Basic và Pro.", sources: ["local.runlumi:docs/PILOT.md#L7", `${LOCAL_GUIDE}#L29`] },
    { en: "Set one hourly labour cost for all unit economics (100,000 or 250,000 VND per hour), so CAC and contribution mean the same thing everywhere.", vi: "Chốt một mức chi phí giờ công cho mọi phép tính (100.000đ hay 250.000đ một giờ), để CAC và đóng góp có cùng một nghĩa ở mọi nơi.", sources: ["www:docs/crm/COMMISSION.md#L37", "lumi-hq:pricing/README.md#L53"] },
  ],
};

const solutions: Canvas = {
  id: "solutions", playbooks: ["lumi-solution"],
  name: { en: "Lumi Agents, BI and Vaults", vi: "Lumi Agents, BI và Vaults" },
  summary: {
    en: "Scoped work for teams with repeated, file-heavy jobs, opened with a free Workflow Kit.",
    vi: "Công việc theo phạm vi cho đội ngũ có việc lặp lại, nhiều tài liệu, mở đầu bằng Workflow Kit miễn phí.",
  },
  blocks: {
    segments: [
      { grade: "hypothesis", en: "Owner-led importers, distributors and wholesalers, about 30 to 150 staff, with recurring catalogues, price lists, quotes and staff handovers. Written as an inference, not a validated finding.", vi: "Doanh nghiệp nhập khẩu, phân phối và bán buôn do chủ điều hành, khoảng 30 đến 150 người, có danh mục, bảng giá, báo giá và bàn giao nhân sự lặp lại. Được ghi là suy luận, chưa được kiểm chứng.", sources: [`${SOLUTION_GUIDE}#L43`, "lumi-vaults:docs/gtm/03-icp.md#L10"] },
      { grade: "hypothesis", en: "BI buyer: a company whose numbers sit in several systems and that has a named owner for each data source.", vi: "Người mua BI: doanh nghiệp có số liệu nằm ở nhiều hệ thống và có người chịu trách nhiệm cho từng nguồn dữ liệu.", sources: ["agents.runlumi_app:knowledge-base/products/lumi-bi.md#L12"] },
      { grade: "hypothesis", en: "Buying roles: the owner or CEO pays, a COO or department head adopts, IT or privacy can veto.", vi: "Vai trò khi mua: chủ hoặc CEO chi tiền, COO hoặc trưởng bộ phận sử dụng, IT hoặc người phụ trách dữ liệu cá nhân có quyền phủ quyết.", sources: ["lumi-vaults:docs/gtm/03-icp.md#L13-L15"] },
    ],
    value: [
      { grade: "decided", en: "Do one repeated job on the files and tools the company already has: read, draft, then a person reviews. No publishing, no writes to commercial systems, no data migration.", vi: "Làm một việc lặp lại trên tài liệu và công cụ doanh nghiệp đang có: đọc, soạn nháp, rồi người kiểm duyệt. Không tự đăng, không ghi vào hệ thống thương mại, không chuyển dữ liệu.", sources: ["agents.runlumi_app:strategy/decisions.md#L16-L18"] },
      { grade: "observed", en: "BI: the founder confirmed deployment for customers on 13 October 2026. Customer count, payment and acceptance are not recorded in Git.", vi: "BI: founder xác nhận đã triển khai cho khách ngày 13/10/2026. Số khách, thanh toán và nghiệm thu chưa được ghi trong Git.", sources: ["agents.runlumi_app:knowledge-base/products/lumi-bi.md#L1-L8"] },
      { grade: "hypothesis", en: "Vaults: when people change, the company's work stays, and AI gets only the access it needs. On-premise, files owned by roles. Pre-alpha.", vi: "Vaults: người đổi thì công việc của công ty vẫn còn, và AI chỉ được quyền vừa đủ. Đặt tại công ty, tài liệu thuộc về vai trò. Đang ở giai đoạn pre-alpha.", sources: ["lumi-vaults:docs/gtm/README.md#L3-L7", "lumi-vaults:README.md#L10-L13"] },
      { grade: "decided", en: "No promises of revenue, ROAS, headcount savings or productivity multiples, and no claim that Google or Microsoft lack access control.", vi: "Không hứa doanh thu, ROAS, giảm nhân sự hay tăng năng suất theo bội số, và không nói Google hay Microsoft thiếu phân quyền.", sources: ["agents.runlumi_app:pricing.md#L55-L57", `${SOLUTION_GUIDE}#L183`] },
    ],
    channels: [
      { grade: "decided", en: "Founder-led and delivered on site with 3 to 5 design partners. Not self-serve, not paid acquisition, marketplaces later.", vi: "Founder trực tiếp bán và triển khai tại chỗ cùng 3 đến 5 đối tác đầu tiên. Không tự phục vụ, không mua khách, sàn phân phối để sau.", sources: ["agents.runlumi_app:gtm/README.md#L5-L13"] },
      { grade: "hypothesis", en: "Free Workflow Kit: one job, synthetic data by default, at most 2 Lumi hours, and the customer keeps the files.", vi: "Workflow Kit miễn phí: một việc, mặc định dùng dữ liệu giả lập, tối đa 2 giờ công Lumi, khách giữ tài liệu.", sources: [`${SOLUTION_GUIDE}#L5`, `${SOLUTION_GUIDE}#L26-L37`] },
      { grade: "hypothesis", en: "Trusted relationships and permission-based introductions first, then selected outbound. IT and NAS installers or ERP partners for Vaults are proposed, none signed.", vi: "Ưu tiên quan hệ tin cậy và lời giới thiệu có sự đồng ý, sau đó mới chủ động liên hệ có chọn lọc. Đối tác IT, NAS hay ERP cho Vaults mới là đề xuất, chưa ký với ai.", sources: [`${SOLUTION_GUIDE}#L43`, "lumi-vaults:docs/gtm/21-partner-playbook.md#L3"] },
      { grade: "observed", en: "agents.runlumi.app is live and its enquiry form delivers to an internal channel, tested with a synthetic enquiry on 27 September 2026.", vi: "agents.runlumi.app đang chạy và form liên hệ gửi về kênh nội bộ, đã thử bằng một yêu cầu giả lập ngày 27/9/2026.", sources: ["agents.runlumi_app:web/TRIAL_SIGNUP.md#L7-L9", "agents.runlumi_app:web/TRIAL_SIGNUP.md#L21-L25"] },
    ],
    relationships: [
      { grade: "decided", en: "Kit, result review, a paid pilot only if needed, implementation, acceptance, then maintenance or training. Nothing becomes paid without a new buying decision.", vi: "Kit, xem kết quả, pilot có trả phí chỉ khi cần, triển khai, nghiệm thu, rồi bảo trì hoặc đào tạo. Không có gì tự chuyển sang trả phí nếu khách chưa quyết định mua.", sources: [`${SOLUTION_GUIDE}#L7`, `${SOLUTION_GUIDE}#L134`] },
      { grade: "decided", en: "Fix the incumbent first. If Drive, SharePoint or a NAS solves it, record a no-sell.", vi: "Thử sửa công cụ đang có trước. Nếu Drive, SharePoint hay NAS giải quyết được thì ghi là không bán.", sources: [`${SOLUTION_GUIDE}#L93`, "lumi-vaults:docs/gtm/pricing.md#L54"] },
      { grade: "hypothesis", en: "Vaults support budget: about 2 hours a month for Team and 4 for Company. Beyond about 2.5 or 4.2 hours the margin target breaks.", vi: "Ngân sách hỗ trợ Vaults: khoảng 2 giờ mỗi tháng cho Team và 4 giờ cho Company. Vượt khoảng 2,5 hoặc 4,2 giờ thì không đạt biên lợi nhuận mục tiêu.", sources: ["lumi-vaults:docs/gtm/pricing.md#L113-L123"] },
    ],
    revenue: [
      { grade: "priced", en: "BI dashboard 9,900,000 VND per implementation; Agents connection 9,900,000 VND; both 19,800,000 VND. A founder proposal of 1 October 2026, published on the Agents site, not evidence that customers accept it.", vi: "Dashboard BI 9.900.000đ mỗi lần triển khai; kết nối Agents 9.900.000đ; cả hai 19.800.000đ. Đề xuất của founder ngày 1/10/2026, đã đăng trên trang Agents, chưa phải bằng chứng khách chấp nhận giá.", sources: ["agents.runlumi_app:pricing.md#L5-L17"] },
      { grade: "priced", en: "After delivery: maintenance at 6,900,000 VND a year, or training and improvement at 3,000,000 or 6,000,000 VND a month.", vi: "Sau bàn giao: bảo trì 6.900.000đ mỗi năm, hoặc đào tạo và cải tiến 3.000.000đ hay 6.000.000đ mỗi tháng.", sources: ["agents.runlumi_app:pricing.md#L18-L20"] },
      { grade: "priced", en: "Vaults, internal proposal, not a live quote: 9,900,000 VND pilot; Team 3,900,000 VND a month plus 9,900,000 setup; Company 6,900,000 VND a month plus 19,900,000 setup.", vi: "Vaults, đề xuất nội bộ, chưa báo giá: pilot 9.900.000đ; Team 3.900.000đ mỗi tháng cộng 9.900.000đ cài đặt; Company 6.900.000đ mỗi tháng cộng 19.900.000đ cài đặt.", sources: ["lumi-vaults:docs/gtm/pricing.md#L3", "lumi-vaults:docs/gtm/pricing.md#L63-L66", `${SOLUTION_GUIDE}#L125`] },
      { grade: "decided", en: "50% at signing and 50% at acceptance where the agreement says so. One-time work is not recurring revenue. Customers pay their AI vendor directly; Lumi does not resell tokens or seats.", vi: "50% khi ký và 50% khi nghiệm thu nếu thỏa thuận ghi vậy. Việc làm một lần không phải doanh thu định kỳ. Khách tự trả tiền cho nhà cung cấp AI; Lumi không bán lại token hay tài khoản.", sources: [`${SOLUTION_GUIDE}#L130`, `${SOLUTION_GUIDE}#L134`, "agents.runlumi_app:strategy/decisions.md#L24"] },
    ],
    resources: [
      { grade: "observed", en: "Vaults code: a Rust server with access, audit, storage, backup and MCP modules and integration tests. No release, tag or security sign-off yet.", vi: "Mã nguồn Vaults: máy chủ Rust có phân quyền, nhật ký, lưu trữ, sao lưu, MCP và kiểm thử tích hợp. Chưa có bản phát hành, tag hay ký duyệt bảo mật.", sources: ["lumi-vaults:README.md#L142-L147", "lumi-vaults:docs/checklists/SECURITY.md#L183-L191"] },
      { grade: "observed", en: "Agents: the Catalog pack has written validators and 23 synthetic evaluation cases; every case is still marked not run.", vi: "Agents: pack Catalog đã có bộ kiểm tra viết sẵn và 23 tình huống đánh giá giả lập; tất cả vẫn ở trạng thái chưa chạy.", sources: ["agents.runlumi_app:evals/README.md#L3-L5"] },
      { grade: "decided", en: "The founder approves every quote; sources, outputs and acceptance criteria are written per opportunity.", vi: "Founder duyệt mọi báo giá; nguồn dữ liệu, đầu ra và tiêu chí nghiệm thu được ghi cho từng cơ hội.", sources: ["agents.runlumi_app:pricing.md#L27-L31"] },
    ],
    activities: [
      { grade: "decided", en: "Find one recurring job, deliver the kit within its caps, then review the result with someone who can buy.", vi: "Tìm một việc lặp lại, giao kit trong giới hạn đã định, rồi xem kết quả với người có quyền mua.", sources: [`${SOLUTION_GUIDE}#L11`, `${SOLUTION_GUIDE}#L26`] },
      { grade: "decided", en: "Release gates before real data: an Agents pack passes its validator and evaluation gate; Vaults takes no real data before G2 and no broad rollout before G3.", vi: "Cổng phát hành trước khi dùng dữ liệu thật: pack Agents qua bộ kiểm tra và đánh giá; Vaults không nhận dữ liệu thật trước G2 và không triển khai rộng trước G3.", sources: ["agents.runlumi_app:packs/ecommerce-ops/catalog-agent/VALIDATION.md#L142-L154", `${SOLUTION_GUIDE}#L63`] },
      { grade: "hypothesis", en: "Vaults 90-day plan from 14 October 2026: about 12 discovery interviews by day 14, 3 signed conditional evaluation charters by day 30, paid pilots only after G2.", vi: "Kế hoạch 90 ngày của Vaults từ 14/10/2026: khoảng 12 cuộc phỏng vấn trước ngày 14, 3 bản cam kết đánh giá có điều kiện trước ngày 30, pilot trả phí chỉ sau G2.", sources: ["lumi-vaults:docs/gtm/15-90-day-execution.md#L3-L12"] },
    ],
    partners: [
      { grade: "decided", en: "AI harness vendors run Lumi's packs: ZCode first, with customer preference still unverified.", vi: "Nhà cung cấp nền tảng AI chạy pack của Lumi: ZCode trước tiên, khách có thích hay không vẫn chưa được kiểm chứng.", sources: ["agents.runlumi_app:strategy/decisions.md#L13"] },
      { grade: "unknown", en: "Vietnamese privacy counsel for Law 91/2025 is needed before any Vaults pilot on real data. None is engaged.", vi: "Cần luật sư về dữ liệu cá nhân theo Luật 91/2025 trước mọi pilot Vaults dùng dữ liệu thật. Hiện chưa có.", sources: ["lumi-vaults:docs/gtm/06-trust-gates.md#L33"] },
      { grade: "decided", en: "Agents and Vaults stay independent: neither requires the other, and no integration between them is confirmed.", vi: "Agents và Vaults độc lập: không bên nào bắt buộc bên kia, và chưa có tích hợp nào giữa hai bên được xác nhận.", sources: ["lumi-vaults:docs/gtm/README.md#L7", `${SOLUTION_GUIDE}#L63`] },
    ],
    costs: [
      { grade: "decided", en: "Log every hour, including the free kit and founder time. Free work is an acquisition cost.", vi: "Ghi đủ mọi giờ công, kể cả kit miễn phí và thời gian founder. Việc làm miễn phí là chi phí tìm khách.", sources: ["agents.runlumi_app:pricing.md#L49-L53", `${SOLUTION_GUIDE}#L170`] },
      { grade: "hypothesis", en: "Kit labour: 10 kits × 2 hours × 350,000 VND an hour = 7,000,000 VND before prospecting. An illustration, not a measurement.", vi: "Công làm kit: 10 kit × 2 giờ × 350.000đ một giờ = 7.000.000đ, chưa tính công tìm khách. Chỉ là ví dụ minh họa, chưa đo.", sources: [`${SOLUTION_GUIDE}#L172`] },
      { grade: "hypothesis", en: "Vaults targets: at least 70% recurring gross margin and CAC paid back within 6 months. All inputs are assumptions.", vi: "Mục tiêu của Vaults: biên lợi nhuận gộp định kỳ ít nhất 70% và thu hồi CAC trong 6 tháng. Mọi đầu vào đều là giả định.", sources: ["lumi-vaults:docs/gtm/pricing.md#L17", "lumi-vaults:docs/gtm/pricing.md#L113"] },
      { grade: "unknown", en: "Actual delivery cost, margin and CAC for Agents and BI have not been measured.", vi: "Chi phí bàn giao, biên lợi nhuận và CAC thực tế của Agents và BI chưa được đo.", sources: ["agents.runlumi_app:pricing.md#L55"] },
    ],
  },
  assumptions: [
    {
      belief: { en: "A team will pay 9,900,000 VND after a free kit made for its own repeated job.", vi: "Một đội ngũ sẽ trả 9.900.000đ sau khi nhận kit miễn phí làm cho chính việc lặp lại của họ." },
      test: { en: "10 accepted kits in small batches, at most 3 in the first week.", vi: "10 kit được nhận làm, theo từng đợt nhỏ, tối đa 3 kit trong tuần đầu." },
      pass: { en: "At least 3 result discussions with a buyer and at least 1 paid next step with confirmed cash. Proposed thresholds that still need team approval.", vi: "Ít nhất 3 buổi xem kết quả với người mua và ít nhất 1 bước tiếp theo có tiền đã xác nhận. Ngưỡng đề xuất, cần đội duyệt." },
      stop: { en: "Two-hour overruns recur, recipients only collect files, no buyer is reachable, or a promised capability fails twice in a row.", vi: "Thường xuyên vượt 2 giờ, người nhận chỉ lấy tài liệu, không gặp được người mua, hoặc hai lần liền không giao được năng lực đã hứa." },
      sources: [`${SOLUTION_GUIDE}#L166`, `${SOLUTION_GUIDE}#L174-L176`],
    },
    {
      belief: { en: "An Agents pack does the job well enough without someone rescuing it.", vi: "Một pack Agents làm được việc mà không cần người phải gỡ rối giúp." },
      test: { en: "Run the Catalog pack's release gate on prepared fixtures, then one authorized customer batch.", vi: "Chạy cổng phát hành của pack Catalog trên dữ liệu mẫu đã dựng, rồi một lô dữ liệu khách đã cho phép." },
      pass: { en: "Every validator fires at least once, all critical evaluation cases pass and a named reviewer signs the release.", vi: "Mọi bộ kiểm tra đều được kích hoạt ít nhất một lần, mọi tình huống đánh giá quan trọng đều đạt và người kiểm duyệt có tên ký biên bản phát hành." },
      stop: { en: "Narrow the scope after 3 qualified quotes without a paid pilot.", vi: "Thu hẹp phạm vi sau 3 báo giá đủ điều kiện mà không có pilot trả phí." },
      sources: ["agents.runlumi_app:packs/ecommerce-ops/catalog-agent/VALIDATION.md#L142-L154", "agents.runlumi_app:strategy/decisions.md#L27"],
    },
    {
      belief: { en: "Companies of 30 to 150 people will pay a monthly fee to keep files owned by roles, on their own premises.", vi: "Công ty 30 đến 150 người sẽ trả phí hằng tháng để tài liệu thuộc về vai trò và đặt tại công ty." },
      test: { en: "Discovery interviews about the last real handover problem, before any real-data pilot.", vi: "Phỏng vấn về lần gặp vấn đề bàn giao gần nhất, trước mọi pilot dùng dữ liệu thật." },
      pass: { en: "At least 5 of 12 interviews show a credible incident; then G2 sign-off before any paid pilot.", vi: "Ít nhất 5/12 cuộc phỏng vấn có sự cố đáng tin; sau đó phải ký duyệt G2 trước mọi pilot trả phí." },
      stop: { en: "Fewer than 5 of the first 15 screened accounts can show a measured handover problem.", vi: "Dưới 5 trong 15 doanh nghiệp sàng lọc đầu tiên có vấn đề bàn giao đo được." },
      sources: ["lumi-vaults:docs/gtm/07-discovery.md#L35", "lumi-vaults:docs/gtm/03-icp.md#L59"],
    },
  ],
  decisions: [
    { en: "Choose the first Solutions customer: e-commerce catalogue teams (Agents decision, 29 September 2026) or distributors with price lists and quote requests (sales guide, 16 October 2026).", vi: "Chọn khách hàng đầu tiên cho Giải pháp: đội vận hành danh mục thương mại điện tử (quyết định Agents, 29/9/2026) hay nhà phân phối có bảng giá và yêu cầu báo giá (hướng dẫn bán, 16/10/2026).", sources: ["agents.runlumi_app:strategy/decisions.md#L11-L12", `${SOLUTION_GUIDE}#L43`] },
    { en: "Approve the Agents and BI prices or mark them as experiments. They are published on the Agents site, while the CRM solution offer has no list price and the Agents catalogue marks the offer as not yet claimable.", vi: "Duyệt giá Agents và BI hoặc ghi rõ là thử nghiệm. Giá đã đăng trên trang Agents, trong khi gói giải pháp trong CRM không có giá niêm yết và danh mục Agents ghi gói chưa được chào bán.", sources: ["agents.runlumi_app:pricing.md#L5-L17", "www:src/lib/crm/seed.ts#L51-L55", "agents.runlumi_app:knowledge-base/products/catalog.json#L20"] },
    { en: "Record BI customers and payments in this CRM. The only BI evidence is a founder statement, and this page cannot count what the ledger does not hold.", vi: "Ghi khách BI và các khoản thanh toán vào CRM này. Bằng chứng BI hiện chỉ là lời xác nhận của founder, và trang này không đếm được những gì sổ thương mại chưa có.", sources: ["agents.runlumi_app:knowledge-base/products/lumi-bi.md#L6-L8"] },
    { en: "Bring the public site in line with what can be delivered. It lists Ads operations, Finance workflows and natural-language BI, which the Agents scope excludes or has not verified.", vi: "Điều chỉnh trang công khai cho khớp với những gì giao được. Trang đang nêu vận hành quảng cáo, quy trình tài chính và BI hỏi bằng ngôn ngữ tự nhiên, những thứ phạm vi Agents loại trừ hoặc chưa kiểm chứng.", sources: ["www:src/data/content.ts#L171-L173", "www:src/data/content.ts#L206-L207", "agents.runlumi_app:packs/ecommerce-ops/README.md#L23-L31"] },
    { en: "Decide where Vaults belongs. The company mission is affordable help for small businesses using tools they already know, and the public site does not mention Vaults; Vaults targets 30 to 150-person companies on their own servers.", vi: "Quyết định vị trí của Vaults. Sứ mệnh công ty là trợ giúp vừa túi tiền cho doanh nghiệp nhỏ trên công cụ họ đã quen, và trang công khai không nhắc Vaults; Vaults lại nhắm công ty 30 đến 150 người với máy chủ riêng.", sources: ["lumi-hq:strategy/vision-mission.md#L30", "lumi-vaults:docs/gtm/03-icp.md#L10"] },
    { en: "Keep one free entry offer. The sales guide uses a 2-hour synthetic Workflow Kit; the Agents pricing still offers a free trial on part of the customer's real data.", vi: "Giữ một ưu đãi miễn phí để mở đầu. Hướng dẫn bán dùng Workflow Kit 2 giờ với dữ liệu giả lập; bảng giá Agents vẫn ghi dùng thử miễn phí trên một phần dữ liệu thật của khách.", sources: [`${SOLUTION_GUIDE}#L5`, "agents.runlumi_app:pricing.md#L14"] },
  ],
};

export const canvases: readonly Canvas[] = [local, solutions];

/** Only allowlisted values select a canvas; anything else shows Local. */
export function canvasFor(value: string | null): Canvas {
  return canvases.find((canvas) => canvas.id === value) ?? local;
}

export function modelUrl(lang: Lang, model?: Motion): string {
  const base = `${lang === "vi" ? "/vi" : ""}/crm/model`;
  return model ? `${base}?model=${model}` : base;
}

export interface ParsedSource { repo: string; path: string; start: number | null; end: number | null }
export function parseSource(source: string): ParsedSource {
  const match = /^([\w.-]+):([^#]+?)(?:#L(\d+)(?:-L(\d+))?)?$/.exec(source);
  if (!match) throw new Error(`invalid source: ${source}`);
  const start = match[3] ? Number(match[3]) : null;
  return { repo: match[1], path: match[2], start, end: match[4] ? Number(match[4]) : start };
}

export function sourceUrl(source: string): string {
  const { repo, path, start, end } = parseSource(source);
  const lines = start ? `#L${start}${end && end !== start ? `-L${end}` : ""}` : "";
  const ref = repo === "www" ? "main" : pinnedCommits[repo as keyof typeof pinnedCommits];
  const name = repo === "www" ? "www.runlumi.app" : repo;
  return `https://github.com/RunLumi/${name}/blob/${ref}/${path}${lines}`;
}

export function sourceLabel(source: string): string {
  const { repo, path, start, end } = parseSource(source);
  const file = path.split("/").pop();
  const lines = start ? `:${start}${end && end !== start ? `–${end}` : ""}` : "";
  return `${repo === "www" ? "" : `${repo} · `}${file}${lines}`;
}

// Read-only guide navigation. These are sales motions, not new DB playbooks.
export const salesMotions = [
  {
    id: "local", number: "01", playbook: "local-preview",
    en: { name: "Lumi Local", offer: "Free printed Trust Kit Basic", summary: "Owner visit and scan test, a private website preview, then Starter with Pro when approved." },
    vi: { name: "Lumi Local", offer: "Trust Kit Basic đã in — miễn phí", summary: "Gặp chủ và quét thử, xem bản nháp website, rồi Starter kèm Pro theo phạm vi được duyệt." },
    source: { en: "docs/Lumi_Sales_Process.en.md", vi: "docs/Lumi_Quy_Trinh_Ban_Hang.md" },
  },
  {
    id: "agents-vaults", number: "02", playbook: "lumi-solution",
    en: { name: "Lumi Agents / Vaults", offer: "Free Lumi Workflow Kit", summary: "One output sample, exceptions and a source/access map to keep. Review the job, then choose the right paid scope." },
    vi: { name: "Lumi Agents / Vaults", offer: "Lumi Workflow Kit — miễn phí", summary: "Một bộ file mẫu, ngoại lệ và bản đồ tài liệu/quyền để khách giữ dùng. Xem kết quả rồi chọn phạm vi trả phí phù hợp." },
    source: { en: "docs/Lumi_Agents_Vaults_Sales_Process.en.md", vi: "docs/Lumi_Agents_Vaults_Sales_Process.vi.md" },
  },
] as const;
export type SalesMotionId = typeof salesMotions[number]["id"];

/** Only allowlisted values select content; arbitrary input is never a path. */
export function salesMotion(value: string | null) {
  return salesMotions.find((motion) => motion.id === value) ?? null;
}

export function salesProcessUrl(lang: "en" | "vi", flow?: SalesMotionId): string {
  const base = `${lang === "vi" ? "/vi" : ""}/crm/process`;
  return flow ? `${base}?flow=${flow}` : base;
}

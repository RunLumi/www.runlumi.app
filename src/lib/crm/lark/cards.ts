// Lark message cards for CRM events and the morning digest. Pure functions:
// the caller gathers the facts; these decide what is shown. Customer text is
// always sent as plain_text, so names can never inject mentions or markdown.
// No phone numbers, emails or note text leave the CRM.
import { formatVnd } from "../money";

export const CRM_BASE = "https://runlumi.app/vi/crm";

export interface OppFacts {
  id: string; title: string; accountName: string; product: string; stage: string; outcome: string;
  ownerName: string | null; value: number | null; probability: number | null; channel: string;
}

export interface EventFacts {
  kind: string; body: Record<string, unknown>; actorName: string; createdAt: string;
  opportunity: OppFacts | null; accountId: string | null; accountName: string | null;
  fromStage?: string; ownerFrom?: string | null; ownerTo?: string | null;
}

type Template = "blue" | "green" | "red" | "orange" | "turquoise" | "indigo" | "grey";
type Field = [label: string, value: string];

const text = (value: unknown, max = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function vnTime(iso: string): string {
  const date = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} ${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}`;
}

const money = (value: number | null) => value === null ? "Chưa biết" : formatVnd(value, true);
const percent = (value: number | null) => value === null ? "Chưa biết" : `${value}%`;

function card(title: string, template: Template, fields: Field[], footer: string, link: { label: string; url: string } | null): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [];
  const shown = fields.filter(([, value]) => value);
  if (shown.length) {
    elements.push({ tag: "div", fields: shown.map(([label, value]) => ({ is_short: true, text: { tag: "plain_text", content: `${label}\n${value}` } })) });
  }
  elements.push({ tag: "note", elements: [{ tag: "plain_text", content: footer }] });
  if (link) elements.push({ tag: "action", actions: [{ tag: "button", text: { tag: "plain_text", content: link.label }, url: link.url, type: "primary" }] });
  return { msg_type: "interactive", card: { config: { wide_screen_mode: true }, header: { template, title: { tag: "plain_text", content: text(title, 120) } }, elements } };
}

function oppFields(opp: OppFacts): Field[] {
  return [
    ["Công ty", text(opp.accountName)], ["Sản phẩm", text(opp.product)], ["Giai đoạn", text(opp.stage)], ["Phụ trách", opp.ownerName ? text(opp.ownerName) : "Chưa phân công"],
    ["Giá trị HĐ mong đợi", money(opp.value)], ["Tỉ lệ thành công", percent(opp.probability)],
  ];
}

const oppLink = (opp: OppFacts) => ({ label: "Mở trong CRM", url: `${CRM_BASE}/${encodeURIComponent(opp.id)}` });
const footer = (facts: EventFacts) => `${text(facts.actorName, 80)} · ${vnTime(facts.createdAt)}`;

/** The card for one CRM event, or null when the event is not announced. */
export function eventCard(facts: EventFacts): Record<string, unknown> | null {
  const opp = facts.opportunity;
  const body = facts.body;
  switch (facts.kind) {
    case "created":
      return opp && card(`Cơ hội mới: ${opp.title}`, "blue", [...oppFields(opp), ["Kênh", text(opp.channel)]], footer(facts), oppLink(opp));
    case "linked_created":
      return opp && card(`Cơ hội tiếp nối: ${opp.title}`, "blue", oppFields(opp), footer(facts), oppLink(opp));
    case "inbound":
      return opp && card(`Yêu cầu mới từ website: ${opp.accountName}`, "orange", [["Công ty", text(opp.accountName)], ["Sản phẩm", text(opp.product)], ["Trạng thái", "Chờ phân công"]], footer(facts), oppLink(opp));
    case "referred":
      return opp && card(`Khách được giới thiệu: ${opp.accountName}`, "orange", [["Công ty", text(opp.accountName)], ["Sản phẩm", text(opp.product)], ["Trạng thái", "Chờ phân công"]], footer(facts), oppLink(opp));
    case "assigned":
      return opp && card(`Đã giao: ${opp.title}`, "indigo", [["Công ty", text(opp.accountName)], ["Từ", facts.ownerFrom ? text(facts.ownerFrom) : "Chưa phân công"], ["Cho", text(facts.ownerTo ?? "—")], ["Giá trị HĐ mong đợi", money(opp.value)]], footer(facts), oppLink(opp));
    case "stage": {
      if (!opp) return null;
      const reason = text(body.reason, 300);
      if (opp.outcome === "won") return card(`Thắng: ${opp.title}`, "green", [...oppFields(opp), ["Từ giai đoạn", text(facts.fromStage)]], footer(facts), oppLink(opp));
      if (opp.outcome === "lost") return card(`Thua: ${opp.title}`, "red", [["Công ty", text(opp.accountName)], ["Giai đoạn", text(opp.stage)], ["Phụ trách", text(opp.ownerName ?? "—")], ["Giá trị HĐ mong đợi", money(opp.value)], ["Lý do", reason || "Chưa ghi"]], footer(facts), oppLink(opp));
      return card(`Chuyển giai đoạn: ${opp.title}`, opp.outcome === "paused" ? "grey" : "turquoise", [["Công ty", text(opp.accountName)], ["Từ", text(facts.fromStage)], ["Sang", text(opp.stage)], ["Phụ trách", text(opp.ownerName ?? "—")], ["Giá trị HĐ mong đợi", money(opp.value)], ["Tỉ lệ thành công", percent(opp.probability)], ...(reason ? [["Lý do", reason] as Field] : [])], footer(facts), oppLink(opp));
    }
    case "quote_accepted":
      return opp && card(`Khách chấp thuận báo giá: ${opp.title}`, "green", [["Công ty", text(opp.accountName)], ["Giá", money(Number(body.price_vnd ?? 0))], ...(Number(body.credit_vnd) > 0 ? [["Trừ credit", money(Number(body.credit_vnd))] as Field] : []), ["Phụ trách", text(opp.ownerName ?? "—")]], `${footer(facts)} · chấp thuận chưa phải đã thanh toán`, oppLink(opp));
    case "payment_confirmed":
      return opp && card(`Đã xác nhận thanh toán: ${opp.title}`, "green", [["Công ty", text(opp.accountName)], ["Số tiền", money(Number(body.amount_vnd ?? 0))], ["Ngày thu", text(body.occurred_on, 20)], ["Phụ trách", text(opp.ownerName ?? "—")]], footer(facts), oppLink(opp));
    case "do_not_contact_set":
      return card(`Yêu cầu không liên hệ: ${facts.accountName ?? "—"}`, "red", [["Công ty", text(facts.accountName)], ["Phạm vi", body.contact_id ? "Một người liên hệ" : "Cả công ty"], ["Lý do", text(body.reason, 200)]], `${footer(facts)} · áp dụng mọi kênh, chỉ admin gỡ`, facts.accountId ? { label: "Mở công ty", url: `${CRM_BASE}/accounts/${encodeURIComponent(facts.accountId)}` } : null);
    default:
      return null;
  }
}

/** Kinds of crm_events that are announced in the team group. */
export const ANNOUNCED_KINDS = ["created", "linked_created", "inbound", "referred", "assigned", "stage", "quote_accepted", "payment_confirmed", "do_not_contact_set"] as const;

export interface DigestItem { id: string; title: string; ownerName: string | null; due: string | null }
export interface DigestFacts {
  date: string; weekday: string;
  open: number; valued: number; value: number; forecastable: number; forecast: number;
  created24h: number; won24h: number; wonValue24h: number; lost24h: number;
  overdue: number; dueToday: number; topOverdue: DigestItem[];
  missingNext: number; unassigned: number; pendingPayments: number; blocked: number;
}

/** Morning summary (Monday to Saturday). Every total says what it covers. */
export function digestCard(facts: DigestFacts): Record<string, unknown> {
  const [year, month, day] = facts.date.split("-");
  const lines = (items: string[]) => items.filter(Boolean).join("\n");
  const overdueList = facts.topOverdue.map((item) => `• ${text(item.title, 80)} — ${text(item.ownerName ?? "Chưa phân công", 40)}${item.due ? ` — hạn ${item.due.slice(8, 10)}/${item.due.slice(5, 7)}` : ""}`);
  const section = (title: string, body: string) => ({ tag: "div", text: { tag: "plain_text", content: `${title}\n${body}` } });
  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: { template: "blue", title: { tag: "plain_text", content: `Tóm tắt CRM sáng ${facts.weekday}, ${day}/${month}/${year}` } },
      elements: [
        section("Pipeline đang mở", lines([
          `${facts.open} cơ hội · giá trị HĐ mong đợi ${formatVnd(facts.value, true)} (${facts.valued}/${facts.open} có giá trị)`,
          `Dự báo theo tỉ lệ thành công: ${formatVnd(Math.round(facts.forecast), true)} (${facts.forecastable}/${facts.open} đủ giá trị và tỉ lệ)`,
        ])),
        section("24 giờ qua", `${facts.created24h} cơ hội mới · ${facts.won24h} thắng (${formatVnd(facts.wonValue24h, true)}) · ${facts.lost24h} thua`),
        section("Việc hôm nay", lines([`${facts.overdue} việc quá hạn · ${facts.dueToday} việc đến hạn hôm nay`, ...overdueList])),
        section("Cần chú ý", lines([
          `${facts.missingNext} cơ hội chưa có bước tiếp theo`,
          `${facts.unassigned} cơ hội chờ phân công`,
          `${facts.pendingPayments} thanh toán chờ tài chính xác nhận`,
          `${facts.blocked} bàn giao đang bị chặn`,
        ])),
        { tag: "note", elements: [{ tag: "plain_text", content: "Giá trị và tỉ lệ là ước tính của người bán; thắng chưa phải tiền đã thu." }] },
        { tag: "action", actions: [{ tag: "button", text: { tag: "plain_text", content: "Mở CRM" }, url: CRM_BASE, type: "primary" }] },
      ],
    },
  };
}

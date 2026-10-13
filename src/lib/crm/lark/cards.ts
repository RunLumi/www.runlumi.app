// Lark message cards for CRM events and the morning digest. Pure functions:
// the caller gathers the facts; these decide what is shown. Customer text is
// always sent as plain_text, so names can never inject mentions or markdown.
// No contact phone numbers or emails are sent; free text (notes, help
// requests, reasons) is excerpted with phone numbers and emails masked.
import { label } from "../i18n";
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
  /** Offer name for quote events; playbook field labels for "fields" events. */
  offerName?: string | null; fieldLabels?: Record<string, string>;
}

type Template = "blue" | "green" | "red" | "orange" | "turquoise" | "indigo" | "grey";
type Field = [label: string, value: string];

const text = (value: unknown, max = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function vnTime(iso: string): string {
  const date = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} ${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}`;
}

/**
 * An excerpt of free text safe for the team group: emails and anything that
 * looks like a phone number are masked, whitespace is folded, length capped.
 */
export function excerpt(value: unknown, max = 280): string {
  const masked = String(value ?? "")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
    // Vietnamese phone shapes (0… or +84…, 10–12 digits with separators); amounts and dates stay.
    .replace(/\+?\d[\d\s.\-()]{6,}\d/g, (match) => (/^(?:84|0)\d{8,10}$/.test(match.replace(/\D/g, "")) ? "[số điện thoại]" : match))
    .replace(/\s+/g, " ").trim();
  return masked.length > max ? `${masked.slice(0, max - 1)}…` : masked;
}

const money = (value: number | null) => value === null ? "Chưa biết" : formatVnd(value, true);
const percent = (value: number | null) => value === null ? "Chưa biết" : `${value}%`;

function card(title: string, template: Template, fields: Field[], footer: string, link: { label: string; url: string } | null, quote?: string): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [];
  if (quote) elements.push({ tag: "div", text: { tag: "plain_text", content: `“${quote}”` } });
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
    case "note":
      return opp && card(`Ghi chú: ${opp.title}`, "grey", [["Công ty", text(opp.accountName)], ["Giai đoạn", text(opp.stage)]], footer(facts), oppLink(opp), excerpt(body.text) || undefined);
    case "details": {
      if (!opp) return null;
      const changes = detailChanges(body);
      return changes.length ? card(`Cập nhật: ${opp.title}`, "turquoise", [["Công ty", text(opp.accountName)], ...changes], footer(facts), oppLink(opp)) : null;
    }
    case "fields": {
      if (!opp) return null;
      const changed = Array.isArray(body.changed) ? body.changed.map((key) => facts.fieldLabels?.[String(key)] ?? String(key)) : [];
      return changed.length ? card(`Cập nhật thông tin khám phá: ${opp.title}`, "grey", [["Công ty", text(opp.accountName)], ["Đã cập nhật", text(changed.join(", "), 300)]], footer(facts), oppLink(opp)) : null;
    }
    case "quote_created":
      return opp && card(`Báo giá mới: ${opp.title}`, "blue", [["Công ty", text(opp.accountName)], ["Gói", text(facts.offerName ?? body.offer)], ["Giá", money(Number(body.price_vnd ?? 0))], ...(Number(body.credit_vnd) > 0 ? [["Trừ credit", money(Number(body.credit_vnd))] as Field] : [])], footer(facts), oppLink(opp));
    case "quote_withdrawn":
      return opp && card(`Rút báo giá: ${opp.title}`, "grey", [["Công ty", text(opp.accountName)]], footer(facts), oppLink(opp));
    case "payment_recorded":
      return opp && card(`Báo đã nhận tiền: ${opp.title}`, "orange", [["Công ty", text(opp.accountName)], ["Số tiền", money(Number(body.amount_vnd ?? 0))], ["Ngày thu", text(body.occurred_on, 20)], ["Trạng thái", "Chờ tài chính xác nhận"]], footer(facts), oppLink(opp));
    case "refund_recorded":
      return opp && card(`Hoàn tiền: ${opp.title}`, "red", [["Công ty", text(opp.accountName)], ["Số tiền", money(Number(body.amount_vnd ?? 0))]], footer(facts), oppLink(opp));
    case "entry_voided":
      return opp && card(`Hủy dòng sổ: ${opp.title}`, "grey", [["Công ty", text(opp.accountName)], ["Loại", text(body.kind)], ["Số tiền", money(Number(body.amount_vnd ?? 0))]], footer(facts), oppLink(opp), excerpt(body.reason) || undefined);
    case "task_created":
      return opp && card(`${label("vi", "task", String(body.kind))}: ${text(body.title, 100)}`, "blue", [["Cơ hội", text(opp.title)], ["Công ty", text(opp.accountName)], ["Hạn", body.due_on ? vnDay(String(body.due_on)) : "Chưa đặt"], ["Phụ trách", text(opp.ownerName ?? "—")]], footer(facts), oppLink(opp));
    case "task_completed":
      return opp && card(`${label("vi", "task", String(body.kind))} xong: ${label("vi", "taskOutcome", String(body.outcome))}`, body.outcome === "no_answer" || body.outcome === "no_show" || body.outcome === "declined" ? "grey" : "green", [["Cơ hội", text(opp.title)], ["Công ty", text(opp.accountName)], ["Giai đoạn", text(opp.stage)]], footer(facts), oppLink(opp));
    case "meeting_confirmed":
      return opp && card(`Khách xác nhận lịch hẹn: ${opp.title}`, "green", [["Công ty", text(opp.accountName)], ["Phụ trách", text(opp.ownerName ?? "—")]], footer(facts), oppLink(opp));
    case "help_requested":
      return opp && card(`Cần hỗ trợ: ${opp.title}`, "orange", [["Công ty", text(opp.accountName)], ["Phụ trách", text(opp.ownerName ?? "—")]], footer(facts), oppLink(opp), excerpt(body.note) || undefined);
    case "handoff_created":
      return opp && card(`Bắt đầu bàn giao: ${opp.title}`, "indigo", [["Công ty", text(opp.accountName)], ["Sản phẩm", text(opp.product)], ["Phụ trách", text(opp.ownerName ?? "—")]], footer(facts), oppLink(opp));
    case "fulfillment_status": {
      if (!opp) return null;
      const to = String(body.to ?? "");
      const title = to === "live" ? `Website đã live: ${opp.title}` : to === "accepted" ? `Khách đã nghiệm thu: ${opp.title}` : `Bàn giao: ${opp.title}`;
      return card(title, to === "live" || to === "accepted" || to === "active" || to === "delivered" ? "green" : "indigo", [["Công ty", text(opp.accountName)], ["Từ", label("vi", "fulfillment", String(body.from))], ["Sang", label("vi", "fulfillment", to)]], footer(facts), oppLink(opp));
    }
    case "fulfillment_blocked":
      return opp && card(`Bàn giao bị chặn: ${opp.title}`, "red", [["Công ty", text(opp.accountName)]], footer(facts), oppLink(opp), excerpt(body.reason) || undefined);
    case "fulfillment_unblocked":
      return opp && card(`Bàn giao chạy tiếp: ${opp.title}`, "green", [["Công ty", text(opp.accountName)]], footer(facts), oppLink(opp));
    case "owner_approval":
      return opp && card(`Chủ đã duyệt nội dung: ${opp.title}`, "green", [["Công ty", text(opp.accountName)], ["Ngày duyệt", body.approved_on ? vnDay(String(body.approved_on)) : "—"]], footer(facts), oppLink(opp));
    case "delivery_accepted":
      return opp && card(`Khách nghiệm thu: ${opp.title}`, "green", [["Công ty", text(opp.accountName)], ["Ngày", body.accepted_on ? vnDay(String(body.accepted_on)) : "—"]], footer(facts), oppLink(opp));
    case "account_created":
      return card(`Công ty mới: ${facts.accountName ?? "—"}`, "blue", [["Quản lý", text(facts.ownerTo ?? "—")]], footer(facts), accountLink(facts));
    case "contact_added":
      return card(`Thêm người liên hệ tại ${facts.accountName ?? "—"}`, "grey", [["Vai trò", label("vi", "role", String(body.role ?? "other"))]], footer(facts), accountLink(facts));
    case "account_owner_changed":
      return card(`Giao công ty: ${facts.accountName ?? "—"}`, "indigo", [["Từ", text(facts.ownerFrom ?? "Chưa có")], ["Cho", text(facts.ownerTo ?? "—")], ["Kèm người liên hệ", body.with_contacts ? "Có" : "Không"]], footer(facts), accountLink(facts));
    default:
      return null;
  }
}

const accountLink = (facts: EventFacts) => facts.accountId ? { label: "Mở công ty", url: `${CRM_BASE}/accounts/${encodeURIComponent(facts.accountId)}` } : null;

/** dd/mm from YYYY-MM-DD. */
function vnDay(date: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : text(date, 20);
}

/** What a "details" save changed that the team cares about: value, probability, next step, name. */
export function detailChanges(body: Record<string, unknown>): Field[] {
  const from = (body.from ?? {}) as Record<string, unknown>;
  const to = (body.to ?? {}) as Record<string, unknown>;
  const changes: Field[] = [];
  const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
  if (num(from.estimated_value_vnd) !== num(to.estimated_value_vnd)) changes.push(["Giá trị HĐ mong đợi", `${money(num(from.estimated_value_vnd))} → ${money(num(to.estimated_value_vnd))}`]);
  if ("win_probability" in to && num(from.win_probability) !== num(to.win_probability)) changes.push(["Tỉ lệ thành công", `${percent(num(from.win_probability))} → ${percent(num(to.win_probability))}`]);
  if ((from.next_action ?? "") !== (to.next_action ?? "") || (from.next_action_due ?? null) !== (to.next_action_due ?? null)) {
    changes.push(["Bước tiếp theo", `${excerpt(to.next_action, 160) || "—"}${to.next_action_due ? ` (hạn ${vnDay(String(to.next_action_due))})` : ""}`]);
  }
  if ((from.title ?? "") !== (to.title ?? "")) changes.push(["Tên cơ hội", `${text(from.title, 80)} → ${text(to.title, 80)}`]);
  return changes;
}

/** Kinds of crm_events that are announced in the team group. */
export const ANNOUNCED_KINDS = [
  "created", "linked_created", "inbound", "referred", "assigned", "stage", "note", "details", "fields",
  "quote_created", "quote_accepted", "quote_withdrawn", "payment_recorded", "payment_confirmed", "refund_recorded", "entry_voided",
  "task_created", "task_completed", "meeting_confirmed", "help_requested",
  "handoff_created", "fulfillment_status", "fulfillment_blocked", "fulfillment_unblocked", "owner_approval", "delivery_accepted",
  "account_created", "contact_added", "account_owner_changed", "do_not_contact_set",
] as const;

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

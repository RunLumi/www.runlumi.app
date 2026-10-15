import type { Permission } from "../workspace/roles";

export const recordKinds = ["contact", "personal", "identity", "dependent", "bank", "tax"] as const;
export type RecordKind = typeof recordKinds[number];
export interface Field { key: string; en: string; vi: string; type?: "text" | "date" | "email" | "tel"; required?: boolean; max?: number }
export const sections: Record<RecordKind, { en: string; vi: string; permission?: Permission; fields: Field[] }> = {
  contact: { en: "Contact and emergency", vi: "Liên hệ và khẩn cấp", fields: [
    { key: "email", en: "Personal email", vi: "Email cá nhân", type: "email" },
    { key: "phone", en: "Personal phone", vi: "Điện thoại cá nhân", type: "tel" },
    { key: "address", en: "Contact address", vi: "Địa chỉ liên hệ", max: 500 },
    { key: "permanent_address", en: "Permanent address", vi: "Địa chỉ thường trú", max: 500 },
    { key: "emergency_name", en: "Emergency contact", vi: "Người liên hệ khẩn cấp" },
    { key: "emergency_relationship", en: "Relationship", vi: "Quan hệ" },
    { key: "emergency_phone", en: "Emergency phone", vi: "Điện thoại khẩn cấp", type: "tel" },
  ] },
  personal: { en: "Personal information", vi: "Thông tin cá nhân", fields: [
    { key: "birth_date", en: "Date of birth", vi: "Ngày sinh", type: "date" },
    { key: "nationality", en: "Nationality (if needed)", vi: "Quốc tịch (nếu cần)" },
    { key: "gender", en: "Gender (optional)", vi: "Giới tính (không bắt buộc)" },
    { key: "marital_status", en: "Marital status (if needed)", vi: "Tình trạng hôn nhân (nếu cần)" },
  ] },
  identity: { en: "Identity documents", vi: "Giấy tờ định danh", permission: "hrm.identity.read", fields: [
    { key: "document_type", en: "Document type (CCCD/passport/other)", vi: "Loại giấy tờ (CCCD/hộ chiếu/khác)", required: true },
    { key: "document_number", en: "Document number", vi: "Số giấy tờ", required: true, max: 80 },
    { key: "issued_on", en: "Issue date", vi: "Ngày cấp", type: "date" },
    { key: "issued_by", en: "Issuing authority", vi: "Nơi cấp" },
    { key: "expires_on", en: "Expiry date (if applicable)", vi: "Ngày hết hạn (nếu có)", type: "date" },
  ] },
  dependent: { en: "Dependents", vi: "Người phụ thuộc", permission: "hrm.identity.read", fields: [
    { key: "name", en: "Full name", vi: "Họ tên", required: true },
    { key: "relationship", en: "Relationship", vi: "Quan hệ", required: true },
    { key: "birth_date", en: "Date of birth", vi: "Ngày sinh", type: "date" },
    { key: "document_number", en: "Identity document number (if needed)", vi: "Số giấy tờ định danh (nếu cần)", max: 80 },
    { key: "tax_number", en: "Tax number (if needed)", vi: "Mã số thuế (nếu cần)", max: 80 },
    { key: "registration_state", en: "External registration status (with evidence)", vi: "Trạng thái đăng ký bên ngoài (có bằng chứng)" },
    { key: "registration_reference", en: "External evidence reference", vi: "Tham chiếu bằng chứng bên ngoài" },
  ] },
  bank: { en: "Salary payment account", vi: "Tài khoản nhận lương", permission: "hrm.bank.read", fields: [
    { key: "bank", en: "Bank", vi: "Ngân hàng", required: true },
    { key: "account_number", en: "Account number", vi: "Số tài khoản", required: true, max: 100 },
    { key: "account_name", en: "Account holder", vi: "Chủ tài khoản", required: true },
    { key: "currency", en: "Currency", vi: "Loại tiền", required: true, max: 3 },
  ] },
  tax: { en: "Tax and insurance", vi: "Thuế và bảo hiểm", permission: "hrm.tax.read", fields: [
    { key: "tax_number", en: "Tax number", vi: "Mã số thuế", max: 80 },
    { key: "insurance_number", en: "Insurance number", vi: "Mã bảo hiểm", max: 80 },
    { key: "participation_state", en: "Participation status", vi: "Trạng thái tham gia" },
    { key: "evidence_reference", en: "Evidence reference", vi: "Tham chiếu chứng từ" },
  ] },
};

export class HrmError extends Error {
  readonly status: number;
  constructor(code: string, status = 422) { super(code); this.status = status; }
}
export function kindOf(value: string): RecordKind {
  if (!(recordKinds as readonly string[]).includes(value)) throw new HrmError("invalid_kind");
  return value as RecordKind;
}
export function text(form: FormData, key: string, max = 200, required = false): string {
  const value = form.get(key);
  if (value !== null && typeof value !== "string") throw new HrmError("invalid_field");
  const result = (value ?? "").trim();
  if (result.length > max || (required && !result)) throw new HrmError("invalid_field");
  return result;
}
export function date(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new HrmError("invalid_date");
  return value;
}
export function revision(form: FormData, name = "version"): number {
  const value = text(form, name, 10, true);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new HrmError("invalid_revision");
  return Number(value);
}
export function readRecord(form: FormData, kind: RecordKind): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of sections[kind].fields) {
    const value = text(form, field.key, field.max ?? 200, field.required);
    if (field.type === "date") date(value);
    if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HrmError("invalid_email");
    if (value) values[field.key] = value;
  }
  if (kind === "bank" && !/^[A-Z]{3}$/.test(values.currency ?? "")) throw new HrmError("invalid_currency");
  if (values.expires_on && values.issued_on && values.expires_on < values.issued_on) throw new HrmError("invalid_date");
  if (kind === "dependent" && values.registration_state && !values.registration_reference) throw new HrmError("evidence_required");
  if (kind === "tax" && values.participation_state && !values.evidence_reference) throw new HrmError("evidence_required");
  if (!Object.keys(values).length) throw new HrmError("empty_record");
  return values;
}
export function period(form: FormData): [string | null, string | null] {
  const from = date(text(form, "effective_from", 10));
  const to = date(text(form, "effective_to", 10));
  if (from && to && to < from) throw new HrmError("invalid_date");
  return [from, to];
}
export function readableFileType(bytes: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (bytes.length >= 8 && bytes.slice(0, 5).every((v, i) => v === [37,80,68,70,45][i])) return "application/pdf";
  if (bytes.length >= 8 && bytes.slice(0,8).every((v,i) => v === [137,80,78,71,13,10,26,10][i])) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  return null;
}

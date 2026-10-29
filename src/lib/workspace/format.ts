// Dates for Workspace screens, always in Vietnam time.
const zone = "Asia/Ho_Chi_Minh";

export function shortDate(iso: string, vi: boolean): string {
  return new Date(iso).toLocaleDateString(vi ? "vi-VN" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: zone });
}

export function dateTime(iso: string, vi: boolean): string {
  return new Date(iso).toLocaleString(vi ? "vi-VN" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: zone });
}

// Groups activity rows by calendar month in Vietnam time, newest first as
// given, for the record activity rails ("Tháng 10 · 2026").
export interface MonthGroup<T> { key: string; label: string; items: T[] }

export function monthGroups<T extends { created_at: string }>(rows: T[], vi: boolean): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = [];
  for (const row of rows) {
    const date = new Date(row.created_at);
    if (Number.isNaN(date.getTime())) continue;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit" }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const key = `${year}-${month}`;
    let group = groups.find((item) => item.key === key);
    if (!group) {
      const label = vi ? `Tháng ${Number(month)} · ${year}` : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", month: "long", year: "numeric" }).format(date);
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(row);
  }
  return groups;
}

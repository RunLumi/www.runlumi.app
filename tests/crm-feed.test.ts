import { test } from "node:test";
import assert from "node:assert/strict";
import { monthGroups } from "../src/lib/crm/feed.ts";

test("activity groups by Vietnam month, keeping the given order", () => {
  const rows = [
    { id: "a", created_at: "2026-10-30T08:00:00.000Z" },
    { id: "b", created_at: "2026-10-01T02:00:00.000Z" },
    { id: "c", created_at: "2026-09-30T18:30:00.000Z" }, // 1 Oct 01:30 in Vietnam
    { id: "d", created_at: "2026-09-29T10:00:00.000Z" },
  ];
  const groups = monthGroups(rows, true);
  assert.deepEqual(groups.map((group) => group.label), ["Tháng 10 · 2026", "Tháng 9 · 2026"]);
  assert.deepEqual(groups[0].items.map((row) => row.id), ["a", "b", "c"]);
  assert.equal(monthGroups(rows, false)[1].label, "September 2026");
  assert.deepEqual(monthGroups([{ created_at: "not a date" }], true), []);
});

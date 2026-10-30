import assert from "node:assert/strict";
import { test } from "node:test";
import { compactVnd, fillMonths, vndTicks, monthKeys, readDashboardFilters, winRate } from "../src/lib/crm/dashboard.ts";

test("win rate counts only closed deals and is unknown when none closed", () => {
  assert.equal(winRate(0, 0), null);
  assert.equal(winRate(1, 3), 25);
  assert.equal(winRate(2, 1), 67);
});

test("months run in Vietnam time and cross year boundaries", () => {
  // 2026-12-31 18:00 UTC is already 1 January 2027 in Vietnam.
  assert.deepEqual(monthKeys(new Date("2026-12-31T18:00:00Z"), 3), ["2026-11", "2026-12", "2027-01"]);
  assert.deepEqual(monthKeys(new Date("2026-02-10T00:00:00Z"), 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("months without activity stay on the axis as zero", () => {
  assert.deepEqual(fillMonths(["2026-09", "2026-10"], [{ month: "2026-10", n: 3 }], [{ month: "2026-09", n: 1 }]), [
    { month: "2026-09", created: 0, won: 1 }, { month: "2026-10", created: 3, won: 0 },
  ]);
});

test("compact VND labels", () => {
  assert.equal(compactVnd(1_990_000, true), "2 tr");
  assert.equal(compactVnd(1_250_000_000, true), "1,3 tỷ");
  assert.equal(compactVnd(399_000, false), "399 k");
});

test("only team-wide roles can look at another seller's dashboard", () => {
  const url = new URL("https://runlumi.app/crm?owner=someone&product=local-preview");
  const base = { id: "me", name: "Me", email: "me@example.test", configure: false, finance: false, fulfillment: false, refer: true, reportPayments: true };
  assert.deepEqual(readDashboardFilters(url, { ...base, manager: false }), { owner: "", playbook: "local-preview" });
  assert.deepEqual(readDashboardFilters(url, { ...base, manager: true }), { owner: "someone", playbook: "local-preview" });
});

test("chart ticks are whole VND steps, and none without a value", () => {
  assert.deepEqual(vndTicks(0), { max: 1, ticks: [] }, "no value: only the 0 baseline");
  assert.deepEqual(vndTicks(-5), { max: 1, ticks: [] });
  assert.deepEqual(vndTicks(1), { max: 1000, ticks: [1000] }, "never fractions of a đồng");
  assert.deepEqual(vndTicks(7_000_000), { max: 8_000_000, ticks: [2_000_000, 4_000_000, 6_000_000, 8_000_000] });
  assert.deepEqual(vndTicks(45_000_000), { max: 60_000_000, ticks: [20_000_000, 40_000_000, 60_000_000] });
  for (const peak of [1, 999, 12_345, 3_000_000, 45_000_000, 999_000_000, 2_500_000_000]) {
    const { max, ticks } = vndTicks(peak);
    assert.ok(ticks.length >= 1 && ticks.length <= 4 && max >= peak, `${peak}: 1–4 ticks covering the peak`);
    assert.match(String(ticks[0]), /^[125]0{3,}$/, `${peak}: the step is 1, 2 or 5 × 10ⁿ đồng`);
    assert.ok(ticks.every((tick, index) => tick === (index + 1) * ticks[0]));
  }
});

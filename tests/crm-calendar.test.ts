import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedD1 } from "./fixtures/d1-sqlite.ts";
import type { CrmActor } from "../src/lib/crm/access.ts";
import { calendarItems, calendarRange, weekStart } from "../src/lib/crm/calendar.ts";

const actor = (id: string, manager = false): CrmActor => ({ id, name: id, email: `${id}@example.test`, manager, configure: false, finance: false, fulfillment: false, refer: true, reportPayments: true });

test("calendar range: whole weeks around a month, Monday-first weeks, bad input falls back", () => {
  const oct = calendarRange("month", "2026-10", "2026-10-29");
  assert.equal(oct.from, "2026-09-28");
  assert.equal(oct.to, "2026-11-01");
  assert.equal(oct.days.length % 7, 0);
  assert.deepEqual([oct.previous, oct.next], ["2026-09", "2026-11"]);
  assert.equal(weekStart("2026-11-01"), "2026-10-26", "Sunday belongs to the week that started Monday");
  const week = calendarRange("week", "2026-10-29", "2026-10-29");
  assert.deepEqual([week.from, week.to, week.previous, week.next], ["2026-10-26", "2026-11-01", "2026-10-19", "2026-11-02"]);
  assert.equal(calendarRange("month", "2026-13", "2026-10-29").anchor, "2026-10-01");
  assert.equal(calendarRange("week", "../../x", "2026-10-29").anchor, "2026-10-26");
});

test("calendar items: own tasks, next steps and lead steps only; activity on its Vietnam day", () => {
  const { raw, d1 } = migratedD1();
  const t = "2026-10-20T00:00:00.000Z";
  raw.prepare("INSERT INTO crm_accounts (id, name, created_by, created_at, updated_at) VALUES ('acc', 'TEST Co', 'a', ?, ?)").run(t, t);
  for (const [id, owner] of [["opp_a", "a"], ["opp_b", "b"]]) {
    raw.prepare("INSERT INTO crm_opportunities (id, account_id, title, playbook_id, stage_id, outcome, owner_id, created_by, source_channel, next_action, next_action_due, created_at, updated_at) VALUES (?, 'acc', ?, 'lumi-solution@1', 'new', 'open', ?, ?, 'phone', 'Call back', '2026-10-30', ?, ?)")
      .run(id, `TEST ${id}`, owner, owner, t, t);
    raw.prepare("INSERT INTO crm_tasks (id, opportunity_id, kind, title, due_on, due_time, status, created_by, created_at, updated_at) VALUES (?, ?, 'meeting', ?, '2026-10-28', '09:30', 'open', ?, ?, ?)")
      .run(`tsk_${id}`, id, `TEST meeting ${id}`, owner, t, t);
  }
  raw.prepare("INSERT INTO crm_lead_records (id, status_id, process_id, name, company, source_channel, owner_id, next_action_due, created_by, created_at, updated_at) VALUES ('lead_a', 'received', 'crm-lead-process@1', 'TEST Lead', 'TEST Lead Co', 'phone', 'a', '2026-10-31', 'a', ?, ?)").run(t, t);
  // 18:30 UTC on the 29th is 01:30 on the 30th in Vietnam.
  raw.prepare("INSERT INTO crm_events (id, opportunity_id, actor_id, actor_name, kind, body, created_at) VALUES ('evt_1', 'opp_a', 'a', 'a', 'note', '{\"text\":\"TEST private\"}', '2026-10-29T18:30:00.000Z')").run();
  return (async () => {
    const mine = await calendarItems(d1, actor("a"), "/crm", "2026-10-26", "2026-11-01", { activity: true, today: "2026-10-29" });
    assert.deepEqual(mine.map((item) => [item.kind, item.date]).sort(), [["activity", "2026-10-30"], ["lead_step", "2026-10-31"], ["next_step", "2026-10-30"], ["task", "2026-10-28"]].sort());
    assert.ok(mine.every((item) => !item.href.includes("opp_b")), "another seller's records never appear");
    assert.equal(mine.find((item) => item.kind === "task")?.overdue, true);
    assert.ok(!JSON.stringify(mine).includes("TEST private"), "note text stays on the record");
    const team = await calendarItems(d1, actor("m", true), "/crm", "2026-10-26", "2026-11-01", { today: "2026-10-29" });
    assert.equal(team.filter((item) => item.kind === "task").length, 2);
    assert.equal(team.filter((item) => item.kind === "activity").length, 0, "activity is shown only when asked");
  })();
});

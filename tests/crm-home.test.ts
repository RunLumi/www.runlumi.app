import { test } from "node:test";
import assert from "node:assert/strict";
import { migratedD1 } from "./fixtures/d1-sqlite.ts";
import type { CrmActor } from "../src/lib/crm/access.ts";
import { quarterResult, recentlyEdited } from "../src/lib/crm/home.ts";

const actor = (id: string, manager = false): CrmActor => ({ id, name: id, email: `${id}@example.test`, manager, configure: false, finance: false, fulfillment: false, refer: true, reportPayments: true });

function seed() {
  const { raw, d1 } = migratedD1();
  const t = "2026-10-01T00:00:00.000Z";
  raw.prepare("INSERT INTO crm_accounts (id, name, owner_id, created_by, created_at, updated_at) VALUES ('acc_a', 'TEST A Co', 'a', 'a', ?, ?), ('acc_b', 'TEST B Co', 'b', 'b', ?, ?)").run(t, t, t, t);
  const opp = raw.prepare("INSERT INTO crm_opportunities (id, account_id, title, playbook_id, stage_id, outcome, owner_id, created_by, source_channel, estimated_value_vnd, win_probability, closed_at, created_at, updated_at) VALUES (?, ?, ?, 'lumi-solution@1', 'new', ?, ?, ?, 'phone', ?, ?, ?, ?, ?)");
  // Won in Q4 (one on 31 Dec 18:00 UTC = 1 Jan in Vietnam, so Q1 next year), won in Q3, open strong/weak, and B's.
  opp.run("w1", "acc_a", "TEST won Oct", "won", "a", "a", 100, null, "2026-10-05T03:00:00.000Z", t, t);
  opp.run("w2", "acc_a", "TEST won no value", "won", "a", "a", null, null, "2026-10-20T03:00:00.000Z", t, t);
  opp.run("w3", "acc_a", "TEST won next year VN", "won", "a", "a", 999, null, "2026-12-31T18:00:00.000Z", t, t);
  opp.run("w4", "acc_a", "TEST won Q3", "won", "a", "a", 999, null, "2026-09-30T10:00:00.000Z", t, t);
  opp.run("o1", "acc_a", "TEST open strong", "open", "a", "a", 50, 70, null, t, t);
  opp.run("o2", "acc_a", "TEST open weak", "open", "a", "a", 500, 69, null, t, t);
  opp.run("b1", "acc_b", "TEST B won", "won", "b", "b", 7000, null, "2026-10-06T03:00:00.000Z", t, t);
  opp.run("b2", "acc_b", "TEST B strong", "open", "b", "b", 7000, 90, null, t, t);
  return { raw, d1 };
}

test("quarter result: won in the Vietnam quarter, strong open ≥ 70 %, own scope for sellers", async () => {
  const { d1 } = seed();
  const mine = await quarterResult(d1, actor("a"), "2026-10-30");
  assert.equal(mine.label, "Q4/2026");
  assert.deepEqual([mine.from, mine.to], ["2026-10-01", "2026-12-31"]);
  assert.equal(mine.won, 100, "unknown values are not counted as 0-valued wins, and other quarters are excluded");
  assert.equal(mine.wonUnknown, 1);
  assert.deepEqual([mine.strongOpen, mine.strongOpenCount], [50, 1]);
  assert.deepEqual(mine.wonByDay.map((row) => row.date), ["2026-10-05", "2026-10-20"]);
  const team = await quarterResult(d1, actor("m", true), "2026-10-30");
  assert.equal(team.won, 7100, "the team sees everyone's");
  assert.equal(team.strongOpen, 7050);
});

test("recently edited: only the person's own events, only records they may still open", async () => {
  const { raw, d1 } = seed();
  const ev = raw.prepare("INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) VALUES (?, ?, ?, ?, ?, 'note', '{}', ?)");
  ev.run("e1", "o1", "acc_a", "a", "a", "2026-10-10T00:00:00.000Z");
  ev.run("e2", "o1", "acc_a", "a", "a", "2026-10-12T00:00:00.000Z");
  ev.run("e3", null, "acc_a", "a", "a", "2026-10-11T00:00:00.000Z");
  ev.run("e4", "b1", "acc_b", "a", "a", "2026-10-13T00:00:00.000Z");
  ev.run("e5", "o2", "acc_a", "b", "b", "2026-10-14T00:00:00.000Z");
  const mine = await recentlyEdited(d1, actor("a"));
  assert.deepEqual(mine.map((row) => [row.kind, row.id]), [["opportunity", "o1"], ["company", "acc_a"]], "B's opportunity (now out of scope) and B's own edits never appear");
});

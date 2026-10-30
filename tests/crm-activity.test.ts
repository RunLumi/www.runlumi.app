// Activity feed words (story UI5-S4): stage changes read as playbook labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { activitySummary, stageName } from "../src/lib/crm/activity.ts";

const vi = { "pb_local_v1:new": "Mới", "pb_local_v1:qualified": "Đủ điều kiện", "pb_local_v1:preview": "Đã xem preview", "pb_other_v2:qualified": "Đã xác minh", "pb_other_v2:won": "Thắng" };
const en = { "pb_local_v1:new": "New", "pb_local_v1:qualified": "Qualified" };

test("stage changes read as playbook labels (UI5-S4)", () => {
  assert.equal(activitySummary("stage", JSON.stringify({ from: "new", to: "qualified" }), true, {}, vi, "pb_local_v1"), "Mới → Đủ điều kiện");
  assert.equal(activitySummary("stage", JSON.stringify({ from: "new", to: "qualified" }), false, {}, en, "pb_local_v1"), "New → Qualified");
  assert.equal(activitySummary("stage", JSON.stringify({ from: "new", to: "preview", skipped: ["qualified"], reason: "TEST lý do" }), true, {}, vi, "pb_local_v1"), "Mới → Đã xem preview (bỏ qua: Đủ điều kiện) — TEST lý do");
  assert.equal(activitySummary("stage", JSON.stringify({ from: "new", to: "mystery" }), true, {}, vi, "pb_local_v1"), "Mới → mystery", "an unknown key stays the key");
  assert.equal(activitySummary("stage", JSON.stringify({ from: "new", to: "qualified" }), true, {}), "new → qualified", "without labels the keys show as before");
  assert.equal(activitySummary("playbook_changed", JSON.stringify({ from: { playbook: "pb_local_v1", stage: "qualified" }, to: { playbook: "pb_other_v2", stage: "qualified" }, reason: "TEST" }), true, { pb_local_v1: "Local v1", pb_other_v2: "Khác v2" }, vi, "pb_other_v2"), "Local v1:Đủ điều kiện → Khác v2:Đã xác minh — TEST", "each side uses its own playbook");
});

test("a stage label prefers the record's own playbook, then any version (UI5-S4)", () => {
  assert.equal(stageName(vi, "qualified", "pb_other_v2"), "Đã xác minh");
  assert.equal(stageName(vi, "won", "pb_local_v1"), "Thắng", "falls back to another version that has the stage");
  assert.equal(stageName(vi, "qualified"), "Đủ điều kiện");
  assert.equal(stageName({}, "qualified", "pb_local_v1"), "qualified");
});

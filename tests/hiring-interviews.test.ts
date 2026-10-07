import { test } from "node:test";
import assert from "node:assert/strict";
import { RETENTION_DAYS, parseLocalDateTime, parseScorecard, retentionCutoff, summarize, visibleScorecards } from "../src/lib/hiring/interviews.ts";

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
const full = { recommendation: "yes", evidence: "Explained the pricing trade-off with numbers.", "rating.role_skills": "3", "rating.problem_solving": "4", "rating.communication": "3", "rating.ownership": "2" };

test("a scorecard needs every rating on the 1–4 scale, a recommendation and real evidence", () => {
  assert.deepEqual(parseScorecard(form(full))?.ratings, { role_skills: 3, problem_solving: 4, communication: 3, ownership: 2 });
  assert.equal(parseScorecard(form({ ...full, "rating.ownership": "5" })), null);
  assert.equal(parseScorecard(form({ ...full, "rating.ownership": "" })), null);
  assert.equal(parseScorecard(form({ ...full, recommendation: "maybe" })), null, "no neutral recommendation");
  assert.equal(parseScorecard(form({ ...full, evidence: "good" })), null, "evidence is required");
});

test("summary counts recommendations and averages criteria", () => {
  const cards = [
    { recommendation: "yes" as const, ratings: JSON.stringify({ role_skills: 3, problem_solving: 4, communication: 3, ownership: 2 }) },
    { recommendation: "strong_no" as const, ratings: JSON.stringify({ role_skills: 1, problem_solving: 2, communication: 2, ownership: 1 }) },
  ];
  const result = summarize(cards);
  assert.equal(result.counts.yes, 1);
  assert.equal(result.counts.strong_no, 1);
  assert.equal(result.averages.problem_solving, 3);
  assert.equal(summarize([]).averages.ownership, null, "no data is not zero");
});

test("colleagues' scorecards stay hidden until you submit yours", () => {
  const cards = [{ author_id: "a" }, { author_id: "b" }];
  assert.deepEqual(visibleScorecards(cards, "c"), { mine: [], others: [], hidden: 2 });
  assert.equal(visibleScorecards(cards, "a").others.length, 1);
});

test("interview times are read as Vietnam time", () => {
  assert.equal(parseLocalDateTime("2026-10-09T09:30"), "2026-10-09T02:30:00.000Z");
  assert.equal(parseLocalDateTime("tomorrow"), null);
});

test("retention keeps closed applications for 60 days (owner decision 2026-10-08)", () => {
  assert.equal(RETENTION_DAYS, 60);
  // 2026-10-08 10:00 in Vietnam: closed on or before 2026-08-09 is due.
  assert.equal(retentionCutoff(Date.parse("2026-10-08T03:00:00Z")), "2026-08-09");
});

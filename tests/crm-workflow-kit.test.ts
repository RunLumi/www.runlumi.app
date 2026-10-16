import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { salesMotions, salesMotion, salesProcessUrl } from "../src/lib/crm/sales-process.ts";
import { lumiSolution } from "../src/lib/crm/seed.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const vi = read("docs/Lumi_Agents_Vaults_Sales_Process.vi.md");
const en = read("docs/Lumi_Agents_Vaults_Sales_Process.en.md");
const docs = [vi, en];
const sections = (text: string) => [...text.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
const sources = (text: string) => [...text.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1]).sort();

test("process navigation has exactly two named motions, not one per product", () => {
  assert.deepEqual(salesMotions.map((m) => [m.id, m.playbook]), [["local", "local-preview"], ["agents-vaults", "lumi-solution"]]);
  for (const motion of salesMotions) for (const lang of ["en", "vi"] as const) {
    assert.ok(motion[lang].name && motion[lang].offer && motion[lang].summary);
    assert.ok(read(motion.source[lang]).startsWith("# "));
  }
});

test("only allowlisted query values can select a guide", () => {
  assert.equal(salesMotion("local")?.id, "local");
  assert.equal(salesMotion("agents-vaults")?.id, "agents-vaults");
  for (const value of [null, "", "bi", "vaults", "LOCAL", "__proto__", "../AGENTS.md", "<script>alert(1)</script>"]) assert.equal(salesMotion(value), null);
});

test("both locales have stable hub and deep links", () => {
  assert.equal(salesProcessUrl("en"), "/crm/process");
  assert.equal(salesProcessUrl("vi"), "/vi/crm/process");
  assert.equal(salesProcessUrl("en", "agents-vaults"), "/crm/process?flow=agents-vaults");
  assert.equal(salesProcessUrl("vi", "local"), "/vi/crm/process?flow=local");
  assert.ok(vi.includes("/vi/crm/process?flow=local"));
  assert.ok(en.includes("/crm/process?flow=local"));
});

test("Workflow Kit guides preserve section, source and charter parity", () => {
  for (const doc of docs) {
    assert.equal((doc.match(/^# /gm) ?? []).length, 1);
    assert.deepEqual(sections(doc), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.equal((doc.match(/^```/gm) ?? []).length, 2);
    assert.ok(doc.includes("1.0") && doc.includes("Lumi Workflow Kit"));
  }
  assert.deepEqual(sources(vi), sources(en));
  assert.equal(sources(en).length, 9);
  const charter = (doc: string) => /```text\n([\s\S]+?)\n```/.exec(doc)?.[1];
  assert.ok(charter(en));
  assert.equal(charter(vi), charter(en));
});

test("free kit has independent deliverables and bounded work, not a disguised subscription", () => {
  assert.match(en, /output draft, review checklist and source\/access map/);
  assert.match(en, /no deposit, card, forced purchase/);
  assert.match(en, /without requiring a Lumi account/);
  assert.match(en, /at most 20 tabular rows/i);
  assert.match(en, /3 short documents \/ 10 pages/);
  assert.match(en, /At most 2 hours total/);
  assert.match(en, /One factual correction pass/);
  assert.match(en, /not a universal SLA/);
  assert.match(en, /not a condition of keeping the files/);
  assert.match(en, /previously agreed customer terms remain intact/);
});

test("data, real-sample and Vaults gates stay separate from the gift", () => {
  for (const doc of docs) for (const token of ["SYNTHETIC", "CUSTOMER-AUTHORIZED SAMPLE", "G2", "G3", "do-not-contact", "unknown", "measured", "self-reported"]) assert.ok(doc.includes(token), token);
  assert.match(en, /Real Agents\/BI samples need separate approval/);
  assert.match(en, /No real data inside Vaults without evidenced G2/);
  assert.match(en, /G2\/G3 are product release gates, not CRM stages/);
  assert.match(en, /retention\/deletion/);
  assert.match(en, /within 7 days after kit handover/);
  assert.match(en, /proposal to verify/);
  assert.match(en, /no public sharing links for sensitive data or results/);
});

test("the solution guide maps to actual configured stages and fields", () => {
  for (const stage of ["new", "contacted", "discovery", "qualified", "demo", "pilot", "proposal", "accepted", "lost", "on_hold"]) {
    assert.ok(lumiSolution.stages.some((s) => s.id === stage), stage);
    for (const doc of docs) assert.ok(doc.includes(`\`${stage}\``), stage);
  }
  for (const key of ["current_workflow", "pain", "frequency", "baseline", "decision_maker", "systems_data", "capabilities_confirmed"]) assert.ok(lumiSolution.fields.some((f) => f.key === key), key);
  assert.match(en, /No new automatic stages or fields/);
  assert.match(en, /manual note conventions/);
  assert.match(en, /not newly implemented server enforcement/);
  assert.match(en, /Local cohort reports do not automatically understand/);
});

test("kit receipt is not a demo, payment, credit, commission or implementation win", () => {
  for (const doc of docs) for (const marker of ["[WORKFLOW_KIT_AGREED]", "[WORKFLOW_KIT_DELIVERED]", "[WORKFLOW_KIT_REVIEWED]"]) assert.ok(doc.includes(marker));
  assert.match(en, /no zero-price quote, receivable, payment, credit or commission/);
  assert.match(en, /file delivery alone is not a demo or buyer attendance/);
  assert.match(en, /Do not mark the main implementation won just because a pilot was paid/);
  assert.match(en, /accepted is not paid/);
  assert.match(en, /Finance confirms received money/);
  assert.match(en, /partial payment/);
  assert.match(en, /Partners do not handle payments/);
  assert.match(en, /do not alter accepted snapshots/);
});

test("paid routing stays optional and Vaults prices remain unapproved", () => {
  assert.match(en, /internal proposal, not a live quote/);
  assert.match(en, /Do not quote these before commercial and release approval/);
  assert.match(en, /50% at signing and 50% at acceptance/);
  assert.match(en, /Do not automatically apply it to Vaults/);
  assert.match(en, /Agents and Vaults are independent options/);
  assert.match(en, /Try native Drive\/SharePoint\/NAS configuration first/);
  assert.match(en, /One-time setup\/pilot work is not ARR/);
  assert.match(en, /training is service revenue/);
});

test("effort and test economics are explicit hypotheses, not a conversion claim", () => {
  assert.equal(10 * 2 * 350000, 7000000);
  assert.ok(vi.replace(/[.,]/g, "").includes("7000000"));
  assert.ok(en.replace(/[.,]/g, "").includes("7000000"));
  assert.match(en, /Illustration only/);
  assert.match(en, /not benchmarks/);
  assert.match(en, /do not sell merely to hit the target/);
  assert.match(en, /Two sales motions|second sales motion/);
});

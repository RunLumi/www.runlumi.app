// Content contract for the business model canvas. The canvas is only useful
// if every statement says how it is known and where; these checks keep it so.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { blockOrder, canvasFor, canvases, grades, modelUrl, parseSource, pinnedCommits, sourceLabel, sourceUrl, type Text } from "../src/lib/crm/business-model.ts";
import { motionPlaybooks, motions } from "../src/lib/crm/business-evidence.ts";

const gradeKeys = new Set<string>(grades.map((grade) => grade.key));
const texts = (canvas: typeof canvases[number]) => [
  ...blockOrder.flatMap((key) => canvas.blocks[key]),
  ...canvas.assumptions.flatMap((row) => [row.belief, row.test, row.pass, row.stop]),
  ...canvas.decisions,
] as Text[];
const sources = (canvas: typeof canvases[number]) => [
  ...blockOrder.flatMap((key) => canvas.blocks[key].flatMap((item) => item.sources)),
  ...canvas.assumptions.flatMap((row) => row.sources),
  ...canvas.decisions.flatMap((row) => row.sources),
];

test("business model: one canvas per sales motion, each with all nine blocks filled", () => {
  assert.deepEqual(canvases.map((canvas) => canvas.id), [...motions]);
  for (const canvas of canvases) {
    assert.deepEqual([...canvas.playbooks], [...motionPlaybooks[canvas.id]], `${canvas.id} reads the same playbooks as its evidence`);
    for (const key of blockOrder) assert.ok(canvas.blocks[key].length > 0, `${canvas.id}.${key} is empty`);
    assert.ok(canvas.assumptions.length >= 3, `${canvas.id} names its load-bearing assumptions`);
    assert.ok(canvas.decisions.length > 0, `${canvas.id} lists open decisions`);
  }
});

test("business model: every statement is graded and sourced", () => {
  for (const canvas of canvases) for (const key of blockOrder) for (const item of canvas.blocks[key]) {
    assert.ok(gradeKeys.has(item.grade), `${canvas.id}.${key}: unknown grade ${item.grade}`);
    assert.ok(item.sources.length > 0, `${canvas.id}.${key}: "${item.en.slice(0, 40)}" has no source`);
  }
  for (const canvas of canvases) {
    for (const row of [...canvas.assumptions, ...canvas.decisions]) assert.ok(row.sources.length > 0, `${canvas.id}: an assumption or decision has no source`);
  }
});

test("business model: sources in this repository exist at the cited lines; other repositories are pinned", () => {
  for (const commit of Object.values(pinnedCommits)) assert.match(commit, /^[0-9a-f]{40}$/);
  for (const canvas of canvases) for (const source of sources(canvas)) {
    const { repo, path, start, end } = parseSource(source);
    if (repo === "www") {
      assert.ok(existsSync(path), `${source}: file missing`);
      const lines = readFileSync(path, "utf8").split("\n").length;
      if (start) assert.ok(start <= (end ?? start) && (end ?? start) <= lines, `${source}: lines out of range (${lines})`);
    } else {
      assert.ok(Object.hasOwn(pinnedCommits, repo), `${source}: repository is not pinned`);
      assert.ok(sourceUrl(source).includes(`/blob/${pinnedCommits[repo as keyof typeof pinnedCommits]}/`));
    }
  }
});

test("business model: English and Vietnamese carry the same figures", () => {
  // Every number in the English text appears in the Vietnamese text; separators differ by locale.
  const numbers = (text: string) => (text.replace(/(\d)[.,](?=\d)/g, "$1").match(/\d+/g) ?? []);
  for (const canvas of canvases) for (const text of [canvas.name, canvas.summary, ...texts(canvas)]) {
    assert.ok(text.en.trim() && text.vi.trim(), `missing locale: ${text.en || text.vi}`);
    const vi = new Set(numbers(text.vi));
    for (const number of numbers(text.en)) assert.ok(vi.has(number), `"${number}" missing in VI: ${text.vi}`);
  }
});

test("business model: public source holds no contact details", () => {
  const source = readFileSync("src/lib/crm/business-model.ts", "utf8");
  assert.doesNotMatch(source, /[\w.+-]+@[\w-]+\.[\w.]+/, "no email addresses");
  assert.doesNotMatch(source, /(?:\+84|\b0)\d{9,10}\b/, "no Vietnamese phone numbers");
});

test("business model: only allowlisted models are selectable; links are localized", () => {
  assert.equal(canvasFor(null).id, "local");
  assert.equal(canvasFor("solutions").id, "solutions");
  assert.equal(canvasFor("../../etc").id, "local");
  assert.equal(modelUrl("en"), "/crm/model");
  assert.equal(modelUrl("vi", "solutions"), "/vi/crm/model?model=solutions");
});

test("business model: source links and labels", () => {
  assert.equal(sourceUrl("www:docs/crm/README.md#L52-L55"), "https://github.com/RunLumi/www.runlumi.app/blob/main/docs/crm/README.md#L52-L55");
  assert.equal(sourceUrl("local.runlumi:STRATEGY.md#L9"), `https://github.com/RunLumi/local.runlumi/blob/${pinnedCommits["local.runlumi"]}/STRATEGY.md#L9`);
  assert.equal(sourceLabel("lumi-vaults:docs/gtm/pricing.md#L63-L66"), "lumi-vaults · pricing.md:63–66");
  assert.equal(sourceLabel("www:docs/crm/README.md"), "README.md");
  assert.throws(() => parseSource("not a source"));
});

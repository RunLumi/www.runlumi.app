import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { type EventFacts, digestCard, eventCard } from "../src/lib/crm/lark/cards.ts";
import { larkSign, larkWebhook, postToLark } from "../src/lib/crm/lark/client.ts";
import { MAX_ATTEMPTS, flushLark, sendDigest } from "../src/lib/crm/lark/notify.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";

const HOOK = "https://open.larksuite.com/open-apis/bot/v2/hook/abcdef12-3456-7890-abcd-ef1234567890";

test("Lark signature matches HMAC-SHA256 keyed by timestamp and secret over an empty message", async () => {
  const expected = createHmac("sha256", "1700000000\ns3cret").update("").digest("base64");
  assert.equal(await larkSign(1700000000, "s3cret"), expected);
});

test("only Lark custom-bot hook URLs are accepted", () => {
  assert.ok(larkWebhook(HOOK));
  for (const bad of [undefined, "", "http://open.larksuite.com/open-apis/bot/v2/hook/abcdef12", "https://open.feishu.cn/open-apis/bot/v2/hook/abcdef12", "https://evil.example/open-apis/bot/v2/hook/abcdef12", `${HOOK}?x=1`, "https://open.larksuite.com/open-apis/im/v1/messages"]) {
    assert.equal(larkWebhook(bad), null, String(bad));
  }
});

test("posts are signed; errors say whether retrying can help", async () => {
  let sent: Record<string, unknown> = {};
  const ok = await postToLark(HOOK, "s3cret", { msg_type: "text", content: { text: "hi" } }, 1_700_000_000_000, async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ code: 0, msg: "success" }));
  });
  assert.deepEqual(ok, { ok: true });
  assert.equal(sent.timestamp, "1700000000");
  assert.equal(sent.sign, await larkSign(1700000000, "s3cret"));
  const reply = (status: number, code: number) => async () => new Response(JSON.stringify({ code, msg: "x" }), { status });
  assert.deepEqual(await postToLark(HOOK, "s", {}, Date.now(), reply(200, 19021)), { ok: false, reason: "lark_19021", retry: false }, "bad signature will not fix itself");
  assert.equal((await postToLark(HOOK, "s", {}, Date.now(), reply(200, 11232)) as { retry: boolean }).retry, true, "rate limit retries");
  assert.equal((await postToLark(HOOK, "s", {}, Date.now(), reply(502, 0)) as { retry: boolean }).retry, true);
  assert.equal((await postToLark(HOOK, "s", {}, Date.now(), async () => { throw new TypeError("network"); }) as { retry: boolean }).retry, true);
  assert.equal((await postToLark("https://example.com/hook", "s", {}, Date.now(), async () => { throw new Error("must not send"); }) as { reason: string }).reason, "invalid_webhook");
});

const opp = { id: "opp_1", title: "Gara Toàn Tâm — Starter", accountName: "Gara <at id=all></at> Toàn Tâm", product: "Lumi Local", stage: "Đã chấp thuận", outcome: "won", ownerName: "Chị Lan", value: 1_990_000, probability: 100, channel: "field_visit" };
const facts = (kind: string, extra: Partial<EventFacts> = {}): EventFacts => ({ kind, body: {}, actorName: "Chị Lan", createdAt: "2026-10-13T02:00:00.000Z", opportunity: opp, accountId: "acc_1", accountName: opp.accountName, ...extra });

test("event cards show money and owners, link to the CRM, and never use markdown", () => {
  const won = eventCard(facts("stage", { fromStage: "Đang quyết định" }))!;
  const json = JSON.stringify(won);
  assert.match(json, /Thắng: Gara Toàn Tâm/);
  assert.match(json, /"template":"green"/);
  assert.match(json, /1\.990\.000/);
  assert.match(json, /https:\/\/runlumi\.app\/vi\/crm\/opp_1/);
  assert.doesNotMatch(json, /lark_md/, "customer text is plain_text, so it cannot mention everyone");
  const lost = JSON.stringify(eventCard(facts("stage", { opportunity: { ...opp, outcome: "lost" }, body: { reason: "Đã có website" } })));
  assert.match(lost, /Thua: .*"red"|"red".*Thua/);
  assert.match(lost, /Đã có website/);
  assert.match(JSON.stringify(eventCard(facts("do_not_contact_set", { opportunity: null, body: { reason: "Gọi điện yêu cầu" } }))), /Yêu cầu không liên hệ/);
  assert.equal(eventCard(facts("note")), null, "notes are never announced");
  assert.match(JSON.stringify(eventCard(facts("created", { opportunity: { ...opp, outcome: "open", value: null, probability: null } }))), /Chưa biết/, "unknown is shown as unknown, not 0");
});

test("the digest states coverage and that won is not cash", () => {
  const card = JSON.stringify(digestCard({ date: "2026-10-13", weekday: "thứ Ba", open: 4, valued: 2, value: 3_980_000, forecastable: 1, forecast: 597_000, created24h: 1, won24h: 0, wonValue24h: 0, lost24h: 1, overdue: 1, dueToday: 2, topOverdue: [{ id: "opp_1", title: "Gọi lại (Gara)", ownerName: "Chị Lan", due: "2026-10-12" }], missingNext: 3, unassigned: 1, pendingPayments: 0, blocked: 0 }));
  assert.match(card, /Tóm tắt CRM sáng thứ Ba, 13\/10\/2026/);
  assert.match(card, /2\/4 có giá trị/);
  assert.match(card, /thắng chưa phải tiền đã thu/);
  assert.match(card, /hạn 12\/10/);
});

async function seed() {
  const db = sqliteD1("jobs");
  const content = sqliteD1("content");
  content.raw.exec("INSERT INTO users (id, email, name) VALUES ('u_lan', 'lan@example.test', 'Chị Lan')");
  const marker = db.raw.prepare("SELECT created_at FROM crm_notifications WHERE id = 'marker'").get() as { created_at: string };
  const at = (offsetMs: number) => new Date(Date.parse(marker.created_at) + offsetMs).toISOString();
  db.raw.exec(`INSERT INTO crm_accounts (id, name, created_by, created_at, updated_at) VALUES ('acc_1', 'Gara Toàn Tâm', 'u_lan', '${at(0)}', '${at(0)}')`);
  db.raw.exec(`INSERT INTO crm_opportunities (id, account_id, title, playbook_id, stage_id, outcome, owner_id, seller_id, created_by, estimated_value_vnd, win_probability, created_at, updated_at)
    VALUES ('opp_1', 'acc_1', 'Gara Toàn Tâm', 'local-preview@1', 'new', 'open', 'u_lan', 'u_lan', 'u_lan', 1990000, 30, '${at(0)}', '${at(0)}')`);
  const event = (id: string, kind: string, offsetMs: number) => db.raw.exec(`INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) VALUES ('${id}', 'opp_1', 'acc_1', 'u_lan', 'Chị Lan', '${kind}', '{}', '${at(offsetMs)}')`);
  event("evt_before", "created", -60_000);
  event("evt_new", "created", 1_000);
  event("evt_note", "note", 2_000);
  return { db, content, now: () => new Date(Date.parse(marker.created_at) + 60_000) };
}

test("each new event is posted once; history before switching on and quiet kinds are not", async () => {
  const { db, content, now } = await seed();
  const posted: string[] = [];
  const send = (async (_url: string, init?: RequestInit) => { posted.push(String(init?.body)); return new Response(JSON.stringify({ code: 0 })); }) as typeof fetch;
  const deps = { db, contentDb: content, webhook: HOOK, secret: "s3cret", send, now, pause: async () => {} };
  assert.deepEqual(await flushLark(deps), { sent: 1, failed: 0, skipped: 0 });
  assert.match(posted[0], /Cơ hội mới: Gara Toàn Tâm/);
  assert.match(posted[0], /Chị Lan/);
  assert.deepEqual(await flushLark(deps), { sent: 0, failed: 0, skipped: 0 }, "a second pass sends nothing again");
  assert.equal(posted.length, 1);
  assert.deepEqual(await flushLark({ ...deps, webhook: undefined }), { sent: 0, failed: 0, skipped: 0 }, "not configured: nothing happens");
});

test("failed posts are retried a bounded number of times", async () => {
  const { db, content, now } = await seed();
  let calls = 0;
  const failing = (async () => { calls += 1; return new Response("{}", { status: 503 }); }) as typeof fetch;
  const deps = { db, contentDb: content, webhook: HOOK, secret: "s", send: failing, now, pause: async () => {} };
  for (let round = 0; round < MAX_ATTEMPTS + 2; round += 1) await flushLark(deps);
  assert.equal(calls, MAX_ATTEMPTS, "stops after the last attempt");
  const row = db.raw.prepare("SELECT status, attempts, last_error FROM crm_notifications WHERE event_id = 'evt_new'").get() as Record<string, unknown>;
  assert.deepEqual({ ...row }, { status: "failed", attempts: MAX_ATTEMPTS, last_error: "lark_503" });
});

test("the digest goes out once a day, Monday to Saturday", async () => {
  const { db, content } = await seed();
  let calls = 0;
  const send = (async () => { calls += 1; return new Response(JSON.stringify({ code: 0 })); }) as typeof fetch;
  const at = (iso: string) => ({ db, contentDb: content, webhook: HOOK, secret: "s", send, now: () => new Date(iso) });
  assert.equal(await sendDigest(at("2026-10-18T01:37:00Z")), "skipped", "Sunday in Vietnam");
  assert.equal(await sendDigest(at("2026-10-19T01:37:00Z")), "sent", "Monday 08:37 in Vietnam");
  assert.equal(await sendDigest(at("2026-10-19T01:47:00Z")), "skipped", "once per day");
  assert.equal(calls, 1);
});

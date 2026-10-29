import { test } from "node:test";
import assert from "node:assert/strict";
import { openUrl, plainFromLarkCard, platformPayload, postWebhook, sealUrl, urlHint, validWebhook, webhookSecret } from "../src/lib/workspace/notify/destinations.ts";
import { matches, parseRuleForm, recipientsFor, saveRule, getRule, type Rule } from "../src/lib/workspace/notify/rules.ts";
import { dispatchNotifications } from "../src/lib/workspace/notify/dispatch.ts";
import { eventCard } from "../src/lib/crm/lark/cards.ts";
import { saveAntiPhishingCode } from "../src/lib/workspace/anti-phishing.ts";
import { makeUser } from "../src/lib/workspace/roles.ts";
import { sqliteD1 } from "./support/d1-sqlite.ts";

const SLACK = "https://hooks.slack.com/services/T0123456/B0123456/abcdefghijklmnopqrstuvwx";
const DISCORD = `https://discord.com/api/webhooks/123456789012345678/${"a".repeat(68)}`;
const TEAMS = "https://prod-12.southeastasia.logic.azure.com/workflows/abc123/triggers/manual/paths/invoke?api-version=2016-06-01&sig=xyz";
const KEY = "k".repeat(40);

test("webhook URLs: only each platform's own incoming-webhook shape is accepted", () => {
  assert.ok(validWebhook("slack", SLACK));
  assert.ok(validWebhook("discord", DISCORD));
  assert.ok(validWebhook("teams", TEAMS));
  assert.ok(validWebhook("teams", "https://contoso.webhook.office.com/webhookb2/abc@def/IncomingWebhook/123/456"));
  for (const [platform, url] of [
    ["slack", "http://hooks.slack.com/services/T0123456/B0123456/abcdefghijklmnopqrstuvwx"], ["slack", "https://hooks.slack.com.evil.example/services/T0123456/B0123456/abcdefghijklmnopqrstuvwx"],
    ["slack", `${SLACK}?x=1`], ["discord", "https://discord.com/api/webhooks/1/short"], ["discord", "https://evil.example/api/webhooks/123456789012345678/" + "a".repeat(68)],
    ["teams", "https://logic.azure.com.evil.example/workflows/x"], ["teams", "https://user:pass@contoso.webhook.office.com/webhookb2/x"], ["slack", "not a url"],
  ] as const) assert.equal(validWebhook(platform, url), null, url);
  assert.equal(urlHint(validWebhook("slack", SLACK)!), "hooks.slack.com/services/••••");
  assert.equal(webhookSecret({ WORKSPACE_WEBHOOK_KEY: "short" }), null, "a short key counts as missing");
});

test("webhook URLs are sealed with AES-GCM and only open with the same key", async () => {
  const sealed = await sealUrl(KEY, new URL(SLACK));
  assert.doesNotMatch(sealed, /hooks\.slack|abcdefghij/);
  assert.equal(await openUrl(KEY, sealed), SLACK);
  assert.equal(await openUrl("z".repeat(40), sealed), null);
  assert.equal(await openUrl(KEY, sealed.replace(/.$/, (char) => char === "A" ? "B" : "A")), null, "tampering is detected");
});

const facts = { kind: "note", body: { text: "Gọi lại 0912 345 678 hoặc an@example.test <!channel> @everyone" }, actorName: "TEST Seller", createdAt: "2026-10-29T02:00:00Z",
  opportunity: { id: "opp_1", title: "Văn phòng <b>Lumen</b>", accountName: "TEST Co", product: "Local", stage: "Thương lượng", outcome: "open", ownerName: "TEST Seller", value: 2_050_000_000, probability: 60, channel: "web" },
  accountId: "acc_1", accountName: "TEST Co" };

test("every platform gets the Lark card's masked content as plain text with mentions disabled", () => {
  const plain = plainFromLarkCard(eventCard(facts)!)!;
  assert.ok(plain.title.includes("Lumen"));
  const all = JSON.stringify(plain);
  assert.doesNotMatch(all, /0912|an@example/, "phone numbers and emails stay masked, as in Lark");
  assert.equal(plain.link!.url, "https://runlumi.app/vi/crm/opp_1");
  const slack = platformPayload("slack", plain) as { text: string };
  assert.doesNotMatch(slack.text, /<!channel>|<b>/, "Slack control sequences are escaped");
  assert.match(slack.text, /<https:\/\/runlumi\.app\/vi\/crm\/opp_1\|/);
  const discord = platformPayload("discord", plain) as { content: string; allowed_mentions: { parse: string[] } };
  assert.deepEqual(discord.allowed_mentions.parse, []);
  assert.doesNotMatch(discord.content, /@everyone/);
  const teams = platformPayload("teams", plain) as { attachments: { content: { type: string; actions: { url: string }[] } }[] };
  assert.equal(teams.attachments[0].content.type, "AdaptiveCard");
  assert.equal(teams.attachments[0].content.actions[0].url, "https://runlumi.app/vi/crm/opp_1");
});

test("posting: no redirects, timeouts, retry only on 429/5xx, never the URL in the result", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = await postWebhook("discord", DISCORD, { content: "x" }, (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); }) as typeof fetch);
  assert.deepEqual(ok, { ok: true, status: 200 });
  assert.match(calls[0].url, /wait=true$/);
  assert.equal(calls[0].init.redirect, "manual");
  const gone = await postWebhook("slack", SLACK, {}, (async () => new Response("no", { status: 404 })) as typeof fetch);
  assert.deepEqual(gone, { ok: false, reason: "slack_404", retry: false });
  assert.deepEqual(await postWebhook("slack", SLACK, {}, (async () => new Response("", { status: 503 })) as typeof fetch), { ok: false, reason: "slack_503", retry: true });
  assert.deepEqual(await postWebhook("slack", SLACK, {}, (async () => { throw new Error(SLACK); }) as typeof fetch), { ok: false, reason: "network", retry: true });
  assert.deepEqual(await postWebhook("slack", "https://evil.example/x", {}), { ok: false, reason: "invalid_webhook", retry: false });
});

const form = (entries: [string, string][]) => { const data = new FormData(); for (const [key, value] of entries) data.append(key, value); return data; };

test("rule form: known events, roles and IDs only; recipients or a webhook required; conditions are data, never code", () => {
  const rule = parseRuleForm(form([["name", " Deal won "], ["events", "stage"], ["events", "DROP TABLE"], ["recipient_roles", "sales_manager"], ["recipient_roles", "root"], ["record_owner", "1"], ["email", "1"], ["min_value_vnd", "500.000.000"], ["outcome", "won"], ["playbooks", "pb_local"], ["playbooks", "x'; --"]]));
  assert.deepEqual(rule.events, ["stage"]);
  assert.deepEqual(rule.recipients.roles, ["sales_manager"]);
  assert.deepEqual(rule.conditions, { playbooks: ["pb_local"], min_value_vnd: 500_000_000, outcome: "won" });
  assert.throws(() => parseRuleForm(form([["name", "x"], ["events", "stage"], ["email", "1"]])), /required/, "email needs recipients");
  assert.throws(() => parseRuleForm(form([["name", "x"], ["events", "stage"]])), /required/, "a rule needs a channel");
  assert.throws(() => parseRuleForm(form([["name", "x"], ["events", "nope"], ["email", "1"], ["record_owner", "1"]])), /required/);
  assert.throws(() => parseRuleForm(form([["name", "x"], ["events", "stage"], ["email", "1"], ["record_owner", "1"], ["min_value_vnd", "1e9"]])), /invalid/);
  const base = { ...rule, id: "r", module: "crm" as const, version: 1, created_by: "a", created_at: "", updated_by: "a", updated_at: "" } satisfies Rule;
  assert.equal(matches(base, { kind: "stage", playbook_id: "pb_local", value: 600_000_000, outcome: "won", owner_id: "u" }), true);
  assert.equal(matches(base, { kind: "stage", playbook_id: "pb_local", value: null, outcome: "won", owner_id: "u" }), false, "unknown values never match a value condition");
  assert.equal(matches(base, { kind: "note", playbook_id: "pb_local", value: 600_000_000, outcome: "won", owner_id: "u" }), false);
  assert.equal(matches({ ...base, enabled: false }, { kind: "stage", playbook_id: "pb_local", value: 600_000_000, outcome: "won", owner_id: "u" }), false);
});

function world() {
  const db = sqliteD1(), content = sqliteD1("content");
  content.raw.exec(`INSERT INTO users (id, email, name, role) VALUES ('admin', 'admin@example.test', 'TEST Admin', 50), ('mgr', 'mgr@example.test', 'TEST Manager', 30),
    ('own', 'own@example.test', 'TEST Owner', 30), ('other', 'other@example.test', 'TEST Other Exec', 30), ('hr', 'hr@example.test', 'TEST HR', 30), ('gone', 'gone@example.test', 'TEST Gone', 30)`);
  content.raw.exec("UPDATE users SET disabled = 1 WHERE id = 'gone'");
  const t = "2026-10-01T00:00:00Z";
  for (const [id, role] of [["mgr", "sales_manager"], ["own", "sales_executive"], ["other", "sales_executive"], ["hr", "hr"], ["gone", "sales_manager"]]) {
    db.raw.prepare("INSERT INTO workspace_members (user_id, enabled, granted_by, created_at, updated_at) VALUES (?, 1, 'admin', ?, ?)").run(id, t, t);
    db.raw.prepare("INSERT INTO workspace_roles (user_id, role, granted_by, granted_at) VALUES (?, ?, 'admin', ?)").run(id, role, t);
  }
  return { db, content, admin: makeUser({ id: "admin", name: "TEST Admin", email: "admin@example.test" }, true, []) };
}

test("recipients are internal members who may see the record: team-wide roles and the owner, never other sellers, HR or disabled accounts", async () => {
  const { db, content, admin } = world();
  const id = await saveRule(db, admin, null, parseRuleForm(form([["name", "Everyone"], ["events", "stage"], ["email", "1"], ["record_owner", "1"], ["recipient_admins", "1"], ["recipient_roles", "sales_manager"], ["recipient_roles", "sales_executive"], ["recipient_roles", "hr"], ["recipient_users", "other"]])));
  const rule = (await getRule(db, id))!;
  const people = (await recipientsFor(db, content, rule, { owner_id: "own" })).map((person) => person.id).sort();
  assert.deepEqual(people, ["admin", "mgr", "own"]);
  const employee = makeUser({ id: "mgr", name: "M", email: "m@example.test" }, false, ["sales_manager"]);
  await assert.rejects(saveRule(db, employee, null, rule), /forbidden/, "only admins configure rules");
  await assert.rejects(saveRule(db, admin, id, rule, 99), /stale/, "stale edits are rejected");
  await saveRule(db, admin, id, { ...rule, name: "Renamed" }, 1);
  assert.equal((await getRule(db, id))!.version, 2);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM workspace_audit WHERE action = 'notification_rule_saved'").get()!.n, 2);
});

test("dispatch: claims each target once, masks content, pauses a failing webhook, never emails without a code or a transport", async () => {
  const { db, content, admin } = world();
  const now = new Date();
  const sealed = await sealUrl(KEY, new URL(SLACK));
  db.raw.prepare("INSERT INTO workspace_notification_destinations (id, name, platform, url_sealed, url_hint, created_by, created_at, updated_by, updated_at) VALUES ('dst_" + "a".repeat(32) + "', 'TEST Slack', 'slack', ?, 'hooks.slack.com/services/••••', 'admin', ?, 'admin', ?)").run(sealed, now.toISOString(), now.toISOString());
  db.raw.exec("PRAGMA foreign_keys = OFF");
  db.raw.prepare("INSERT INTO crm_accounts (id, name, created_by, created_at, updated_at, owner_id) VALUES ('acc_1', 'TEST Co', 'own', ?, ?, 'own')").run(now.toISOString(), now.toISOString());
  const id = await saveRule(db, admin, null, parseRuleForm(form([["name", "Companies"], ["events", "account_created"], ["email", "1"], ["record_owner", "1"], ["recipient_roles", "sales_manager"], ["destinations", "dst_" + "a".repeat(32)]])));
  const later = new Date(now.getTime() + 1000).toISOString();
  db.raw.prepare("INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) VALUES ('evt_1', NULL, 'acc_1', 'own', 'TEST Owner', 'account_created', '{\"note\":\"call 0912345678\"}', ?)").run(later);
  await saveAntiPhishingCode(db, makeUser({ id: "mgr", name: "TEST Manager", email: "mgr@example.test" }, false, ["sales_manager"]), "Mây Xanh 7");
  const posted: string[] = [];
  const mails: string[] = [];
  const send = (async (_url: string, init: RequestInit) => { posted.push(String(init.body)); return new Response("ok", { status: 200 }); }) as typeof fetch;
  const first = await dispatchNotifications({ db, contentDb: content, webhookKey: KEY, send, email: async (mail) => { mails.push(mail.to + "|" + mail.text); return { ok: true }; }, now: () => new Date(now.getTime() + 2000) });
  assert.equal(posted.length, 1, "one Slack post");
  assert.doesNotMatch(posted[0], /0912345678/);
  assert.equal(mails.length, 1, "only the recipient with a code gets an email");
  assert.ok(mails[0].startsWith("mgr@example.test|Mã chống lừa đảo của bạn: Mây Xanh 7"));
  assert.equal(db.raw.prepare("SELECT last_error FROM workspace_notification_deliveries WHERE target = 'email:own'").get()!.last_error, "no_anti_phishing_code");
  assert.deepEqual(first, { sent: 2, failed: 0, skipped: 1 });
  const again = await dispatchNotifications({ db, contentDb: content, webhookKey: KEY, send, email: async () => ({ ok: true }), now: () => new Date(now.getTime() + 3000) });
  assert.deepEqual(again, { sent: 0, failed: 0, skipped: 0 }, "each target is delivered once");
  assert.equal((await getRule(db, id))!.enabled, true);
  // A second event with no transport configured: recorded as skipped, nothing sent.
  db.raw.prepare("INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) VALUES ('evt_2', NULL, 'acc_1', 'own', 'TEST Owner', 'account_created', '{}', ?)").run(later);
  const failing = (async () => new Response("", { status: 500 })) as typeof fetch;
  await dispatchNotifications({ db, contentDb: content, webhookKey: KEY, send: failing, email: null, now: () => new Date(now.getTime() + 4000) });
  assert.equal(db.raw.prepare("SELECT last_error FROM workspace_notification_deliveries WHERE event_id = 'evt_2' AND target = 'email:mgr'").get()!.last_error, "email_not_configured");
  db.raw.exec("UPDATE workspace_notification_destinations SET consecutive_failures = 9");
  db.raw.prepare("INSERT INTO crm_events (id, opportunity_id, account_id, actor_id, actor_name, kind, body, created_at) VALUES ('evt_3', NULL, 'acc_1', 'own', 'TEST Owner', 'account_created', '{}', ?)").run(later);
  await dispatchNotifications({ db, contentDb: content, webhookKey: KEY, send: failing, email: null, now: () => new Date(now.getTime() + 5000) });
  assert.equal(db.raw.prepare("SELECT status FROM workspace_notification_destinations").get()!.status, "paused", "ten failures in a row pause the webhook");
  const withoutKey = await dispatchNotifications({ db, contentDb: content, webhookKey: null, send, email: null, now: () => new Date(now.getTime() + 6000) });
  assert.equal(withoutKey.sent, 0);
});

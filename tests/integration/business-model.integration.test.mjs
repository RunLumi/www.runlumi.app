// Real HTTP + isolated D1/EmDash sessions. Synthetic records only; never production data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSession, userSession, Session, jobs, q } from "./helpers.mjs";

const run = Date.now().toString(36);
const figure = (html, name) => Number(new RegExp(`data-figure="${name}" data-value="(-?\\d+)"`).exec(html)?.[1]);

test("business model: company economics only for team-wide roles and Finance, with ledger-backed figures", async (t) => {
  const admin = await adminSession();
  const make = async (slug, roles) => {
    const session = await userSession(admin, { email: `bm-${slug}-${run}@example.test`, name: `TEST BM ${slug} ${run}` });
    if (roles.length) assert.equal((await admin.post("/workspace/users", { intent: "grant", email: session.email, roles })).status, 303);
    return session;
  };
  const manager = await make("manager", ["sales_manager"]);
  const finance = await make("finance", ["finance"]);
  const seller = await make("seller", ["sales_executive"]);
  const partner = await make("partner", ["partner"]);
  const outsider = await make("none", []);
  const anonymous = new Session("anonymous");

  for (const root of ["/crm/model", "/vi/crm/model"]) {
    await t.test(`${root}: authorization is enforced by the server, not only the menu`, async () => {
      const unauth = await anonymous.get(root);
      assert.ok([302, 303, 401, 403].includes(unauth.status), `anonymous status ${unauth.status}`);
      assert.doesNotMatch(unauth.html, /data-canvas=/);
      for (const session of [outsider, seller, partner]) {
        const page = await session.get(root);
        assert.equal(page.status, 403, `${session.email} must not read company economics`);
        assert.doesNotMatch(page.html, /data-canvas=/);
      }
      for (const session of [manager, finance]) {
        const page = await session.get(root);
        assert.equal(page.status, 200);
        assert.match(page.headers.get("cache-control") ?? "", /no-store/);
        assert.match(page.html, /data-canvas="local"/, "Local is the default canvas");
        assert.match(page.html, /data-live-evidence/);
        assert.equal([...page.html.matchAll(/data-block="/g)].length, 9, "nine blocks render without JavaScript");
      }
      assert.match((await manager.get(`${root}?model=solutions`)).html, /data-canvas="solutions"/);
      assert.match((await manager.get(`${root}?model=../../x`)).html, /data-canvas="local"/, "unknown values fall back, never select content");
    });
  }

  await t.test("menus list the page only for people who may open it", async () => {
    assert.match((await manager.get("/crm")).html, /href="\/crm\/model"/);
    assert.match((await finance.get("/vi/crm")).html, /href="\/vi\/crm\/model"/);
    assert.doesNotMatch((await seller.get("/crm")).html, /href="\/crm\/model"/);
  });

  await t.test("only Finance-confirmed cash moves the figures, and no names reach the page", async () => {
    const before = await manager.get("/crm/model");
    const paying = figure(before.html, "paying");
    const cash = figure(before.html, "cash");
    assert.ok(Number.isFinite(paying) && Number.isFinite(cash));
    const solutionsCash = figure((await manager.get("/crm/model?model=solutions")).html, "cash");
    const now = new Date().toISOString();
    const playbook = jobs("SELECT id FROM crm_playbooks WHERE playbook_key = 'local-preview' ORDER BY version DESC LIMIT 1")[0].id;
    const offer = jobs("SELECT id FROM crm_offers WHERE offer_key = 'local-starter' ORDER BY version DESC LIMIT 1")[0].id;
    const ids = { account: `acc_bm_${run}`, opp: `opp_bm_${run}`, quote: `quo_bm_${run}` };
    const secret = `TEST Hidden Garage ${run}`;
    jobs(`INSERT INTO crm_accounts (id, name, created_by, created_at, updated_at) VALUES (${q(ids.account)}, ${q(secret)}, 'test', ${q(now)}, ${q(now)})`);
    jobs(`INSERT INTO crm_opportunities (id, account_id, title, playbook_id, stage_id, outcome, created_by, source_channel, created_at, updated_at) VALUES (${q(ids.opp)}, ${q(ids.account)}, ${q(`${secret} deal`)}, ${q(playbook)}, 'accepted', 'won', 'test', 'referral', ${q(now)}, ${q(now)})`);
    jobs(`INSERT INTO crm_quotes (id, opportunity_id, offer_id, snapshot, price_vnd, status, accepted_on, created_by, created_at, updated_at) VALUES (${q(ids.quote)}, ${q(ids.opp)}, ${q(offer)}, '{}', 1990000, 'accepted', ${q(now.slice(0, 10))}, 'test', ${q(now)}, ${q(now)})`);
    const ledger = (id, kind, status) => jobs(`INSERT INTO crm_ledger (id, opportunity_id, account_id, quote_id, kind, amount_vnd, occurred_on, status, recorded_by, created_at) VALUES (${q(`led_bm_${id}_${run}`)}, ${q(ids.opp)}, ${q(ids.account)}, ${kind === "receivable" ? q(ids.quote) : "NULL"}, ${q(kind)}, 1990000, ${q(now.slice(0, 10))}, ${q(status)}, 'test', ${q(now)})`);
    ledger("due", "receivable", "confirmed");
    ledger("reported", "payment", "pending");
    const pending = await manager.get("/crm/model");
    assert.equal(figure(pending.html, "paying"), paying, "a reported payment is not cash");
    assert.equal(figure(pending.html, "cash"), cash);
    ledger("confirmed", "payment", "confirmed");
    const after = await finance.get("/crm/model");
    assert.equal(figure(after.html, "paying"), paying + 1);
    assert.equal(figure(after.html, "cash"), cash + 1990000);
    assert.ok(!after.html.includes(secret), "aggregates only: no company or deal names");
    const solutionsAfter = await manager.get("/crm/model?model=solutions");
    assert.equal(figure(solutionsAfter.html, "cash"), solutionsCash, "Local cash does not leak into Solutions");
  });
});

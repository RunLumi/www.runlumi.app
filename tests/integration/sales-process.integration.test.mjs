// Real HTTP + isolated D1/EmDash sessions. Never uses production or customer data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminSession, userSession, Session, jobs } from "./helpers.mjs";

function counts() {
  return jobs("SELECT (SELECT COUNT(*) FROM crm_opportunities) AS opportunities, (SELECT COUNT(*) FROM crm_quotes) AS quotes, (SELECT COUNT(*) FROM crm_ledger) AS ledger, (SELECT COUNT(*) FROM crm_playbooks) AS playbooks, (SELECT COUNT(*) FROM crm_offers) AS offers")[0];
}
function ids(html) { return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])); }
function checkContents(html) {
  const targets = ids(html);
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(anchors.length >= 12, "guide has a table of contents");
  for (const target of anchors) assert.ok(targets.has(target), `missing contents anchor ${target}`);
}

test("sales processes: authorization, two choices, EN/VI deep links and read-only behavior", async (t) => {
  const run = Date.now().toString(36);
  const anonymous = new Session("anonymous");
  const admin = await adminSession();
  const seller = await userSession(admin, { email: `guide-seller-${run}@example.test`, name: `TEST Guide Seller ${run}` });
  const outsider = await userSession(admin, { email: `guide-out-${run}@example.test`, name: `TEST Guide Outsider ${run}` });
  const grant = await admin.post("/workspace/users", { intent: "grant", email: seller.email, roles: ["sales_executive"] });
  assert.equal(grant.status, 303);
  const before = counts();

  for (const [lang, root] of [["en", "/crm/process"], ["vi", "/vi/crm/process"]]) {
    await t.test(`${lang}: both guide choices and all deep links stay private`, async () => {
      for (const suffix of ["", "?flow=local", "?flow=agents-vaults"]) {
        const unauth = await anonymous.get(root + suffix);
        assert.ok([302, 303, 401, 403].includes(unauth.status), `anonymous status ${unauth.status}`);
        assert.doesNotMatch(unauth.html, /data-process-guide=/);
        assert.equal((await outsider.get(root + suffix)).status, 403);
      }
    });
    await t.test(`${lang}: hub has exactly two motion choices and no default giant guide`, async () => {
      const hub = await seller.get(root);
      assert.equal(hub.status, 200);
      assert.match(hub.headers.get("cache-control") ?? "", /no-store/);
      const choices = [...hub.html.matchAll(/data-sales-motion="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(choices, ["local", "agents-vaults"]);
      assert.doesNotMatch(hub.html, /data-process-guide=/);
      assert.ok(hub.html.includes(`${root}?flow=local`));
      assert.ok(hub.html.includes(`${root}?flow=agents-vaults`));
    });
    for (const flow of ["local", "agents-vaults"]) {
      await t.test(`${lang}/${flow}: correct complete guide, headings and locale switch are server-rendered`, async () => {
        const page = await seller.get(`${root}?flow=${flow}`);
        assert.equal(page.status, 200);
        assert.match(page.headers.get("cache-control") ?? "", /no-store/);
        assert.ok(page.html.includes(`data-process-guide="${flow}"`));
        const article = /<article\b[^>]*class="[^"]*guide-body[^>]*>([\s\S]*?)<\/article>/.exec(page.html)?.[1];
        assert.ok(article, "the guide is in the HTML without running JS");
        if (flow === "local") {
          assert.match(article, /BASIC_DELIVERED/);
          assert.doesNotMatch(article, /WORKFLOW_KIT_AGREED/);
        } else {
          assert.match(article, /WORKFLOW_KIT_AGREED/);
          assert.match(article, /SYNTHETIC/);
          assert.doesNotMatch(article, /BASIC_DELIVERED/);
          assert.ok(article.includes(lang === "en" ? "The free offer" : "Offer miễn phí"));
        }
        checkContents(page.html);
        const other = lang === "en" ? "/vi/crm/process" : "/crm/process";
        assert.ok(page.html.includes(`${other}?flow=${flow}`), "language switch preserves the chosen motion");
        assert.doesNotMatch(page.html, /Source: docs\//, "seller does not see admin-only source instructions");
      });
    }
    await t.test(`${lang}: unknown query stays on the hub without injecting a document or markup`, async () => {
      const invalid = await seller.get(`${root}?flow=${encodeURIComponent('<img id="guide-attack" src=x>')}`);
      assert.equal(invalid.status, 200);
      assert.doesNotMatch(invalid.html, /data-process-guide=/);
      assert.doesNotMatch(invalid.html, /<img id="guide-attack"/);
    });
  }
  await t.test("admin source reference is correct and guide reads never create commercial records", async () => {
    const page = await admin.get("/crm/process?flow=agents-vaults");
    assert.equal(page.status, 200);
    assert.match(page.html, /Source: docs\/Lumi_Agents_Vaults_Sales_Process\.en\.md/);
    assert.deepEqual(counts(), before);
  });
});

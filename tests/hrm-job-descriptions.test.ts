import { test } from "node:test";
import assert from "node:assert/strict";
import type { AstroGlobal } from "astro";
import { makeUser, roles, type Role, type WorkspaceUser } from "../src/lib/workspace/roles.ts";
import { modules, visibleLinks, visibleModules } from "../src/lib/workspace/nav.ts";
import { findJobDescription, jobDescriptions } from "../src/lib/hrm/job-description-catalog.ts";
import { jobDescriptionPage, jobDescriptionsPage } from "../src/lib/hrm/job-description-pages.ts";

const slug = "coo-head-of-sales-operations";
const actor = (granted: Role[], live: boolean | undefined = true, admin = false): WorkspaceUser => {
  const user = makeUser({ id: "jd-reader", name: "JD Reader", email: "jd-reader@example.test" }, admin, granted);
  user.hrmEnabled = live;
  return user;
};
const astro = (user?: WorkspaceUser, method = "GET", selected = slug): AstroGlobal => ({
  locals: { workspace: user },
  request: new Request(`https://runlumi.test/hrm/job-descriptions/${encodeURIComponent(selected)}`, { method }),
  params: { slug: selected },
}) as unknown as AstroGlobal;
const handlers = [jobDescriptionsPage, jobDescriptionPage] as const;

test("job descriptions require the HRM record capability at both page boundaries", async () => {
  for (const handler of handlers) {
    const anonymous = handler(astro(), "en");
    assert.ok(anonymous instanceof Response);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.headers.get("cache-control"), "private, no-store");
    for (const role of roles.filter(role => role !== "hrm_admin" && role !== "hrm_officer")) {
      const denied = handler(astro(actor([role])), "en");
      assert.ok(denied instanceof Response, role);
      assert.equal(denied.status, 403, role);
      assert.doesNotMatch(await denied.text(), /COO|Head of Sales/);
    }
  }
});

test("closed HRM permits only configuration-capable readers and never ended employment", () => {
  for (const handler of handlers) {
    for (const user of [actor(["hrm_admin"], false), actor([], false, true)]) {
      const page = handler(astro(user), "en");
      assert.ok(!(page instanceof Response));
      assert.equal(page.live, false);
    }
    for (const live of [false, undefined]) {
      const user = actor(["hrm_officer"]);
      user.hrmEnabled = live;
      const denied = handler(astro(user), "en");
      assert.ok(denied instanceof Response);
      assert.equal(denied.status, 503);
    }
    for (const user of [actor(["hrm_officer"]), actor(["hrm_admin"], false), actor([], false, true)]) {
      user.hrmEmploymentEnded = true;
      const denied = handler(astro(user), "en");
      assert.ok(denied instanceof Response);
      assert.equal(denied.status, 403);
    }
  }
});

test("catalog reads support GET and HEAD, reject all write methods, and keep EN/VI peers", () => {
  for (const method of ["GET", "HEAD"]) {
    for (const lang of ["en", "vi"] as const) {
      const request = astro(actor(["hrm_officer"]), method);
      const catalog = jobDescriptionsPage(request, lang);
      assert.ok(!(catalog instanceof Response));
      assert.equal(catalog.lang, lang);
      assert.equal(catalog.vi, lang === "vi");
      assert.equal(catalog.live, true);
      assert.equal(catalog.descriptions, jobDescriptions);
      const detail = jobDescriptionPage(request, lang);
      assert.ok(!(detail instanceof Response));
      assert.equal(detail.description.slug, slug);
      assert.equal(detail.title, detail.description.locales[lang].title);
    }
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    for (const handler of handlers) {
      const denied = handler(astro(actor(["hrm_admin"]), method), "en");
      assert.ok(denied instanceof Response);
      assert.equal(denied.status, 405, method);
      assert.equal(denied.headers.get("allow"), "GET, HEAD");
      assert.equal(denied.headers.get("cache-control"), "private, no-store");
    }
  }
});

test("unknown and malformed slugs never select a document or reflect user markup", async () => {
  for (const selected of ["", "missing-role", "../../settings", `${slug}/`, "<script>alert(1)</script>"]) {
    const denied = jobDescriptionPage(astro(actor(["hrm_admin"]), "GET", selected), "vi");
    assert.ok(denied instanceof Response);
    assert.equal(denied.status, 404);
    assert.equal(await denied.text(), "Not found");
  }
});

test("catalog content has complete bilingual sections and unique stable navigation IDs", () => {
  assert.ok(jobDescriptions.length > 0);
  assert.equal(new Set(jobDescriptions.map(description => description.slug)).size, jobDescriptions.length);
  const coo = findJobDescription(slug);
  assert.ok(coo, "the requested COO role exists");
  assert.equal(coo.status, "draft", "internal draft does not imply approved hiring or publication");
  for (const description of jobDescriptions) {
    assert.match(description.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(description.code && description.version && description.updatedAt);
    assert.equal(findJobDescription(description.slug), description);
    for (const lang of ["en", "vi"] as const) {
      const locale = description.locales[lang];
      for (const key of ["title", "subtitle", "summary", "department", "reportsTo", "employment", "location"] as const) {
        assert.ok(locale[key].trim(), `${description.slug} ${lang} ${key}`);
      }
      assert.ok(locale.sections.length > 0);
      assert.equal(new Set(locale.sections.map(section => section.id)).size, locale.sections.length);
      for (const section of locale.sections) {
        assert.match(section.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        assert.ok(section.title.trim());
        assert.ok(section.paragraphs?.length || section.bullets?.length || section.table?.rows.length, `${lang} ${section.id} has useful content`);
        if (section.table) {
          assert.ok(section.table.headers.length > 0);
          for (const row of section.table.rows) assert.equal(row.length, section.table.headers.length, `${lang} ${section.id} keeps table headers aligned`);
        }
      }
    }
    assert.deepEqual(description.locales.en.sections.map(section => section.id), description.locales.vi.sections.map(section => section.id), "both locales preserve the same role scope and stable section anchors");
  }
});

test("job-description navigation agrees with the server's live and closed role boundaries", () => {
  const module = modules.find(module => module.key === "hrm")!;
  const visible = (user: WorkspaceUser) => visibleModules(user).includes(module) && visibleLinks(user, module).some(link => link.key === "job-descriptions");
  for (const role of roles) {
    assert.equal(visible(actor([role])), role === "hrm_admin" || role === "hrm_officer", `live ${role}`);
    assert.equal(visible(actor([role], false)), role === "hrm_admin", `closed ${role}`);
  }
  assert.equal(visible(actor([], false, true)), true);
  for (const user of [actor(["hrm_admin"]), actor(["hrm_officer"]), actor([], false, true)]) {
    user.hrmEmploymentEnded = true;
    assert.equal(visible(user), false);
  }
});

// Shell, kit and personal screens of round 2 (stories UI1-S1, S3, S4, S6, S7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { makeUser, roles } from "../src/lib/workspace/roles.ts";
import { accountModule, appBar, helpLinks, moduleByKey, modules, visibleCreateActions, visibleLinks, visibleModules } from "../src/lib/workspace/nav.ts";
import { hasNoticeSource } from "../src/lib/workspace/inbox.ts";
import { launcherBlurbs, launcherPages } from "../src/lib/workspace/summaries.ts";
import { rulesReaching, searchableKinds } from "../src/lib/workspace/shell-pages.ts";
import type { Rule } from "../src/lib/workspace/notify/rules.ts";

const user = (granted: (typeof roles)[number][], admin = false, extra: { hrmEnabled?: boolean } = {}) => Object.assign(makeUser({ id: "u1", name: "U", email: "u@example.test" }, admin, granted), extra);

test("create actions and help links follow permissions (UI1-S1)", () => {
  assert.deepEqual(visibleCreateActions(user(["hr"])).map((action) => action.key), ["role"], "HR creates hiring roles only");
  assert.deepEqual(visibleCreateActions(user(["sales_executive"])).map((action) => action.key), ["lead", "opportunity", "referral"]);
  assert.ok(!visibleCreateActions(user(["sales_manager"])).some((action) => action.key === "member" || action.key === "role"));
  assert.deepEqual(visibleCreateActions(user(["employee"])), [], "an employee has nothing to create here");
  assert.ok(visibleCreateActions(user([], true)).some((action) => action.key === "member"), "admins grant access");
  assert.deepEqual(helpLinks(user(["hr"])), [], "no CRM guides without the CRM");
  assert.ok(helpLinks(user(["partner"])).every(({ module, link }) => module.key === "crm" && link.group === "help"));
  for (const role of roles) {
    const person = user([role]);
    const open = new Set(visibleModules(person).map((module) => module.key));
    for (const action of visibleCreateActions(person)) assert.ok(open.has(action.module), `${role}: ${action.key} sits in a module they open`);
  }
});

test("the app bar shows CRM tabs and keeps every other visible page in More (UI1-S1)", () => {
  const crm = moduleByKey("crm");
  for (const role of ["sales_manager", "sales_executive", "partner", "finance"] as const) {
    const person = user([role]);
    const { tabs, more } = appBar(person, crm);
    const shown = [...tabs, ...more.flatMap((entry) => entry.links)].map((link) => link.key).sort();
    assert.deepEqual(shown, visibleLinks(person, crm).map((link) => link.key).sort(), `${role}: tabs + More = every visible CRM page`);
    assert.ok(tabs.every((link) => link.tab));
  }
  for (const key of ["hrm", "finance", "admin"] as const) assert.equal(moduleByKey(key).layout, "side", `${key} uses the side navigation`);
  assert.deepEqual(appBar(user(["hr"]), moduleByKey("hiring")).more, [], "ungrouped modules show all pages as tabs");
  assert.ok(visibleLinks(user(["employee"]), accountModule).some((link) => link.key === "notifications"), "everyone reaches My notifications");
  assert.ok(modules.every((module) => module.links.every((link) => !link.tab || module.groups?.length)), "tab flags only matter in grouped modules");
});

test("search covers only lists the person may open (UI1-S3)", () => {
  assert.deepEqual(searchableKinds(user(["hr"])), [], "HR has nothing to search: no CRM, no members");
  assert.deepEqual(searchableKinds(user(["sales_executive"])), ["opportunities", "companies", "contacts", "leads"]);
  assert.ok(!searchableKinds(user(["sales_manager"])).includes("members"), "members need users.manage");
  assert.ok(searchableKinds(user([], true)).includes("members"));
});

test("the bell appears only with a notice source (UI1-S4)", () => {
  assert.equal(hasNoticeSource(user(["employee"], false, { hrmEnabled: true })), true);
  assert.equal(hasNoticeSource(user(["employee"], false, { hrmEnabled: false })), false, "HRM closed: no bell");
  assert.equal(hasNoticeSource(user(["sales_executive"], false, { hrmEnabled: true })), false, "no HRM notices without the permission");
});

test("My notifications lists only rules that reach the person (UI1-S6)", () => {
  const rule = (recipients: Partial<Rule["recipients"]>, extra: Partial<Rule> = {}): Rule => ({
    id: "r", module: "crm", version: 1, created_by: "a", created_at: "", updated_by: "a", updated_at: "", name: "R", events: ["stage"], conditions: { playbooks: [], min_value_vnd: null, outcome: "" },
    recipients: { roles: [], admins: false, users: [], record_owner: false, ...recipients }, email: true, destinations: [], enabled: true, ...extra,
  });
  const exec = user(["sales_executive"]);
  assert.deepEqual(rulesReaching(exec, [rule({ roles: ["sales_manager"] })]), [], "another role's rule is hidden");
  assert.deepEqual(rulesReaching(exec, [rule({ users: ["someone-else"] })]), [], "another person's rule is hidden");
  assert.deepEqual(rulesReaching(exec, [rule({ roles: ["sales_executive"] }, { enabled: false })]), [], "disabled rules are hidden");
  assert.deepEqual(rulesReaching(exec, [rule({ roles: ["sales_executive"] }, { email: false })]), [], "webhook-only rules send nothing to people");
  assert.deepEqual(rulesReaching(exec, [rule({ users: ["u1"], record_owner: true })]).map((reach) => [reach.why, reach.scope]), [[["person", "owner"], "own"]]);
  assert.deepEqual(rulesReaching(user(["hr"]), [rule({ roles: ["hr"] })]), [], "rules are CRM rules: no CRM, nothing reaches");
});

test("kit and shell carry no board placeholders or board CSS (UI1-S7)", () => {
  const files = [
    "src/layouts/WorkspaceShell.astro", "src/styles/workspace.css",
    ...readdirSync("src/components/workspace/ui").map((name) => `src/components/workspace/ui/${name}`),
    ...["WorkspaceHome", "WorkspaceAccount", "WorkspaceAccountNotifications", "WorkspaceInbox", "WorkspaceSearch"].map((name) => `src/components/workspace/${name}.astro`),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /\{\{[^}]*\}\}/, `${file}: no {{…}} placeholders`);
    assert.doesNotMatch(text, /Dữ liệu minh họa|Mộc Gia|lumi\.css|redesign\/boards/, `${file}: no board sample data or board CSS`);
  }
});

test("launcher tiles and page results follow permissions (UI5-S2)", () => {
  for (const key of modules.map((module) => module.key)) {
    for (const blurb of launcherBlurbs[key]) assert.ok(blurb.length > 0 && blurb.length <= 36 && !blurb.includes("\n"), `${key}: one short line, got "${blurb}"`);
  }
  for (const person of [...roles.map((role) => user([role])), user([], true)]) {
    const open = new Set(visibleModules(person).map((module) => module.key));
    const pages = launcherPages(person);
    for (const { module, link } of pages) {
      assert.ok(open.has(module.key), `a page result sits in a module the person opens (${module.key})`);
      assert.ok(visibleLinks(person, module).some((visible) => visible.key === link.key), `${module.key}/${link.key} is a page the person may open`);
    }
    assert.equal(pages.length, visibleModules(person).reduce((sum, module) => sum + visibleLinks(person, module).length, 0), "every page the person may open is findable");
  }
  assert.ok(!launcherPages(user(["hr"])).some(({ module }) => module.key === "crm"), "HR finds no CRM page");
  assert.ok(!launcherPages(user(["sales_executive"])).some(({ module }) => module.key === "hiring" || module.key === "admin"), "a seller finds no hiring or admin page");
});

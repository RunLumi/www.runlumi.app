import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_PERMISSIONS, makeUser, permissions, permissionsFor, roles } from "../src/lib/workspace/roles.ts";
import { modules, moduleForPath, switchLocale, visibleGroups, visibleLinks, visibleModules } from "../src/lib/workspace/nav.ts";
import { readFileSync } from "node:fs";

const user = (granted: (typeof roles)[number][], admin = false) => makeUser({ id: "u", name: "U", email: "u@example.test" }, admin, granted);

test("admins hold every permission; roles hold only their own", () => {
  assert.equal(permissionsFor(true, []).size, permissions.length);
  assert.ok(user(["hr"]).can("hiring.applications.delete"));
  assert.ok(!user(["hr"]).can("crm.access"), "HR never opens the CRM");
  for (const role of ["sales_manager", "sales_executive", "finance", "fulfillment"] as const) {
    assert.ok(!user([role]).can("hiring.access"), `${role} never opens candidate records`);
    assert.ok(!user([role]).can("users.manage"));
    assert.ok(!user([role]).can("crm.configure"));
  }
  assert.ok(user(["sales_manager"]).can("crm.team"));
  assert.ok(!user(["sales_executive"]).can("crm.team"));
  assert.ok(user(["sales_executive", "fulfillment"]).can("crm.fulfillment"), "roles combine");
  assert.equal(permissionsFor(false, []).size, 0);
});

test("every role is allowed by the database constraint", () => {
  const sql = readFileSync(new URL("../migrations/0007_workspace_partner_role.sql", import.meta.url), "utf8");
  for (const role of roles) assert.ok(sql.includes(`'${role}'`), role);
  for (const role of roles) assert.ok(ROLE_PERMISSIONS[role].includes("workspace.access"), `${role} can reach the Workspace home`);
});

test("navigation lists only modules and pages a person may open", () => {
  assert.deepEqual(visibleModules(user(["hr"])).map((module) => module.key), ["home", "hiring"]);
  assert.deepEqual(visibleModules(user([], true)).map((module) => module.key), ["home", "hiring", "crm", "admin"]);
  const crm = modules.find((module) => module.key === "crm")!;
  assert.ok(!visibleLinks(user(["sales_executive"]), crm).some((link) => ["operations", "playbooks", "offers", "fulfillment"].includes(link.key)));
  assert.ok(visibleLinks(user(["sales_manager"]), crm).some((link) => link.key === "operations"));
  assert.ok(!visibleLinks(user(["sales_manager"]), crm).some((link) => link.key === "playbooks"));
  assert.equal(moduleForPath("/vi/admin/jobs/applications/x"), "hiring");
  assert.equal(switchLocale(new URL("https://runlumi.app/vi/admin/jobs?job=1")), "/admin/jobs?job=1");
  assert.equal(switchLocale(new URL("https://runlumi.app/workspace/users")), "/vi/workspace/users");
});

test("partners sell or refer but never handle money, team-wide data or hiring", () => {
  const partner = user(["partner"]);
  assert.ok(partner.can("crm.access") && partner.can("crm.refer"));
  for (const permission of ["crm.team", "crm.configure", "crm.finance", "crm.fulfillment", "crm.payments.report", "hiring.access", "users.manage"] as const) assert.ok(!partner.can(permission), permission);
  assert.ok(user(["sales_executive"]).can("crm.payments.report"), "staff still report payments");
  const crm = modules.find((module) => module.key === "crm")!;
  assert.ok(visibleLinks(partner, crm).some((link) => link.key === "referrals"));
  assert.ok(!visibleLinks(user(["finance"]), crm).some((link) => link.key === "referrals"));
});

test("CRM navigation is grouped, every page has an icon, and empty groups are hidden", () => {
  const crm = modules.find((module) => module.key === "crm")!;
  const groupKeys = new Set((crm.groups ?? []).map((group) => group.key));
  for (const module of modules) for (const link of module.links) assert.ok(link.icon, `${link.key} has an icon`);
  for (const link of crm.links) assert.ok(link.group && groupKeys.has(link.group), `${link.key} belongs to a CRM group`);
  assert.equal(new Set(crm.links.map((link) => link.icon)).size, crm.links.length, "each CRM page has its own glyph");
  const groupsFor = (roles: Parameters<typeof user>[0]) => visibleGroups(user(roles), crm).map(({ group }) => group.key);
  assert.deepEqual(groupsFor(["partner"]), ["sell", "customers", "results", "help"]);
  assert.deepEqual(groupsFor(["sales_manager"]), ["sell", "customers", "results", "operations", "help"]);
  assert.deepEqual(groupsFor(["fulfillment"]), ["sell", "customers", "results", "operations", "help"]);
  const agentLink = visibleGroups(user(["sales_executive"]), crm).find(({ group }) => group.key === "help")!.links.map((link) => link.key);
  assert.deepEqual(agentLink, ["process", "files", "api"], "everyone selling sees files, the sales process and the agent guide");
});

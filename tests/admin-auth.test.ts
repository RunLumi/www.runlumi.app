// EmDash user sessions replace the former application-owned password cookie.
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeUser, emdashLoginUrl, safeNext } from "../src/lib/admin-auth.ts";

test("activeUser rejects missing and disabled EmDash accounts", () => {
  assert.equal(activeUser({ user: undefined }), undefined);
  assert.equal(activeUser({ user: { id: "disabled", disabled: true } as never }), undefined);
  assert.equal(activeUser({ user: { id: "active", disabled: false } as never })?.id, "active");
});

test("safeNext allows local admin and CRM destinations", () => {
  assert.equal(safeNext("/admin/jobs"), "/admin/jobs");
  assert.equal(safeNext("/admin/jobs/applications?status=new"), "/admin/jobs/applications?status=new");
  assert.equal(safeNext("/admin/crm"), "/admin/crm");
  assert.equal(safeNext("/crm?stage=proposal"), "/crm?stage=proposal");
  assert.equal(safeNext("/vi/crm/lead-123"), "/vi/crm/lead-123");
});

test("safeNext rejects external and malformed destinations", () => {
  for (const value of [null, "", "https://evil.example/admin/jobs", "//evil.example/admin/jobs", "/public", "/\\\\evil.example", "/crm/%5c%5cevil.example"]) {
    assert.equal(safeNext(value), "/admin/jobs");
  }
});

test("EmDash login return URL is encoded and restricted", () => {
  assert.equal(emdashLoginUrl("/crm?stage=proposal"), "/_emdash/admin/login?redirect=%2Fcrm%3Fstage%3Dproposal");
  assert.equal(emdashLoginUrl("https://evil.example"), "/_emdash/admin/login?redirect=%2Fadmin%2Fjobs");
});

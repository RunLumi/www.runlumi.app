import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error plain ESM build script without types
import { appVersion, formatAppVersion } from "../scripts/app-version.mjs";

test("version is v<year>.<month>+<short commit>, month in Vietnam time", () => {
  assert.equal(formatAppVersion({ sha: "c1a328c793f7599512d5c2570601bd98d7aae1cf", date: new Date("2026-11-02T03:01:19Z") }), "v2026.11+c1a328c");
  // 31 Oct 18:00 UTC is already 1 Nov in Ho Chi Minh City.
  assert.equal(formatAppVersion({ sha: "ABCDEF1234", date: new Date("2026-10-31T18:00:00Z") }), "v2026.11+abcdef1");
  assert.equal(formatAppVersion({ sha: "", date: new Date("2027-03-15T00:00:00Z") }), "v2027.03+dev");
  assert.match(appVersion({ WORKERS_CI_COMMIT_SHA: "0123456789abcdef" }), /^v\d{4}\.\d{2}\+0123456$/);
});

test("every page layout shows the version except the landing page", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  for (const path of ["src/layouts/WorkspaceShell.astro", "src/layouts/WorkspaceAuth.astro", "src/components/crm/SharedFilesView.astro", "src/components/CompanyFooter.astro"]) assert.match(read(path), /APP_VERSION/, path);
  assert.match(read("src/components/LandingPage.astro"), /<CompanyFooter[^>]*version=\{false\}/);
  assert.doesNotMatch(read("src/components/CompanyPage.astro"), /version=\{false\}/);
});

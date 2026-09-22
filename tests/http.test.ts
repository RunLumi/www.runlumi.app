// Tests for src/lib/http.ts — same-origin enforcement and response helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin, redirect303, badRequest } from "../src/lib/http.ts";

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

test("sameOrigin: same-origin request is allowed", () => {
  const url = "https://runlumi.app/api/jobs/x/apply";
  assert.equal(sameOrigin(request(url, { Origin: "https://runlumi.app" })), true);
});

test("sameOrigin: cross-origin request is rejected", () => {
  const url = "https://runlumi.app/api/jobs/x/apply";
  assert.equal(sameOrigin(request(url, { Origin: "https://evil.example" })), false);
});

test("sameOrigin: subdomain is cross-origin", () => {
  const url = "https://runlumi.app/api/jobs/x/apply";
  assert.equal(sameOrigin(request(url, { Origin: "https://runlumi.app.evil.example" })), false);
});

test("sameOrigin: missing Origin falls back to Sec-Fetch-Site", () => {
  const url = "https://runlumi.app/api/jobs/x/apply";
  assert.equal(sameOrigin(request(url, { "Sec-Fetch-Site": "same-origin" })), true);
  assert.equal(sameOrigin(request(url, { "Sec-Fetch-Site": "cross-site" })), false);
});

test("sameOrigin: no Origin and no Sec-Fetch-Site is allowed (non-browser client)", () => {
  assert.equal(sameOrigin(request("https://runlumi.app/api/jobs/x/apply")), true);
});

test("redirect303: sets 303 status and Location header", () => {
  const response = redirect303("/admin/jobs");
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), "/admin/jobs");
});

test("badRequest: sets 400 status and plain-text body", () => {
  const response = badRequest("nope");
  assert.equal(response.status, 400);
  assert.match(response.headers.get("Content-Type") ?? "", /^text\/plain/);
  assert.equal(response.headers.get("Content-Type")?.includes("charset=utf-8"), true);
});

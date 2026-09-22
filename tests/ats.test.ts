// Tests for src/lib/ats.ts — pure helpers used by the ATS endpoints.
// The cloudflare:workers module is stubbed by scripts/test-setup.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formText,
  slugify,
  safeHttpUrl,
  safeFilename,
  splitLines,
  statusLabel,
  applicationStatuses
} from "../src/lib/ats.ts";

test("formText: trims strings and caps length", () => {
  const form = new FormData();
  form.set("a", "  padded  ");
  form.set("long", "x".repeat(50));
  assert.equal(formText(form, "a"), "padded");
  assert.equal(formText(form, "long", 10), "x".repeat(10));
});

test("formText: returns empty string for missing or non-string values", () => {
  const form = new FormData();
  form.set("file", new Blob(["cv"]));
  assert.equal(formText(form, "missing"), "");
  assert.equal(formText(form, "file"), "");
});

test("slugify: lowercases, transliterates diacritics, and collapses separators", () => {
  assert.equal(slugify("  Senior Product Engineer "), "senior-product-engineer");
  assert.equal(slugify("Trợ lý vận hành"), "tro-ly-van-hanh");
  assert.equal(slugify("C++ / Rust — Ops"), "c-rust-ops");
});

test("slugify: caps at 80 chars", () => {
  assert.ok(slugify("a".repeat(200)).length <= 80);
});

test("slugify: always returns something", () => {
  assert.match(slugify("///"), /^job-\d+$/);
});

test("safeHttpUrl: accepts http(s) URLs only", () => {
  assert.equal(safeHttpUrl("https://linkedin.com/in/someone"), "https://linkedin.com/in/someone");
  assert.equal(safeHttpUrl("http://example.com/portfolio"), "http://example.com/portfolio");
  assert.equal(safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(safeHttpUrl("file:///etc/passwd"), "");
  assert.equal(safeHttpUrl("not a url"), "");
  assert.equal(safeHttpUrl(""), "");
});

test("safeFilename: strips path traversal and unsafe characters", () => {
  // separators are neutralized, so the result cannot traverse paths
  assert.equal(safeFilename("../../etc/passwd"), "..-..-etc-passwd");
  assert.ok(!safeFilename("../../etc/passwd").includes("/"));
  assert.equal(safeFilename("cv (final) v2.pdf"), "cv-final-v2.pdf");
  assert.equal(safeFilename("weird\u0000name\rfile.pdf"), "weird-name-file.pdf");
  assert.equal(safeFilename(""), "file");
});

test("safeFilename: keeps Vietnamese letters", () => {
  assert.equal(safeFilename("đơn ứng tuyển.pdf"), "đơn-ứng-tuyển.pdf");
});

test("splitLines: splits, trims bullets, and drops empties", () => {
  assert.deepEqual(splitLines("- one\n• two\n\n  three  "), ["one", "two", "three"]);
  assert.deepEqual(splitLines(""), []);
});

test("statusLabel: humanizes enum values", () => {
  assert.equal(statusLabel("work_sample"), "Work Sample");
  assert.equal(statusLabel("hired"), "Hired");
});

test("applicationStatuses covers the pipeline contract", () => {
  assert.equal(applicationStatuses.length, 8);
  assert.ok(applicationStatuses.includes("new") && applicationStatuses.includes("withdrawn"));
});

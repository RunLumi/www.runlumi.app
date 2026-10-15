// Content-contract checks only. Run the full Astro build and authenticated UI
// review separately; these tests do not claim to exercise the production CRM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const viPath = new URL("../docs/Lumi_Quy_Trinh_Ban_Hang.md", import.meta.url);
const enPath = new URL("../docs/Lumi_Sales_Process.en.md", import.meta.url);
const guides = [readFileSync(viPath, "utf8"), readFileSync(enPath, "utf8")];
const component = readFileSync(new URL("../src/components/crm/SalesProcessView.astro", import.meta.url), "utf8");
const sections = (text: string) => [...text.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));
const links = (text: string) => [...text.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]).sort();

test("sales guide: both locales have one title and the same twelve sections", () => {
  for (const guide of guides) {
    assert.equal((guide.match(/^# /gm) ?? []).length, 1);
    assert.deepEqual(sections(guide), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.equal((guide.match(/^```/gm) ?? []).length, 2);
    assert.ok(guide.includes("2.0"));
  }
});

test("sales guide: prices and historical paid credit agree across locales", () => {
  for (const guide of guides) {
    for (const digits of ["1990000", "399000", "1591000", "599000", "999000"]) {
      assert.ok(guide.replace(/[.,]/g, "").includes(digits), digits);
    }
    assert.ok(guide.includes("30"));
  }
  assert.match(guides[1], /free Basic gift does not create this credit/);
  assert.match(guides[1], /no automatic new Pro kit every year/);
});

test("sales guide: Basic is independent of purchase and is not a receivable", () => {
  assert.match(guides[1], /Basic requires no purchase/);
  assert.match(guides[1], /No website purchase, demo attendance, promotional post, referral or review of Lumi is required/);
  assert.match(guides[1], /Do not collect payment or create a receivable for the gift/);
  assert.match(guides[1], /Customers may buy Starter directly/);
  assert.match(guides[1], /Never disable the QR, demand the gift back/);
});

test("sales guide: historical configurations and actual payment boundaries are explicit", () => {
  assert.match(guides[1], /Saved playbooks, offers and quotes retain their versions/);
  assert.match(guides[1], /an Admin must create an approved offer version/);
  assert.match(guides[1], /Accepted is not paid/);
  assert.match(guides[1], /Finance confirms/);
  assert.match(guides[1], /Partners do not handle money/);
  assert.match(guides[1], /no cash collection or personal accounts/);
  assert.match(guides[1], /50% at signing and 50% at acceptance/);
});

test("sales guide: actions map to existing stages rather than a replacement pipeline", () => {
  for (const guide of guides) {
    for (const key of ["local-preview", "new", "qualified", "owner_talked", "preview_shown", "deciding", "accepted", "local-renewal", "parent_id", "lumi-solution"]) {
      assert.ok(guide.includes(`\`${key}\``), key);
    }
    assert.doesNotMatch(guide, /\| S[0-9] \|/);
  }
  assert.match(guides[1], /This guide adds no database stages or fields/);
});

test("sales guide: failed visits and gift markers are not fabricated milestones", () => {
  for (const guide of guides) {
    for (const token of ["visit", "internal", "owner_absent", "rescheduled", "no_show", "declined", "[BASIC_READY]", "[BASIC_DELIVERED]", "[BASIC_DECLINED]", "[PRO_DELIVERED]"]) assert.ok(guide.includes(token), token);
  }
  assert.match(guides[1], /manual note conventions/);
  assert.match(guides[1], /not an automatic fulfillment transition or commission trigger/);
  assert.match(guides[1], /CRM currently has no separate Pro status/);
});

test("sales guide: Basic acquisition costs and Pro delivery costs remain distinct", () => {
  for (const guide of guides) {
    assert.ok(guide.includes("trust-kit-basic/print"));
    for (const category of ["sales", "printing", "travel", "actual", "estimate"]) assert.ok(guide.includes(`\`${category}\``));
  }
  assert.match(guides[1], /Basic uses `sales`; Pro uses `printing`/);
  assert.match(guides[1], /Minutes without a costed amount mean incomplete costing/);
  assert.match(guides[1], /Do not duplicate minutes/);
  assert.match(guides[1], /Existing cohort\/commission gates remain governed by their stored policy versions/);
});

test("sales guide: arithmetic examples reconcile and are identified as illustrations", () => {
  const total = 2700000;
  assert.equal(total / 2, 1350000);
  assert.equal(total / 5, 540000);
  assert.equal(total / 9, 300000);
  for (const guide of guides) {
    const digits = guide.replace(/[.,]/g, "");
    for (const amount of [total, total / 2, total / 5, total / 9]) assert.ok(digits.includes(String(amount)));
  }
  assert.match(guides[1], /Illustration, not Lumi actuals/);
});

test("sales guide: Google review integrity, consent and private previews remain explicit", () => {
  assert.match(guides[1], /do-not-contact/);
  assert.match(guides[1], /Never request passwords, OTPs or administrative access/);
  assert.match(guides[1], /No five-star requests, rewards\/discounts for reviews/);
  assert.match(guides[1], /without screening for happy customers/);
  assert.match(guides[1], /real enquiry collection disabled/);
  assert.match(guides[1], /permission to a demo|consent to a demo/);
});

test("sales guide: citations match and both Markdown files exist", () => {
  assert.ok(existsSync(viPath) && existsSync(enPath));
  assert.deepEqual(links(guides[0]), links(guides[1]));
  assert.ok(links(guides[1]).length >= 7);
  for (const link of links(guides[1])) assert.equal(new URL(link).protocol, "https:");
});

test("sales guide renderer: each locale uses its own content and headings", () => {
  assert.match(component, /import \* as guideVi from "\.\.\/\.\.\/\.\.\/docs\/Lumi_Quy_Trinh_Ban_Hang\.md"/);
  assert.match(component, /import \* as guideEn from "\.\.\/\.\.\/\.\.\/docs\/Lumi_Sales_Process\.en\.md"/);
  assert.match(component, /const guide = vi \? guideVi : guideEn/);
  assert.match(component, /guide\.getHeadings\(\)/);
  assert.match(component, /lang=\{lang\} aria-label=\{title\}/);
  assert.doesNotMatch(component, /This guide is written in Vietnamese/);
});

test("sales guide renderer: existing CRM shell and source visibility are retained", () => {
  assert.match(component, /<CrmShell[^>]*lang=\{lang\} actor=\{actor\} current="process"/);
  assert.match(component, /actor\.configure &&/);
  assert.match(component, /sections\.map/);
  assert.match(component, /<Content \/>/);
  assert.doesNotMatch(component, /<script|set:html|fetch\(|\.prepare\(|\.batch\(/);
});

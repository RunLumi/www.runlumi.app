import { test } from "node:test";
import assert from "node:assert/strict";
import { sendApplicationNotification, notifyApplication } from "../src/lib/application-notification.ts";

const webhook = "https://discord.com/api/webhooks/123456789/fixture_token";
const notice = { applicationId: "test-application", publicId: "TEST1234", jobTitle: "GTM @everyone" };

test("sends a private-admin link with mentions disabled and confirms saved message", async () => {
  let payload: any;
  const send = async (url: any, options: any) => {
    assert.equal(new URL(url).search, "?wait=true");
    assert.equal(options.redirect, "manual");
    assert.ok(options.signal instanceof AbortSignal);
    payload = JSON.parse(options.body);
    return Response.json({ id: "123456789012345678" });
  };
  assert.deepEqual(await sendApplicationNotification(webhook, notice, send), {
    status: "sent", messageId: "123456789012345678"
  });
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.embeds[0].url, "https://runlumi.app/admin/jobs/applications/test-application");
  assert.ok(!JSON.stringify(payload).includes("resume"));
  assert.ok(!JSON.stringify(payload).includes("email"));
});

test("rejects missing or non-Discord destinations before transmitting", async () => {
  const send = async () => { throw new Error("Must not send"); };
  for (const url of [undefined, "http://discord.com/api/webhooks/1/token", "https://evil.test/api/webhooks/1/token", "https://discord.com.evil.test/api/webhooks/1/token", "https://discord.com/api/webhooks/1/token/messages/2"]) {
    const result = await sendApplicationNotification(url, notice, send);
    assert.equal(result.status, "failed");
    assert.notEqual(result.status === "failed" && result.reason, "delivery_error");
  }
});

test("HTTP failures, redirects and unconfirmed responses are failures", async () => {
  for (const status of [302, 429, 500]) {
    assert.deepEqual(await sendApplicationNotification(webhook, notice, async () => new Response(null, { status })), {
      status: "failed", reason: `http_${status}`
    });
  }
  assert.deepEqual(await sendApplicationNotification(webhook, notice, async () => Response.json({})), {
    status: "failed", reason: "unconfirmed_delivery"
  });
});

test("fetch errors never expose the webhook or trigger ambiguous retries", async () => {
  let calls = 0;
  const result = await sendApplicationNotification(webhook, notice, async () => {
    calls++;
    throw new Error(webhook);
  });
  assert.deepEqual(result, { status: "failed", reason: "delivery_error" });
  assert.equal(calls, 1);
});

test("notification and audit failures cannot throw away a saved application", async () => {
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args) => { logs.push(args); };
  try {
    await notifyApplication({ DB: { prepare() { throw new Error("db unavailable"); } } } as any, notice);
    assert.ok(logs.length > 0);
    assert.ok(!JSON.stringify(logs).includes(webhook));
  } finally {
    console.error = originalError;
  }
});

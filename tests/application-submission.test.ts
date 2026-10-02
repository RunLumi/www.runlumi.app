import { test } from "node:test";
import assert from "node:assert/strict";
import { env } from "cloudflare:workers";
import { POST } from "../src/pages/api/jobs/[slug]/apply.ts";

const url = "https://runlumi.app/api/jobs/gtm-specialist/apply";
const job = { id: "test-job", slug: "gtm-specialist", title: "TEST GTM" };

function fixture(options: { failCommit?: boolean; questions?: any[] } = {}) {
  const operations: string[] = [];
  const rows: Array<{ sql: string; values: unknown[] }> = [];
  const DB = {
    prepare(sql: string) {
      const statement = {
        sql, values: [] as unknown[],
        bind(...values: unknown[]) { this.values = values; return this; },
        async first() { return job; },
        async all() { return { results: options.questions ?? [] }; },
        async run() { operations.push("audit"); rows.push(this); return { success: true }; }
      };
      return statement;
    },
    async batch(statements: any[]) {
      operations.push("commit");
      if (options.failCommit) throw new Error("Simulated commit failure");
      rows.push(...statements);
      return statements.map(() => ({ success: true }));
    }
  };
  const FILES = {
    async put(key: string, body: ReadableStream) {
      assert.ok((await new Response(body).arrayBuffer()).byteLength > 0);
      operations.push("upload");
    },
    async delete() { operations.push("cleanup"); }
  };
  return { DB, FILES, operations, rows };
}

function form() {
  const data = new FormData();
  data.set("started_at", String(Date.now() - 5000));
  data.set("website", "");
  data.set("full_name", "TEST Applicant");
  data.set("email", "test@example.com");
  data.set("cover_letter", "Synthetic application regression test");
  data.set("consent", "1");
  data.set("resume", new File(["%PDF-1.4 test"], "TEST-cv.pdf", { type: "application/pdf" }));
  return data;
}

async function submit(request: Request, state: ReturnType<typeof fixture>, discordStatus = 200) {
  const bindings = env as any;
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  bindings.DB = state.DB;
  bindings.FILES = state.FILES;
  bindings.DISCORD_APPLICATION_WEBHOOK_URL = "https://discord.com/api/webhooks/123456789/fixture_token";
  globalThis.fetch = async () => {
    state.operations.push("discord");
    return Response.json({ id: "123456789012345678" }, { status: discordStatus });
  };
  console.error = () => {};
  try {
    return await POST({ request, params: { slug: job.slug }, locals: {} } as any);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    delete bindings.DB;
    delete bindings.FILES;
    delete bindings.DISCORD_APPLICATION_WEBHOOK_URL;
  }
}

function request(body: FormData) {
  return new Request(url, { method: "POST", headers: { Origin: "https://runlumi.app" }, body });
}

test("application commits private CV metadata before notifying Discord", async () => {
  const state = fixture();
  const response = await submit(request(form()), state);
  assert.equal(response.status, 303);
  assert.match(response.headers.get("Location") ?? "", /^\/jobs\/gtm-specialist\?applied=[A-F0-9]{8}$/);
  assert.deepEqual(state.operations, ["upload", "commit", "discord", "audit"]);
  assert.equal(state.rows.filter(row => row.sql.includes("INSERT INTO applications")).length, 1);
  assert.equal(state.rows.filter(row => row.sql.includes("INSERT INTO application_files")).length, 1);
  assert.ok(state.rows.some(row => row.values.includes("discord_notification_sent")));
});

test("malformed bodies return the candidate error page without side effects", async () => {
  for (const contentType of ["text/plain", "multipart/form-data; boundary=broken"]) {
    const state = fixture();
    const response = await submit(new Request(url, {
      method: "POST", headers: { Origin: "https://runlumi.app", "Content-Type": contentType }, body: "broken form"
    }), state);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), "/jobs/gtm-specialist?error=1");
    assert.deepEqual(state.operations, []);
  }
});

test("missing consent, invalid CV, oversized CV and honeypot do not create applications", async () => {
  const cases = [
    (data: FormData) => data.delete("consent"),
    (data: FormData) => data.set("resume", new File(["test"], "invalid.exe", { type: "application/octet-stream" })),
    (data: FormData) => data.set("resume", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })),
    (data: FormData) => data.set("website", "bot")
  ];
  for (const change of cases) {
    const state = fixture(), data = form();
    change(data);
    const response = await submit(request(data), state);
    assert.equal(response.headers.get("Location"), "/jobs/gtm-specialist?error=1");
    assert.deepEqual(state.operations, []);
  }
});

test("failed commit cleans uploaded files and never sends a notification", async () => {
  const state = fixture({ failCommit: true });
  const response = await submit(request(form()), state);
  assert.equal(response.headers.get("Location"), "/jobs/gtm-specialist?error=1");
  assert.deepEqual(state.operations, ["upload", "commit", "cleanup"]);
});

test("Discord failure preserves the committed application and success receipt", async () => {
  const state = fixture();
  const response = await submit(request(form()), state, 500);
  assert.match(response.headers.get("Location") ?? "", /\?applied=/);
  assert.deepEqual(state.operations, ["upload", "commit", "discord", "audit"]);
  assert.ok(state.rows.some(row => row.values.includes("discord_notification_failed")));
});

test("required job questions are enforced and answers/files are committed together", async () => {
  const questions = [
    { id: "answer", kind: "long", required: 1 },
    { id: "work", kind: "file", required: 1 }
  ];
  const missing = fixture({ questions });
  const rejected = await submit(request(form()), missing);
  assert.equal(rejected.headers.get("Location"), "/jobs/gtm-specialist?error=1");
  assert.deepEqual(missing.operations, []);
  const state = fixture({ questions }), data = form();
  data.set("question_answer", "TEST relevant work example");
  data.set("question_work", new File(["TEST work sample"], "TEST-sample.txt", { type: "text/plain" }));
  const accepted = await submit(request(data), state);
  assert.match(accepted.headers.get("Location") ?? "", /\?applied=/);
  assert.deepEqual(state.operations, ["upload", "upload", "commit", "discord", "audit"]);
  assert.equal(state.rows.filter(row => row.sql.includes("INSERT INTO application_answers")).length, 1);
  assert.equal(state.rows.filter(row => row.sql.includes("INSERT INTO application_files")).length, 2);
});

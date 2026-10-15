// Integration helpers: real HTTP against a local Astro/Worker dev server with
// D1 persisted in an isolated directory, and real EmDash sessions.
// Synthetic data only; never point this at production.
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";

export const BASE = process.env.CRM_BASE_URL ?? "http://localhost:4391";
export const PERSIST = process.env.LUMI_PERSIST_TO;
if (!PERSIST) throw new Error("Set LUMI_PERSIST_TO to the isolated D1 directory used by the dev server.");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Integration tests only run against a local dev server.");

function failedRequest(method,url,error){
  const path=new URL(url,BASE).pathname.replace(/\/(?:person|employment|rec|chg|file)_[a-zA-Z0-9_-]+/g,"/[record]");
  const cause=error&&typeof error==="object"&&"cause" in error?error.cause:error;
  const code=cause&&typeof cause==="object"&&"code" in cause?String(cause.code):cause instanceof Error?cause.name:"unknown";
  console.error("local_integration_request_failed",method,path,code);
}
export async function localFetch(url,options={}){
  const headers=new Headers(options.headers);
  headers.set("Connection","close");
  try{return await globalThis.fetch(url,{...options,headers})}catch(error){failedRequest(options.method??"GET",url,error);throw error}
}

export class Session {
  constructor(name) { this.name = name; this.cookies = new Map(); }
  header() { return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "); }
  absorb(response) {
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(line) || value === "") this.cookies.delete(key); else this.cookies.set(key, value);
    }
  }
  async get(path) {
    const response = await localFetch(BASE + path, { headers: { cookie: this.header() }, redirect: "manual" });
    this.absorb(response);
    return { status: response.status, location: response.headers.get("location"), html: await response.text(), headers: response.headers };
  }
  async post(path, fields, { origin = BASE } = {}) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) body.append(key, String(item));
    if (!body.has("request_key")) body.set("request_key", key());
    const response = await localFetch(BASE + path, { method: "POST", body, headers: { cookie: this.header(), origin, "content-type": "application/x-www-form-urlencoded" }, redirect: "manual" });
    this.absorb(response);
    return { status: response.status, location: response.headers.get("location"), html: await response.text(), headers: response.headers };
  }
}

export const key = () => randomUUID().replaceAll("-", "");

export function sql(database, command) {
  const out = execFileSync("./node_modules/.bin/wrangler", ["d1", "execute", database, "--local", "--persist-to", PERSIST, "--json", "--command", command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out)[0].results;
}
export const jobs = (command) => sql("lumi-jobs", command);
export const content = (command) => sql("lumi-content", command);
export const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

export async function adminSession() {
  const session = new Session("admin");
  const response = await session.get("/_emdash/api/setup/dev-bypass?content=0");
  if (response.status !== 200) throw new Error(`dev bypass failed: ${response.status}`);
  return session;
}

/** Creates (or reuses) a synthetic EmDash user and signs in through a real magic link. */
export async function userSession(admin, { email, name, role = 30 }) {
  const id = `test_${email.split("@")[0].replace(/[^a-z0-9]/gi, "_")}`;
  content(`INSERT INTO users (id, email, name, role, email_verified, disabled) VALUES (${q(id)}, ${q(email)}, ${q(name)}, ${role}, 1, 0) ON CONFLICT(id) DO UPDATE SET disabled = 0, role = ${role}`);
  const session = new Session(name);
  // EmDash allows 3 magic links per IP per 5 minutes; reset the counter in the
  // isolated test database only so several synthetic users can sign in.
  content("DELETE FROM _emdash_rate_limits");
  const send = await localFetch(`${BASE}/_emdash/api/auth/magic-link/send`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email }) });
  if (!send.ok) throw new Error(`magic link send failed for ${email}: ${send.status}`);
  const emails = await admin.get("/_emdash/api/dev/emails");
  const items = JSON.parse(emails.html).data.items.filter((item) => item.message.to === email);
  const link = items.map((item) => /https?:\/\/\S+magic-link\/verify\?token=[\w-]+/.exec(item.message.text)?.[0]).filter(Boolean).pop();
  if (!link) throw new Error(`no magic link for ${email}`);
  const url = new URL(link);
  const verify = await session.get(url.pathname + url.search);
  if (![200, 302, 303].includes(verify.status)) throw new Error(`magic link verify failed: ${verify.status}`);
  const cleared = await localFetch(`${BASE}/_emdash/api/dev/emails`, { method: "DELETE", headers: { cookie: admin.header(), origin: BASE, "x-emdash-request": "1" } });
  if (!cleared.ok) {
    const detail=(await cleared.text()).replace(/[^\s@]+@[^\s@]+\.[A-Z]{2,}/gi,"[redacted-email]").replace(/([?&]token=)[A-Z0-9_-]+/gi,"$1[redacted-token]").slice(0,180);
    throw new Error(`synthetic dev-email cleanup failed: ${cleared.status} ${detail}`);
  }
  session.id = id;
  session.email = email;
  return session;
}

export function idFrom(location) {
  const match = /\/crm\/(opp_[a-f0-9]+|[A-Za-z0-9_-]+)(?:[?#]|$)/.exec(location ?? "");
  if (!match) throw new Error(`no id in ${location}`);
  return match[1];
}

export function version(html) {
  const match = /name="version" value="(\d+)"/.exec(html);
  if (!match) throw new Error("no version in page");
  return Number(match[1]);
}

export async function oppVersion(session, id) {
  return version((await session.get(`/crm/${id}`)).html);
}

export const isoDaysAgo = (days) => new Date(Date.now() + 7 * 3600_000 - days * 86_400_000).toISOString().slice(0, 10);

export function signedIntake(secret, body, { key: idem = `enq_${key()}`, source = "local.runlumi.app", timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const signature = `v1=${createHmac("sha256", secret).update(`${timestamp}.${idem}.${text}`).digest("hex")}`;
  return localFetch(`${BASE}/api/intake/local`, { method: "POST", headers: { "content-type": "application/json", "x-lumi-source": source, "x-lumi-timestamp": String(timestamp), "idempotency-key": idem, "x-lumi-signature": signature }, body: text });
}

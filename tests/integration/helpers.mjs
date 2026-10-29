// Integration helpers: real HTTP against a local Astro/Worker dev server with
// D1 persisted in an isolated directory, and real EmDash sessions.
// Synthetic data only; never point this at production.
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { syntheticPasskey } from "../support/synthetic-passkey.mjs";

export const BASE = process.env.CRM_BASE_URL ?? "http://localhost:4391";
export const PERSIST = process.env.LUMI_PERSIST_TO;
if (!PERSIST) throw new Error("Set LUMI_PERSIST_TO to the isolated D1 directory used by the dev server.");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("Integration tests only run against a local dev server.");

function failedRequest(method,url,error){
  const path=safePath(url);
  const cause=error&&typeof error==="object"&&"cause" in error?error.cause:error;
  const code=cause&&typeof cause==="object"&&"code" in cause?String(cause.code):cause instanceof Error?cause.name:"unknown";
  console.error("local_integration_request_failed",method,path,code);
}
function safePath(url){return new URL(url,BASE).pathname.replace(/\/(?:person|employment|rec|chg|file)_[a-zA-Z0-9_-]+/g,"/[record]")}
export async function localFetch(url,options={}){
  const headers=new Headers(options.headers);
  headers.set("Connection","close");
  const requestOptions={...options,headers};
  try{return await globalThis.fetch(url,requestOptions)}catch(error){
    const method=(options.method??"GET").toUpperCase(),path=safePath(url);
    const isHrm=path==="/hrm"||path.startsWith("/hrm/")||path==="/vi/hrm"||path.startsWith("/vi/hrm/")||path.startsWith("/api/hrm/");
    const isCrm=path==="/crm"||path.startsWith("/crm/")||path.startsWith("/api/crm/");
    const isWorkspace=path==="/workspace"||path.startsWith("/workspace/")||path==="/vi/workspace"||path.startsWith("/vi/workspace/");
    const body=options.body;const hasIdempotencyKey=body instanceof URLSearchParams?body.has("request_key"):body instanceof FormData?body.has("request_key"):false;
    const cause=error&&typeof error==="object"&&"cause" in error?error.cause:error,code=cause&&typeof cause==="object"&&"code" in cause?String(cause.code):"";
    const retryable=(isHrm||isCrm||isWorkspace&&method==="GET")&&(method==="GET"||method==="POST"&&hasIdempotencyKey);
    if(retryable&&(code==="ECONNRESET"||code==="UND_ERR_SOCKET"||code==="EPIPE")){
      let lastError=error;
      for(const delay of [80,160,320]){
        await new Promise(resolve=>setTimeout(resolve,delay));
        try{const response=await globalThis.fetch(url,requestOptions);console.error("local_integration_safe_retry",method,path,"recovered");return response}catch(retryError){lastError=retryError;const retryCause=retryError&&typeof retryError==="object"&&"cause" in retryError?retryError.cause:retryError;const retryCode=retryCause&&typeof retryCause==="object"&&"code" in retryCause?String(retryCause.code):"";if(retryCode!=="ECONNRESET"&&retryCode!=="UND_ERR_SOCKET"&&retryCode!=="EPIPE")break;}
      }
      failedRequest(method,url,lastError);throw lastError;
    }
    failedRequest(method,url,error);throw error;
  }
}

export class Session {
  constructor(name) { this.name = name; this.cookies = new Map(); this.passkeyChecks = 0; }
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
  /** True when the server asked for the Workspace passkey check (session gate or step-up). */
  static asksForPasskey(status, location, body = "") {
    return (status === 303 && /^\/(?:vi\/)?workspace\/verify\?/.test(location ?? "")) || ((status === 401 || status === 403) && /"code":"(?:step_up_required|passkey_required)"/.test(body));
  }
  /** EmDash user ID of this session (dev-bypass admins learn it here). */
  async userId() {
    if (this.id) return this.id;
    const response = await localFetch(`${BASE}/_emdash/api/auth/me`, { headers: { cookie: this.header() } });
    this.id = (await response.json()).data?.id;
    return this.id;
  }
  /**
   * Touch the synthetic passkey: register it in EmDash's credentials table on
   * first use (as EmDash's own registration would), then run the real
   * Workspace options/verify ceremony. Returns the verify status.
   */
  async verifyPasskey(purpose = "step_up") {
    const userId = await this.userId();
    if (!this.passkey) {
      this.passkey = syntheticPasskey(`test_cred_${randomUUID().replaceAll("-", "")}`);
      content(`INSERT INTO credentials (id, user_id, public_key, algorithm, counter, device_type, backed_up, transports, name) VALUES (${q(this.passkey.id)}, ${q(userId)}, X'${this.passkey.publicKeyHex}', -7, 0, 'singleDevice', 0, '["internal"]', 'Synthetic test passkey')`);
    }
    const json = { cookie: this.header(), origin: BASE, "content-type": "application/json", accept: "application/json" };
    const started = await localFetch(`${BASE}/api/workspace/passkey/options`, { method: "POST", headers: json, body: "{}" });
    this.absorb(started);
    if (started.status !== 200) return started.status;
    const { options } = await started.json();
    const verified = await localFetch(`${BASE}/api/workspace/passkey/verify`, { method: "POST", headers: { ...json, cookie: this.header() }, body: JSON.stringify({ purpose, credential: this.passkey.assert(options.challenge) }) });
    this.absorb(verified);
    if (verified.status === 200) this.passkeyChecks += 1;
    return verified.status;
  }
  async get(path) {
    let result = await this.rawGet(path);
    if (Session.asksForPasskey(result.status, result.location, result.html) && await this.verifyPasskey() === 200) result = await this.rawGet(path);
    return result;
  }
  async rawGet(path) {
    const response = await localFetch(BASE + path, { headers: { cookie: this.header() }, redirect: "manual" });
    this.absorb(response);
    return { status: response.status, location: response.headers.get("location"), html: await response.text(), headers: response.headers };
  }
  async post(path, fields, options = {}) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) body.append(key, String(item));
    if (!body.has("request_key")) body.set("request_key", key());
    let result = await this.rawPost(path, body, options);
    // The same body (and request_key) is retried once after the passkey check.
    if (Session.asksForPasskey(result.status, result.location, result.html) && await this.verifyPasskey() === 200) result = await this.rawPost(path, body, options);
    return result;
  }
  async rawPost(path, body, { origin = BASE } = {}) {
    const response = await localFetch(BASE + path, { method: "POST", body, headers: { cookie: this.header(), origin, "content-type": "application/x-www-form-urlencoded" }, redirect: "manual" });
    this.absorb(response);
    return { status: response.status, location: response.headers.get("location"), html: await response.text(), headers: response.headers };
  }
}

export const key = () => randomUUID().replaceAll("-", "");

export function sql(database, command) {
  try {
    const out = execFileSync("./node_modules/.bin/wrangler", ["d1", "execute", database, "--local", "--persist-to", PERSIST, "--json", "--command", command], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return JSON.parse(out)[0].results;
  } catch (error) {
    const raw = `${String(error?.stderr ?? "")}\n${String(error?.stdout ?? "")}`;
    const detail = raw.replace(/[^\s@]+@[^\s@]+\.[A-Z]{2,}/gi, "[redacted-email]")
      .replace(/([?&]token=)[A-Z0-9_-]+/gi, "$1[redacted-token]")
      .replace(/\b\d{9,15}\b/g, "[redacted-number]")
      .trim().slice(-800);
    throw new Error(`Local D1 command failed for ${database} (exit ${error?.status ?? "unknown"}).${detail ? ` ${detail}` : ""}`);
  }
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

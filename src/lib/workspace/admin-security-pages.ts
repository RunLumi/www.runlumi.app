// Loaders for the admin security and integration screens. Middleware already
// requires users.manage for these paths; each loader checks it again, and
// every change also needs step-up (a passkey check in the last five minutes).
import type { AstroGlobal } from "astro";
import { envFromLocals } from "../ats";
import { sameOrigin } from "../http";
import { listTokens, revokeToken } from "../crm/api/tokens";
import { actorFrom } from "../crm/access";
import { latestPlaybooks } from "../crm/config";
import { type AgentLevel, type AgentModule, agentPolicy, saveAgentPolicy } from "./agents";
import { AccessError, auditStatement, emdashUsers, workspaceMembers } from "./members";
import { type Platform, DestinationKeyMissing, platforms, sealUrl, urlHint, validWebhook, webhookSecret } from "./notify/destinations";
import { type Rule, getRule, listRules, parseRuleForm, saveRule } from "./notify/rules";
import { openRecoveryWindow, securityOverview, type SecurityRow } from "./org-security";
import type { WorkspaceUser } from "./roles";
import { stepUpGuard } from "./step-up";
import { passkeyRequired } from "./security-gate";

export type Lang = "en" | "vi";
type Base = { lang: Lang; vi: boolean; user: WorkspaceUser; error: string | null; saved: string | null };

const forbidden = () => new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store" } });
const seeOther = (location: string) => new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "private, no-store" } });

/** Shared POST handling: permission, origin, step-up, form; AccessError re-renders with a message. */
async function post(astro: AstroGlobal, lang: Lang, run: (form: FormData) => Promise<string>): Promise<Response | { error: string }> {
  if (!sameOrigin(astro.request)) return new Response("Invalid request origin.", { status: 400 });
  const stepUp = await stepUpGuard({ session: astro.session, locals: astro.locals, request: astro.request, url: astro.url }, { vi: lang === "vi", next: astro.url.pathname });
  if (stepUp) return stepUp;
  const form = await astro.request.formData().catch(() => null);
  if (!form) return new Response("Invalid form body.", { status: 400 });
  try {
    return seeOther(await run(form));
  } catch (error) {
    if (error instanceof AccessError) { astro.response.status = 422; return { error: `${error.field}:${error.message}` }; }
    if (error instanceof DestinationKeyMissing) { astro.response.status = 503; return { error: "key:missing" }; }
    throw error;
  }
}

function base(astro: AstroGlobal, lang: Lang): Base | Response {
  const user = astro.locals.workspace;
  if (!user?.can("users.manage")) return forbidden();
  return { lang, vi: lang === "vi", user, error: null, saved: astro.url.searchParams.get("saved") };
}

// ---- Security overview -----------------------------------------------------

export interface SecurityData extends Base { rows: SecurityRow[]; enforced: boolean }

export async function securityPage(astro: AstroGlobal, lang: Lang): Promise<SecurityData | Response> {
  const data = base(astro, lang);
  if (data instanceof Response) return data;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  if (astro.request.method === "POST") {
    const result = await post(astro, lang, async (form) => {
      if (form.get("intent") !== "recovery") throw new AccessError("intent", "invalid");
      // The admin confirms who the person is (in person or by video call) before opening a window.
      if (form.get("confirmed") !== "1") throw new AccessError("confirmed", "required");
      await openRecoveryWindow(DB, CONTENT_DB, data.user, String(form.get("user_id") ?? ""), String(form.get("reason") ?? ""));
      return `${astro.url.pathname}?saved=recovery`;
    });
    if (result instanceof Response) return result;
    data.error = result.error;
  }
  return { ...data, rows: await securityOverview(DB, CONTENT_DB), enforced: passkeyRequired(envFromLocals(astro.locals)) };
}

// ---- Webhooks ---------------------------------------------------------------

export interface DestinationRow { id: string; name: string; platform: Platform; url_hint: string; status: string; consecutive_failures: number; last_result: string; last_sent_at: string | null; created_by: string; created_at: string }
export interface DeliveryRow { id: string; rule_id: string; event_id: string; target: string; status: string; attempts: number; last_error: string; created_at: string; updated_at: string }
export interface WebhooksData extends Base { destinations: DestinationRow[]; names: Record<string, string>; keyReady: boolean; larkReady: boolean; sent7d: Record<string, { sent: number; failed: number }> }

async function names(contentDb: D1Database, ids: string[]): Promise<Record<string, string>> {
  return Object.fromEntries([...(await emdashUsers(contentDb, ids))].map(([id, user]) => [id, user.name || user.email]));
}

export async function webhooksPage(astro: AstroGlobal, lang: Lang): Promise<WebhooksData | Response> {
  const data = base(astro, lang);
  if (data instanceof Response) return data;
  const env = envFromLocals(astro.locals);
  const secret = webhookSecret(env);
  if (astro.request.method === "POST") {
    const result = await post(astro, lang, async (form) => {
      if (form.get("intent") !== "create") throw new AccessError("intent", "invalid");
      if (!secret) throw new DestinationKeyMissing();
      const platform = String(form.get("platform") ?? "") as Platform;
      if (!platforms.includes(platform)) throw new AccessError("platform", "invalid");
      const name = String(form.get("name") ?? "").replace(/\p{Cc}+/gu, " ").trim().slice(0, 80);
      if (!name) throw new AccessError("name", "required");
      const url = validWebhook(platform, String(form.get("url") ?? ""));
      if (!url) throw new AccessError("url", "invalid");
      const id = `dst_${crypto.randomUUID().replaceAll("-", "")}`, now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO workspace_notification_destinations (id, name, platform, url_sealed, url_hint, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, name, platform, await sealUrl(secret, url), urlHint(url), data.user.id, now, data.user.id, now),
        auditStatement(env.DB, data.user, "notification_destination_saved", id, { destination: id, name, platform, url: urlHint(url) }, now, { module: "admin" }),
      ]);
      return `${astro.url.pathname}/${id}?saved=created`;
    });
    if (result instanceof Response) return result;
    data.error = result.error;
  }
  const destinations = (await env.DB.prepare("SELECT id, name, platform, url_hint, status, consecutive_failures, last_result, last_sent_at, created_by, created_at FROM workspace_notification_destinations WHERE status != 'removed' ORDER BY status = 'active', name").all<DestinationRow>()).results;
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const counts = (await env.DB.prepare("SELECT target, SUM(status = 'sent') AS sent, SUM(status = 'failed') AS failed FROM workspace_notification_deliveries WHERE target LIKE 'webhook:%' AND created_at >= ? GROUP BY target").bind(since).all<{ target: string; sent: number; failed: number }>()).results;
  return { ...data, destinations, names: await names(env.CONTENT_DB, destinations.map((row) => row.created_by)), keyReady: !!secret, larkReady: !!env.LARK_CRM_WEBHOOK_URL,
    sent7d: Object.fromEntries(counts.map((row) => [row.target.slice(8), { sent: row.sent, failed: row.failed }])) };
}

export interface WebhookData extends Base { destination: DestinationRow; deliveries: DeliveryRow[]; rules: Rule[]; names: Record<string, string> }

export async function webhookPage(astro: AstroGlobal, lang: Lang): Promise<WebhookData | Response> {
  const data = base(astro, lang);
  if (data instanceof Response) return data;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const id = astro.params.id ?? "";
  const load = () => DB.prepare("SELECT id, name, platform, url_hint, status, consecutive_failures, last_result, last_sent_at, created_by, created_at FROM workspace_notification_destinations WHERE id = ? AND status != 'removed'").bind(id).first<DestinationRow>();
  const destination = await load();
  if (!destination) return new Response(lang === "vi" ? "Không tìm thấy Webhook." : "Webhook not found.", { status: 404 });
  if (astro.request.method === "POST") {
    const result = await post(astro, lang, async (form) => {
      const intent = String(form.get("intent") ?? "");
      const status = intent === "pause" ? "paused" : intent === "resume" ? "active" : intent === "remove" ? "removed" : null;
      if (!status) throw new AccessError("intent", "invalid");
      const now = new Date().toISOString();
      await DB.batch([
        DB.prepare("UPDATE workspace_notification_destinations SET status = ?, consecutive_failures = CASE WHEN ? = 'active' THEN 0 ELSE consecutive_failures END, updated_by = ?, updated_at = ? WHERE id = ?").bind(status, status, data.user.id, now, id),
        auditStatement(DB, data.user, status === "removed" ? "notification_destination_removed" : "notification_destination_saved", id, { destination: id, status }, now, { module: "admin" }),
      ]);
      return status === "removed" ? `${astro.url.pathname.replace(/\/[^/]+$/, "")}?saved=removed` : `${astro.url.pathname}?saved=${status}`;
    });
    if (result instanceof Response) return result;
    data.error = result.error;
  }
  const deliveries = (await DB.prepare("SELECT id, rule_id, event_id, target, status, attempts, last_error, created_at, updated_at FROM workspace_notification_deliveries WHERE target = ? ORDER BY created_at DESC LIMIT 100").bind(`webhook:${id}`).all<DeliveryRow>()).results;
  const rules = (await listRules(DB)).filter((rule) => rule.destinations.includes(id));
  return { ...data, destination: (await load()) ?? destination, deliveries, rules, names: await names(CONTENT_DB, [destination.created_by]) };
}

// ---- Notification rules -----------------------------------------------------

export interface RulesData extends Base { rules: Rule[]; destinations: DestinationRow[]; stats: Record<string, { last: string | null; failed7d: number; skipped7d: number }> }

export async function rulesPage(astro: AstroGlobal, lang: Lang): Promise<RulesData | Response> {
  const data = base(astro, lang);
  if (data instanceof Response) return data;
  const { DB } = envFromLocals(astro.locals);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const stats = (await DB.prepare("SELECT rule_id, MAX(CASE WHEN status = 'sent' THEN updated_at END) AS last, SUM(status = 'failed' AND created_at >= ?) AS failed7d, SUM(status = 'skipped' AND created_at >= ?) AS skipped7d FROM workspace_notification_deliveries GROUP BY rule_id").bind(since, since).all<{ rule_id: string; last: string | null; failed7d: number; skipped7d: number }>()).results;
  const destinations = (await DB.prepare("SELECT id, name, platform, url_hint, status, consecutive_failures, last_result, last_sent_at, created_by, created_at FROM workspace_notification_destinations WHERE status != 'removed' ORDER BY name").all<DestinationRow>()).results;
  return { ...data, rules: await listRules(DB), destinations, stats: Object.fromEntries(stats.map((row) => [row.rule_id, row])) };
}

export interface RuleData extends Base { rule: Rule | null; destinations: DestinationRow[]; playbooks: { id: string; name: string }[]; people: { id: string; name: string }[]; typed: FormData | null }

export async function rulePage(astro: AstroGlobal, lang: Lang): Promise<RuleData | Response> {
  const data = base(astro, lang);
  if (data instanceof Response) return data;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const id = astro.params.id && astro.params.id !== "new" ? astro.params.id : null;
  const rule = id ? await getRule(DB, id) : null;
  if (id && !rule) return new Response(lang === "vi" ? "Không tìm thấy quy tắc." : "Rule not found.", { status: 404 });
  let typed: FormData | null = null;
  if (astro.request.method === "POST") {
    const result = await post(astro, lang, async (form) => {
      typed = form;
      const saved = await saveRule(DB, data.user, id, parseRuleForm(form), id ? Number(form.get("version")) : undefined);
      return `${astro.url.pathname.replace(/\/[^/]+$/, "")}/${saved}?saved=rule`;
    });
    if (result instanceof Response) return result;
    data.error = result.error;
  }
  const destinations = (await DB.prepare("SELECT id, name, platform, url_hint, status, consecutive_failures, last_result, last_sent_at, created_by, created_at FROM workspace_notification_destinations WHERE status != 'removed' ORDER BY name").all<DestinationRow>()).results;
  const playbooks = (await latestPlaybooks(DB)).map((playbook) => ({ id: playbook.playbook_key, name: lang === "vi" ? playbook.name_vi : playbook.name_en ?? playbook.name_vi }));
  const people = (await workspaceMembers(DB, CONTENT_DB)).filter((member) => member.enabled && member.active).map((member) => ({ id: member.user_id, name: member.name || member.email }));
  return { ...data, rule, destinations, playbooks, people, typed };
}

// ---- AI agents ----------------------------------------------------------------

export interface AgentsData extends Base {
  policy: Record<AgentModule, AgentLevel>; tokens: { id: string; user_id: string; name: string; scope: string; created_at: string; expires_at: string; last_used_at: string | null; revoked_at: string | null }[];
  names: Record<string, string>; calls7d: Record<string, { calls: number; denied: number }>;
}

export async function agentsPage(astro: AstroGlobal, lang: Lang): Promise<AgentsData | Response> {
  const data = base(astro, lang);
  if (data instanceof Response) return data;
  const { DB, CONTENT_DB } = envFromLocals(astro.locals);
  const actor = actorFrom(data.user);
  if (astro.request.method === "POST") {
    const result = await post(astro, lang, async (form) => {
      const intent = String(form.get("intent") ?? "");
      if (intent === "policy") { await saveAgentPolicy(DB, data.user, form); return `${astro.url.pathname}?saved=policy`; }
      if (intent === "revoke" && actor) { await revokeToken(DB, actor, form); return `${astro.url.pathname}?saved=revoked`; }
      throw new AccessError("intent", "invalid");
    });
    if (result instanceof Response) return result;
    data.error = result.error;
  }
  const tokens = actor ? await listTokens(DB, actor, true) : [];
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const calls = (await DB.prepare("SELECT json_extract(detail, '$.token') AS token, COUNT(*) AS calls, SUM(outcome != 'success') AS denied FROM workspace_audit WHERE action = 'agent_tool_called' AND created_at >= ? GROUP BY token").bind(since).all<{ token: string; calls: number; denied: number }>()).results;
  return { ...data, policy: await agentPolicy(DB), tokens, names: await names(CONTENT_DB, tokens.map((token) => token.user_id)), calls7d: Object.fromEntries(calls.map((row) => [row.token, row])) };
}

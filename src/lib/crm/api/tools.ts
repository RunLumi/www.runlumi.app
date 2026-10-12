// The operations an API client or AI agent may perform, defined once and
// exposed both as REST endpoints (/api/crm/v1) and as MCP tools
// (/api/crm/mcp). Each operation calls the same functions as the CRM pages,
// so ownership, validation, do-not-contact, versions and audit events apply
// unchanged. Money, quotes, fulfillment, commission, assignment and
// configuration are deliberately not available here.
import { contactScope, displayNames } from "../access";
import { getPlaybook, latestPlaybooks } from "../config";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../core";
import {
  createAccount, createContact, createOpportunityFor, listAccounts, listContacts, loadAccount, saveAccount, setDoNotContact, updateContact, visibleContacts,
} from "../directory";
import { type Account, type Contact, type Filters, type Opportunity, accountOpportunities, addNote, contactRoles, listOpportunities, loadOpportunity, moveStage, oppFields, recentEvents, requireEdit, saveDetails, saveFields, sourceChannels } from "../records";
import { type ApiIdentity, requireWrite } from "./tokens";

export interface ToolContext { db: D1Database; contentDb: D1Database; identity: ApiIdentity; requestKey: string }
type Args = Record<string, unknown>;
type JsonSchema = Record<string, unknown>;

export interface Tool {
  name: string; title: string; description: string; write: boolean; inputSchema: JsonSchema;
  run: (ctx: ToolContext, args: Args) => Promise<unknown>;
}

// ---- argument helpers ------------------------------------------------------

function str(args: Args, key: string): string {
  const value = args[key];
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new ValidationError({ [key]: "invalid" });
}

function has(args: Args, key: string): boolean {
  return Object.hasOwn(args, key) && args[key] !== undefined;
}

function form(values: Record<string, string | undefined>, requestKey: string): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) data.set(key, value);
  data.set("request_key", requestKey);
  return data;
}

function pageArg(args: Args): number {
  const value = Number(args.page ?? 1);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

/** Uses the caller's version when given (stale writes are rejected), else the current one. */
function versionArg(args: Args, current: number): string {
  if (!has(args, "version")) return String(current);
  const value = Number(args.version);
  if (!Number.isSafeInteger(value) || value < 1) throw new ValidationError({ version: "invalid" });
  return String(value);
}

const text = (description: string, maxLength?: number): JsonSchema => ({ type: "string", description, ...(maxLength ? { maxLength } : {}) });
const id = (description: string): JsonSchema => ({ type: "string", description });
const schema = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });
const page = { type: "integer", minimum: 1, description: "Page number (50 results per page)." };
const version = { type: "integer", minimum: 1, description: "Version you last read. Omit to apply on top of the latest; give it to have a stale write rejected." };
const contactProperties: Record<string, JsonSchema> = {
  name: text("Full name", 160), role: { type: "string", enum: [...contactRoles] }, phone: text("Phone number", 40), email: text("Email", 254), zalo: text("Zalo", 80),
  contact_basis: text("Why this person may be contacted (met in person, referral, listed number)", 500),
  preferred_channel: { type: "string", enum: ["", "phone", "zalo", "email", "visit", "facebook", "other"] },
  consent_status: { type: "string", enum: ["unknown", "granted", "refused", "withdrawn"], description: "granted requires consent_evidence; refused or withdrawn also sets do-not-contact." },
  consent_evidence: text("Where and when consent was given", 500),
};

// ---- result shapes -----------------------------------------------------------

function company(row: Account) {
  return { id: row.id, name: row.name, industry: row.industry, region: row.region, address: row.address, notes: row.notes, owner_id: row.owner_id, do_not_contact: !!row.do_not_contact, version: row.version, created_at: row.created_at, updated_at: row.updated_at };
}

function contact(row: Contact) {
  return {
    id: row.id, company_id: row.account_id, name: row.name, role: row.role, phone: row.phone, email: row.email, zalo: row.zalo, contact_basis: row.contact_basis,
    preferred_channel: row.preferred_channel, consent_status: row.consent_status, do_not_contact: !!row.do_not_contact, owner_id: row.owner_id, version: row.version,
  };
}

function opportunity(row: Opportunity) {
  return {
    id: row.id, title: row.title, company_id: row.account_id, company_name: row.account_name, contact_id: row.primary_contact_id, playbook_id: row.playbook_id, stage_id: row.stage_id,
    outcome: row.outcome, owner_id: row.owner_id, relation: row.relation, source_channel: row.source_channel, next_action: row.next_action, next_action_due: row.next_action_due,
    estimated_value_vnd: row.estimated_value_vnd, win_probability: row.win_probability, version: row.version, created_at: row.created_at, updated_at: row.updated_at,
  };
}

async function contactRow(ctx: ToolContext, contactId: string): Promise<Contact> {
  const scope = contactScope(ctx.identity.actor);
  const row = await ctx.db.prepare(`SELECT c.* FROM crm_contacts c WHERE c.id = ? AND ${scope.sql}`).bind(contactId, ...scope.args).first<Contact>();
  if (!row) throw new NotFoundError();
  return row;
}

async function opportunityDetail(ctx: ToolContext, opportunityId: string) {
  const { actor } = ctx.identity;
  const access = await loadOpportunity(ctx.db, actor, opportunityId);
  const opp = access.opportunity;
  const playbook = await getPlaybook(ctx.db, opp.playbook_id);
  const contacts = await visibleContacts(ctx.db, actor, opp.account_id);
  const names = await displayNames(ctx.contentDb, [opp.owner_id ?? ""].filter(Boolean));
  return {
    ...opportunity(opp), can_edit: access.canEdit, owner_name: opp.owner_id ? names[opp.owner_id]?.name ?? null : null,
    contact: contacts.find((item) => item.id === opp.primary_contact_id) ? contact(contacts.find((item) => item.id === opp.primary_contact_id)!) : null,
    fields: access.canEdit ? oppFields(opp) : {},
    playbook: playbook ? {
      key: playbook.playbook_key, name: playbook.name_en,
      stages: playbook.def.stages.map((stage) => ({ id: stage.id, name: stage.en, name_vi: stage.vi, outcome: stage.outcome, requires: stage.requires ?? [], skippable: !!stage.skippable })),
      fields: playbook.def.fields.map((item) => ({ key: item.key, label: item.en, type: item.type, stage: item.stage, options: item.options?.map((option) => option.value) })),
    } : null,
    // Notes and history belong to whoever works the deal, not to read-only viewers.
    recent_activity: access.canEdit ? (await recentEvents(ctx.db, opp.id)).filter((event) => ACTIVITY_KINDS.has(event.kind)).slice(0, 15).map((event) => ({ kind: event.kind, by: event.actor_name, at: event.created_at, detail: safeJson(event.body) })) : [],
  };
}

/**
 * Activity an agent may read. Money (quotes, payments, refunds, ledger),
 * fulfillment, assignment and referral events stay out of the API even for
 * the deal's owner.
 */
const ACTIVITY_KINDS = new Set(["created", "note", "stage", "fields", "details", "primary_contact", "linked_created", "child_created", "referred", "playbook_changed"]);

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return {}; }
}

// ---- tools -------------------------------------------------------------------

export const tools: Tool[] = [
  {
    name: "whoami", title: "Who am I", write: false,
    description: "The person this token acts for, their CRM permissions and the token's scope (read or write).",
    inputSchema: schema({}),
    run: async ({ identity }) => {
      const { actor, token } = identity;
      return { id: actor.id, email: actor.email, team_wide: actor.manager, admin: actor.configure, finance: actor.finance, fulfillment: actor.fulfillment, can_refer: actor.refer, token: { name: token.name, scope: token.scope } };
    },
  },
  {
    name: "list_playbooks", title: "List sales playbooks", write: false,
    description: "Active sales playbooks with their stages (and what each stage requires) and discovery fields. Use the keys when creating or updating opportunities.",
    inputSchema: schema({}),
    run: async ({ db }) => ({
      source_channels: sourceChannels, contact_roles: contactRoles,
      playbooks: (await latestPlaybooks(db, { activeOnly: true })).map((item) => ({
        key: item.playbook_key, version: item.version, name: item.name_en, name_vi: item.name_vi, kind: item.kind,
        stages: item.def.stages.map((stage) => ({ id: stage.id, name: stage.en, outcome: stage.outcome, requires: stage.requires ?? [], skippable: !!stage.skippable })),
        fields: item.def.fields.map((field) => ({ key: field.key, label: field.en, type: field.type, stage: field.stage, options: field.options?.map((option) => option.value) })),
      })),
    }),
  },
  {
    name: "search_companies", title: "Search companies", write: false,
    description: "Companies you may see (team-wide roles see all). Search by name, industry or area.",
    inputSchema: schema({ q: text("Search text", 120), owner: text("Team-wide roles only: a user ID, or 'unassigned'", 128), page }),
    run: async ({ db, identity }, args) => {
      const list = await listAccounts(db, identity.actor, { q: str(args, "q").slice(0, 120), owner: str(args, "owner").slice(0, 128) }, pageArg(args));
      return { total: list.total, page: list.page, pages: list.pages, companies: list.rows.map((row) => ({ ...company(row), contacts: row.contacts, open_opportunities: row.open_opportunities })) };
    },
  },
  {
    name: "get_company", title: "Get a company", write: false,
    description: "One company with the contacts and opportunities you may see.",
    inputSchema: schema({ company_id: id("Company ID (acc_…)") }, ["company_id"]),
    run: async (ctx, args) => {
      const account = await loadAccount(ctx.db, ctx.identity.actor, str(args, "company_id"));
      const [contacts, opportunities] = await Promise.all([
        visibleContacts(ctx.db, ctx.identity.actor, account.id), accountOpportunities(ctx.db, ctx.identity.actor, account.id),
      ]);
      return { ...company(account), contacts: contacts.map(contact), opportunities: opportunities.map(opportunity) };
    },
  },
  {
    name: "create_company", title: "Create a company", write: true,
    description: "Creates a company, optionally with its first contact. You manage what you create; team-wide roles may set owner_id.",
    inputSchema: schema({
      name: text("Company name", 160), industry: text("Industry", 120), region: text("Area / region", 120), address: text("Address", 300), notes: text("Notes", 3000),
      owner_id: text("Team-wide roles only: who manages it", 128), contact: schema(contactProperties, ["name"]),
    }, ["name"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const first = (args.contact && typeof args.contact === "object" ? args.contact : {}) as Args;
      const values: Record<string, string> = { name: str(args, "name"), industry: str(args, "industry"), region: str(args, "region"), address: str(args, "address"), notes: str(args, "notes"), owner_id: str(args, "owner_id") };
      for (const key of Object.keys(contactProperties)) values[`contact_${key}`] = str(first, key);
      const id = await createAccount(ctx.db, ctx.contentDb, ctx.identity.actor, form(values, ctx.requestKey));
      return company(await loadAccount(ctx.db, ctx.identity.actor, id));
    },
  },
  {
    name: "update_company", title: "Update a company", write: true,
    description: "Changes a company's name, industry, area, address or notes. Only the fields you pass change.",
    inputSchema: schema({ company_id: id("Company ID"), name: text("Name", 160), industry: text("Industry", 120), region: text("Area", 120), address: text("Address", 300), notes: text("Notes", 3000), version }, ["company_id"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const account = await loadAccount(ctx.db, ctx.identity.actor, str(args, "company_id"));
      const pick = (key: keyof Account & string) => has(args, key) ? str(args, key) : String(account[key] ?? "");
      await saveAccount(ctx.db, ctx.identity.actor, account, form({ name: pick("name"), industry: pick("industry"), region: pick("region"), address: pick("address"), notes: pick("notes"), version: versionArg(args, account.version) }, ctx.requestKey));
      return company(await loadAccount(ctx.db, ctx.identity.actor, account.id));
    },
  },
  {
    name: "search_contacts", title: "Search contacts", write: false,
    description: "Contacts you may see: those you manage, those at companies you manage and those on your opportunities (team-wide roles see all). Search by name, phone, email or company.",
    inputSchema: schema({ q: text("Search text", 120), owner: text("Team-wide roles only: a user ID, or 'unassigned'", 128), page }),
    run: async ({ db, identity }, args) => {
      const list = await listContacts(db, identity.actor, { q: str(args, "q").slice(0, 120), owner: str(args, "owner").slice(0, 128) }, pageArg(args));
      return { total: list.total, page: list.page, pages: list.pages, contacts: list.rows.map((row) => ({ ...contact(row), company_name: row.account_name, company_do_not_contact: !!row.account_dnc })) };
    },
  },
  {
    name: "create_contact", title: "Add a contact", write: true,
    description: "Adds a contact to a company you work on. A number that asked not to be contacted is refused.",
    inputSchema: schema({ company_id: id("Company ID"), ...contactProperties, owner_id: text("Team-wide roles only: who manages the contact (default: the company's manager)", 128) }, ["company_id", "name"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const account = await loadAccount(ctx.db, ctx.identity.actor, str(args, "company_id"));
      const values: Record<string, string> = { owner_id: str(args, "owner_id") };
      for (const key of Object.keys(contactProperties)) values[key] = str(args, key);
      const created = await createContact(ctx.db, ctx.contentDb, ctx.identity.actor, account, form(values, ctx.requestKey));
      return contact(await contactRow(ctx, created));
    },
  },
  {
    name: "update_contact", title: "Update a contact", write: true,
    description: "Changes a contact you may edit. Only the fields you pass change. Setting consent to refused or withdrawn also stops all contact.",
    inputSchema: schema({ contact_id: id("Contact ID (con_…)"), ...contactProperties, version }, ["contact_id"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const current = await contactRow(ctx, str(args, "contact_id"));
      const values: Record<string, string> = { contact_id: current.id, version: versionArg(args, current.version) };
      for (const key of Object.keys(contactProperties)) values[key] = has(args, key) ? str(args, key) : String((current as unknown as Record<string, unknown>)[key] ?? "");
      await updateContact(ctx.db, ctx.identity.actor, current.account_id, form(values, ctx.requestKey));
      return contact(await contactRow(ctx, current.id));
    },
  },
  {
    name: "set_do_not_contact", title: "Record a do-not-contact request", write: true,
    description: "Records that a contact (or, without contact_id, the whole company) asked not to be contacted. Applies to every channel. Only an admin can lift it, in the CRM.",
    inputSchema: schema({ company_id: id("Company ID"), contact_id: id("Contact ID; omit for the whole company"), reason: text("Who asked, how and when", 500) }, ["company_id", "reason"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const account = await loadAccount(ctx.db, ctx.identity.actor, str(args, "company_id"));
      await setDoNotContact(ctx.db, ctx.identity.actor, account.id, form({ contact_id: str(args, "contact_id"), do_not_contact: "1", dnc_reason: str(args, "reason") }, ctx.requestKey));
      return { company_id: account.id, contact_id: str(args, "contact_id") || null, do_not_contact: true };
    },
  },
  {
    name: "search_opportunities", title: "Search opportunities", write: false,
    description: "Opportunities you own (team-wide roles see all), most urgent first.",
    inputSchema: schema({ q: text("Search title or company", 120), playbook: text("Playbook key", 60), stage: text("Stage ID", 40), outcome: { type: "string", enum: ["open", "won", "lost", "paused"] }, owner: text("Team-wide roles only: user ID or 'unassigned'", 128), page }),
    run: async ({ db, identity }, args) => {
      const filters: Filters = { ...emptyFilters, q: str(args, "q").slice(0, 120), playbook: str(args, "playbook").slice(0, 60), stage: str(args, "stage").slice(0, 40), outcome: str(args, "outcome").slice(0, 10), owner: str(args, "owner").slice(0, 128) };
      const list = await listOpportunities(db, identity.actor, filters, pageArg(args));
      return { total: list.total, page: list.page, pages: list.pages, opportunities: list.rows.map(opportunity) };
    },
  },
  {
    name: "get_opportunity", title: "Get an opportunity", write: false,
    description: "One opportunity with its contact, playbook stages, discovery fields and (for its owner) recent activity.",
    inputSchema: schema({ opportunity_id: id("Opportunity ID (opp_…)") }, ["opportunity_id"]),
    run: (ctx, args) => opportunityDetail(ctx, str(args, "opportunity_id")),
  },
  {
    name: "create_opportunity", title: "Open an opportunity", write: true,
    description: "Opens an opportunity for a company and one of its contacts. Team-wide roles may assign owner_id; others own what they open.",
    inputSchema: schema({
      company_id: id("Company ID"), contact_id: id("Contact ID at that company"), playbook_key: text("Playbook key (see list_playbooks)", 60),
      source_channel: { type: "string", enum: [...sourceChannels] }, title: text("Title (default: company name)", 160), next_action: text("Next step", 500),
      next_action_due: { type: "string", format: "date", description: "YYYY-MM-DD" }, owner_id: text("Team-wide roles only: who owns it", 128),
      estimated_value_vnd: { type: "integer", minimum: 0, description: "Expected contract value in VND; omit when unknown" },
      win_probability: { type: "integer", minimum: 0, maximum: 100, description: "Expected win probability in %; omit when unknown" },
    }, ["company_id", "contact_id", "playbook_key", "source_channel"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const account = await loadAccount(ctx.db, ctx.identity.actor, str(args, "company_id"));
      const id = await createOpportunityFor(ctx.db, ctx.contentDb, ctx.identity.actor, account, form({
        contact_id: str(args, "contact_id"), playbook_key: str(args, "playbook_key"), source_channel: str(args, "source_channel"), title: str(args, "title"),
        next_action: str(args, "next_action"), next_action_due: str(args, "next_action_due"), owner_id: str(args, "owner_id"),
        estimated_value_vnd: str(args, "estimated_value_vnd"), win_probability: str(args, "win_probability"),
      }, ctx.requestKey));
      return opportunityDetail(ctx, id);
    },
  },
  {
    name: "update_opportunity", title: "Update an opportunity", write: true,
    description: "Changes the title, next step, next step date, estimated value or source detail of an opportunity you own. Only the fields you pass change.",
    inputSchema: schema({
      opportunity_id: id("Opportunity ID"), title: text("Title", 160), next_action: text("Next step", 500), next_action_due: { type: ["string", "null"], description: "YYYY-MM-DD, or null to clear" },
      estimated_value_vnd: { type: ["integer", "null"], minimum: 0, description: "Expected contract value in VND; null when unknown (never guess)" },
      win_probability: { type: ["integer", "null"], minimum: 0, maximum: 100, description: "Expected win probability in %, the seller's estimate; null when unknown" }, source_detail: text("Source detail", 300), version,
    }, ["opportunity_id"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const opp = requireEdit(await loadOpportunity(ctx.db, ctx.identity.actor, str(args, "opportunity_id")));
      const pick = (key: keyof Opportunity & string) => has(args, key) ? str(args, key) : String(opp[key] ?? "");
      // Whole VND only: the form parser treats "." and "," as thousands separators.
      if (has(args, "estimated_value_vnd") && args.estimated_value_vnd !== null && !(Number.isSafeInteger(args.estimated_value_vnd) && Number(args.estimated_value_vnd) >= 0)) throw new ValidationError({ estimated_value_vnd: "invalid" });
      if (has(args, "win_probability") && args.win_probability !== null && !(Number.isSafeInteger(args.win_probability) && Number(args.win_probability) >= 0 && Number(args.win_probability) <= 100)) throw new ValidationError({ win_probability: "invalid" });
      await saveDetails(ctx.db, ctx.identity.actor, opp, form({
        title: pick("title"), next_action: pick("next_action"), next_action_due: pick("next_action_due"), estimated_value_vnd: pick("estimated_value_vnd"), win_probability: pick("win_probability"),
        source_detail: pick("source_detail"), referrer: opp.referrer, cohort_key: opp.cohort_key ?? "", service_period_start: opp.service_period_start ?? "",
        service_period_end: opp.service_period_end ?? "", renewal_due_on: opp.renewal_due_on ?? "", version: versionArg(args, opp.version),
      }, ctx.requestKey));
      return opportunityDetail(ctx, opp.id);
    },
  },
  {
    name: "update_opportunity_fields", title: "Record discovery fields", write: true,
    description: "Sets playbook discovery fields (keys from get_opportunity or list_playbooks) that are visible at the current stage. An empty string clears a field. Record what the customer said; never guess.",
    inputSchema: schema({ opportunity_id: id("Opportunity ID"), fields: { type: "object", additionalProperties: { type: "string" }, description: "{ field_key: value }" }, version }, ["opportunity_id", "fields"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const access = await loadOpportunity(ctx.db, ctx.identity.actor, str(args, "opportunity_id"));
      const opp = requireEdit(access);
      const playbook = await getPlaybook(ctx.db, opp.playbook_id);
      if (!playbook) throw new NotFoundError();
      const fields = args.fields && typeof args.fields === "object" && !Array.isArray(args.fields) ? args.fields as Args : null;
      if (!fields) throw new ValidationError({ fields: "invalid" });
      const unknown = Object.keys(fields).filter((key) => !playbook.def.fields.some((field) => field.key === key));
      if (unknown.length) throw new ValidationError(Object.fromEntries(unknown.map((key) => [`field.${key}`, "invalid"])));
      const values: Record<string, string> = { version: versionArg(args, opp.version) };
      for (const key of Object.keys(fields)) values[`field.${key}`] = str(fields, key);
      await saveFields(ctx.db, ctx.identity.actor, opp, playbook, form(values, ctx.requestKey));
      return opportunityDetail(ctx, opp.id);
    },
  },
  {
    name: "move_stage", title: "Move to another stage", write: true,
    description: "Moves an opportunity you own to another stage of its playbook. The stage's requirements must be met (error lists what is missing); lost, paused and skipped stages need a reason.",
    inputSchema: schema({ opportunity_id: id("Opportunity ID"), to_stage: text("Stage ID", 40), reason: text("Reason (required for lost, paused or skipped stages)", 1000), version }, ["opportunity_id", "to_stage"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const opp = requireEdit(await loadOpportunity(ctx.db, ctx.identity.actor, str(args, "opportunity_id")));
      const playbook = await getPlaybook(ctx.db, opp.playbook_id);
      if (!playbook) throw new NotFoundError();
      await moveStage(ctx.db, ctx.identity.actor, opp, playbook, form({ to_stage: str(args, "to_stage"), reason: str(args, "reason"), version: versionArg(args, opp.version) }, ctx.requestKey));
      return opportunityDetail(ctx, opp.id);
    },
  },
  {
    name: "add_note", title: "Add a note", write: true,
    description: "Adds a note to the activity of an opportunity you own, for example a call summary. Notes are permanent.",
    inputSchema: schema({ opportunity_id: id("Opportunity ID"), note: text("Note", 3000) }, ["opportunity_id", "note"]),
    run: async (ctx, args) => {
      requireWrite(ctx.identity);
      const opp = requireEdit(await loadOpportunity(ctx.db, ctx.identity.actor, str(args, "opportunity_id")));
      await addNote(ctx.db, ctx.identity.actor, opp, form({ note: str(args, "note") }, ctx.requestKey));
      return { opportunity_id: opp.id, noted: true };
    },
  },
];

const emptyFilters: Filters = { playbook: "", stage: "", owner: "", channel: "", cohort: "", industry: "", region: "", offer: "", outcome: "", q: "" };

export function findTool(name: string): Tool | undefined {
  return tools.find((tool) => tool.name === name);
}

export interface ToolFailure { status: number; code: string; message: string; fields?: Record<string, string> }

/** Maps the shared CRM errors to an API failure. Anything else is a server error. */
export function toolFailure(error: unknown): ToolFailure | null {
  if (error instanceof ValidationError) return { status: 422, code: "validation", message: "Some values need attention.", fields: error.fields };
  if (error instanceof NotFoundError) return { status: 404, code: "not_found", message: "Not found, or not visible to you." };
  if (error instanceof ForbiddenError) return { status: 403, code: "forbidden", message: "Your role or this token's scope does not allow this." };
  if (error instanceof ConflictError) return { status: 409, code: "conflict", message: "Someone changed this record since you read it. Read it again and retry." };
  return null;
}

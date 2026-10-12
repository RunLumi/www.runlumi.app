// Companies (accounts) and their contacts. A company has many contacts and
// can exist before any opportunity; each company and contact has a manager
// (owner_id). The team sees every record; everyone else sees what they manage
// plus what their opportunities name (access.ts scopes).
import { type CrmActor, accountEditScope, accountScope, assignableOwner, contactEditScope, contactScope, readableScope } from "./access";
import { latestPlaybooks } from "./config";
import {
  ConflictError, Errors, ForbiddenError, NotFoundError, emailPattern, eventStatement, fail, newId, normalizePhone, nowIso, once, onceGuarded,
} from "./core";
import { isIsoDate } from "./playbook";
import { type Account, type Contact, type SourceChannel, contactChannels, contactRoles, parseVersion, phoneSuppressed, sourceChannels } from "./records";

export const DIRECTORY_PAGE_SIZE = 50;
const consentStatuses = ["unknown", "granted", "refused", "withdrawn"] as const;

function requestKey(form: FormData): string {
  return typeof form.get("request_key") === "string" ? String(form.get("request_key")) : "";
}

function field(form: FormData, key: string): string {
  return typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
}

function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

export interface DirectoryFilters { q: string; owner: string }

export function readDirectoryFilters(url: URL): DirectoryFilters {
  const get = (key: string) => (url.searchParams.get(key) ?? "").trim().slice(0, 120);
  return { q: get("q"), owner: get("owner") };
}

interface Paged<T> { rows: T[]; total: number; page: number; pages: number }

function ownerFilter(actor: CrmActor, owner: string, column: string): { sql: string; args: unknown[] } | null {
  if (!actor.manager || !owner) return null;
  return owner === "unassigned" ? { sql: `${column} IS NULL`, args: [] } : { sql: `${column} = ?`, args: [owner] };
}

async function paged<T>(db: D1Database, countSql: string, rowsSql: string, args: unknown[], selectArgs: unknown[], page: number): Promise<Paged<T>> {
  const total = (await db.prepare(countSql).bind(...args).first<{ count: number }>())?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = (await db.prepare(`${rowsSql} LIMIT ? OFFSET ?`).bind(...selectArgs, ...args, DIRECTORY_PAGE_SIZE, (current - 1) * DIRECTORY_PAGE_SIZE).all<T>()).results;
  return { rows, total, page: current, pages };
}

export interface AccountRow extends Account { contacts: number; open_opportunities: number }

/** Companies the person may see, with the contacts and open opportunities they may see. */
export async function listAccounts(db: D1Database, actor: CrmActor, filters: DirectoryFilters, page: number): Promise<Paged<AccountRow>> {
  const scope = accountScope(actor);
  const parts = [scope.sql];
  const args: unknown[] = [...scope.args];
  const owner = ownerFilter(actor, filters.owner, "a.owner_id");
  if (owner) { parts.push(owner.sql); args.push(...owner.args); }
  if (filters.q) { parts.push("(a.name LIKE ? ESCAPE '\\' OR a.industry LIKE ? ESCAPE '\\' OR a.region LIKE ? ESCAPE '\\')"); args.push(...Array(3).fill(like(filters.q))); }
  const where = parts.join(" AND ");
  const contacts = contactScope(actor, "cc");
  const opportunities = readableScope(actor, "oo");
  return paged<AccountRow>(db,
    `SELECT COUNT(*) AS count FROM crm_accounts a WHERE ${where}`,
    `SELECT a.*, (SELECT COUNT(*) FROM crm_contacts cc WHERE cc.account_id = a.id AND ${contacts.sql}) AS contacts,
      (SELECT COUNT(*) FROM crm_opportunities oo WHERE oo.account_id = a.id AND oo.outcome IN ('open', 'paused') AND ${opportunities.sql}) AS open_opportunities
      FROM crm_accounts a WHERE ${where} ORDER BY a.name COLLATE NOCASE, a.created_at`,
    args, [...contacts.args, ...opportunities.args], page);
}

export interface ContactRow extends Contact { account_name: string; account_dnc: number }

/** Contacts the person may see. Search covers name, phone, email and company. */
export async function listContacts(db: D1Database, actor: CrmActor, filters: DirectoryFilters, page: number): Promise<Paged<ContactRow>> {
  const scope = contactScope(actor);
  const parts = [scope.sql];
  const args: unknown[] = [...scope.args];
  const owner = ownerFilter(actor, filters.owner, "c.owner_id");
  if (owner) { parts.push(owner.sql); args.push(...owner.args); }
  if (filters.q) {
    const digits = normalizePhone(filters.q);
    const phone = digits.length >= 4 ? " OR c.phone_norm LIKE ? ESCAPE '\\'" : "";
    parts.push(`(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\'${phone})`);
    args.push(...Array(3).fill(like(filters.q)), ...(phone ? [like(digits)] : []));
  }
  const where = parts.join(" AND ");
  return paged<ContactRow>(db,
    `SELECT COUNT(*) AS count FROM crm_contacts c JOIN crm_accounts a ON a.id = c.account_id WHERE ${where}`,
    `SELECT c.*, a.name AS account_name, a.do_not_contact AS account_dnc FROM crm_contacts c JOIN crm_accounts a ON a.id = c.account_id WHERE ${where} ORDER BY c.name COLLATE NOCASE, c.created_at`,
    args, [], page);
}

export async function loadAccount(db: D1Database, actor: CrmActor, id: string): Promise<Account> {
  const scope = accountScope(actor);
  const row = await db.prepare(`SELECT a.* FROM crm_accounts a WHERE a.id = ? AND ${scope.sql}`).bind(id, ...scope.args).first<Account>();
  if (!row) throw new NotFoundError();
  return row;
}

export async function canEditAccount(db: D1Database, actor: CrmActor, accountId: string): Promise<boolean> {
  if (actor.manager) return true;
  const scope = accountEditScope(actor);
  return !!await db.prepare(`SELECT 1 FROM crm_accounts a WHERE a.id = ? AND ${scope.sql}`).bind(accountId, ...scope.args).first();
}

/** Companies the person may add contacts or opportunities to (for pickers). */
export async function editableAccounts(db: D1Database, actor: CrmActor): Promise<Pick<Account, "id" | "name" | "region">[]> {
  const scope = accountEditScope(actor);
  return (await db.prepare(`SELECT a.id, a.name, a.region FROM crm_accounts a WHERE ${scope.sql} ORDER BY a.name COLLATE NOCASE LIMIT 300`).bind(...scope.args).all<Pick<Account, "id" | "name" | "region">>()).results;
}

/** The company's contacts this person may see; others' contacts stay hidden. */
export async function visibleContacts(db: D1Database, actor: CrmActor, accountId: string): Promise<Contact[]> {
  const scope = contactScope(actor);
  return (await db.prepare(`SELECT c.* FROM crm_contacts c WHERE c.account_id = ? AND ${scope.sql} ORDER BY c.created_at LIMIT 100`).bind(accountId, ...scope.args).all<Contact>()).results;
}

export async function editableContactIds(db: D1Database, actor: CrmActor, accountId: string): Promise<Set<string>> {
  const scope = contactEditScope(actor);
  const rows = (await db.prepare(`SELECT c.id FROM crm_contacts c WHERE c.account_id = ? AND ${scope.sql} LIMIT 100`).bind(accountId, ...scope.args).all<{ id: string }>()).results;
  return new Set(rows.map((row) => row.id));
}

/** Managers choose who manages a record; everyone else manages what they create. */
async function chooseOwner(db: D1Database, contentDb: D1Database, actor: CrmActor, requested: string, fallback: string | null, errors: Errors): Promise<string> {
  if (!actor.manager) return actor.id;
  const owner = requested || fallback || actor.id;
  if (!await assignableOwner(db, contentDb, actor, owner)) errors.add("owner_id", "invalid");
  return owner;
}

interface ContactInput {
  name: string; role: string; email: string; phone: string; phoneNorm: string; zalo: string; contact_basis: string;
  preferred_channel: string; consent_status: string; consent_evidence: string;
}

function contactInput(form: FormData, errors: Errors, prefix = ""): ContactInput {
  const name = errors.text(form, `${prefix}name`, 160, true);
  const role = errors.text(form, `${prefix}role`, 20) || "other";
  const email = errors.text(form, `${prefix}email`, 254);
  const phone = errors.text(form, `${prefix}phone`, 40);
  const phoneNorm = normalizePhone(phone);
  const input = {
    name, role, email, phone, phoneNorm, zalo: errors.text(form, `${prefix}zalo`, 80), contact_basis: errors.text(form, `${prefix}contact_basis`, 500),
    preferred_channel: errors.text(form, `${prefix}preferred_channel`, 20), consent_status: errors.text(form, `${prefix}consent_status`, 20) || "unknown",
    consent_evidence: errors.text(form, `${prefix}consent_evidence`, 500),
  };
  if (!contactRoles.includes(role as typeof contactRoles[number])) errors.add(`${prefix}role`, "invalid");
  if (email && !emailPattern.test(email)) errors.add(`${prefix}email`, "invalid");
  if (phone && (phoneNorm.length < 8 || phoneNorm.length > 15)) errors.add(`${prefix}phone`, "invalid");
  if (!contactChannels.includes(input.preferred_channel as typeof contactChannels[number])) errors.add(`${prefix}preferred_channel`, "invalid");
  if (!consentStatuses.includes(input.consent_status as typeof consentStatuses[number])) errors.add(`${prefix}consent_status`, "invalid");
  if (input.consent_status === "granted" && !input.consent_evidence) errors.add(`${prefix}consent_evidence`, "required");
  return input;
}

function insertContact(db: D1Database, id: string, accountId: string, input: ContactInput, owner: string, actor: CrmActor, now: string): D1PreparedStatement {
  return db.prepare("INSERT INTO crm_contacts (id, account_id, name, role, email, phone, phone_norm, zalo, contact_basis, preferred_channel, consent_status, consent_evidence, owner_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, accountId, input.name, input.role, input.email, input.phone, input.phoneNorm, input.zalo, input.contact_basis, input.preferred_channel, input.consent_status, input.consent_evidence, owner, actor.id, now, now);
}

/** Creates a company, optionally with its first contact, before any opportunity exists. */
export async function createAccount(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData): Promise<string> {
  const errors = new Errors();
  const name = errors.text(form, "name", 160, true);
  const industry = errors.text(form, "industry", 120);
  const region = errors.text(form, "region", 120);
  const address = errors.text(form, "address", 300);
  const notes = errors.text(form, "notes", 3000);
  const withContact = !!field(form, "contact_name") || !!field(form, "contact_phone") || !!field(form, "contact_email");
  const contact = withContact ? contactInput(form, errors, "contact_") : null;
  const owner = await chooseOwner(db, contentDb, actor, field(form, "owner_id"), null, errors);
  errors.throwIfAny();
  if (contact?.phoneNorm && await phoneSuppressed(db, contact.phoneNorm)) fail("contact_phone", "suppressed");
  const now = nowIso();
  const id = newId("acc");
  const contactId = newId("con");
  const result = await once(db, actor, requestKey(form), "account_create", id, [
    db.prepare("INSERT INTO crm_accounts (id, name, industry, region, address, notes, phone_norm, owner_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, name, industry, region, address, notes, contact?.phoneNorm ?? "", owner, actor.id, now, now),
    eventStatement(db, actor, "account_created", { owner_id: owner }, { accountId: id }),
    ...(contact ? [insertContact(db, contactId, id, contact, owner, actor, now), eventStatement(db, actor, "contact_added", { contact_id: contactId, role: contact.role, owner_id: owner }, { accountId: id })] : []),
  ]);
  return result.refId;
}

/** Adds a contact to a company the person works on. */
export async function createContact(db: D1Database, contentDb: D1Database, actor: CrmActor, account: Pick<Account, "id" | "owner_id">, form: FormData): Promise<string> {
  if (!await canEditAccount(db, actor, account.id)) throw new ForbiddenError();
  const errors = new Errors();
  const input = contactInput(form, errors);
  const owner = await chooseOwner(db, contentDb, actor, field(form, "owner_id"), account.owner_id, errors);
  errors.throwIfAny();
  // A number that asked not to be contacted cannot come back as a new contact.
  if (input.phoneNorm && await phoneSuppressed(db, input.phoneNorm)) fail("phone", "suppressed");
  const now = nowIso();
  const id = newId("con");
  const result = await once(db, actor, requestKey(form), "contact_add", id, [
    insertContact(db, id, account.id, input, owner, actor, now),
    eventStatement(db, actor, "contact_added", { contact_id: id, role: input.role, owner_id: owner }, { accountId: account.id }),
  ]);
  return result.refId;
}

/** Contacts page: the company is chosen in the form and must be one the person works on. */
export async function createContactFor(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData): Promise<{ accountId: string; contactId: string }> {
  const accountId = field(form, "account_id");
  const scope = accountEditScope(actor);
  const account = accountId ? await db.prepare(`SELECT a.id, a.owner_id FROM crm_accounts a WHERE a.id = ? AND ${scope.sql}`).bind(accountId, ...scope.args).first<Pick<Account, "id" | "owner_id">>() : null;
  if (!account) fail("account_id", accountId ? "invalid" : "required");
  return { accountId: account!.id, contactId: await createContact(db, contentDb, actor, account!, form) };
}

export async function updateContact(db: D1Database, actor: CrmActor, accountId: string, form: FormData): Promise<void> {
  const errors = new Errors();
  const contactId = errors.text(form, "contact_id", 60, true);
  const input = contactInput(form, errors);
  errors.throwIfAny();
  if (!(await editableContactIds(db, actor, accountId)).has(contactId)) throw new ForbiddenError();
  const version = parseVersion(form);
  // Withdrawn or refused consent also stops contact; it cannot be lifted here.
  const dnc = input.consent_status === "withdrawn" || input.consent_status === "refused" ? 1 : 0;
  const now = nowIso();
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_contacts WHERE id = ? AND account_id = ? AND version = ?)", args: [contactId, accountId, version] };
  const result = await onceGuarded(db, actor, requestKey(form), "contact_edit", contactId, guard, [
    eventStatement(db, actor, "contact_updated", { contact_id: contactId, consent_status: input.consent_status }, { accountId }, guard),
    db.prepare(`UPDATE crm_contacts SET name = ?, role = ?, email = ?, phone = ?, phone_norm = ?, zalo = ?, contact_basis = ?, preferred_channel = ?, consent_status = ?, consent_evidence = ?,
      do_not_contact = CASE WHEN ? = 1 THEN 1 ELSE do_not_contact END, dnc_reason = CASE WHEN ? = 1 AND do_not_contact = 0 THEN 'consent ' || ? ELSE dnc_reason END,
      dnc_recorded_by = CASE WHEN ? = 1 AND do_not_contact = 0 THEN ? ELSE dnc_recorded_by END, dnc_recorded_at = CASE WHEN ? = 1 AND do_not_contact = 0 THEN ? ELSE dnc_recorded_at END,
      version = version + 1, updated_at = ? WHERE id = ? AND account_id = ? AND version = ?`)
      .bind(input.name, input.role, input.email, input.phone, input.phoneNorm, input.zalo, input.contact_basis, input.preferred_channel, input.consent_status, input.consent_evidence,
        dnc, dnc, input.consent_status, dnc, actor.id, dnc, now, now, contactId, accountId, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Anyone who can see a contact can stop contact; only an admin can lift it, with evidence. */
export async function setDoNotContact(db: D1Database, actor: CrmActor, accountId: string, form: FormData): Promise<void> {
  const errors = new Errors();
  const contactId = errors.text(form, "contact_id", 60);
  const value = form.get("do_not_contact") === "1";
  const reason = errors.text(form, "dnc_reason", 500, true);
  errors.throwIfAny();
  if (!value && !actor.configure) throw new ForbiddenError();
  if (contactId) {
    if (!(await visibleContacts(db, actor, accountId)).some((contact) => contact.id === contactId)) throw new ForbiddenError();
  } else if (!await canEditAccount(db, actor, accountId)) throw new ForbiddenError();
  const now = nowIso();
  const statements = contactId
    ? [db.prepare("UPDATE crm_contacts SET do_not_contact = ?, dnc_reason = ?, dnc_recorded_by = ?, dnc_recorded_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND account_id = ?").bind(value ? 1 : 0, reason, actor.id, now, now, contactId, accountId)]
    : [db.prepare("UPDATE crm_accounts SET do_not_contact = ?, dnc_reason = ?, version = version + 1, updated_at = ? WHERE id = ?").bind(value ? 1 : 0, reason, now, accountId)];
  await once(db, actor, requestKey(form), "dnc", accountId, [...statements, eventStatement(db, actor, value ? "do_not_contact_set" : "do_not_contact_lifted", { contact_id: contactId || null, reason }, { accountId })]);
}

export async function saveAccount(db: D1Database, actor: CrmActor, account: Account, form: FormData): Promise<void> {
  if (!await canEditAccount(db, actor, account.id)) throw new ForbiddenError();
  const version = parseVersion(form);
  const errors = new Errors();
  const name = errors.text(form, "name", 160, true);
  const industry = errors.text(form, "industry", 120);
  const region = errors.text(form, "region", 120);
  const address = errors.text(form, "address", 300);
  const notes = errors.text(form, "notes", 3000);
  errors.throwIfAny();
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_accounts WHERE id = ? AND version = ?)", args: [account.id, version] };
  const result = await onceGuarded(db, actor, requestKey(form), "account", account.id, guard, [
    eventStatement(db, actor, "account_updated", { from: { name: account.name, industry: account.industry, region: account.region }, to: { name, industry, region } }, { accountId: account.id }, guard),
    db.prepare("UPDATE crm_accounts SET name = ?, industry = ?, region = ?, address = ?, notes = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?")
      .bind(name, industry, region, address, notes, nowIso(), account.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/**
 * Team only: hands a company to another person. Contacts the previous manager
 * looked after can move with it. Opportunities keep their own owners.
 */
export async function reassignAccount(db: D1Database, contentDb: D1Database, actor: CrmActor, account: Account, form: FormData): Promise<void> {
  if (!actor.manager) throw new ForbiddenError();
  const version = parseVersion(form);
  const ownerId = field(form, "owner_id");
  if (!ownerId || !await assignableOwner(db, contentDb, actor, ownerId)) fail("owner_id", "invalid");
  const withContacts = form.get("with_contacts") === "1";
  const now = nowIso();
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_accounts WHERE id = ? AND version = ?)", args: [account.id, version] };
  const result = await onceGuarded(db, actor, requestKey(form), "account_owner", account.id, guard, [
    eventStatement(db, actor, "account_owner_changed", { from: account.owner_id, to: ownerId, with_contacts: withContacts }, { accountId: account.id }, guard),
    ...(withContacts ? [db.prepare(`UPDATE crm_contacts SET owner_id = ?, version = version + 1, updated_at = ? WHERE account_id = ? AND owner_id IS ? AND ${guard.sql}`).bind(ownerId, now, account.id, account.owner_id, ...guard.args)] : []),
    db.prepare("UPDATE crm_accounts SET owner_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(ownerId, now, account.id, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/** Team only: changes who manages one contact. */
export async function reassignContact(db: D1Database, contentDb: D1Database, actor: CrmActor, accountId: string, form: FormData): Promise<void> {
  if (!actor.manager) throw new ForbiddenError();
  const version = parseVersion(form);
  const contactId = field(form, "contact_id");
  const ownerId = field(form, "owner_id");
  if (!ownerId || !await assignableOwner(db, contentDb, actor, ownerId)) fail("owner_id", "invalid");
  const contact = await db.prepare("SELECT owner_id FROM crm_contacts WHERE id = ? AND account_id = ?").bind(contactId, accountId).first<{ owner_id: string | null }>();
  if (!contact) throw new NotFoundError();
  const guard = { sql: "EXISTS (SELECT 1 FROM crm_contacts WHERE id = ? AND account_id = ? AND version = ?)", args: [contactId, accountId, version] };
  const result = await onceGuarded(db, actor, requestKey(form), "contact_owner", contactId, guard, [
    eventStatement(db, actor, "contact_owner_changed", { contact_id: contactId, from: contact.owner_id, to: ownerId }, { accountId }, guard),
    db.prepare("UPDATE crm_contacts SET owner_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND account_id = ? AND version = ?").bind(ownerId, nowIso(), contactId, accountId, version),
  ]);
  if (!result.changed) throw new ConflictError();
}

/**
 * Opens an opportunity for an existing company and one of its contacts, and
 * assigns it. The team may assign anyone who sells; others assign themselves.
 */
export async function createOpportunityFor(db: D1Database, contentDb: D1Database, actor: CrmActor, account: Account, form: FormData): Promise<string> {
  if (!await canEditAccount(db, actor, account.id)) throw new ForbiddenError();
  const errors = new Errors();
  const contactId = errors.text(form, "contact_id", 60, true);
  const playbookKey = errors.text(form, "playbook_key", 60, true);
  const sourceChannel = errors.text(form, "source_channel", 30, true) as SourceChannel;
  const title = errors.text(form, "title", 160) || account.name;
  const nextAction = errors.text(form, "next_action", 500);
  const nextActionDue = errors.text(form, "next_action_due", 10);
  const sourceDetail = errors.text(form, "source_detail", 300);
  const referrer = errors.text(form, "referrer", 160);
  if (sourceChannel && !sourceChannels.includes(sourceChannel)) errors.add("source_channel", "invalid");
  if (nextActionDue && !isIsoDate(nextActionDue)) errors.add("next_action_due", "invalid");
  const playbook = (await latestPlaybooks(db, { activeOnly: true })).find((item) => item.playbook_key === playbookKey);
  if (playbookKey && !playbook) errors.add("playbook_key", "invalid");
  const contact = contactId ? (await visibleContacts(db, actor, account.id)).find((item) => item.id === contactId) : undefined;
  if (contactId && !contact) errors.add("contact_id", "invalid");
  const owner = await chooseOwner(db, contentDb, actor, field(form, "owner_id"), account.owner_id, errors);
  errors.throwIfAny();
  if (account.do_not_contact || contact!.do_not_contact) fail("contact_id", "do_not_contact");
  const now = nowIso();
  const id = newId("opp");
  const firstStage = playbook!.def.stages[0].id;
  const fields = Object.fromEntries(Object.entries({ industry: account.industry, location: account.region }).filter(([key, value]) => value && playbook!.def.fields.some((item) => item.key === key)));
  const result = await once(db, actor, requestKey(form), "account_opportunity", id, [
    db.prepare(`INSERT INTO crm_opportunities (id, account_id, primary_contact_id, title, playbook_id, stage_id, outcome, owner_id, seller_id, created_by, source_channel, source_detail, referrer, relation, fields, next_action, next_action_due, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`)
      .bind(id, account.id, contact!.id, title, playbook!.id, firstStage, owner, owner, actor.id, sourceChannel, sourceDetail, referrer, JSON.stringify(fields), nextAction, nextActionDue || null, now, now),
    db.prepare("INSERT INTO crm_stage_history (id, opportunity_id, playbook_id, from_stage, to_stage, actor_id, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)").bind(newId("stg"), id, playbook!.id, firstStage, actor.id, now),
    eventStatement(db, actor, "created", { playbook: playbook!.id, stage: firstStage, owner_id: owner, source_channel: sourceChannel, contact_id: contact!.id }, { opportunityId: id, accountId: account.id }),
    db.prepare("UPDATE crm_accounts SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id IS NULL").bind(owner, now, account.id),
    db.prepare("UPDATE crm_contacts SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id IS NULL").bind(owner, now, contact!.id),
  ]);
  return result.refId;
}

export interface PickableContact { contact_id: string; contact_name: string; role: string; account_id: string; account_name: string; region: string }

/**
 * Contacts an opportunity can be opened with: visible to the person, at a
 * company they work on, and neither asked not to be contacted.
 */
export async function pickableContacts(db: D1Database, actor: CrmActor): Promise<PickableContact[]> {
  const companies = accountEditScope(actor);
  const contacts = contactScope(actor);
  return (await db.prepare(`SELECT c.id AS contact_id, c.name AS contact_name, c.role, a.id AS account_id, a.name AS account_name, a.region
    FROM crm_contacts c JOIN crm_accounts a ON a.id = c.account_id
    WHERE c.do_not_contact = 0 AND a.do_not_contact = 0 AND ${companies.sql} AND ${contacts.sql}
    ORDER BY a.name COLLATE NOCASE, a.id, c.name COLLATE NOCASE LIMIT 500`).bind(...companies.args, ...contacts.args).all<PickableContact>()).results;
}

/** New-opportunity page: the contact picked implies its company. */
export async function createOpportunityForContact(db: D1Database, contentDb: D1Database, actor: CrmActor, form: FormData): Promise<string> {
  const contactId = field(form, "contact_id");
  const scope = contactScope(actor);
  const contact = await db.prepare(`SELECT c.account_id FROM crm_contacts c WHERE c.id = ? AND ${scope.sql}`).bind(contactId, ...scope.args).first<{ account_id: string }>();
  if (!contact) fail("contact_id", "invalid");
  let account: Account;
  try {
    account = await loadAccount(db, actor, contact!.account_id);
  } catch (error) {
    if (error instanceof NotFoundError) fail("contact_id", "invalid");
    throw error;
  }
  return createOpportunityFor(db, contentDb, actor, account!, form);
}

/** Team view: companies that share a phone number or name with this one. */
export async function possibleDuplicates(db: D1Database, account: Account): Promise<Pick<Account, "id" | "name" | "region">[]> {
  return (await db.prepare(
    "SELECT id, name, region FROM crm_accounts WHERE id != ? AND ((phone_norm != '' AND phone_norm = ?) OR (name = ? COLLATE NOCASE)) LIMIT 10",
  ).bind(account.id, account.phone_norm, account.name).all<Pick<Account, "id" | "name" | "region">>()).results;
}

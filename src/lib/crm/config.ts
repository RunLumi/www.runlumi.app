// Playbook and offer configuration. Changes always insert a new version; rows
// already referenced by opportunities or quotes are never rewritten.
import type { CrmActor } from "./access";
import { eventStatement, fail, nowIso, ValidationError } from "./core";
import { chargeTypes, type ChargeType } from "./seed";
import {
  type CheckDef, type FieldDef, type FieldType, type Milestone, type Outcome, type Playbook, type PlaybookDef, type PlaybookKind, type PlaybookRow, type StageDef,
  fieldTypes, milestones, offerKeyPattern, outcomes, parsePlaybook, playbookKinds, validatePlaybook,
} from "./playbook";
import type { CreditRule } from "./money";

export interface OfferRow {
  id: string; offer_key: string; version: number; name_en: string; name_vi: string; charge_type: ChargeType;
  list_price_vnd: number | null; scope_en: string; scope_vi: string; conditions_en: string; conditions_vi: string;
  rules: string; source_ref: string; effective_from: string; active: number; created_at: string;
}
export interface Offer extends Omit<OfferRow, "rules"> { rules: { credit?: CreditRule } }

export function parseOffer(row: OfferRow): Offer {
  return { ...row, rules: JSON.parse(row.rules || "{}") };
}

export async function allPlaybookVersions(db: D1Database): Promise<Playbook[]> {
  const rows = (await db.prepare("SELECT * FROM crm_playbooks ORDER BY playbook_key, version DESC").all<PlaybookRow>()).results;
  return rows.map(parsePlaybook);
}

/** Latest version of every playbook key. */
export async function latestPlaybooks(db: D1Database, { activeOnly = false } = {}): Promise<Playbook[]> {
  const rows = (await db.prepare(
    `SELECT p.* FROM crm_playbooks p WHERE p.version = (SELECT MAX(version) FROM crm_playbooks x WHERE x.playbook_key = p.playbook_key)${activeOnly ? " AND p.active = 1" : ""} ORDER BY p.kind, p.name_en`,
  ).all<PlaybookRow>()).results;
  return rows.map(parsePlaybook);
}

export async function getPlaybook(db: D1Database, id: string): Promise<Playbook | null> {
  const row = await db.prepare("SELECT * FROM crm_playbooks WHERE id = ?").bind(id).first<PlaybookRow>();
  return row ? parsePlaybook(row) : null;
}

export async function playbooksById(db: D1Database, ids: readonly string[]): Promise<Map<string, Playbook>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, Playbook>();
  if (!unique.length) return map;
  const rows = (await db.prepare(`SELECT * FROM crm_playbooks WHERE id IN (${unique.map(() => "?").join(", ")})`).bind(...unique).all<PlaybookRow>()).results;
  for (const row of rows) map.set(row.id, parsePlaybook(row));
  return map;
}

export async function latestOffers(db: D1Database, { activeOnly = false } = {}): Promise<Offer[]> {
  const rows = (await db.prepare(
    `SELECT o.* FROM crm_offers o WHERE o.version = (SELECT MAX(version) FROM crm_offers x WHERE x.offer_key = o.offer_key)${activeOnly ? " AND o.active = 1" : ""} ORDER BY o.offer_key`,
  ).all<OfferRow>()).results;
  return rows.map(parseOffer);
}

export async function allOfferVersions(db: D1Database): Promise<Offer[]> {
  return (await db.prepare("SELECT * FROM crm_offers ORDER BY offer_key, version DESC").all<OfferRow>()).results.map(parseOffer);
}

export async function getOffer(db: D1Database, id: string): Promise<Offer | null> {
  const row = await db.prepare("SELECT * FROM crm_offers WHERE id = ?").bind(id).first<OfferRow>();
  return row ? parseOffer(row) : null;
}

/** Offers a playbook allows, resolved to the latest active version of each key. */
export async function offersForPlaybook(db: D1Database, playbook: Playbook): Promise<Offer[]> {
  const latest = await latestOffers(db, { activeOnly: true });
  return latest.filter((offer) => playbook.def.offers.includes(offer.offer_key));
}

const playbookKeyPattern = /^[a-z][a-z0-9-]{1,47}$/;

export interface PlaybookMeta { key: string; kind: PlaybookKind; name_en: string; name_vi: string; description_en: string; description_vi: string }

function rowsFrom(form: FormData, prefix: string): Map<number, Record<string, string>> {
  const rows = new Map<number, Record<string, string>>();
  for (const [name, value] of form.entries()) {
    const match = new RegExp(`^${prefix}\\.(\\d{1,3})\\.([a-z_]+)$`).exec(name);
    if (!match || typeof value !== "string") continue;
    const index = Number(match[1]);
    rows.set(index, { ...(rows.get(index) ?? {}), [match[2]]: value.trim() });
  }
  return new Map([...rows.entries()].sort((a, b) => Number(a[1].order || a[0]) - Number(b[1].order || b[0])));
}

/** Reads the structured playbook editor form. Blank rows are ignored. */
export function parsePlaybookForm(form: FormData): { meta: PlaybookMeta; def: PlaybookDef } {
  const get = (key: string) => (typeof form.get(key) === "string" ? String(form.get(key)).trim() : "");
  const meta: PlaybookMeta = {
    key: get("playbook_key"), kind: get("kind") as PlaybookKind, name_en: get("name_en"), name_vi: get("name_vi"),
    description_en: get("description_en").slice(0, 500), description_vi: get("description_vi").slice(0, 500),
  };
  const errors: Record<string, string> = {};
  if (!playbookKeyPattern.test(meta.key)) errors.playbook_key = "invalid";
  if (!playbookKinds.includes(meta.kind) || meta.kind === "legacy") errors.kind = "invalid";
  if (!meta.name_en || meta.name_en.length > 120) errors.name_en = "required";
  if (!meta.name_vi || meta.name_vi.length > 120) errors.name_vi = "required";
  const stages: StageDef[] = [...rowsFrom(form, "s").values()].filter((row) => row.id).map((row) => ({
    id: row.id, en: row.en ?? "", vi: row.vi ?? "", outcome: (row.outcome || "open") as Outcome,
    ...(row.milestone ? { milestone: row.milestone as Milestone } : {}),
    ...(row.requires ? { requires: row.requires.split(/[\s,]+/).filter(Boolean) } : {}),
    ...(row.skippable === "1" ? { skippable: true } : {}),
  }));
  const fields: FieldDef[] = [...rowsFrom(form, "f").values()].filter((row) => row.key).map((row) => {
    const options = (row.options ?? "").split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [value = "", en = "", vi = ""] = line.split("|").map((part) => part.trim());
      return { value, en, vi };
    });
    return {
      key: row.key, en: row.en ?? "", vi: row.vi ?? "", type: (row.type || "text") as FieldType, stage: row.stage ?? "",
      ...(options.length ? { options } : {}),
      ...(row.help_en ? { help_en: row.help_en.slice(0, 300) } : {}), ...(row.help_vi ? { help_vi: row.help_vi.slice(0, 300) } : {}),
    };
  });
  const checklist: CheckDef[] = [...rowsFrom(form, "c").values()].filter((row) => row.key).map((row) => ({ key: row.key, en: row.en ?? "", vi: row.vi ?? "", stage: row.stage ?? "" }));
  const offers = form.getAll("offers").filter((value): value is string => typeof value === "string" && offerKeyPattern.test(value));
  if (Object.keys(errors).length) throw new ValidationError(errors);
  for (const field of fields) if (!fieldTypes.includes(field.type)) throw new ValidationError({ definition: `field "${field.key}": unsupported type` });
  for (const stage of stages) if (!outcomes.includes(stage.outcome) || (stage.milestone && !milestones.includes(stage.milestone))) throw new ValidationError({ definition: `stage "${stage.id}": invalid outcome or milestone` });
  return { meta, def: { stages, fields, checklist, offers } };
}

export async function savePlaybookVersion(db: D1Database, actor: CrmActor, meta: PlaybookMeta, def: PlaybookDef, { newKey }: { newKey: boolean }): Promise<string> {
  const offers = new Set((await latestOffers(db)).map((offer) => offer.offer_key));
  const problems = validatePlaybook(def, offers);
  if (problems.length) throw new ValidationError({ definition: problems.join("\n") });
  const current = await db.prepare("SELECT MAX(version) AS version, MAX(kind) AS kind FROM crm_playbooks WHERE playbook_key = ?").bind(meta.key).first<{ version: number | null; kind: string | null }>();
  if (newKey && current?.version) fail("playbook_key", "taken");
  if (!newKey && !current?.version) fail("playbook_key", "unknown");
  if (current?.kind === "legacy") fail("playbook_key", "legacy");
  const version = (current?.version ?? 0) + 1;
  const id = `${meta.key}@${version}`;
  await db.batch([
    db.prepare("INSERT INTO crm_playbooks (id, playbook_key, version, name_en, name_vi, kind, description_en, description_vi, definition, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .bind(id, meta.key, version, meta.name_en, meta.name_vi, meta.kind, meta.description_en, meta.description_vi, JSON.stringify(def), actor.id, nowIso()),
    db.prepare("UPDATE crm_playbooks SET active = 1 WHERE playbook_key = ?").bind(meta.key),
    eventStatement(db, actor, "playbook_version", { id, version }, {}),
  ]);
  return id;
}

export async function setPlaybookActive(db: D1Database, actor: CrmActor, key: string, active: boolean): Promise<void> {
  const row = await db.prepare("SELECT kind FROM crm_playbooks WHERE playbook_key = ? LIMIT 1").bind(key).first<{ kind: string }>();
  if (!row || row.kind === "legacy") throw new ValidationError({ playbook_key: "unknown" });
  await db.batch([
    db.prepare("UPDATE crm_playbooks SET active = ? WHERE playbook_key = ?").bind(active ? 1 : 0, key),
    eventStatement(db, actor, active ? "playbook_activated" : "playbook_deactivated", { key }, {}),
  ]);
}

export interface OfferInput {
  key: string; name_en: string; name_vi: string; charge_type: ChargeType; list_price_vnd: number | null;
  scope_en: string; scope_vi: string; conditions_en: string; conditions_vi: string; source_ref: string; effective_from: string;
  credit_from: string; credit_days: number | null;
}

export async function saveOfferVersion(db: D1Database, actor: CrmActor, input: OfferInput, { newKey }: { newKey: boolean }): Promise<string> {
  const errors: Record<string, string> = {};
  if (!offerKeyPattern.test(input.key)) errors.offer_key = "invalid";
  if (!input.name_en || !input.name_vi) errors.name_en = "required";
  if (!chargeTypes.includes(input.charge_type)) errors.charge_type = "invalid";
  if (!input.source_ref) errors.source_ref = "required";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effective_from)) errors.effective_from = "invalid";
  if (input.credit_from && !offerKeyPattern.test(input.credit_from)) errors.credit_from = "invalid";
  if (input.credit_from && (!input.credit_days || input.credit_days < 1 || input.credit_days > 365)) errors.credit_days = "invalid";
  if (Object.keys(errors).length) throw new ValidationError(errors);
  const current = await db.prepare("SELECT MAX(version) AS version FROM crm_offers WHERE offer_key = ?").bind(input.key).first<{ version: number | null }>();
  if (newKey && current?.version) fail("offer_key", "taken");
  if (!newKey && !current?.version) fail("offer_key", "unknown");
  if (input.credit_from && !await db.prepare("SELECT 1 FROM crm_offers WHERE offer_key = ?").bind(input.credit_from).first()) fail("credit_from", "unknown");
  const version = (current?.version ?? 0) + 1;
  const id = `${input.key}@${version}`;
  const rules = input.credit_from ? { credit: { from_offer: input.credit_from, window_days: input.credit_days, amount: "full_paid" } } : {};
  await db.batch([
    db.prepare("INSERT INTO crm_offers (id, offer_key, version, name_en, name_vi, charge_type, list_price_vnd, scope_en, scope_vi, conditions_en, conditions_vi, rules, source_ref, effective_from, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .bind(id, input.key, version, input.name_en, input.name_vi, input.charge_type, input.list_price_vnd, input.scope_en, input.scope_vi, input.conditions_en, input.conditions_vi, JSON.stringify(rules), input.source_ref, input.effective_from, actor.id, nowIso()),
    db.prepare("UPDATE crm_offers SET active = 1 WHERE offer_key = ?").bind(input.key),
    eventStatement(db, actor, "offer_version", { id, version }, {}),
  ]);
  return id;
}

export async function setOfferActive(db: D1Database, actor: CrmActor, key: string, active: boolean): Promise<void> {
  const result = await db.prepare("UPDATE crm_offers SET active = ? WHERE offer_key = ?").bind(active ? 1 : 0, key).run();
  if (!result.meta.changes) throw new ValidationError({ offer_key: "unknown" });
  await eventStatement(db, actor, active ? "offer_activated" : "offer_deactivated", { key }, {}).run();
}

// Sales playbooks are data, not code. An admin can configure stages, fields,
// checklists, entry requirements and allowed offers from a closed vocabulary;
// nothing here evaluates SQL, JavaScript or free-form expressions.

export const fieldTypes = ["text", "long_text", "number", "money", "minutes", "date", "url", "select", "yes_no"] as const;
export type FieldType = typeof fieldTypes[number];
export const outcomes = ["open", "won", "lost", "paused"] as const;
export type Outcome = typeof outcomes[number];
// Milestones let reports count the same business step across playbooks
// without hardcoding stage IDs.
export const milestones = ["qualified", "conversation", "preview_shown", "demo_done", "pilot_done", "proposal"] as const;
export type Milestone = typeof milestones[number];
// Built-in requirements that are checked against records, not field values.
export const builtinRequirements = ["accepted_quote", "primary_contact", "next_step"] as const;
export type BuiltinRequirement = typeof builtinRequirements[number];
export const playbookKinds = ["acquisition", "solution", "renewal", "legacy"] as const;
export type PlaybookKind = typeof playbookKinds[number];

export interface Option { value: string; en: string; vi: string }
export interface StageDef {
  id: string; en: string; vi: string; outcome: Outcome;
  milestone?: Milestone;
  /** Field, checklist or built-in keys that must be satisfied to enter. */
  requires?: string[];
  /** A skippable stage can be passed over with a recorded reason. */
  skippable?: boolean;
}
export interface FieldDef {
  key: string; en: string; vi: string; type: FieldType;
  /** First stage at which the field is shown; earlier stages hide it. */
  stage: string;
  options?: Option[];
  help_en?: string; help_vi?: string;
}
export interface CheckDef { key: string; en: string; vi: string; stage: string }
export interface PlaybookDef { stages: StageDef[]; fields: FieldDef[]; checklist: CheckDef[]; offers: string[] }

export interface PlaybookRow {
  id: string; playbook_key: string; version: number; name_en: string; name_vi: string;
  kind: PlaybookKind; description_en: string; description_vi: string; definition: string; active: number; created_at: string;
}
export interface Playbook extends Omit<PlaybookRow, "definition"> { def: PlaybookDef }

export const LIMITS = { stages: 20, fields: 60, checklist: 40, offers: 30, label: 120, options: 20 } as const;
const keyPattern = /^[a-z][a-z0-9_]{1,39}$/;
export const offerKeyPattern = /^[a-z][a-z0-9-]{1,47}$/;

export function parsePlaybook(row: PlaybookRow): Playbook {
  const { definition, ...rest } = row;
  return { ...rest, def: JSON.parse(definition) as PlaybookDef };
}

/** Returns a list of human-readable problems; empty means valid. */
export function validatePlaybook(def: PlaybookDef, knownOffers: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const label = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.length <= LIMITS.label;
  if (!Array.isArray(def.stages) || def.stages.length < 2 || def.stages.length > LIMITS.stages) errors.push(`stages: 2–${LIMITS.stages} required`);
  if (!Array.isArray(def.fields) || def.fields.length > LIMITS.fields) errors.push(`fields: at most ${LIMITS.fields}`);
  if (!Array.isArray(def.checklist) || def.checklist.length > LIMITS.checklist) errors.push(`checklist: at most ${LIMITS.checklist}`);
  if (!Array.isArray(def.offers) || def.offers.length > LIMITS.offers) errors.push(`offers: at most ${LIMITS.offers}`);
  if (errors.length) return errors;

  const stageIds = new Set<string>();
  for (const stage of def.stages) {
    if (!keyPattern.test(stage.id)) errors.push(`stage "${stage.id}": id must be lowercase letters, digits or _`);
    if (stageIds.has(stage.id)) errors.push(`stage "${stage.id}": duplicate id`);
    stageIds.add(stage.id);
    if (!label(stage.en) || !label(stage.vi)) errors.push(`stage "${stage.id}": EN and VI names required`);
    if (!outcomes.includes(stage.outcome)) errors.push(`stage "${stage.id}": unknown outcome`);
    if (stage.milestone && !milestones.includes(stage.milestone)) errors.push(`stage "${stage.id}": unknown milestone`);
    if (stage.skippable && stage.outcome !== "open") errors.push(`stage "${stage.id}": only open stages can be skippable`);
  }
  if (def.stages[0] && def.stages[0].outcome !== "open") errors.push("the first stage must be open");
  if (!def.stages.some((stage) => stage.outcome === "won")) errors.push("at least one won stage is required");
  if (!def.stages.some((stage) => stage.outcome === "lost")) errors.push("at least one lost stage is required");

  const keys = new Set<string>();
  for (const field of def.fields) {
    if (!keyPattern.test(field.key)) errors.push(`field "${field.key}": invalid key`);
    if (keys.has(field.key)) errors.push(`field "${field.key}": duplicate key`);
    keys.add(field.key);
    if (!label(field.en) || !label(field.vi)) errors.push(`field "${field.key}": EN and VI labels required`);
    if (!fieldTypes.includes(field.type)) errors.push(`field "${field.key}": unsupported type`);
    if (!stageIds.has(field.stage)) errors.push(`field "${field.key}": unknown stage "${field.stage}"`);
    if (field.type === "select") {
      const options = field.options ?? [];
      if (options.length < 2 || options.length > LIMITS.options) errors.push(`field "${field.key}": select needs 2–${LIMITS.options} options`);
      const values = new Set<string>();
      for (const option of options) {
        if (!keyPattern.test(option.value) || values.has(option.value) || !label(option.en) || !label(option.vi)) errors.push(`field "${field.key}": invalid option "${option.value}"`);
        values.add(option.value);
      }
    } else if (field.options?.length) errors.push(`field "${field.key}": only select fields have options`);
  }
  for (const check of def.checklist) {
    if (!keyPattern.test(check.key)) errors.push(`checklist "${check.key}": invalid key`);
    if (keys.has(check.key)) errors.push(`checklist "${check.key}": key already used`);
    keys.add(check.key);
    if (!label(check.en) || !label(check.vi)) errors.push(`checklist "${check.key}": EN and VI labels required`);
    if (!stageIds.has(check.stage)) errors.push(`checklist "${check.key}": unknown stage "${check.stage}"`);
  }
  for (const stage of def.stages) {
    for (const requirement of stage.requires ?? []) {
      if (!keys.has(requirement) && !builtinRequirements.includes(requirement as BuiltinRequirement)) errors.push(`stage "${stage.id}": requirement "${requirement}" is not a field, checklist item or built-in`);
    }
  }
  for (const offer of def.offers) if (!knownOffers.has(offer)) errors.push(`offer "${offer}" does not exist`);
  return errors;
}

export function stageIndex(def: PlaybookDef, stageId: string): number {
  return def.stages.findIndex((stage) => stage.id === stageId);
}

/**
 * Fields appear from their stage onward. When the next stage is skippable,
 * fields of the stages up to the next required one also appear, so whatever
 * that stage needs can be recorded even if the optional step is skipped.
 */
export function visibleUntil(def: PlaybookDef, stageId: string): number {
  const current = stageIndex(def, stageId);
  if (current < 0) return def.stages.length - 1;
  let index = current;
  while (def.stages[index + 1]?.skippable) index += 1;
  return index;
}

export function visibleFields(def: PlaybookDef, stageId: string): FieldDef[] {
  const until = visibleUntil(def, stageId);
  return def.fields.filter((field) => stageIndex(def, field.stage) <= until);
}

export function visibleChecks(def: PlaybookDef, stageId: string): CheckDef[] {
  const until = visibleUntil(def, stageId);
  return def.checklist.filter((check) => stageIndex(def, check.stage) <= until);
}

/** Fields that become relevant when moving to the next open stage. */
export function upcomingFields(def: PlaybookDef, stageId: string): FieldDef[] {
  const next = def.stages[visibleUntil(def, stageId) + 1];
  return next ? def.fields.filter((field) => field.stage === next.id) : [];
}

export type FieldValues = Record<string, string>;
export interface TransitionContext {
  fields: FieldValues; checks: Record<string, boolean>;
  acceptedQuote: boolean; primaryContact: boolean; nextStep: boolean;
}
export interface TransitionCheck { ok: boolean; missing: string[]; skipped: string[]; needsReason: boolean }

export function requirementMet(requirement: string, context: TransitionContext): boolean {
  if (requirement === "accepted_quote") return context.acceptedQuote;
  if (requirement === "primary_contact") return context.primaryContact;
  if (requirement === "next_step") return context.nextStep;
  if (requirement in context.checks) return context.checks[requirement] === true;
  const value = context.fields[requirement];
  return typeof value === "string" && value.trim() !== "" && value !== "unknown";
}

/**
 * Forward moves may pass over skippable stages only, each with a recorded
 * reason. Moving back to an earlier open stage needs no requirements. Moving
 * into lost/paused needs a reason. Reopening a lost/paused record, and any
 * move into a won stage, must meet the target's requirements and (when
 * reopening) record why.
 */
export function checkTransition(def: PlaybookDef, from: string, to: string, context: TransitionContext): TransitionCheck {
  const fromIndex = stageIndex(def, from);
  const toIndex = stageIndex(def, to);
  const target = def.stages[toIndex];
  if (!target || toIndex === fromIndex) return { ok: false, missing: ["stage"], skipped: [], needsReason: false };
  if (target.outcome === "lost" || target.outcome === "paused") return { ok: true, missing: [], skipped: [], needsReason: true };
  const reopening = fromIndex >= 0 && def.stages[fromIndex].outcome !== "open";
  const skipped: string[] = [];
  const missing: string[] = [];
  if (fromIndex >= 0 && toIndex > fromIndex && !reopening) {
    for (const stage of def.stages.slice(fromIndex + 1, toIndex)) {
      if (stage.outcome !== "open") continue;
      if (stage.skippable) skipped.push(stage.id);
      else missing.push(`stage:${stage.id}`);
    }
  }
  if (toIndex > fromIndex || fromIndex < 0 || reopening || target.outcome === "won") {
    for (const requirement of target.requires ?? []) if (!requirementMet(requirement, context)) missing.push(requirement);
  }
  return { ok: missing.length === 0, missing, skipped, needsReason: skipped.length > 0 || reopening };
}

export function stageLabel(def: PlaybookDef, stageId: string, vi: boolean): string {
  const stage = def.stages.find((item) => item.id === stageId);
  return stage ? (vi ? stage.vi : stage.en) : stageId;
}

export function requirementLabel(def: PlaybookDef, key: string, vi: boolean): string {
  if (key.startsWith("stage:")) return (vi ? "Giai đoạn bắt buộc: " : "Required stage: ") + stageLabel(def, key.slice(6), vi);
  const builtin: Record<BuiltinRequirement, [string, string]> = {
    accepted_quote: ["An accepted quote", "Báo giá đã được chấp thuận"],
    primary_contact: ["A primary contact", "Người liên hệ chính"],
    next_step: ["An agreed next step", "Bước tiếp theo đã thống nhất"],
  };
  if (key in builtin) return builtin[key as BuiltinRequirement][vi ? 1 : 0];
  const item = def.fields.find((field) => field.key === key) ?? def.checklist.find((check) => check.key === key);
  return item ? (vi ? item.vi : item.en) : key;
}

/** Normalizes a submitted field value; returns null for invalid input. */
export function parseFieldValue(field: FieldDef, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return "";
  switch (field.type) {
    case "text": return value.length <= 300 ? value : null;
    case "long_text": return value.length <= 4000 ? value : null;
    case "number": return /^-?\d{1,12}(\.\d{1,4})?$/.test(value) ? value : null;
    case "money":
    case "minutes": return /^\d{1,13}$/.test(value) && Number(value) <= 1_000_000_000_000 ? String(Number(value)) : null;
    case "date": return isIsoDate(value) ? value : null;
    case "url": return safeUrl(value);
    case "select": return field.options?.some((option) => option.value === value) ? value : null;
    case "yes_no": return value === "yes" || value === "no" || value === "unknown" ? value : null;
  }
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function safeUrl(value: string): string | null {
  if (value.length > 500) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

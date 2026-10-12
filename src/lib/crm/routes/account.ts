import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, ownerOptions } from "../access";
import { allPlaybookVersions, latestPlaybooks } from "../config";
import { NotFoundError } from "../core";
import {
  canEditAccount, createContact, createOpportunityFor, editableContactIds, loadAccount, possibleDuplicates, reassignAccount, reassignContact,
  saveAccount, setDoNotContact, updateContact, visibleContacts,
} from "../directory";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost, notFound } from "../page";
import type { Playbook } from "../playbook";
import { type Account, type Contact, type Opportunity, accountOpportunities } from "../records";

export interface AccountProps {
  ctx: Ctx; state: FormState; account: Account; contacts: Contact[]; editable: Set<string>; opportunities: Opportunity[]; canEdit: boolean;
  duplicates: Pick<Account, "id" | "name" | "region">[]; playbookNames: Record<string, string>; playbooks: Playbook[];
  owners: OwnerOption[]; names: Record<string, { name: string; active: boolean }>;
}

export async function accountRoute(astro: AstroGlobal, lang: Lang): Promise<AccountProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  let account: Account;
  try {
    account = await loadAccount(ctx.db, ctx.actor, astro.params.id ?? "");
  } catch (error) {
    if (error instanceof NotFoundError) return notFound(lang);
    throw error;
  }
  const here = astro.url.pathname;
  const posted = await handlePost(astro, ctx, {
    account: async (form) => { await saveAccount(ctx.db, ctx.actor, account, form); return here; },
    account_owner: async (form) => { await reassignAccount(ctx.db, ctx.contentDb, ctx.actor, account, form); return here; },
    contact: async (form) => {
      if (form.get("contact_id")) await updateContact(ctx.db, ctx.actor, account.id, form);
      else await createContact(ctx.db, ctx.contentDb, ctx.actor, account, form);
      return `${here}#contacts`;
    },
    contact_owner: async (form) => { await reassignContact(ctx.db, ctx.contentDb, ctx.actor, account.id, form); return `${here}#contacts`; },
    dnc: async (form) => { await setDoNotContact(ctx.db, ctx.actor, account.id, form); return `${here}#contacts`; },
    opportunity: async (form) => `${ctx.base}/${await createOpportunityFor(ctx.db, ctx.contentDb, ctx.actor, account, form)}`,
  });
  if (posted instanceof Response) return posted;
  const [contacts, editable, opportunities, canEdit] = await Promise.all([
    visibleContacts(ctx.db, ctx.actor, account.id), editableContactIds(ctx.db, ctx.actor, account.id),
    accountOpportunities(ctx.db, ctx.actor, account.id), canEditAccount(ctx.db, ctx.actor, account.id),
  ]);
  const people = [account.owner_id, ...contacts.map((contact) => contact.owner_id), ...opportunities.map((opp) => opp.owner_id)].filter((id): id is string => !!id);
  return {
    ctx, state: posted ?? emptyState, account, contacts, editable, opportunities, canEdit,
    duplicates: ctx.actor.manager ? await possibleDuplicates(ctx.db, account) : [],
    playbookNames: Object.fromEntries((await allPlaybookVersions(ctx.db)).map((item) => [item.id, lang === "vi" ? item.name_vi : item.name_en])),
    playbooks: canEdit ? await latestPlaybooks(ctx.db, { activeOnly: true }) : [],
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    names: await displayNames(ctx.contentDb, [...new Set(people)]),
  };
}

import type { AstroGlobal } from "astro";
import { allPlaybookVersions } from "../config";
import { NotFoundError } from "../core";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost, notFound } from "../page";
import { type Account, type Contact, type Opportunity, accountContacts, accountOpportunities, canEditAccount, loadAccount, possibleDuplicates, saveAccount, saveContact, setDoNotContact } from "../records";

export interface AccountProps {
  ctx: Ctx; state: FormState; account: Account; contacts: Contact[]; opportunities: Opportunity[]; canEdit: boolean;
  duplicates: Pick<Account, "id" | "name" | "region">[]; playbookNames: Record<string, string>;
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
    contact: async (form) => { await saveContact(ctx.db, ctx.actor, account.id, form); return `${here}#contacts`; },
    dnc: async (form) => { await setDoNotContact(ctx.db, ctx.actor, account.id, form); return `${here}#contacts`; },
  });
  if (posted instanceof Response) return posted;
  return {
    ctx, state: posted ?? emptyState, account, contacts: await accountContacts(ctx.db, account.id),
    opportunities: await accountOpportunities(ctx.db, ctx.actor, account.id), canEdit: await canEditAccount(ctx.db, ctx.actor, account.id),
    duplicates: ctx.actor.admin ? await possibleDuplicates(ctx.db, account) : [],
    playbookNames: Object.fromEntries((await allPlaybookVersions(ctx.db)).map((item) => [item.id, lang === "vi" ? item.name_vi : item.name_en])),
  };
}

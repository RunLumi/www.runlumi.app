import type { AstroGlobal } from "astro";
import { type OwnerOption, displayNames, ownerOptions } from "../access";
import {
  type AccountRow, type ContactRow, type DirectoryFilters, createAccount, createContactFor, editableAccounts, listAccounts, listContacts, readDirectoryFilters,
} from "../directory";
import type { Lang } from "../i18n";
import { type Ctx, type FormState, context, emptyState, handlePost, page } from "../page";
import type { Account } from "../records";

interface DirectoryBase {
  ctx: Ctx; state: FormState; filters: DirectoryFilters; total: number; page: number; pages: number;
  owners: OwnerOption[]; names: Record<string, { name: string; active: boolean }>;
}
export interface CompaniesProps extends DirectoryBase { rows: AccountRow[] }
export interface ContactsProps extends DirectoryBase { rows: ContactRow[]; accounts: Pick<Account, "id" | "name" | "region">[] }

export async function companiesRoute(astro: AstroGlobal, lang: Lang): Promise<CompaniesProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const posted = await handlePost(astro, ctx, {
    account_create: async (form) => `${ctx.base}/accounts/${await createAccount(ctx.db, ctx.contentDb, ctx.actor, form)}`,
  });
  if (posted instanceof Response) return posted;
  const filters = readDirectoryFilters(astro.url);
  const list = await listAccounts(ctx.db, ctx.actor, filters, page(astro.url));
  return {
    ctx, state: posted ?? emptyState, filters, ...list,
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    names: await displayNames(ctx.contentDb, list.rows.map((row) => row.owner_id).filter((id): id is string => !!id)),
  };
}

export async function contactsRoute(astro: AstroGlobal, lang: Lang): Promise<ContactsProps | Response> {
  const ctx = await context(astro, lang);
  if (ctx instanceof Response) return ctx;
  const posted = await handlePost(astro, ctx, {
    contact_create: async (form) => {
      const created = await createContactFor(ctx.db, ctx.contentDb, ctx.actor, form);
      return `${ctx.base}/accounts/${created.accountId}#contacts`;
    },
  });
  if (posted instanceof Response) return posted;
  const filters = readDirectoryFilters(astro.url);
  const list = await listContacts(ctx.db, ctx.actor, filters, page(astro.url));
  return {
    ctx, state: posted ?? emptyState, filters, ...list, accounts: await editableAccounts(ctx.db, ctx.actor),
    owners: ctx.actor.manager ? await ownerOptions(ctx.db, ctx.contentDb, ctx.actor) : [],
    names: await displayNames(ctx.contentDb, list.rows.map((row) => row.owner_id).filter((id): id is string => !!id)),
  };
}

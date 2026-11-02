// One search behaviour for every Workspace list: the query is split into words
// and a row matches when every word appears somewhere in its searchable text,
// in any order and ignoring letter case — Vietnamese letters included.
//
// SQLite's LIKE, lower() and upper() fold ASCII only, so "VÂN SPA" never found
// "Vân Spa" and "đại" never found "ĐẠI". D1 accepts no custom functions, so the
// SQL side lower-cases the column and then replaces each uppercase accented
// letter explicitly. Text typed with combining accents (NFD) is matched too:
// every word is looked up in both its composed and decomposed form.

/** Uppercase letters SQLite's lower() leaves alone: Vietnamese and Latin-1. */
const UPPER = "ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴÄÅÆÇËÎÏÑÖØÛÜÞŸ";

const MAX_TERMS = 8;

/** NFC and lower-case (Vietnamese rules). */
export function foldText(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("vi");
}

/** The distinct words of a query, folded. */
export function searchTerms(query: string): string[] {
  return [...new Set(foldText(query).split(/\s+/u).filter(Boolean))].slice(0, MAX_TERMS);
}

/** True when every word of the query appears in the given text (case-insensitive). */
export function matchesSearch(text: string | readonly (string | null | undefined)[], query: string): boolean {
  const terms = searchTerms(query);
  if (!terms.length) return true;
  const haystack = foldText(Array.isArray(text) ? text.filter(Boolean).join("\n") : String(text));
  return terms.every((term) => haystack.includes(term));
}

/** SQL expression that lower-cases `expression` including Vietnamese capitals. */
export function foldSql(expression: string): string {
  let sql = `lower(${expression})`;
  for (const letter of UPPER) sql = `replace(${sql},'${letter}','${letter.toLocaleLowerCase("vi")}')`;
  return sql;
}

export interface SearchClause { sql: string; args: unknown[] }

/**
 * A WHERE fragment matching rows whose `columns` contain every word of
 * `query`, or null when the query has no words. Bind `args` in place of the
 * single placeholder. Columns are trusted SQL expressions, never user input.
 */
export function searchSql(columns: readonly string[], query: string): SearchClause | null {
  const terms = searchTerms(query);
  if (!terms.length || !columns.length) return null;
  const haystack = foldSql(columns.map((column) => `COALESCE(${column},'')`).join(" || char(10) || "));
  const forms = terms.map((term) => [...new Set([term, term.normalize("NFD")])]);
  return {
    sql: `NOT EXISTS (SELECT 1 FROM json_each(?) AS search_term WHERE NOT EXISTS (SELECT 1 FROM json_each(search_term.value) AS search_form WHERE instr(${haystack}, search_form.value) > 0))`,
    args: [JSON.stringify(forms)],
  };
}

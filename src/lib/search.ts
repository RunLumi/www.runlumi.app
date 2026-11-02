// One search behaviour for every Workspace list: the query is split into words
// and a row matches when every word appears somewhere in its searchable text,
// in any order and ignoring letter case — Vietnamese letters included.
//
// SQLite's LIKE, lower() and upper() fold ASCII only, so "VÂN SPA" never found
// "Vân Spa". D1 accepts no custom functions and caps expression depth at 100,
// so letters cannot be folded in SQL one replace() at a time. Instead SQL
// lower-cases ASCII and each word is looked up in the ways people write it:
// lower case, UPPER CASE and Title case, each also with combining accents (NFD).

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

const asciiLower = (value: string) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/**
 * The spellings of one folded word that SQL `lower(text)` can contain: its
 * lower, UPPER and Title case (ASCII already lowered by SQL), composed and
 * decomposed.
 */
export function caseForms(word: string): string[] {
  const lower = foldText(word);
  const upper = asciiLower(lower.toLocaleUpperCase("vi"));
  const title = asciiLower([...lower].map((letter, index) => index === 0 ? letter.toLocaleUpperCase("vi") : letter).join(""));
  return [...new Set([lower, upper, title].flatMap((form) => [form, form.normalize("NFD")]))];
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
  // Shallow on purpose: D1 rejects expression trees deeper than 100.
  const haystack = `lower(${columns.map((column) => `COALESCE(${column},'')`).join(" || char(10) || ")})`;
  const forms = terms.map(caseForms);
  return {
    sql: `NOT EXISTS (SELECT 1 FROM json_each(?) AS search_term WHERE NOT EXISTS (SELECT 1 FROM json_each(search_term.value) AS search_form WHERE instr(${haystack}, search_form.value) > 0))`,
    args: [JSON.stringify(forms)],
  };
}

/** `column` equals `value` ignoring letter case (same spellings as searchSql). */
export function sameTextSql(column: string, value: string): SearchClause {
  const forms = caseForms(value.trim());
  return { sql: `lower(${column}) IN (${forms.map(() => "?").join(", ")})`, args: forms };
}

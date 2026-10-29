// A minimal D1 stand-in over node:sqlite for unit tests: every migration is
// applied to an in-memory database, and batch() runs in one transaction like
// D1. Only the methods the CRM library uses are implemented.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Value = string | number | null;

class Statement {
  readonly db: DatabaseSync; readonly sql: string; readonly args: Value[];
  constructor(db: DatabaseSync, sql: string, args: Value[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args: unknown[]): Statement {
    return new Statement(this.db, this.sql, args.map((arg) => (arg === undefined ? null : typeof arg === "boolean" ? Number(arg) : arg as Value)));
  }
  async first<T>(): Promise<T | null> { return (this.db.prepare(this.sql).get(...this.args) as T | undefined) ?? null; }
  async all<T>(): Promise<{ results: T[] }> { return { results: this.db.prepare(this.sql).all(...this.args) as T[] }; }
  async run(): Promise<{ meta: { changes: number } }> { return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.args).changes) } }; }
  exec(): { meta: { changes: number } } {
    if (/^\s*(select|with)\b/i.test(this.sql)) { this.db.prepare(this.sql).all(...this.args); return { meta: { changes: 0 } }; }
    return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.args).changes) } };
  }
}

export interface TestD1 { raw: DatabaseSync; d1: D1Database }

export function migratedD1(): TestD1 {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys=ON");
  const dir = join(process.cwd(), "migrations");
  for (const file of readdirSync(dir).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) raw.exec(readFileSync(join(dir, file), "utf8"));
  const d1 = {
    prepare: (sql: string) => new Statement(raw, sql),
    async batch(statements: Statement[]) {
      raw.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.exec());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { raw, d1 };
}

/** EmDash's users table only, for owner checks (assignableOwner, display names). */
export function contentD1(users: { id: string; email: string; name: string; role: number; disabled?: number }[]): D1Database {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT, role INTEGER, disabled INTEGER DEFAULT 0)");
  for (const user of users) raw.prepare("INSERT INTO users (id, email, name, role, disabled) VALUES (?, ?, ?, ?, ?)").run(user.id, user.email, user.name, user.role, user.disabled ?? 0);
  return { prepare: (sql: string) => new Statement(raw, sql) } as unknown as D1Database;
}

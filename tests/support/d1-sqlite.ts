// A D1Database stand-in over node:sqlite for unit tests that need real SQL:
// it applies the repository's migrations, so queries run against the schema
// production uses. Supports prepare/bind/first/all/run and batch.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

type Value = string | number | null;

class Statement {
  private readonly db: DatabaseSync;
  private readonly sql: string;
  private readonly args: Value[];
  constructor(db: DatabaseSync, sql: string, args: Value[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args: unknown[]): Statement {
    return new Statement(this.db, this.sql, args.map((arg) => (arg === undefined ? null : typeof arg === "boolean" ? Number(arg) : arg as Value)));
  }
  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.args) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: (this.db.prepare(this.sql).all(...this.args) as Record<string, unknown>[]).map((row) => ({ ...row }) as T) };
  }
  async run(): Promise<{ meta: { changes: number } }> {
    return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.args).changes) } };
  }
  runSync(): { meta: { changes: number } } {
    return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.args).changes) } };
  }
  batchResult(): { results?: Record<string, unknown>[]; meta: { changes: number } } {
    if (/^\s*SELECT\b/i.test(this.sql)) return { results: this.db.prepare(this.sql).all(...this.args) as Record<string, unknown>[], meta: { changes: 0 } };
    return this.runSync();
  }
}

export function sqliteD1(schema: "jobs" | "content" = "jobs"): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  if (schema === "jobs") {
    const dir = new URL("../../migrations/", import.meta.url);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));
  } else {
    db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, role INTEGER NOT NULL DEFAULT 30, disabled INTEGER NOT NULL DEFAULT 0)");
  }
  const d1 = {
    raw: db,
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.batchResult());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql: string) { db.exec(sql); return { count: 0, duration: 0 }; },
  };
  return d1 as unknown as D1Database & { raw: DatabaseSync };
}

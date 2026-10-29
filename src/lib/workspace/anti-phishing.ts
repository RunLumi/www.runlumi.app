// Personal anti-phishing code (R-08): each person sets their own phrase; every
// email this app sends them starts with it, so an email without it is not
// from Lumi. Mandatory for every Workspace user, with no opt-out. The code is
// not a secret credential (it is printed in mail), but it is personal: only
// its owner sees it in the Workspace, and the audit log records that it
// changed, never the value.
import { auditStatement } from "./members";

export const CODE_MIN = 4;
export const CODE_MAX = 20;

export class AntiPhishingError extends Error {
  constructor(code: "required" | "length" | "characters" | "personal") { super(code); }
}

/** Letters (any script, including Vietnamese), digits and single spaces, 4–20 characters. */
export function normalizeCode(raw: unknown, personal: { email?: string; name?: string } = {}): string {
  const value = String(raw ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!value) throw new AntiPhishingError("required");
  const length = [...value].length;
  if (length < CODE_MIN || length > CODE_MAX) throw new AntiPhishingError("length");
  if (!/^[\p{L}\p{M}\p{N} ]+$/u.test(value)) throw new AntiPhishingError("characters");
  const lower = value.toLocaleLowerCase("vi");
  const local = (personal.email ?? "").split("@")[0].toLocaleLowerCase("vi");
  const name = (personal.name ?? "").normalize("NFC").trim().toLocaleLowerCase("vi");
  if ((local.length >= 3 && lower.includes(local)) || (name.length >= 3 && lower === name)) throw new AntiPhishingError("personal");
  return value;
}

/** The person's code, or null when it is not set yet. */
export async function antiPhishingCode(db: D1Database, userId: string): Promise<{ code: string; updated_at: string } | null> {
  return await db.prepare("SELECT code, updated_at FROM workspace_anti_phishing WHERE user_id = ?").bind(userId).first<{ code: string; updated_at: string }>() ?? null;
}

/** Shows the first character and masks the rest, for screens that only confirm a code exists. */
export function maskCode(code: string): string {
  const characters = [...code];
  return characters[0] + "•".repeat(Math.max(3, characters.length - 1));
}

/** Sets or changes the signed-in person's own code. Nobody sets another person's code. */
export async function saveAntiPhishingCode(db: D1Database, actor: { id: string; name: string; email: string }, raw: unknown): Promise<void> {
  const code = normalizeCode(raw, actor);
  const now = new Date().toISOString();
  const before = await antiPhishingCode(db, actor.id);
  await db.batch([
    db.prepare("INSERT INTO workspace_anti_phishing (user_id, code, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at")
      .bind(actor.id, code, now, now),
    auditStatement(db, actor, before ? "anti_phishing_changed" : "anti_phishing_set", actor.id, {}, now, { module: "account" }),
  ]);
}

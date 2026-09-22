import { env } from "cloudflare:workers";

export type JobStatus = "draft" | "published" | "closed";
export type ApplicationStatus =
  | "new"
  | "review"
  | "shortlist"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

export type QuestionKind = "short" | "long" | "file";

export interface Job {
  id: string;
  slug: string;
  title: string;
  team: string;
  location: string;
  employment_type: string;
  workplace_type: string;
  summary: string;
  description: string;
  responsibilities: string;
  requirements: string;
  application_note: string;
  status: JobStatus;
  published_at: string | null;
  closes_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface JobQuestion {
  id: string;
  job_id: string;
  kind: QuestionKind;
  prompt: string;
  help_text: string;
  required: number;
  sort_order: number;
  created_at: string;
}

export interface ApplicationRow {
  id: string;
  public_id: string;
  job_id: string;
  full_name: string;
  email: string;
  phone: string;
  linkedin_url: string;
  portfolio_url: string;
  cover_letter: string;
  consent: number;
  source: string;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}

export interface AdminApplicationRow extends ApplicationRow {
  job_title: string;
  job_slug: string;
}

export function envFromLocals(_locals?: App.Locals): Env {
  return env as Env;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formText(form: FormData, key: string, max = 20_000): string {
  const value = form.get(key);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `job-${Date.now()}`;
}

export function safeFilename(input: string): string {
  const clean = input
    .normalize("NFKC")
    .replace(/[\\/\0\r\n]/g, "-")
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return clean || "file";
}

export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function statusLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getPublishedJobs(db: D1Database): Promise<Job[]> {
  const result = await db
    .prepare(
      `SELECT * FROM jobs
       WHERE status = 'published'
         AND (closes_at IS NULL OR closes_at = '' OR closes_at > ?)
       ORDER BY sort_order ASC, published_at DESC, created_at DESC`
    )
    .bind(nowIso())
    .all<Job>();
  return result.results;
}

export async function getJobBySlug(db: D1Database, slug: string): Promise<Job | null> {
  return db
    .prepare(
      `SELECT * FROM jobs
       WHERE slug = ? AND status = 'published'
         AND (closes_at IS NULL OR closes_at = '' OR closes_at > ?)
       LIMIT 1`
    )
    .bind(slug, nowIso())
    .first<Job>();
}

export async function getJobById(db: D1Database, id: string): Promise<Job | null> {
  return db.prepare("SELECT * FROM jobs WHERE id = ? LIMIT 1").bind(id).first<Job>();
}

export async function getQuestions(db: D1Database, jobId: string): Promise<JobQuestion[]> {
  const result = await db
    .prepare("SELECT * FROM job_questions WHERE job_id = ? ORDER BY sort_order ASC, created_at ASC")
    .bind(jobId)
    .all<JobQuestion>();
  return result.results;
}

export async function getAdminJobs(db: D1Database) {
  const result = await db
    .prepare(
      `SELECT j.*,
         (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id) AS application_count,
         (SELECT COUNT(*) FROM applications a WHERE a.job_id = j.id AND a.status IN ('new','review')) AS unread_count
       FROM jobs j
       ORDER BY CASE j.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
                j.sort_order ASC, j.updated_at DESC`
    )
    .all();
  return result.results;
}

export async function getApplications(
  db: D1Database,
  jobId = "",
  status = ""
): Promise<AdminApplicationRow[]> {
  const clauses: string[] = [];
  const values: string[] = [];
  if (jobId) {
    clauses.push("a.job_id = ?");
    values.push(jobId);
  }
  if (status) {
    clauses.push("a.status = ?");
    values.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const result = await db
    .prepare(
      `SELECT a.*, j.title AS job_title, j.slug AS job_slug
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT 500`
    )
    .bind(...values)
    .all<AdminApplicationRow>();
  return result.results;
}

export async function getApplication(db: D1Database, id: string): Promise<AdminApplicationRow | null> {
  return db
    .prepare(
      `SELECT a.*, j.title AS job_title, j.slug AS job_slug
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.id = ? LIMIT 1`
    )
    .bind(id)
    .first<AdminApplicationRow>();
}

export const applicationStatuses: ApplicationStatus[] = [
  "new",
  "review",
  "shortlist",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn"
];

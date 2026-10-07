// Data for hiring desk pages. Mutations stay in /api/admin/* endpoints.
import type { AstroGlobal } from "astro";
import { type AdminApplicationRow, type Job, type JobQuestion, envFromLocals, getAdminJobs, getApplication, getApplications, getJobById, getQuestions } from "../ats";
import type { WorkspaceUser } from "../workspace/roles";
import type { Lang } from "./desk";

export interface DeskBase { lang: Lang; vi: boolean; user: WorkspaceUser }
type JobListRow = Job & { application_count: number; unread_count: number };

function base(astro: AstroGlobal, lang: Lang): DeskBase {
  return { lang, vi: lang === "vi", user: astro.locals.workspace! };
}

export async function jobsPage(astro: AstroGlobal, lang: Lang) {
  const { DB } = envFromLocals(astro.locals);
  const jobs = (await getAdminJobs(DB)) as unknown as JobListRow[];
  return { ...base(astro, lang), jobs, error: astro.url.searchParams.get("error") };
}

export async function jobPage(astro: AstroGlobal, lang: Lang) {
  const { DB } = envFromLocals(astro.locals);
  const job = await getJobById(DB, astro.params.id ?? "");
  if (!job) return null;
  const questions: JobQuestion[] = await getQuestions(DB, job.id);
  const counts = await DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('new', 'review') THEN 1 ELSE 0 END) AS open FROM applications WHERE job_id = ?").bind(job.id).first<{ total: number; open: number | null }>();
  const query = astro.url.searchParams;
  return { ...base(astro, lang), job, questions, total: counts?.total ?? 0, open: counts?.open ?? 0, errors: { slug: query.get("error") === "slug", question: !!query.get("question_error"), delete: query.get("delete_error") } };
}

export async function applicationsPage(astro: AstroGlobal, lang: Lang) {
  const { DB } = envFromLocals(astro.locals);
  const jobId = astro.url.searchParams.get("job") ?? "";
  const status = astro.url.searchParams.get("status") ?? "";
  const [jobs, applications, stages] = await Promise.all([
    getAdminJobs(DB) as unknown as Promise<JobListRow[]>, getApplications(DB, jobId, status),
    DB.prepare(`SELECT status, COUNT(*) AS count FROM applications ${jobId ? "WHERE job_id = ?" : ""} GROUP BY status`).bind(...(jobId ? [jobId] : [])).all<{ status: string; count: number }>(),
  ]);
  return { ...base(astro, lang), jobs, applications, jobId, status, stageCounts: Object.fromEntries(stages.results.map((row) => [row.status, row.count])) as Record<string, number> };
}

export interface AnswerRow { prompt: string; kind: string; answer_text: string }
export interface FileRow { id: string; filename: string; kind: string; size_bytes: number; prompt: string | null }
export interface NoteRow { id: string; body: string; author: string; created_at: string }
export interface EventRow { id: string; event_type: string; actor: string; from_status: string | null; to_status: string | null; detail: string; created_at: string }

export async function applicationPage(astro: AstroGlobal, lang: Lang) {
  const { DB } = envFromLocals(astro.locals);
  const application: AdminApplicationRow | null = await getApplication(DB, astro.params.id ?? "");
  if (!application) return null;
  const [answers, files, notes, events] = await Promise.all([
    DB.prepare("SELECT q.prompt, q.kind, aa.answer_text FROM application_answers aa JOIN job_questions q ON q.id = aa.question_id WHERE aa.application_id = ? ORDER BY q.sort_order, q.created_at").bind(application.id).all<AnswerRow>(),
    DB.prepare("SELECT af.id, af.filename, af.kind, af.size_bytes, q.prompt FROM application_files af LEFT JOIN job_questions q ON q.id = af.question_id WHERE af.application_id = ? ORDER BY CASE af.kind WHEN 'resume' THEN 0 ELSE 1 END, af.created_at").bind(application.id).all<FileRow>(),
    DB.prepare("SELECT id, body, author, created_at FROM application_notes WHERE application_id = ? ORDER BY created_at DESC").bind(application.id).all<NoteRow>(),
    DB.prepare("SELECT id, event_type, actor, from_status, to_status, detail, created_at FROM application_events WHERE application_id = ? ORDER BY created_at DESC LIMIT 50").bind(application.id).all<EventRow>(),
  ]);
  return { ...base(astro, lang), application, answers: answers.results, files: files.results, notes: notes.results, events: events.results };
}

export function notFound(lang: Lang): Response {
  return new Response(lang === "vi" ? "Không tìm thấy." : "Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

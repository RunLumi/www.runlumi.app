import type { APIRoute } from "astro";
import {
  envFromLocals,
  formText,
  getJobBySlug,
  getQuestions,
  nowIso,
  safeFilename,
  safeHttpUrl
} from "../../../../lib/ats";
import { badRequest, redirect303, sameOrigin } from "../../../../lib/http";

export const prerender = false;

const RESUME_MAX = 10 * 1024 * 1024;
const TEST_MAX = 15 * 1024 * 1024;
const TOTAL_MAX = 30 * 1024 * 1024;

const resumeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File && value.size > 0;
}

function resumeAllowed(file: File): boolean {
  if (resumeTypes.has(file.type)) return true;
  return /\.(pdf|doc|docx)$/i.test(file.name);
}

function testFileAllowed(file: File): boolean {
  return /\.(pdf|doc|docx|txt|md|csv|xlsx|pptx|png|jpe?g|zip)$/i.test(file.name);
}

export const POST: APIRoute = async (context) => {
  const slug = context.params.slug ?? "";
  const fallback = `/jobs/${slug}?error=1`;
  if (!sameOrigin(context.request)) return badRequest("Invalid request origin.");

  const { DB, FILES } = envFromLocals(context.locals);
  const job = await getJobBySlug(DB, slug);
  if (!job) return new Response("Role not found.", { status: 404 });

  const form = await context.request.formData();
  const honeypot = formText(form, "website", 200);
  const startedAt = Number(formText(form, "started_at", 30));
  if (honeypot || !Number.isFinite(startedAt) || Date.now() - startedAt < 1200) {
    return redirect303(fallback);
  }

  const fullName = formText(form, "full_name", 160);
  const email = formText(form, "email", 254).toLowerCase();
  const phone = formText(form, "phone", 80);
  const linkedin = safeHttpUrl(formText(form, "linkedin_url", 500));
  const portfolio = safeHttpUrl(formText(form, "portfolio_url", 500));
  const coverLetter = formText(form, "cover_letter", 10_000);
  const consent = form.get("consent") === "1";
  const resume = form.get("resume");

  if (!fullName || !email || !/^\S+@\S+\.\S+$/.test(email) || !coverLetter || !consent || !isFile(resume)) {
    return redirect303(fallback);
  }
  if (!resumeAllowed(resume) || resume.size > RESUME_MAX) return redirect303(fallback);

  const questions = await getQuestions(DB, job.id);
  const answers: Array<{ questionId: string; text: string }> = [];
  const testFiles: Array<{ questionId: string; file: File }> = [];
  let totalBytes = resume.size;

  for (const question of questions) {
    const value = form.get(`question_${question.id}`);
    if (question.kind === "file") {
      if (isFile(value)) {
        if (!testFileAllowed(value) || value.size > TEST_MAX) return redirect303(fallback);
        totalBytes += value.size;
        testFiles.push({ questionId: question.id, file: value });
      } else if (question.required) {
        return redirect303(fallback);
      }
    } else {
      const text = typeof value === "string" ? value.trim().slice(0, 12_000) : "";
      if (question.required && !text) return redirect303(fallback);
      answers.push({ questionId: question.id, text });
    }
  }

  if (totalBytes > TOTAL_MAX) return redirect303(fallback);

  const applicationId = crypto.randomUUID();
  const publicId = crypto.randomUUID().split("-")[0].toUpperCase();
  const now = nowIso();
  const uploadedKeys: string[] = [];
  const fileRows: Array<{
    id: string;
    questionId: string | null;
    kind: "resume" | "test";
    key: string;
    filename: string;
    contentType: string;
    size: number;
  }> = [];

  const upload = async (file: File, kind: "resume" | "test", questionId: string | null) => {
    const id = crypto.randomUUID();
    const filename = safeFilename(file.name);
    const prefix = questionId ? `test/${questionId}` : "resume";
    const key = `applications/${applicationId}/${prefix}/${id}-${filename}`;
    await FILES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { applicationId, kind }
    });
    uploadedKeys.push(key);
    fileRows.push({
      id,
      questionId,
      kind,
      key,
      filename,
      contentType: file.type || "application/octet-stream",
      size: file.size
    });
  };

  try {
    await upload(resume, "resume", null);
    for (const item of testFiles) await upload(item.file, "test", item.questionId);

    const statements = [
      DB.prepare(
        `INSERT INTO applications
        (id, public_id, job_id, full_name, email, phone, linkedin_url, portfolio_url, cover_letter, consent, source, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'jobs', 'new', ?, ?)`
      ).bind(
        applicationId,
        publicId,
        job.id,
        fullName,
        email,
        phone,
        linkedin,
        portfolio,
        coverLetter,
        now,
        now
      ),
      ...answers.map((answer) =>
        DB.prepare(
          "INSERT INTO application_answers (id, application_id, question_id, answer_text, created_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), applicationId, answer.questionId, answer.text, now)
      ),
      ...fileRows.map((file) =>
        DB.prepare(
          `INSERT INTO application_files
          (id, application_id, question_id, kind, object_key, filename, content_type, size_bytes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          file.id,
          applicationId,
          file.questionId,
          file.kind,
          file.key,
          file.filename,
          file.contentType,
          file.size,
          now
        )
      ),
      DB.prepare(
        "INSERT INTO application_events (id, application_id, actor, event_type, detail, created_at) VALUES (?, ?, 'Candidate', 'submitted', ?, ?)"
      ).bind(crypto.randomUUID(), applicationId, `Applied to ${job.title}`, now)
    ];

    await DB.batch(statements);
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => FILES.delete(key).catch(() => undefined)));
    console.error("Application submission failed", error);
    return redirect303(fallback);
  }

  return redirect303(`/jobs/${job.slug}?applied=${encodeURIComponent(publicId)}`);
};

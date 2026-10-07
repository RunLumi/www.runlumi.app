// Interviews, scorecards and retention for the hiring desk.
export const interviewStages = ["screen", "work_sample", "technical", "culture", "final"] as const;
export type InterviewStage = typeof interviewStages[number];
export const interviewStatuses = ["scheduled", "done", "cancelled", "no_show"] as const;
export type InterviewStatus = typeof interviewStatuses[number];
export const recommendations = ["strong_yes", "yes", "no", "strong_no"] as const;
export type Recommendation = typeof recommendations[number];
export const criteria = ["role_skills", "problem_solving", "communication", "ownership"] as const;
export type Criterion = typeof criteria[number];

export const labels = {
  stage: { screen: ["Screening call", "Gọi sàng lọc"], work_sample: ["Work sample review", "Xem bài làm"], technical: ["Skills interview", "Phỏng vấn chuyên môn"], culture: ["Working-style interview", "Phỏng vấn cách làm việc"], final: ["Final interview", "Phỏng vấn cuối"] },
  status: { scheduled: ["Scheduled", "Đã hẹn"], done: ["Done", "Đã diễn ra"], cancelled: ["Cancelled", "Đã hủy"], no_show: ["No-show", "Ứng viên không đến"] },
  recommendation: { strong_yes: ["Strong yes", "Rất nên tuyển"], yes: ["Yes", "Nên tuyển"], no: ["No", "Không nên tuyển"], strong_no: ["Strong no", "Hoàn toàn không"] },
  criterion: { role_skills: ["Skills for the role", "Kỹ năng cho vị trí"], problem_solving: ["Problem solving", "Giải quyết vấn đề"], communication: ["Clear communication", "Giao tiếp rõ ràng"], ownership: ["Ownership", "Tinh thần trách nhiệm"] },
} as const satisfies Record<string, Record<string, readonly [string, string]>>;

export function label<G extends keyof typeof labels>(group: G, value: string, vi: boolean): string {
  const entry = (labels[group] as Record<string, readonly [string, string]>)[value];
  return entry ? entry[vi ? 1 : 0] : value;
}

export interface InterviewRow { id: string; stage: InterviewStage; scheduled_at: string; duration_minutes: number; location: string; interviewers: string; status: InterviewStatus; created_by_name: string }
export interface ScorecardRow { id: string; interview_id: string | null; author_id: string; author_name: string; recommendation: Recommendation; ratings: string; evidence: string; created_at: string }

/** Validated scorecard input; null when something required is missing. */
export function parseScorecard(form: FormData): { recommendation: Recommendation; ratings: Record<Criterion, number>; evidence: string; interviewId: string } | null {
  const recommendation = String(form.get("recommendation") ?? "");
  const evidence = String(form.get("evidence") ?? "").trim().slice(0, 6000);
  if (!(recommendations as readonly string[]).includes(recommendation) || evidence.length < 20) return null;
  const ratings = {} as Record<Criterion, number>;
  for (const criterion of criteria) {
    const value = Number(form.get(`rating.${criterion}`));
    if (!Number.isInteger(value) || value < 1 || value > 4) return null;
    ratings[criterion] = value;
  }
  return { recommendation: recommendation as Recommendation, ratings, evidence, interviewId: String(form.get("interview_id") ?? "").slice(0, 80) };
}

/** Counts per recommendation and average rating per criterion. */
export function summarize(cards: readonly Pick<ScorecardRow, "recommendation" | "ratings">[]) {
  const counts = Object.fromEntries(recommendations.map((value) => [value, 0])) as Record<Recommendation, number>;
  const sums = Object.fromEntries(criteria.map((value) => [value, 0])) as Record<Criterion, number>;
  for (const card of cards) {
    counts[card.recommendation] += 1;
    const ratings = JSON.parse(card.ratings || "{}") as Partial<Record<Criterion, number>>;
    for (const criterion of criteria) sums[criterion] += ratings[criterion] ?? 0;
  }
  const averages = Object.fromEntries(criteria.map((value) => [value, cards.length ? Math.round((sums[value] / cards.length) * 10) / 10 : null])) as Record<Criterion, number | null>;
  return { total: cards.length, counts, averages };
}

/**
 * Reviewers see colleagues' scorecards only after submitting their own for
 * the application, so the first impression is not anchored by others.
 */
export function visibleScorecards<T extends Pick<ScorecardRow, "author_id">>(cards: readonly T[], viewerId: string): { mine: T[]; others: T[]; hidden: number } {
  const mine = cards.filter((card) => card.author_id === viewerId);
  const others = cards.filter((card) => card.author_id !== viewerId);
  return mine.length ? { mine, others, hidden: 0 } : { mine, others: [], hidden: others.length };
}

/**
 * Retention policy confirmed by the owner on 2026-10-08: applications that
 * are not moving forward or were withdrawn are kept for 60 days after their
 * last update, then deleted with their files, interviews and scorecards.
 */
export const RETENTION_STATUSES = ["rejected", "withdrawn"] as const;
export const RETENTION_DAYS = 60;
export const DEFAULT_RETENTION_DAYS = RETENTION_DAYS;

/** Last calendar day (Asia/Ho_Chi_Minh) whose closed applications are due for deletion. */
export function retentionCutoff(now = Date.now(), days = RETENTION_DAYS): string {
  return new Date(now + 7 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);
}

export function parseLocalDateTime(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

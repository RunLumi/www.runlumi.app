// The header bell and the notices page (Notifications board). They show the
// person's existing in-app notices only; today that is HRM service-request
// notices, delivered to `hrm_notifications` for people with
// hrm.notifications.read while HRM is live. Reads are always scoped to the
// signed-in person's own user ID; marking read goes through the HRM command.
import { listNotifications, markNotificationRead, type HrNotification } from "../hrm/employee-services";
import type { WorkspaceUser } from "./roles";

/** True when some module can deliver in-app notices to this person. */
export function hasNoticeSource(user: WorkspaceUser): boolean {
  return user.can("hrm.notifications.read") && user.hrmEnabled === true && !user.hrmEmploymentEnded;
}

/**
 * Unread count for the bell: delivered unread notices plus those still queued
 * for this person (HRM delivers the queue when the inbox opens). Indexed
 * COUNTs, no audit row.
 */
export async function unreadNotices(db: D1Database, user: WorkspaceUser): Promise<number> {
  if (!hasNoticeSource(user)) return 0;
  const row = await db.prepare(`SELECT (SELECT COUNT(*) FROM hrm_notifications WHERE recipient_user_id = ?1 AND state = 'unread')
    + (SELECT COUNT(*) FROM hrm_notification_outbox o WHERE o.recipient_user_id = ?1 AND o.state = 'queued' AND o.attempts < 3
      AND NOT EXISTS (SELECT 1 FROM hrm_notifications n WHERE n.recipient_user_id = ?1 AND n.event_key = o.event_key)) AS n`).bind(user.id).first<{ n: number }>();
  return row?.n ?? 0;
}

export interface Notice { id: string; version: number; source: "hrm"; type: string; href: string; unread: boolean; created_at: string }

/** The person's own notices, newest first (at most 100, as the HRM inbox). */
export async function listNotices(db: D1Database, user: WorkspaceUser): Promise<{ notices: Notice[]; unread: number }> {
  if (!hasNoticeSource(user)) return { notices: [], unread: 0 };
  const { notifications, unread } = await listNotifications(db, user);
  return { notices: notifications.map(fromHrm), unread };
}

function fromHrm(note: HrNotification): Notice {
  return { id: note.id, version: note.version, source: "hrm", type: note.event_type, href: note.href, unread: note.state === "unread", created_at: note.created_at };
}

/** Marks one of the person's own notices read; the HRM guard refuses anyone else's. */
export async function markNoticeRead(db: D1Database, user: WorkspaceUser, key: string, id: string, version: number): Promise<void> {
  await markNotificationRead(db, user, key, id, version);
}

const titles: Record<string, [string, string]> = {
  request_created: ["A new HR request needs handling", "Yêu cầu HR mới cần xử lý"],
  request_assigned: ["An HR request was assigned to you", "Một yêu cầu HR được giao cho bạn"],
  request_updated: ["An HR request you follow was updated", "Yêu cầu HR bạn theo dõi có cập nhật"],
};
const reasons: Record<string, [string, string]> = {
  request_created: ["you handle HR service requests", "bạn xử lý yêu cầu dịch vụ HR"],
  request_assigned: ["the request was assigned to you", "yêu cầu được giao cho bạn"],
  request_updated: ["you sent or handle this request", "bạn gửi hoặc xử lý yêu cầu này"],
};
export const noticeTitle = (type: string, vi: boolean) => titles[type]?.[vi ? 1 : 0] ?? (vi ? "Thông báo HRM" : "HRM notice");
export const noticeReason = (type: string, vi: boolean) => reasons[type]?.[vi ? 1 : 0] ?? (vi ? "thông báo HRM gửi bạn" : "an HRM notice for you");

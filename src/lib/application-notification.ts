interface ApplicationNotice {
  applicationId: string;
  publicId: string;
  jobTitle: string;
}

export type NotificationResult =
  | { status: "sent"; messageId: string }
  | { status: "failed"; reason: string };

// This notification intentionally excludes candidate names, contact details,
// answers and files. The link requires the existing hiring-desk authentication.
export async function sendApplicationNotification(
  webhook: string | undefined,
  notice: ApplicationNotice,
  send: typeof fetch = fetch
): Promise<NotificationResult> {
  let url: URL;
  try {
    url = new URL(webhook ?? "");
    if (url.protocol !== "https:" || url.hostname !== "discord.com" ||
        url.port || url.username || url.password ||
        !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
      return { status: "failed", reason: "invalid_webhook" };
    }
  } catch {
    return { status: "failed", reason: "missing_or_invalid_webhook" };
  }
  url.search = "";
  url.hash = "";
  url.searchParams.set("wait", "true");

  try {
    const response = await send(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        username: "Lumi Hiring",
        allowed_mentions: { parse: [] },
        embeds: [{
          title: "Có hồ sơ ứng tuyển mới",
          description: notice.jobTitle.slice(0, 500),
          url: `https://runlumi.app/admin/jobs/applications/${encodeURIComponent(notice.applicationId)}`,
          color: 24723,
          fields: [{ name: "Mã hồ sơ", value: notice.publicId.slice(0, 50) }],
          footer: { text: "Mở trang quản trị để xem hồ sơ. CV và thông tin cá nhân không được gửi qua Discord." }
        }]
      })
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { status: "failed", reason: `http_${response.status}` };
    }
    const message = await response.json() as { id?: unknown };
    if (typeof message.id !== "string" || !/^\d+$/.test(message.id)) {
      return { status: "failed", reason: "unconfirmed_delivery" };
    }
    return { status: "sent", messageId: message.id };
  } catch {
    // Never log the exception: fetch errors can contain the webhook credential.
    // Do not retry an ambiguous timeout, which could send duplicate messages.
    return { status: "failed", reason: "delivery_error" };
  }
}

export async function notifyApplication(
  env: Pick<Env, "DB" | "DISCORD_APPLICATION_WEBHOOK_URL">,
  notice: ApplicationNotice
): Promise<void> {
  const result = await sendApplicationNotification(env.DISCORD_APPLICATION_WEBHOOK_URL, notice);
  try {
    await env.DB.prepare(
      "INSERT INTO application_events (id, application_id, actor, event_type, detail, created_at) VALUES (?, ?, 'System', ?, ?, ?)"
    ).bind(
      crypto.randomUUID(), notice.applicationId,
      result.status === "sent" ? "discord_notification_sent" : "discord_notification_failed",
      result.status === "sent" ? `Discord message ${result.messageId}` : result.reason,
      new Date().toISOString()
    ).run();
  } catch {
    console.error("Application notification audit write failed");
  }
  if (result.status === "failed") console.error("Application Discord notification failed", result.reason);
}

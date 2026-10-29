// Every email this app sends to a person goes through `composeWorkspaceEmail`,
// which puts that person's anti-phishing code at the top. Without a code there
// is no email (fail closed), so a message without the code is never genuine.
// Delivery is separate (see notifications); the composer never sends.
import { antiPhishingCode } from "./anti-phishing";

export interface EmailRecipient { id: string; email: string; name: string; vi: boolean }
export interface EmailBody { subject: string; lines: string[]; link?: { label: string; href: string } }
export interface ComposedEmail { to: string; subject: string; text: string; html: string }

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
/** Plain, single-line text: no control characters, no header injection. */
const line = (value: string, max = 500) => value.replace(/[\p{Cc}\u2028\u2029]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Links in Workspace email point only at this site over HTTPS. */
export function safeLink(href: string): string | null {
  try {
    const url = new URL(href, "https://runlumi.app");
    return url.origin === "https://runlumi.app" ? url.href : null;
  } catch { return null; }
}

export function renderEmail(recipient: EmailRecipient, code: string, body: EmailBody): ComposedEmail {
  const vi = recipient.vi;
  const heading = vi ? "Mã chống lừa đảo của bạn" : "Your anti-phishing code";
  const warning = vi
    ? "Email từ Lumi Workspace luôn có đúng mã này ở đầu thư. Email không có mã: đừng bấm link, hãy chuyển cho admin."
    : "Email from Lumi Workspace always starts with this exact code. If it is missing, do not click any link; forward the email to an admin.";
  const subject = line(body.subject, 200);
  const lines = body.lines.map((item) => line(item)).filter(Boolean);
  const link = body.link ? safeLink(body.link.href) : null;
  const greeting = vi ? `Chào ${line(recipient.name, 120) || recipient.email},` : `Hello ${line(recipient.name, 120) || recipient.email},`;
  const text = [`${heading}: ${code}`, "", greeting, "", ...lines, ...(link ? ["", `${line(body.link!.label, 80)}: ${link}`] : []), "", "—", warning].join("\n");
  const html = `<!doctype html><html lang="${vi ? "vi" : "en"}"><body style="font-family:system-ui,sans-serif;color:#172033;line-height:1.5">`
    + `<p style="margin:0 0 16px;padding:10px 14px;border:1px solid #C8D0DE;border-radius:8px;background:#F4F0E8"><strong>${escape(heading)}:</strong> ${escape(code)}</p>`
    + `<p>${escape(greeting)}</p>${lines.map((item) => `<p>${escape(item)}</p>`).join("")}`
    + (link ? `<p><a href="${escape(link)}">${escape(line(body.link!.label, 80))}</a></p>` : "")
    + `<hr style="border:0;border-top:1px solid #E7EAF0"><p style="font-size:13px;color:#5E6677">${escape(warning)}</p></body></html>`;
  return { to: recipient.email, subject, text, html };
}

/** The email for one internal recipient, or null when they have not set a code yet (never sent without it). */
export async function composeWorkspaceEmail(db: D1Database, recipient: EmailRecipient, body: EmailBody): Promise<ComposedEmail | null> {
  const code = await antiPhishingCode(db, recipient.id);
  if (!code || !recipient.email) return null;
  return renderEmail(recipient, code.code, body);
}

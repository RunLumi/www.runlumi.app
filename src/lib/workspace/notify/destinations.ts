// Webhook destinations next to the built-in Lark bot: Slack, Discord and
// Microsoft Teams channels an admin connects. A webhook URL is a credential:
// it is encrypted at rest with the WORKSPACE_WEBHOOK_KEY Worker secret, shown
// only as a masked hint, never logged and never returned to the browser.
// Messages carry exactly what the Lark card shows (same privacy rules: no
// contact phone numbers or emails, free text excerpted and masked, discovery
// values never sent), as plain text with mentions disabled.

export const platforms = ["slack", "discord", "teams"] as const;
export type Platform = typeof platforms[number];
export const platformLabels: Record<Platform | "lark", string> = { lark: "Lark", slack: "Slack", discord: "Discord", teams: "Microsoft Teams" };
export const PAUSE_AFTER_FAILURES = 10;

/** Accepts only the platform's own incoming-webhook URL shape; anything else is refused before storing. */
export function validWebhook(platform: Platform, raw: string): URL | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return null;
  const host = url.hostname.toLowerCase(), path = url.pathname;
  if (platform === "slack") return host === "hooks.slack.com" && /^\/services\/[A-Z0-9]{6,20}\/[A-Z0-9]{6,20}\/[A-Za-z0-9]{16,40}$/.test(path) && !url.search ? url : null;
  if (platform === "discord") return (host === "discord.com" || host === "discordapp.com") && /^\/api\/webhooks\/\d{15,22}\/[A-Za-z0-9_-]{40,100}$/.test(path) && !url.search ? url : null;
  // Teams: a Workflows (Power Automate) webhook, or a legacy Office 365 connector.
  const workflows = (/^[a-z0-9-]+\.[a-z0-9-]+\.logic\.azure\.com$/.test(host) && path.startsWith("/workflows/")) || (/^[a-z0-9-]+\.[a-z0-9.-]*\.api\.powerplatform\.com$/.test(host) && path.includes("/workflows/"));
  const connector = /^[a-z0-9-]+\.webhook\.office\.com$/.test(host) && path.startsWith("/webhookb2/");
  return workflows || connector ? url : null;
}

/** "hooks.slack.com/services/••••" — enough to recognise, never enough to use. */
export function urlHint(url: URL): string {
  const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
  return `${url.hostname}/${first}/••••`;
}

async function key(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`lumi-webhook-v1\n${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export class DestinationKeyMissing extends Error { constructor() { super("webhook_key_missing"); } }

/** A usable secret is at least 32 characters; shorter values are treated as missing (fail closed). */
export function webhookSecret(env: { WORKSPACE_WEBHOOK_KEY?: string }): string | null {
  const value = env.WORKSPACE_WEBHOOK_KEY ?? "";
  return value.length >= 32 ? value : null;
}

export async function sealUrl(secret: string, url: URL): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(url.href))); // !# policy: d1-blob (ciphertext of a URL, stored as base64 text)
  return `v1.${b64(iv)}.${b64(sealed)}`;
}

export async function openUrl(secret: string, sealed: string): Promise<string | null> {
  const [version, iv, data] = sealed.split(".");
  if (version !== "v1" || !iv || !data) return null;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(secret), unb64(data)));
  } catch { return null; }
}

/** The plain parts of a Lark card (cards.ts), so every destination shows the same, already-masked content. */
export interface PlainMessage { title: string; fields: [string, string][]; quote: string | null; footer: string; link: { label: string; url: string } | null }

export function plainFromLarkCard(message: Record<string, unknown>): PlainMessage | null {
  const card = (message as { card?: { header?: { title?: { content?: string } }; elements?: Record<string, unknown>[] } }).card;
  if (!card) return null;
  const out: PlainMessage = { title: String(card.header?.title?.content ?? ""), fields: [], quote: null, footer: "", link: null };
  for (const element of card.elements ?? []) {
    const tag = element.tag;
    if (tag === "div" && Array.isArray(element.fields)) {
      for (const field of element.fields as { text?: { content?: string } }[]) {
        const [label, ...rest] = String(field.text?.content ?? "").split("\n");
        out.fields.push([label, rest.join(" ")]);
      }
    } else if (tag === "div") out.quote = String((element.text as { content?: string } | undefined)?.content ?? "") || null;
    else if (tag === "note") out.footer = ((element.elements as { content?: string }[] | undefined) ?? []).map((item) => item.content ?? "").join(" ");
    else if (tag === "action") {
      const button = ((element.actions as { text?: { content?: string }; url?: string }[] | undefined) ?? [])[0];
      if (button?.url && button.url.startsWith("https://runlumi.app/")) out.link = { label: button.text?.content ?? "Open", url: button.url };
    }
  }
  return out.title ? out : null;
}

/** Slack escapes &, < and > so names can never form <!channel> mentions or links. */
const slackText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Discord: break mention and markdown syntax; allowed_mentions is empty as well. */
const discordText = (value: string) => value.replace(/@/g, "@​").replace(/([*_`~|>\\[\]()])/g, "\\$1");
/** Teams (Adaptive Card TextBlock markdown): escape markdown and HTML. */
const teamsText = (value: string) => value.replace(/[\\*_`#[\]()<>~]/g, (char) => `\\${char}`);

export function platformPayload(platform: Platform, message: PlainMessage): Record<string, unknown> {
  const lines = (format: (value: string) => string) => [
    ...(message.quote ? [format(message.quote)] : []),
    ...message.fields.map(([label, value]) => `${format(label)}: ${format(value)}`),
    format(message.footer),
  ].filter(Boolean);
  if (platform === "slack") {
    const text = [`*${slackText(message.title)}*`, ...lines(slackText), ...(message.link ? [`<${message.link.url}|${slackText(message.link.label)}>`] : [])].join("\n");
    return { text, unfurl_links: false, unfurl_media: false };
  }
  if (platform === "discord") {
    const content = [`**${discordText(message.title)}**`, ...lines(discordText), ...(message.link ? [`${discordText(message.link.label)}: <${message.link.url}>`] : [])].join("\n").slice(0, 1900);
    return { content, allowed_mentions: { parse: [] } };
  }
  return {
    type: "message",
    attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
      body: [{ type: "TextBlock", text: teamsText(message.title), weight: "Bolder", wrap: true }, ...lines(teamsText).map((text) => ({ type: "TextBlock", text, wrap: true, spacing: "Small" }))],
      actions: message.link ? [{ type: "Action.OpenUrl", title: message.link.label, url: message.link.url }] : [],
    } }],
  };
}

export type SendResult = { ok: true; status: number } | { ok: false; reason: string; retry: boolean };

/** Posts one message. Never throws, never follows redirects, never reports the URL. */
export async function postWebhook(platform: Platform, rawUrl: string, payload: Record<string, unknown>, send: typeof fetch = fetch): Promise<SendResult> {
  const url = validWebhook(platform, rawUrl);
  if (!url) return { ok: false, reason: "invalid_webhook", retry: false };
  if (platform === "discord") url.searchParams.set("wait", "true");
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).length > 24_000) return { ok: false, reason: "too_large", retry: false };
  try {
    const response = await send(url.href, { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "manual", signal: AbortSignal.timeout(8000), body });
    if (response.ok) return { ok: true, status: response.status };
    return { ok: false, reason: `${platform}_${response.status}`, retry: response.status === 429 || response.status >= 500 };
  } catch {
    return { ok: false, reason: "network", retry: true };
  }
}

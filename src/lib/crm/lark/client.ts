// Lark (larksuite.com) custom group bot: signed webhook posts.
// https://open.larksuite.com/document/client-docs/bot-v3/add-custom-bot

export type LarkResult = { ok: true } | { ok: false; reason: string; retry: boolean };

/** Accepts only a Lark custom-bot hook URL; anything else is refused before sending. */
export function larkWebhook(raw: string | undefined): URL | null {
  try {
    const url = new URL(raw ?? "");
    const valid = url.protocol === "https:" && url.hostname === "open.larksuite.com" && !url.port && !url.username && !url.password
      && /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]{8,80}$/.test(url.pathname) && !url.search && !url.hash;
    return valid ? url : null;
  } catch {
    return null;
  }
}

/** Lark signature: HMAC-SHA256 keyed by "timestamp\nsecret" over an empty message, base64. */
export async function larkSign(timestamp: number, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${timestamp}\n${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new Uint8Array(0))); // !# policy: d1-blob (signature bytes, never stored)
  return btoa(String.fromCharCode(...signature));
}

/** Posts one message. Never throws and never reports the URL (it is a credential). */
export async function postToLark(
  webhook: string | undefined, secret: string | undefined, message: Record<string, unknown>, now = Date.now(), send: typeof fetch = fetch,
): Promise<LarkResult> {
  const url = larkWebhook(webhook);
  if (!url) return { ok: false, reason: "invalid_webhook", retry: false };
  const timestamp = Math.floor(now / 1000);
  const body = secret ? { timestamp: String(timestamp), sign: await larkSign(timestamp, secret), ...message } : message;
  const text = JSON.stringify(body);
  if (new TextEncoder().encode(text).length > 20_000) return { ok: false, reason: "too_large", retry: false };
  try {
    const response = await send(url.toString(), { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "manual", signal: AbortSignal.timeout(8000), body: text });
    const result = await response.json().catch(() => ({})) as { code?: number; StatusCode?: number; msg?: string };
    const code = result.code ?? result.StatusCode;
    if (response.ok && code === 0) return { ok: true };
    // 11232: rate limited; 5xx: Lark side. Signature, keyword and IP errors will not fix themselves.
    const retry = response.status >= 500 || code === 11232 || response.status === 429;
    return { ok: false, reason: `lark_${code ?? response.status}`, retry };
  } catch {
    return { ok: false, reason: "network", retry: true };
  }
}

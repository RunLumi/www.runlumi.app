import type { APIContext, AstroGlobal } from "astro";

const COOKIE = "lumi_ats_admin";
const MAX_AGE = 60 * 60 * 12;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64Url(new Uint8Array(signature));
}

export async function createAdminSession(secret: string): Promise<string> {
  const payload = `${Date.now()}.${Date.now() + MAX_AGE * 1000}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifyAdminSession(secret: string, token: string | undefined): Promise<boolean> {
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [issued, expires, signature] = parts;
  const expiry = Number(expires);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const payload = `${issued}.${expires}`;
  const expected = await hmac(secret, payload);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

export function setAdminCookie(context: APIContext, token: string) {
  context.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: context.url.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE
  });
}

export function clearAdminCookie(context: APIContext) {
  context.cookies.delete(COOKIE, { path: "/" });
}

export async function isAdmin(context: Pick<APIContext, "cookies" | "locals"> | AstroGlobal): Promise<boolean> {
  const secret = context.locals.runtime.env.ADMIN_SESSION_SECRET;
  const token = context.cookies.get(COOKIE)?.value;
  return verifyAdminSession(secret, token);
}

export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/admin/jobs") || value.startsWith("//")) return "/admin/jobs";
  return value;
}

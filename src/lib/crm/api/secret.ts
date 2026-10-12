// Token secrets: random bytes for new tokens, SHA-256 for storage and lookup.

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32)); // !# policy: d1-blob (random token bytes, never stored)
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// base64url helpers for WebAuthn payloads, shared by the Workspace passkey
// and sign-in scripts.
export const toB64 = (buffer: ArrayBuffer): string => {
  let text = "";
  for (const byte of new Uint8Array(buffer)) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
export const fromB64 = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};
export type Descriptor = { id: string; type?: "public-key"; transports?: AuthenticatorTransport[] };

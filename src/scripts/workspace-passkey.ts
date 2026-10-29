// Browser side of the Workspace passkey page. WebAuthn needs JavaScript, so
// this is the one place the private Workspace uses a client script for
// security: it asks the operating system for a passkey and posts the signed
// answer. Adding a passkey goes to EmDash's own endpoints, so the passkey is
// stored by EmDash exactly as if it were added in the EmDash admin.
const toB64 = (buffer: ArrayBuffer): string => {
  let text = "";
  for (const byte of new Uint8Array(buffer)) text += String.fromCharCode(byte);
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const fromB64 = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

type Descriptor = { id: string; type?: "public-key"; transports?: AuthenticatorTransport[] };
const descriptors = (items: Descriptor[] | undefined) => items?.map((item) => ({ type: "public-key" as const, id: fromB64(item.id), transports: item.transports }));

function say(form: HTMLElement, key: string): void {
  const status = form.querySelector<HTMLElement>("[data-passkey-status]");
  const message = form.dataset[`msg${key[0].toUpperCase()}${key.slice(1)}`] ?? form.dataset.msgFailed ?? "";
  if (status) { status.textContent = message; status.hidden = !message; }
}

async function verify(form: HTMLFormElement): Promise<void> {
  const started = await fetch("/api/workspace/passkey/options", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: "{}" });
  if (started.status === 409) return say(form, "none");
  if (!started.ok) return say(form, "failed");
  const { options } = await started.json() as { options: { challenge: string; rpId: string; timeout: number; userVerification: UserVerificationRequirement; allowCredentials?: Descriptor[] } };
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: fromB64(options.challenge), rpId: options.rpId, timeout: options.timeout,
    userVerification: options.userVerification, allowCredentials: descriptors(options.allowCredentials),
  } }) as PublicKeyCredential | null;
  if (!credential) return say(form, "cancelled");
  const response = credential.response as AuthenticatorAssertionResponse;
  const done = await fetch("/api/workspace/passkey/verify", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({
    purpose: form.dataset.purpose,
    credential: { id: credential.id, rawId: toB64(credential.rawId), type: "public-key", response: {
      clientDataJSON: toB64(response.clientDataJSON), authenticatorData: toB64(response.authenticatorData), signature: toB64(response.signature),
      ...(response.userHandle ? { userHandle: toB64(response.userHandle) } : {}),
    } },
  }) });
  if (!done.ok) return say(form, "failed");
  say(form, "done");
  window.location.assign(form.dataset.next || "/workspace");
}

async function enrol(form: HTMLFormElement): Promise<void> {
  const name = (form.querySelector<HTMLInputElement>("[name=passkey_name]")?.value ?? "").trim().slice(0, 80);
  const emdash = { "Content-Type": "application/json", "X-EmDash-Request": "1" };
  const started = await fetch("/_emdash/api/auth/passkey/register/options", { method: "POST", credentials: "same-origin", headers: emdash, body: JSON.stringify(name ? { name } : {}) });
  if (!started.ok) return say(form, "failed");
  const { data } = await started.json() as { data: { options: { challenge: string; rp: PublicKeyCredentialRpEntity; user: { id: string; name: string; displayName: string }; pubKeyCredParams: PublicKeyCredentialParameters[]; timeout: number; attestation: AttestationConveyancePreference; authenticatorSelection: AuthenticatorSelectionCriteria; excludeCredentials?: Descriptor[] } } };
  const options = data.options;
  const credential = await navigator.credentials.create({ publicKey: {
    ...options, challenge: fromB64(options.challenge), user: { ...options.user, id: fromB64(options.user.id) },
    authenticatorSelection: { ...options.authenticatorSelection, userVerification: "required" },
    excludeCredentials: descriptors(options.excludeCredentials),
  } }) as PublicKeyCredential | null;
  if (!credential) return say(form, "cancelled");
  const response = credential.response as AuthenticatorAttestationResponse;
  const done = await fetch("/_emdash/api/auth/passkey/register/verify", { method: "POST", credentials: "same-origin", headers: emdash, body: JSON.stringify({
    ...(name ? { name } : {}),
    credential: { id: credential.id, rawId: toB64(credential.rawId), type: "public-key", response: {
      clientDataJSON: toB64(response.clientDataJSON), attestationObject: toB64(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : undefined,
    } },
  }) });
  if (!done.ok) return say(form, "failed");
  say(form, "done");
  window.location.reload();
}

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-passkey]")) {
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
  if (!window.PublicKeyCredential) { say(form, "unsupported"); if (button) button.disabled = true; continue; }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (button) button.disabled = true;
    say(form, "working");
    (form.dataset.passkey === "enrol" ? enrol(form) : verify(form))
      .catch(() => say(form, "cancelled"))
      .finally(() => { if (button) button.disabled = false; });
  });
}

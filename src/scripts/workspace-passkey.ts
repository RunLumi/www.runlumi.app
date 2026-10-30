// Browser side of the Workspace passkey page. WebAuthn needs JavaScript, so
// this is the one place the private Workspace uses a client script for
// security: it asks the operating system for a passkey and posts the signed
// answer. Adding a passkey goes to EmDash's own endpoints, so the passkey is
// stored by EmDash exactly as if it were added in the EmDash admin.
import { type Descriptor, fromB64, toB64 } from "./webauthn-codec";

const descriptors = (items: Descriptor[] | undefined) => items?.map((item) => ({ type: "public-key" as const, id: fromB64(item.id), transports: item.transports }));

function say(form: HTMLElement, key: string): void {
  const status = form.querySelector<HTMLElement>("[data-passkey-status]") ?? form.closest("section")?.querySelector<HTMLElement>("[data-passkey-status]");
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
  // The first-visit page shows the created card (rename, next step) instead of reloading.
  const created = form.dataset.created ? document.querySelector<HTMLElement>(form.dataset.created) : null;
  const passkey = (await done.json().catch(() => null) as { data?: { passkey?: { id: string; name: string | null; createdAt: string } } } | null)?.data?.passkey;
  if (!created || !passkey) { window.location.reload(); return; }
  const rename = created.querySelector<HTMLFormElement>("form[data-passkey-rename]");
  if (rename) rename.dataset.id = passkey.id;
  const input = created.querySelector<HTMLInputElement>("[name=name]");
  if (input) input.value = passkey.name ?? name;
  const at = created.querySelector<HTMLElement>("[data-created-at]");
  if (at) at.textContent = new Date(passkey.createdAt).toLocaleString(document.documentElement.lang === "vi" ? "vi-VN" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  form.closest("section")?.setAttribute("hidden", "");
  created.hidden = false;
  created.querySelector<HTMLElement>("a, input")?.focus();
}

const emdashHeaders = { "Content-Type": "application/json", "X-EmDash-Request": "1" };

/** Renames one of the person's own passkeys through EmDash (it checks ownership). */
async function rename(form: HTMLFormElement): Promise<void> {
  const name = (form.querySelector<HTMLInputElement>("[name=name]")?.value ?? "").trim().slice(0, 80);
  if (!name || !form.dataset.id) return say(form, "failed");
  const done = await fetch(`/_emdash/api/auth/passkey/${encodeURIComponent(form.dataset.id)}`, { method: "PATCH", credentials: "same-origin", headers: emdashHeaders, body: JSON.stringify({ name }) });
  say(form, done.ok ? "done" : "failed");
  if (done.ok && form.dataset.reload !== undefined) window.location.reload();
}

/** Removes one of the person's own passkeys through EmDash; the Workspace asks for step-up first. */
async function remove(form: HTMLFormElement): Promise<void> {
  if (!form.dataset.id) return say(form, "failed");
  const done = await fetch(`/_emdash/api/auth/passkey/${encodeURIComponent(form.dataset.id)}`, { method: "DELETE", credentials: "same-origin", headers: emdashHeaders });
  if (done.status === 403 && form.dataset.verify) { window.location.assign(form.dataset.verify); return; }
  if (done.status === 400) return say(form, "last");
  if (!done.ok) return say(form, "failed");
  window.location.reload();
}

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-passkey-rename], form[data-passkey-remove]")) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]");
    if (button) button.disabled = true;
    (form.dataset.passkeyRemove !== undefined ? remove(form) : rename(form))
      .catch(() => say(form, "failed"))
      .finally(() => { if (button) button.disabled = false; });
  });
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

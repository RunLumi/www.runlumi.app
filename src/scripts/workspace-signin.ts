// Browser side of the Workspace sign-in page. Sign-in is EmDash's: a passkey
// through /_emdash/api/auth/passkey/{options,verify}, or a sign-in link
// through /_emdash/api/auth/magic-link/send. WebAuthn needs JavaScript.
import { type Descriptor, fromB64, toB64 } from "./webauthn-codec";

const form = document.querySelector<HTMLFormElement>("form[data-signin]");
if (form) {
  const status = form.querySelector<HTMLElement>("[data-signin-status]");
  const email = form.querySelector<HTMLInputElement>("[name=email]");
  const say = (key: string) => { if (status) status.textContent = form.dataset[`msg${key[0].toUpperCase()}${key.slice(1)}`] ?? ""; };
  const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
  const busy = (on: boolean) => buttons.forEach((button) => { button.disabled = on; });
  const json = { "Content-Type": "application/json" };

  async function passkey(): Promise<void> {
    const address = email?.value.trim();
    const started = await fetch("/_emdash/api/auth/passkey/options", { method: "POST", credentials: "same-origin", headers: json, body: JSON.stringify(address ? { email: address } : {}) });
    if (!started.ok) return say("failed");
    const { data } = await started.json() as { data: { options: { challenge: string; rpId: string; timeout: number; userVerification?: UserVerificationRequirement; allowCredentials?: Descriptor[] } } };
    const options = data.options;
    const credential = await navigator.credentials.get({ publicKey: {
      challenge: fromB64(options.challenge), rpId: options.rpId, timeout: options.timeout, userVerification: "required",
      allowCredentials: options.allowCredentials?.map((item) => ({ type: "public-key" as const, id: fromB64(item.id), transports: item.transports })),
    } }) as PublicKeyCredential | null;
    if (!credential) return say("cancelled");
    const response = credential.response as AuthenticatorAssertionResponse;
    const done = await fetch("/_emdash/api/auth/passkey/verify", { method: "POST", credentials: "same-origin", headers: json, body: JSON.stringify({ credential: {
      id: credential.id, rawId: toB64(credential.rawId), type: "public-key", response: {
        clientDataJSON: toB64(response.clientDataJSON), authenticatorData: toB64(response.authenticatorData), signature: toB64(response.signature),
        ...(response.userHandle ? { userHandle: toB64(response.userHandle) } : {}),
      },
    } }) });
    if (!done.ok) return say("failed");
    say("done");
    window.location.assign(form!.dataset.next || "/workspace");
  }

  async function link(): Promise<void> {
    const address = email?.value.trim();
    if (!address || !email?.checkValidity()) { email?.focus(); return say("email"); }
    const sent = await fetch("/_emdash/api/auth/magic-link/send", { method: "POST", credentials: "same-origin", headers: json, body: JSON.stringify({ email: address }) });
    say(sent.status === 503 ? "nomail" : "sent");
  }

  if (!window.PublicKeyCredential) { say("unsupported"); form.querySelector<HTMLButtonElement>("[data-signin-passkey]")!.disabled = true; }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    busy(true); say("working");
    passkey().catch(() => say("cancelled")).finally(() => busy(false));
  });
  form.querySelector("[data-signin-link]")?.addEventListener("click", () => {
    busy(true);
    link().catch(() => say("nomail")).finally(() => busy(false));
  });
}

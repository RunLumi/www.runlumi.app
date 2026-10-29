// A synthetic WebAuthn authenticator for tests: a P-256 key pair that signs
// assertions the way a browser passkey does. Never use outside tests.
import { createHash, generateKeyPairSync, sign } from "node:crypto";

const b64 = (bytes) => Buffer.from(bytes).toString("base64url");

export function syntheticPasskey(id = `cred_${Math.random().toString(36).slice(2)}`) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const sec1 = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
  let counter = 0;
  return {
    id,
    /** SEC1 public key as EmDash stores it in credentials.public_key. */
    publicKey: new Uint8Array(sec1),
    publicKeyHex: sec1.toString("hex"),
    /** An assertion for `challenge`; flags default to user present + user verified. */
    assert(challenge, { origin = "https://runlumi.app", rpId = "runlumi.app", flags = 0x05, type = "webauthn.get", bump = true } = {}) {
      if (bump) counter += 1;
      const clientDataJSON = Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
      const count = Buffer.alloc(4); count.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([createHash("sha256").update(rpId).digest(), Buffer.from([flags]), count]);
      const signature = sign("sha256", Buffer.concat([authenticatorData, createHash("sha256").update(clientDataJSON).digest()]), privateKey);
      return { id, rawId: id, type: "public-key", response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authenticatorData), signature: b64(signature) } };
    },
  };
}

export function memorySession() {
  const map = new Map();
  return { map, get: async (key) => map.get(key), set: (key, value) => { map.set(key, structuredClone(value)); }, delete: (key) => { map.delete(key); } };
}

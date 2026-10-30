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
    /**
     * A registration response for EmDash's /passkey/register/verify: "none"
     * attestation with this key as a COSE ES256 key. Flags default to user
     * present + user verified + attested credential data.
     */
    attest(challenge, { origin = "https://runlumi.app", rpId = "runlumi.app", flags = 0x45 } = {}) {
      const credentialId = Buffer.from(id);
      const idLength = Buffer.alloc(2); idLength.writeUInt16BE(credentialId.length);
      const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]));
      const authData = Buffer.concat([createHash("sha256").update(rpId).digest(), Buffer.from([flags]), Buffer.alloc(4), Buffer.alloc(16), idLength, credentialId, cose]);
      const attestationObject = cbor(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));
      const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false }));
      return { id, rawId: b64(credentialId), type: "public-key", response: { clientDataJSON: b64(clientDataJSON), attestationObject: b64(attestationObject), transports: ["internal"] } };
    },
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

/** Minimal CBOR encoder for the attestation above: integers, byte and text strings, maps. */
function cbor(value) {
  const head = (major, n) => n < 24 ? Buffer.from([(major << 5) | n]) : n < 256 ? Buffer.from([(major << 5) | 24, n]) : Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") { const bytes = Buffer.from(value); return Buffer.concat([head(3, bytes.length), bytes]); }
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (value instanceof Map) return Buffer.concat([head(5, value.size), ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)])]);
  throw new Error("unsupported CBOR value");
}

export function memorySession() {
  const map = new Map();
  return { map, get: async (key) => map.get(key), set: (key, value) => { map.set(key, structuredClone(value)); }, delete: (key) => { map.delete(key); } };
}

// Module hook used by scripts/test-setup.mjs: resolves the workerd-only
// "cloudflare:workers" specifier to scripts/cloudflare-workers-stub.mjs.
const stubUrl = new URL("./cloudflare-workers-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: stubUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

// Module hook used by scripts/test-setup.mjs: resolves the workerd-only
// "cloudflare:workers" specifier to scripts/cloudflare-workers-stub.mjs.
const stubUrl = new URL("./cloudflare-workers-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { url: stubUrl, shortCircuit: true };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Astro route imports omit .ts; resolve those same imports in Node tests.
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}

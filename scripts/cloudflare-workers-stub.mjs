// Test double for the workerd-only "cloudflare:workers" module. `env` proxies
// to process.env so individual tests can set and restore binding values.
const env = new Proxy(
  {},
  {
    get(target, prop) {
      if (Object.hasOwn(target, prop)) return target[prop];
      return process.env[String(prop)];
    },
    has(target, prop) {
      return Object.hasOwn(target, prop) || String(prop) in process.env;
    }
  }
);

export { env };

// Test double for the workerd-only "cloudflare:workers" module. `env` proxies
// to process.env so individual tests can set and restore binding values.
const env = new Proxy(
  {},
  {
    get(_target, prop) {
      return process.env[String(prop)];
    },
    has(_target, prop) {
      return String(prop) in process.env;
    }
  }
);

export { env };

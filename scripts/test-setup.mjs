// Shared setup for `npm test` (node --test). Node 26 runs TypeScript sources
// through type stripping, but src/lib imports "cloudflare:workers", which
// only exists inside workerd. The --import hook below resolves it to a stub
// whose `env` is backed by environment variables so tests can set secrets.
import { register } from "node:module";

register("./cloudflare-workers-hook.mjs", new URL("./", import.meta.url));

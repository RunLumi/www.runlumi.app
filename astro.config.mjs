import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import emdash from "emdash/astro";
import { d1, r2 } from "@emdash-cms/cloudflare";

export default defineConfig({
  site: "https://runlumi.app",
  output: "server",
  integrations: [
    react(),
    emdash({
      database: d1({ binding: "CONTENT_DB", session: "disabled" }),
      storage: r2({ binding: "BLOG_MEDIA" }),
      siteUrl: "https://runlumi.app",
      allowedOrigins: [
        "https://runlumi.app",
        "https://www.runlumi.app",
        "https://landing.runlumi.app",
      ],
    }),
  ],
  adapter: cloudflare({
    imageService: "compile",
    // Integration runs point local D1/KV/R2 at an isolated directory; the
    // default keeps Wrangler's normal .wrangler/state persistence.
    persistState: process.env.LUMI_PERSIST_TO ? { path: process.env.LUMI_PERSIST_TO } : true
  }),
  trailingSlash: "never"
});

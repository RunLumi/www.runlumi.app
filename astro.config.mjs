import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://runlumi.app",
  output: "server",
  session: false,
  adapter: cloudflare({
    imageService: "compile"
  }),
  trailingSlash: "never"
});

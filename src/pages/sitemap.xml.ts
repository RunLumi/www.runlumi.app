import { blogPosts } from "../data/blog";

export const prerender = true;

const urls = [
  "/",
  "/vi",
  "/blog",
  "/vi/blog",
  "/rss.xml",
  "/jobs",
  ...blogPosts.map((post) => `${post.lang === "vi" ? "/vi/blog" : "/blog"}/${post.slug}`),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((path) => `  <url><loc>https://runlumi.app${path}</loc></url>`).join("\n")}
</urlset>`;

export const GET = () => new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });

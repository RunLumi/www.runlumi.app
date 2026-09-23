import { loadBlogPosts } from "../lib/blog-source";

export const prerender = false;

const site = "https://runlumi.app";
const fixed = ["/", "/vi", "/blog", "/vi/blog", "/rss.xml", "/vi/rss.xml", "/jobs"];
const escapeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

export async function GET() {
  try {
    const [en, vi] = await Promise.all([loadBlogPosts("en"), loadBlogPosts("vi")]);
    const urls = [
      ...fixed.map((path) => ({ path, updated: "", image: "" })),
      ...[...en, ...vi].map((post) => ({
        path: (post.lang === "vi" ? "/vi/blog/" : "/blog/") + post.slug,
        updated: post.updated || "",
        image: post.seo?.image || "",
      })),
    ];
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
      urls.map((item) => {
        const loc = site + item.path;
        const lastmod = item.updated ? "<lastmod>" + escapeXml(item.updated) + "</lastmod>" : "";
        const image = item.image ? "<image:image><image:loc>" + escapeXml(new URL(item.image, site).href) + "</image:loc></image:image>" : "";
        return "  <url><loc>" + escapeXml(loc) + "</loc>" + lastmod + image + "</url>";
      }).join("\n") + "\n</urlset>";
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503 });
  }
}

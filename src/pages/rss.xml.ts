import { blogPosts } from "../data/blog";

export const prerender = true;

const posts = [...blogPosts].sort((a, b) => b.date.localeCompare(a.date));
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Lumi Journal</title>
  <link>https://runlumi.app/blog</link>
  <description>Practical writing about AI operating layers, evidence-led business intelligence and bounded AI agents.</description>
  <language>en</language>
${posts.map((post) => `  <item><title><![CDATA[${post.title}]]></title><link>https://runlumi.app${post.lang === "vi" ? "/vi/blog" : "/blog"}/${post.slug}</link><guid>https://runlumi.app${post.lang === "vi" ? "/vi/blog" : "/blog"}/${post.slug}</guid><pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate><description><![CDATA[${post.description}]]></description></item>`).join("\n")}
</channel></rss>`;

export const GET = () => new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });

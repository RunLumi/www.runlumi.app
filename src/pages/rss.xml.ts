import { loadBlogPosts } from "../lib/blog-source";
import { blogFeed } from "../lib/blog-feed";

export const prerender = false;

export async function GET() {
  try {
    const xml = blogFeed("en", await loadBlogPosts("en"));
    return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  } catch {
    return new Response("Feed temporarily unavailable", { status: 503 });
  }
}

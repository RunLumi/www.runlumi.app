import type { JournalPost } from "./blog-source";

const site = "https://runlumi.app";
const escapeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

export function blogFeed(lang: "en" | "vi", posts: JournalPost[]): string {
  const base = lang === "vi" ? "/vi/blog" : "/blog";
  const title = lang === "vi" ? "Góc nhìn Lumi" : "Lumi Journal";
  const description = lang === "vi"
    ? "Ghi chép về dữ liệu, quyết định và công việc cùng AI trong doanh nghiệp."
    : "Practical writing about data, decisions and AI work in companies.";
  const items = posts.map((post) => {
    const url = site + base + "/" + post.slug;
    const pubDate = post.publishedAt ? "<pubDate>" + new Date(post.publishedAt).toUTCString() + "</pubDate>" : "";
    return "<item><title>" + escapeXml(post.title) + "</title><link>" + escapeXml(url) +
      "</link><guid isPermaLink=\"true\">" + escapeXml(url) + "</guid>" + pubDate +
      "<description>" + escapeXml(post.description) + "</description></item>";
  }).join("\n");
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    "<rss version=\"2.0\"><channel><title>" + escapeXml(title) + "</title><link>" + site + base +
    "</link><description>" + escapeXml(description) + "</description><language>" +
    (lang === "vi" ? "vi-VN" : "en-US") + "</language>\n" + items + "\n</channel></rss>";
}

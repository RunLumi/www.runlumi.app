import { getEmDashCollection, getEmDashEntry } from "emdash";
import { getBlogPost, getBlogPosts, type BlogPost } from "../data/blog";

type CmsEntry = {
  id: string;
  data: {
    title?: string;
    excerpt?: string;
    content?: unknown;
  };
};

export async function loadBlogPosts(lang: "en" | "vi"): Promise<BlogPost[]> {
  const fallback = getBlogPosts(lang);
  try {
    const result = await getEmDashCollection("posts", {
      orderBy: { published_at: "desc" },
      limit: 24,
      locale: lang,
    });
    const entries = (result.entries ?? []) as CmsEntry[];
    if (!entries.length) return fallback;

    return entries.map((entry) => {
      const known = getBlogPost(lang, entry.id);
      if (known) {
        return {
          ...known,
          title: entry.data.title || known.title,
          description: entry.data.excerpt || known.description,
          intro: entry.data.excerpt || known.intro,
        };
      }

      return {
        lang,
        slug: entry.id,
        alternateSlug: entry.id,
        title: entry.data.title || "Lumi Journal",
        description: entry.data.excerpt || "Practical notes from Lumi.",
        category: lang === "vi" ? "Góc nhìn" : "Journal",
        date: new Date().toISOString().slice(0, 10),
        updated: new Date().toISOString().slice(0, 10),
        readTime: lang === "vi" ? "Đọc trong vài phút" : "A short read",
        author: lang === "vi" ? "Ban biên tập Lumi" : "Lumi editorial",
        intro: entry.data.excerpt || "",
        sections: [],
        faq: [],
        related: [],
      } satisfies BlogPost;
    });
  } catch {
    return fallback;
  }
}

export async function loadBlogPost(lang: "en" | "vi", slug: string) {
  const fallback = getBlogPost(lang, slug);
  try {
    const result = await getEmDashEntry("posts", slug);
    const entry = result.entry as CmsEntry | null | undefined;
    if (!entry) return { post: fallback, cmsContent: undefined };
    const known = fallback ?? getBlogPosts(lang)[0];
    if (!known) return { post: undefined, cmsContent: entry.data.content };
    return {
      post: {
        ...known,
        title: entry.data.title || known.title,
        description: entry.data.excerpt || known.description,
        intro: entry.data.excerpt || known.intro,
      },
      cmsContent: entry.data.content,
    };
  } catch {
    return { post: fallback, cmsContent: undefined };
  }
}

import { getEmDashCollection, getEmDashEntry, getTranslations } from "emdash";
import type { MediaValue, PortableTextBlock } from "emdash";
import { getBlogPost, type BlogPost } from "../data/blog";

type SeoFields = {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  canonical?: string | null;
  noIndex?: boolean;
};

type CmsEntry = {
  id: string;
  data: {
    id?: string;
    slug?: string;
    status?: string;
    locale?: string;
    title?: string;
    excerpt?: string;
    content?: PortableTextBlock[];
    featured_image?: MediaValue | null;
    publishedAt?: Date | string | null;
    updatedAt?: Date | string | null;
    seo?: SeoFields;
  };
};

export type JournalPost = BlogPost & {
  featuredImage?: MediaValue | null;
  imageCaption?: string;
  seo?: SeoFields;
  publishedAt?: string;
  updatedAt?: string;
  alternateEnPath?: string | null;
  alternateViPath?: string | null;
};

function dateIso(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function bodyText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(bodyText).join(" ");
  if (value && typeof value === "object") {
    const node = value as { text?: unknown; children?: unknown };
    if (typeof node.text === "string") return node.text;
    return bodyText(node.children);
  }
  return "";
}

function readTime(content: unknown, lang: "en" | "vi", fallback?: string): string {
  const words = bodyText(content).trim().split(/\s+/).filter(Boolean).length;
  if (!words) return fallback ?? "";
  const minutes = Math.max(1, Math.ceil(words / (lang === "vi" ? 260 : 225)));
  return lang === "vi" ? minutes + " phút đọc" : minutes + " min read";
}

function mapEntry(entry: CmsEntry, lang: "en" | "vi"): JournalPost {
  const data = entry.data;
  const slug = data.slug || entry.id;
  const known = getBlogPost(lang, slug);
  const featuredImage = data.featured_image ?? null;
  const caption = featuredImage?.meta?.caption;
  const publishedAt = dateIso(data.publishedAt);
  const updatedAt = dateIso(data.updatedAt);
  const date = publishedAt.slice(0, 10) || known?.date || "";
  return {
    lang,
    slug,
    alternateSlug: known?.alternateSlug || "",
    title: data.title || known?.title || "Lumi Journal",
    description: data.excerpt || known?.description || "",
    category: known?.category || (lang === "vi" ? "Góc nhìn" : "Journal"),
    date,
    updated: updatedAt.slice(0, 10) || known?.updated || date,
    readTime: readTime(data.content, lang, known?.readTime),
    author: known?.author || (lang === "vi" ? "Ban biên tập Lumi" : "Lumi editorial"),
    intro: data.excerpt || known?.intro || "",
    sections: known?.sections || [],
    faq: known?.faq || [],
    related: known?.related || [],
    sources: known?.sources,
    featuredImage,
    imageCaption: typeof caption === "string" ? caption : undefined,
    seo: data.seo,
    publishedAt,
    updatedAt,
  };
}

export async function loadBlogPosts(lang: "en" | "vi"): Promise<JournalPost[]> {
  const result = await getEmDashCollection("posts", {
    status: "published",
    orderBy: { published_at: "desc" },
    limit: 100,
    locale: lang,
  });
  if (result.error) throw result.error;
  return (result.entries as CmsEntry[])
    .filter((entry) => entry.data.locale === lang)
    .map((entry) => mapEntry(entry, lang));
}

export async function loadBlogPost(lang: "en" | "vi", slug: string) {
  const result = await getEmDashEntry("posts", slug, { locale: lang });
  if (result.error) {
    // Some missing-slug lookups fail in the live loader instead of returning
    // null. Confirm absence with a published collection query; keep a real
    // loader failure as 503 when that query finds the requested article.
    const check = await getEmDashCollection("posts", {
      status: "published",
      locale: lang,
      where: { slug },
      limit: 1,
    });
    if (!check.error && !check.entries.some((item) => (item.data as CmsEntry["data"]).slug === slug)) {
      return { post: undefined, cmsContent: undefined, error: undefined };
    }
    return { post: undefined, cmsContent: undefined, error: result.error };
  }
  const entry = result.entry as CmsEntry | null;
  if (!entry || entry.data.locale !== lang || entry.data.slug !== slug ||
      (entry.data.status !== "published" && !result.isPreview)) {
    return { post: undefined, cmsContent: undefined, error: undefined };
  }

  const post = mapEntry(entry, lang);
  const translationResult = await getTranslations("posts", entry.data.id || entry.id);
  const translations = translationResult.error
    ? []
    : translationResult.translations.filter((item) => item.status === "published");
  const en = translations.find((item) => item.locale === "en" && item.slug);
  const vi = translations.find((item) => item.locale === "vi" && item.slug);
  if (en && vi) {
    post.alternateEnPath = "/blog/" + en.slug;
    post.alternateViPath = "/vi/blog/" + vi.slug;
    post.alternateSlug = lang === "vi" ? en.slug! : vi.slug!;
  } else {
    post.alternateEnPath = null;
    post.alternateViPath = null;
  }
  return { post, cmsContent: entry.data.content, error: undefined };
}

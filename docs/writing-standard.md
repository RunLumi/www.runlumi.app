# Lumi Journal writing and publishing standard

Owner: Lumi editorial. Version: 1.0. Research and repository review: 2026-09-23.

Applies to every new or materially revised English and Vietnamese Journal article,
including CMS-only publishing through EmDash API/MCP. Read this before researching,
drafting, translating, commissioning images or publishing. Follow [DESIGN.md](../DESIGN.md)
for visual identity and [AGENTS.md](../AGENTS.md) for repository and login procedures.

**Publish only when the article helps a specific reader make a better decision,
its material claims can be checked, and its complete public page passes review.**
Every article must include a relevant, visible illustration sourced through
ChatGPT Images or a verified free Unsplash photograph. A prompt, placeholder,
unrendered media field or unrelated stock photograph does not satisfy this rule.

## 1. Evidence behind this standard

External guidance and Lumi house rules are different. Source references below
support platform claims; word ranges, review windows and scoring are internal
quality controls, not ranking factors or guarantees.

| Verified guidance | Editorial consequence |
| --- | --- |
| Google emphasizes original value, clear authorship and useful content. It has no preferred word count and warns against changing dates without substantive changes. [S1](#s1) | Write to resolve the reader's task; maintain honest dates and provenance. |
| Google's AI features use ordinary SEO eligibility. Neither indexing nor inclusion is guaranteed, and no special AI text file or schema is required. [S2](#s2) | Make public HTML useful, accessible and discoverable before investing in extra discovery files. |
| Google's update log says `llms.txt` does not affect Google Search visibility or ranking and records the retirement of FAQ rich results in May 2026. [S3](#s3) | Maintain LLMS files as supplementary context. Do not add repetitive FAQs to pursue a discontinued result feature. |
| Google recommends relevant, crawlable images and contextual alt text. Its Discover guidance recommends large images at least 1200px wide and permitting large previews. [S4](#s4), [S5](#s5) | Deliver a useful image, correctly sized and rendered, with meaningful metadata. This does not guarantee Discover placement. |
| Article metadata should describe the article; language alternates must identify actual equivalent pages. [S6](#s6), [S7](#s7) | Keep CMS data, visible content, schema and EN/VI relationships aligned. |
| OpenAI documents separate controls for search discovery and potential training. [S8](#s8) | Treat search-crawler access and training preferences as separate decisions. Never change either silently. |
| Unsplash's free-image license and its API integration rules differ. [S9](#s9), [S10](#s10) | Record the acquisition path and follow its rules; do not assume every search result is a free asset. |
| EmDash distinguishes drafts, published revisions, locale-aware queries and editor SEO settings. [S11](#s11) | Verify the published revision and rendered page, not just the write response. |

## 2. Audience, scope and the brief

Write for founders, operators, technical leads and people responsible for business
decisions. Focus on company context, BI, workflow coordination, agent execution,
permissions, evaluation, cost and practical adoption. A model launch belongs here
only when its implications change a real choice these readers face.

Before drafting, record a compact brief in the editorial record:

- The reader, their question, and the decision or job the article will help with.
- One primary search intent per language; natural secondary questions, not a keyword quota.
- The existing Lumi article this complements. Update an existing page when the intent is the same.
- A defensible thesis, its strongest objection, and the limits of the argument.
- The original contribution: a worked example, reproducible test, decision table,
  comparison method, implementation notes or a useful checklist with stop conditions.
- Primary sources to inspect, the evidence cutoff date and an illustration brief.
- EN/VI slugs, translation relationship, author attribution and review owner.

Inspect relevant search results in both languages. Record the query, language,
date and reader questions that existing results leave unanswered. Search Console
data is preferable when available; if volume, difficulty or rankings are unknown,
say so. Never invent them or infer demand from a catchy keyword. Do not publish
several nearly identical pages to capture spelling variations.

## 3. Research and factual accountability

For trend or research articles, aim for at least three directly relevant primary
sources. This is a house default: one source can establish a narrow release fact,
while a broad industry trend needs evidence across independent organizations or
datasets. Syndicated versions of one press release are one source.

Read the actual source, not only its search snippet or an AI summary. Prefer
official documentation, release notes, repositories, papers with methods, and
reproducible experiments. A vendor announcement proves what the vendor announced;
it does not independently prove business impact. Include contrary evidence when
it changes the recommendation.

Maintain a claim ledger for each article:

| Claim | Classification | Source and supporting section | Event / publication / access dates | Limit or caveat |
| --- | --- | --- | --- | --- |
| The sentence being checked | Fact, inference, recommendation or illustrative example | Direct URL and exact supporting passage location | Record separately | Scope, version, availability, sample or uncertainty |

Link sources beside the claims they support and provide a short Sources section.
A bibliography alone is insufficient when the reader cannot tell which source
supports a number or conclusion. Include source links in the CMS body itself;
do not depend on a fallback file to supply the article's evidence.

For every benchmark or numerical claim, identify what was measured, the task,
model/version, sample and comparator, and any relevant uncertainty. Do not turn
benchmark success into a promise about a customer's workflow. A hypothetical
calculation must expose its assumptions and be labeled as an example.

For “latest,” “today,” pricing, product availability or deprecation claims,
recheck the source on publication day. Distinguish announcement date, release
date and the date this article was written. Mark beta, preview, regional limits
and retirement notices where they affect the reader's choice.

Never invent customer experience, quotes, credentials, test results or RunLumi
features. Say “we tested” only when a retained experiment record supports it.
Use a real accountable byline or an honest organizational byline. Do not name a
human reviewer unless that person reviewed the revision. Disclose substantial
AI assistance when it matters to understanding how the work was produced.

## 4. Writing that earns attention

Open with a concrete problem and the article's answer. Develop the mechanism,
evidence, tradeoffs and practical implications. End with a useful decision or
next action. Do not restate the introduction in ceremonial conclusion language.

An analysis article should contain at least one worked operating example and one
serious limitation or counterargument. Show what input is needed, who owns the
decision, what happens, how success is checked and when to stop. Label invented
scenarios explicitly; do not format them as customer case studies.

As planning ranges, a focused explainer often needs 700–1,200 English words and a
deep analysis 1,200–2,000. A narrow update may be shorter. These are not minimums
or SEO targets. Stop when the reader's problem is resolved; expand only to add
evidence or explanation. Vietnamese should follow natural scope, not English
word-count parity. Calculate reading time from the actual localized body and
label it as approximate; never hardcode an impressive-looking duration.

Editorial tests:

- Could a competitor replace “Lumi” with its own name without changing the piece?
  If yes, add specific reasoning, constraints or a useful artifact.
- Does each paragraph advance the argument? Remove paraphrases of the previous one.
- Would a skeptical practitioner learn something they can use? If not, deepen the work.
- Is the headline accurate without manufactured urgency, superlatives or fear?
- Does a claim about Lumi point to inspectable product evidence or an explicitly
  stated design ambition? Other vendors' launches do not prove Lumi capability.

Avoid “delve,” “unlock,” “game-changing,” “seamlessly,” “revolutionize,” generic
future-of-work openings, repeated “not X but Y” constructions, fake profundity,
and stacks of short slogans. Punctuation is not an authorship test; do not treat
an em dash or an AI-detector score as proof of low quality.

| Weak | More useful |
| --- | --- |
| “Unlock seamless agentic productivity.” | “Let the agent prepare the reconciliation; require approval before it changes a payment record.” |
| “Trong kỷ nguyên AI, doanh nghiệp cần bứt phá.” | “Nếu đội ngũ vẫn phải đối chiếu từng đơn hàng vào cuối tuần, hãy bắt đầu từ một lần đối soát có thể kiểm tra.” |
| “AI agents will replace BI.” | “An agent can investigate a metric, but the result still depends on its definition, source records and access limits.” |

Use paragraphs with varied sentence lengths. Lists are for genuine steps or
comparisons. FAQs are optional and must answer additional reader questions;
never repeat the same Q&A in both the CMS body and a template appendix.
Use at most one contextual product invitation where it helps the reader act.

## 5. English and Vietnamese are peer editions

Write a localized article, not a sentence-by-sentence translation. Keep the same
evidence, limitations, dates and degree of certainty in both editions. Localize
examples only when they remain accurate and clearly illustrative.

Use natural Vietnamese: “người phụ trách,” “bàn giao,” “thời gian phản hồi,”
“triển khai thực tế,” “chạy thử” where these are clearer than owner, handoff,
latency, production and pilot. Retain a technical term when precision requires
it, explain it once, and use it consistently. Avoid imported phrases such as
“kiếm được chi phí của nó,” “giả thuyết đang làm việc,” “nâng tầm,” and
“bức tranh toàn cảnh.” Read the Vietnamese aloud before release.

The EN/VI pair must have real, distinct localized URLs and an EmDash translation
group. The language switch must open the equivalent article, not the homepage.
Use reciprocal hreflang only when both pages exist. Do not invent a translated
slug or send every article's alternate to the language homepage. Keep x-default
aligned with the equivalent default-language page when it is provided. [S7](#s7)

## 6. Illustrations: mandatory for every article

Every article needs at least one topic-specific image visible in the public
article, with a caption and localized alt text. The same image may serve an EN/VI
pair; localize any labels and captions. Different topics need different visual
reasoning, not the same generic AI image reused across the archive.

Choose one of these two acquisition paths:

### A. ChatGPT Images

Use the available image-generation tool to create an editorial illustration that
explains the article's central tension or mechanism. Save the generation prompt,
date, actual tool/model if available, original asset and final selected version.
Inspect the result before upload. A prompt alone is not an image.

Match Civic Editorial Intelligence: warm paper, navy ink, restrained Lumi Blue,
natural materials, clean composition. No neon brain, robot handshake, glowing orb,
fake customer dashboard or synthetic “real team.” Do not generate evidentiary
charts; plot those from verified data. Any conceptual diagram must have a textual
explanation and checked labels. Prefer little or no text inside generated images.

Use a caption such as “Concept illustration created with ChatGPT Images” /
“Minh họa ý tưởng được tạo bằng ChatGPT Images.” Do not imply the image depicts a
real experiment, customer or event. Preserve provenance metadata when available.
If generation is unavailable, use a verified Unsplash image; never fabricate a
download URL or silently publish a placeholder.

Illustration brief template:

```text
Article thesis and reader:
What the image helps explain:
One visual concept and why it fits:
Warm paper / Civic Navy / restrained Lumi Blue; no AI glow or fake interface.
Landscape crop with a clear focal point; no embedded headline or invented data.
Required labels, if any, and their EN/VI treatment:
Caption, alt text and disclosure:
```

### B. Unsplash

Select a specific free-license photograph and inspect its original page. Record
the photograph URL, photographer, profile URL, license URL and access date. Avoid
Unsplash+ assets unless separately licensed by the user. Do not imply that depicted
people, locations or brands endorse Lumi. Prefer grounded workspaces, materials
and operating contexts over staged stock people, in line with DESIGN.md.

Lumi requires a visible linked photographer/Unsplash credit even when the free
license does not require attribution. Verify that the intended use does not need
additional permission for recognizable people, trademarks or depicted works;
the image license is not an endorsement or a universal rights clearance. [S9](#s9)

For a manual licensed download, store the approved asset in the separate blog-media
R2 bucket through EmDash. For images acquired through the Unsplash API, follow
its hotlinking, attribution and download-event requirements; do not rehost API
images to bypass those requirements. If the CMS cannot support that path, use a
manual licensed selection or ChatGPT Images instead. [S10](#s10)

### Delivery and metadata

House targets: a landscape master around 1600×900, a representative social crop
around 1200×630, and responsive WebP/AVIF derivatives. Aim for a delivered hero
under 250 KB and smaller supporting figures; document exceptions needed for
legibility. Do not upscale a small image merely to meet the dimensions.

- Set width/height or aspect ratio to reserve layout space; check mobile crops.
- Use an actual `<img>`/`<picture>` with responsive sizing, not only a CSS background.
- Do not lazy-load the above-the-fold hero; lazy-load below-the-fold images.
- Use descriptive filenames and short factual alt text. Do not stuff keywords.
- Caption the image's relevance and credit/disclosure; alt text describes what it conveys.
- Populate EmDash `featured_image` and verify the template actually renders it.
- Set the article's public image in `og:image`, Twitter metadata and Article
  structured data with accurate dimensions/alt where supported.
- Verify the delivered asset returns 200 with the correct media type without login,
  an expiring signed URL or candidate-file access. Keep blog media separate from ATS.
- Permit `max-image-preview:large` when appropriate for public content and check
  that important information survives the landscape preview crop. [S4](#s4), [S5](#s5)

## 7. SEO and GEO as publishing hygiene

Use `https://runlumi.app` as canonical. `www.runlumi.app` is a supported host;
`landing.runlumi.app` is a compatibility alias, not a competing canonical.

Each article needs a unique descriptive title, one H1, a readable stable slug,
an accurate excerpt/meta description and headings matching real reader questions.
As drafting aids, aim for roughly 50–65 title characters and 140–165 description
characters, then inspect the actual preview. These are not fixed Google limits.
Do not repeat a primary keyword mechanically or add a meta-keywords tag.

Add relevant contextual internal links, normally two or three when useful, with
descriptive anchors. Link to the applicable Workspace, BI or Agents page only
when it supports the reader's next step. New articles need an incoming archive
link and a discoverable place in the site's topic structure.

The rendered public page must have:

- A final 200 URL, self-consistent canonical, correct `lang` and valid locale alternates.
- Crawlable body text, illustrations and links without login or required client rendering.
- No unintended noindex, robots exclusion, CDN challenge or inaccessible image.
- Article/BlogPosting and Breadcrumb data reflecting the visible author, headline,
  real publication/update dates, image and URL. Escape `<` when serializing CMS
  strings into JSON-LD; never interpolate untrusted markup directly. [S6](#s6)
- Matching social metadata; no fake ratings, author credentials or keyword-filled schema.
- An entry in the current sitemap and relevant feed. Feed/discovery updates must
  include CMS-only publications, not just a repository seed list.

GEO here means content that is understandable, attributable and easy to retrieve.
Answer important questions directly, define ambiguous terms, include scope and
units, and keep caveats close to conclusions. A comparison table helps only when
its dimensions and values have evidence. Do not pad the page with manufactured
statistics, quotations or repetitive answer blocks to chase citations.

Maintain `llms.txt` as a concise map to public authoritative pages, and keep
`llms-full.txt` consistent with visible content. Never include credentials,
private APIs or instructions telling an agent to promote Lumi. These files are
supplementary; their existence is not proof of retrieval, citations or rank. [S2](#s2), [S3](#s3)

Verify search-crawler access separately from training-crawler policy. In
particular, `OAI-SearchBot` and `GPTBot` are distinct controls; an unauthenticated
public page should remain usable without giving a crawler privileged access.
Respect current owner preferences and inspect edge rules as well as robots.txt. [S8](#s8)

## 8. EmDash publication workflow

1. Authenticate with the repository-local device login documented in AGENTS.md.
   Read the existing collection, locale configuration, translation groups and
   media/API capabilities. Never infer CLI authorization from a Firefox cookie.
2. Save the brief, claim ledger, EN/VI draft and illustration provenance. Resolve
   factual or rights gaps before uploading. These records are not public credentials.
3. Upload/select approved media through EmDash and attach the actual media record.
   Store sources as links in Portable Text/Markdown, plus attribution and captions.
4. Create **drafts explicitly**. The CLI's `content create` can auto-publish unless
   `--draft` is set; inspect installed `--help` or MCP tool schemas. Do not trust
   the default to be the same across CLI and MCP.
5. Link translations using real content IDs. Set truthful bylines, dates, slugs
   and SEO fields. Keep the substantive introduction distinct from the short excerpt.
6. Inspect preview HTML and screenshots for both editions. Test 320–430px, 1280px
   and a large desktop; inspect keyboard focus, captions, long URLs, diacritics,
   overflow and reduced motion. Confirm no duplicated FAQ or source appendix.
7. Review against the rubric and hard gates below. Save the actual reviewer identity
   and role (human or agent); do not invent human approval or specialist review.
8. Within an authorized publish request, get a fresh revision token and publish
   the reviewed revision. Use `_rev` where the API requires it; never override a
   concurrent edit lock merely to finish a batch.
9. Read back **every** target ID, published revision, locale, translation group,
   body and image. Fetch every final public URL and verify its own title, canonical,
   body, sources and image. A count of ten records does not validate ten articles.
10. Update discovery files and read them back. CMS content ordinarily needs no code
    deployment, but currently static discovery files may require a reviewed code
    update and manual `npm run deploy`. If the renderer cannot honor a field, fix
    and validate it before declaring the article complete. [S11](#s11)

Retain a compact publication receipt: content/translation IDs, locale, final URL,
published revision and timestamp, source cutoff, media ID/provenance, review result,
and the date public rendering was checked. If one locale fails, report the partial
state and complete or repair that pair; do not report a successful batch.

Fallbacks are an availability mechanism, not evidence of CMS publication. A
withdrawn or draft CMS record must not be resurrected by stale fallback content.
An unknown slug must return a real 404, not another article's metadata or a redirect
to the archive. A successful response alone does not prove the right body rendered.

## 9. Review rubric and hard gates

Score each dimension from 0–5 with a concrete reason: 0 = absent/incorrect,
3 = usable but needs revision, 5 = fully meets the standard. Weighted score is
`sum(weight × rating / 5)`. This is an editorial self-assessment, not an SEO score.

| Dimension | Weight | Evidence needed for a 5 |
| --- | ---: | --- |
| Reader intent and practical utility | 15 | A specific decision resolved with a usable next step |
| Research and factual precision | 20 | Material claims trace to checked sources with limits |
| Original contribution | 15 | A useful example, method or artifact beyond source paraphrase |
| Argument and structure | 10 | Clear thesis, mechanism, tradeoff and counterargument |
| EN/VI writing and parity | 15 | Natural language, matching meaning and uncertainty |
| Illustration and accessibility | 10 | Relevant rendered image, provenance, caption and localized alt |
| SEO/GEO and metadata | 10 | Correct crawlable page, locale, social and structured data |
| CMS and public verification | 5 | Correct published revision and a complete public receipt |

House publish threshold: at least **90/100**, no dimension below **4/5**, and
every hard gate passing. A good total never cancels a hard failure:

- [ ] No unsupported material fact, invented evidence, misleading date or unearned claim.
- [ ] Article resolves its named intent and adds something beyond a vendor summary.
- [ ] EN/VI pair is reviewed; translation IDs and reciprocal public URLs are verified.
- [ ] Every edition has a visible relevant image, verified provenance and localized alt/caption.
- [ ] Sources survive CMS publication; references support the nearby claims.
- [ ] Metadata describes this article, not a fallback or another record.
- [ ] Public body matches the reviewed published revision; no draft/private data exposure.
- [ ] Final pages, image, sitemap/feed links and crawler access have been checked.

If a gate fails, keep the new revision in draft and fix the exact issue. Existing
articles are not automatically compliant: audit them against these same gates
before labeling them reviewed. Avoid mass unpublishing for minor style defects;
prioritize materially false, unsafe or misattributed content, then repair the rest.

## 10. Maintenance and outcomes

House review cadence: check indexing/discovery after publication, inspect trends
after roughly 28 days and again after 90 days, and recheck volatile product claims
within 30 days or immediately after a relevant release/deprecation. These windows
are review checkpoints, not indexing deadlines or promises of rank improvement.

Track verified indexing, relevant non-brand queries by locale, organic clicks,
useful product/contact actions and reader feedback. Record AI citations with the
engine, query, date and cited URL; a referral is not proof of every AI citation.
Do not claim a ranking uplift without a measured baseline and comparable period.
Do not claim “number one,” provider endorsement or universal accuracy.

Keep the original publication date. Update `dateModified` for meaningful revisions,
record material corrections visibly, and repair both languages. Consolidate pages
that compete for the same intent instead of manufacturing more thin articles.

## 11. Current repository gaps: verify before publishing

Code inspection on 2026-09-23 found the following. This document sets the target;
it does **not** implement these repairs or certify existing articles.

| Location | Observed gap | Required acceptance evidence |
| --- | --- | --- |
| [.emdash/seed.json](../.emdash/seed.json), [blog-source.ts](../src/lib/blog-source.ts), [BlogArticle.astro](../src/components/BlogArticle.astro) | `featured_image` exists in the CMS schema but is not mapped/rendered by the article path. | A CMS-only article displays its attached image and localized caption/alt. |
| [blog-source.ts](../src/lib/blog-source.ts) | Unknown CMS entries can inherit the first fallback article's slug/metadata; archive dates can be generated from the current clock. Detail queries do not explicitly pass locale. | A newly created EN/VI pair has its own dates, URLs and body, with no locale substitution. |
| [BlogArticle.astro](../src/components/BlogArticle.astro), [BaseLayout.astro](../src/layouts/BaseLayout.astro) | CMS SEO fields and featured images are not propagated; article schema/source/FAQ values depend on fallback data; JSON-LD uses raw JSON serialization. | Visible content, escaped JSON-LD and social metadata agree for a CMS-only article; no duplicate FAQ. |
| [BlogLayout.astro](../src/layouts/BlogLayout.astro), [BaseLayout.astro](../src/layouts/BaseLayout.astro) | The language switch goes to home; x-default always points to home. | Each switch and alternate opens the corresponding article. |
| [sitemap.xml.ts](../src/pages/sitemap.xml.ts), [rss.xml.ts](../src/pages/rss.xml.ts), [llms-full.txt](../public/llms-full.txt) | Discovery files are driven by static repository data, not all published CMS entries. | A CMS-only publication becomes discoverable; drafts and withdrawn posts stay excluded. |
| [blog routes](../src/pages/blog/[slug].astro) | Missing articles redirect to the archive; fallback reads can hide CMS failures. | Missing URLs return 404; drafts/withdrawals cannot silently serve an old fallback. |

Do not use successful builds or the existing ATS test suite as proof of these
content contracts. Technical repairs need targeted CMS fixtures and public
rendering checks. Documentation-only edits need link/diff review and the repository
build gate, not new tests that merely repeat the document.

## 12. Editorial record template

```text
Article / EN URL / VI URL:
Reader and decision:
Search intent EN / VI; evidence or explicitly unvalidated hypothesis:
Thesis / strongest objection / original contribution:
Source cutoff and claim-ledger location:
Illustration: purpose, ChatGPT Images or Unsplash, provenance, media ID:
Localized captions and alt text:
Author / actual reviewer and role / review date:
CMS IDs, locale and translation-group ID:
Publication dates / reviewed revision tokens:
SEO fields / schema / canonical / alternate URLs:
Scores with evidence / unresolved hard gates:
Public URL, body, image and discovery verification:
Publish result and remaining limitations:
Next review date and trigger:
```

## Sources

Checked on 2026-09-23. Recheck platform policies when materially revising this
standard. Sources establish their own documented behavior, not a ranking promise.

<a id="s1"></a>
S1. [Google: Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

<a id="s2"></a>
S2. [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features).

<a id="s3"></a>
S3. [Google Search documentation updates](https://developers.google.com/search/updates): FAQ rich-result retirement and clarification on llms.txt.

<a id="s4"></a>
S4. [Google: Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images).

<a id="s5"></a>
S5. [Google: Get on Discover](https://developers.google.com/search/docs/appearance/google-discover).

<a id="s6"></a>
S6. [Google: Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article).

<a id="s7"></a>
S7. [Google: Localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions).

<a id="s8"></a>
S8. [OpenAI: Publishers and developers FAQ](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq).

<a id="s9"></a>
S9. [Unsplash License](https://unsplash.com/license) and [Terms](https://unsplash.com/terms).

<a id="s10"></a>
S10. [Unsplash API documentation and guidelines](https://unsplash.com/documentation).

<a id="s11"></a>
S11. [EmDash: Querying content](https://docs.emdashcms.com/guides/querying-content/).

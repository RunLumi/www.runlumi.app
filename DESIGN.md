# Lumi Landing Design System

> Marketing adaptation of the canonical Lumi design language in
> `RunLumi/lumi-agents/DESIGN.md`. The shared Lumi identity is authoritative.
> This file narrows that system for `runlumi.app`; it does not invent a second brand.

## 0. Purpose

The landing page has one job:

> Make a serious operator understand, in under a minute, that Lumi is an AI operating
> layer that works across the software, data, and workflows a company already uses.

It must communicate **vision + system + evidence + a concrete next step** without becoming
an AI spectacle, a four-product catalogue, or a consulting brochure.

The page should feel closer to a beautifully edited operating manual, annual report,
or systems map than a conventional startup template.

---

# 1. Shared Lumi identity

Preserve these ideas from the canonical design system:

- **Civic Editorial Intelligence** — institutional trust, editorial clarity, warm human texture.
- **Lit operating desk** — warm paper is the desk; white sheets are evidence and work.
- **Light only** — no dark theme. One intentional Civic Navy editorial inversion is allowed.
- **One type family** — Geist for display/body, Geist Mono only for technical fragments.
- **Folded-L geometry** — precise corners, brackets, rails, negative space, handoff lines.
- **Restrained material depth** — navy-tinted shadows, lit top edges, no generic floating SaaS cards.
- **Evidence before performance** — sources, freshness, permissions, approvals, worklogs.
- **Unconventional restraint** — fewer things, better ordered, with stronger meaning.

The landing page should never visually drift toward futuristic, magical, cyberpunk,
robotic, gamified, crypto-like, or trend-chasing AI aesthetics.

---

# 2. Positioning

## 2.1 Company-level proposition

Lumi is not presented as four unrelated products.

The system is:

```text
People
  ↕
Lumi Autonomous Assistant
  ↕
AI Workspace · Lumi BI · Lumi Agents
  ↕
Company Context
(memory · evidence · permissions · workflows · models · audit)
  ↕
The software the company already uses
```

The page therefore sells a **new operating model for the company**, not a collection of features.

## 2.2 Product roles

- **Lumi AI Workspace** — coordinate people, decisions, commitments, risks, and operating work.
- **Lumi BI** — understand the business and trace conclusions to evidence.
- **Lumi Agents** — execute bounded digital jobs with tools, worklogs, and approvals.
- **Lumi Autonomous Assistant** — the universal front door for delegation across the stack.

The Assistant is the interface across the system, not merely a fourth equal tile.

---

# 3. Visual philosophy

## 3.1 The mass-love layer

A first-time visitor should immediately feel:

> “This is clear, useful, and trustworthy.”

Require:
- obvious hierarchy;
- readable type;
- familiar navigation;
- one message per section;
- no clever interaction required to understand the system.

## 3.2 The designer-praise layer

A strong designer should notice:

> “This is restrained, consistent, unusually well edited.”

Require:
- intentional whitespace;
- precise grid;
- strong typographic rhythm;
- quiet paper texture;
- repeated folded-L line geometry;
- material states with a reason.

## 3.3 The operator layer

A CEO or operator should understand:

1. what Lumi is;
2. where it sits in the company;
3. what each product does;
4. how work moves through the stack;
5. why it can be trusted;
6. what to do next.

Visual polish that does not improve one of those six outcomes is not completion.

---

# 4. Material model

Lumi is a **lit operating desk**.

| Cue | Meaning | Landing expression |
|---|---|---|
| Paper | calm reading surface | warm page canvas |
| Sheet | product/evidence/work | white surface, 1px border, lit top edge |
| Ink | authority | Civic Navy / Ink, never pure black |
| Mark | provenance/attention | small blue rail, dot, bracket, clarity mark |
| Lift | interaction | navy-tinted elevation only |
| Glass | floating chrome | header only; never marketing content |
| Seal | authority | primary Lumi Blue CTA |
| Inversion | one editorial interruption | Civic Navy context section only |

Every visible material needs a physical reason. Remove decoration that does not explain
hierarchy, state, affordance, provenance, or system structure.

---

# 5. Canonical color contract

Use the shared Lumi values exactly.

```css
--color-lumi-blue: #006093;
--color-lumi-blue-hover: #004F80;
--color-lumi-blue-active: #003E6A;
--color-lumi-blue-soft: #E4F3FC;

--color-civic-navy: #102A43;
--color-ink: #172033;
--color-soft-slate: #5E6677;

--color-paper-white: #F4F0E8;
--color-surface-white: #FFFFFF;
--color-archive-gray: #E7EAF0;
--color-border-subtle: #E7EAF0;
--color-border: #D9DEE8;
--color-border-strong: #C8D0DE;

--color-signal-amber: #F4A62A;
--color-amber-soft: #FFF4DC;
--color-risk-red: #C2410C;
--color-red-soft: #FFF1EC;
--color-success-green: #1F7A4D;
--color-green-soft: #E9F7EF;
```

Color temperament:

- **Paper / white / navy / slate:** 85–95%.
- **Lumi Blue:** 3–8%.
- **Status colors:** only when they carry real semantics.
- **Decorative color:** 0%.

Blue is authority, not wallpaper. A whole hero line does not need to be blue to feel like Lumi.

---

# 6. Typography

## 6.1 Family

```css
--font-sans:
  Geist, "Noto Sans", "Noto Sans Thai", "Noto Sans Arabic", "Noto Sans Devanagari",
  "Noto Sans JP", "Noto Sans KR", "Noto Sans SC", "Noto Sans TC",
  ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

--font-mono:
  "Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
```

One family. Authority comes from weight and tracking, not a second display face.

## 6.2 Marketing hierarchy

Hero:

```css
font-size: clamp(42px, 7vw, 88px);
line-height: .96;
font-weight: 700;
letter-spacing: -.055em;
```

Hero body:

```css
font-size: clamp(18px, 2vw, 22px);
line-height: 1.55;
font-weight: 400;
```

Section headings should be large enough to read editorially but must not compete with the hero.

Rules:
- Civic Navy headings, never black.
- Body copy 16px minimum.
- Metadata 12px minimum.
- Tabular numbers for times, indexes, metrics.
- Test Vietnamese line breaks and diacritics.
- No ornamental italics, decorative serif, or fake editorial flourish.

---

# 7. Grid and spacing

Canonical desktop outer bound: **1200px**.

```css
desktop: 12 columns · 24px gap · ~80px outer breathing room
tablet: 40px outer margin · 20px gap
mobile: 20px outer margin · 16px gap
```

Spacing scale:

```css
4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96
```

Use whitespace to separate ideas, not to manufacture luxury.

Each section must answer one question:

- What is Lumi?
- How does the stack fit together?
- What does a day with Lumi look like?
- What does the system know?
- What does each product do?
- How does Lumi fit the existing software stack?
- Why should I trust it?
- What should I do next?

If a section answers two unrelated questions, split it.

---

# 8. Geometry and materials

## 8.1 Radius

```css
2px  tiny evidence detail
4px  compact detail
8px  cards, buttons, inputs
12px popovers
16px large CTA / editorial sheet
999px true chips only
```

No giant rounded SaaS panels. No playful blobs.

## 8.2 Borders

- 1px archival borders.
- 2px focus ring.
- 3px semantic severity rail only.
- Avoid boxing every row.
- Lines should feel like document structure and systems diagrams.

## 8.3 Elevation

Use navy-tinted shadows from the canonical system.

```css
--shadow-card:
  inset 0 1px 0 0 color-mix(in oklch, white 60%, transparent),
  0 1px 2px -1px color-mix(in oklch, #102A43 8%, transparent),
  0 8px 20px -10px color-mix(in oklch, #102A43 10%, transparent);

--shadow-button:
  inset 0 1px 0 0 color-mix(in oklch, white 22%, transparent),
  0 1px 2px 0 color-mix(in oklch, #102A43 22%, transparent);
```

No black drop shadows. No colored glow.

---

# 9. Landing-page composition

The page should read as a **field guide to the AI-native company**.

## 9.1 Hero — declare the new operating model

Do not use:
- product screenshot collage;
- video;
- orb;
- abstract 3D AI object.

Use:
- large thesis headline;
- short explanatory body;
- one primary CTA + one quiet secondary CTA;
- a compact **system index** showing how Assistant / Workspace / BI / Agents fit together.

The right side of the hero should already prove that Lumi is a system.

## 9.2 Operating verbs

Immediately after the hero, establish the conceptual loop:

> **Connect → Understand → Decide → Act**

These are not feature labels. They are the company-level operating loop that the products support.

## 9.3 Stack — architecture is the product story

The stack diagram is the visual centerpiece.

Hierarchy:

```text
Assistant
   ↓
Workspace · BI · Agents
   ↓
Company Context
   ↓
Existing Software
```

Use system lines and sheets, not a feature-card wall.

## 9.4 A day with Lumi

Show one continuous workday across products.

The visitor should see that people do not need to think:

> “Which Lumi app do I open?”

The work moves through the system naturally.

## 9.5 One company context

One intentional Civic Navy inversion may explain the shared context layer.

It must remain editorial, not a dark mode:
- no neon;
- no glow;
- no cyber grid;
- no colorful nodes.

## 9.6 Product chapters

Products are **editorial chapters**, not four equal cards.

Each chapter contains:
1. role;
2. product name;
3. one strong proposition;
4. concise explanation;
5. a small inspectable product artifact / schematic.

The artifact should look like real work:
- Workspace → ranked brief / decision;
- BI → metric → driver → records;
- Agents → goal → tools → worklog → approval;
- Assistant → request → routing → result.

Avoid fabricated customer data and fake vanity metrics.

## 9.7 Existing stack

Say the strategic truth plainly:

> Don't replace the SME software stack. Make it intelligent.

Show the adoption loop:

> Connect → Understand → Decide → Act

## 9.8 Trust

Trust is not a footer compliance strip.

Make these first-class product concepts:
- evidence;
- permissions;
- human judgment;
- inspectable execution.

## 9.9 CTA

One concrete next step:

> Start with one real workflow.

No countdown, no urgency theatre, no “book a demo” boilerplate if a more human action works.

---

# 10. Iconography

Use minimal line geometry that feels related to the folded-L mark:
- brackets;
- rails;
- annotation dots;
- document corners;
- simple directional paths.

Stroke: 1.75–2px.

Avoid:
- emoji;
- cartoon icons;
- 3D icons;
- gradient icon tiles;
- generic sparkle overload;
- mixed icon packs.

The four-point clarity mark means Lumi found, clarified, or verified something useful.
Use it rarely.

---

# 11. Photography

Photography exists to make Lumi feel grounded in real work, not to decorate the page.

Use:
- real shops, counters, warehouses, desks, paperwork, laptops, stock, tools;
- natural or available light;
- editorial framing;
- people absorbed in work rather than posing at camera;
- muted, believable color;
- images that reveal a real operating environment.

Avoid:
- handshake imagery;
- staged executive portraits;
- fake diversity collages;
- smiling call-center teams;
- futuristic blue rooms;
- generic “business success” stock photography;
- photos whose only message is “people in an office.”

Photography should appear as an editorial interruption between conceptual sections.
Do not place a full-bleed photo behind the hero headline.

When using Unsplash:
- use free-license images only, not Unsplash+;
- link the photographer/source in the caption;
- preserve meaningful alt text;
- crop with CSS rather than distorting the image;
- keep saturation slightly restrained so photographs live inside the Lumi paper system.

---

# 12. Language

The best Lumi copy sounds like a capable person explaining the product across a table.

Prefer:
- plain verbs;
- short sentences;
- familiar business words;
- one claim at a time;
- concrete effects on daily work;
- quiet confidence.

Replace abstract technology language whenever ordinary language says the same thing.

Prefer:
> Keep the systems that work. Make them work together.

Over:
> Add an intelligent orchestration layer to your existing technology stack.

Prefer:
> Hỏi doanh nghiệp. Lần theo bằng chứng.

Over:
> Khai thác dữ liệu bằng nền tảng AI thông minh đa tác tử.

Product names may contain “AI”, “Agents”, or “Autonomous” where those are the actual names.
Do not repeat those terms in surrounding copy merely to signal modernity.

Vietnamese should be chân phương, tự nhiên, mềm và chắc:
- tránh dịch sát tiếng Anh;
- tránh “tối ưu hóa”, “đột phá”, “nâng tầm”, “cách mạng hóa” nếu không có nghĩa cụ thể;
- ưu tiên cách nói một người chủ doanh nghiệp có thể nói lại cho người khác ngay sau khi đọc.

---

# 13. Motion

No video dependency.

Allowed:
- 120–180ms hover/focus transitions;
- 1px sheet lift;
- subtle line/rail state changes;
- no motion required to understand any content.

Forbidden:
- looping decorative motion;
- AI typing theatre;
- sparkle animation;
- parallax spectacle;
- bouncy spring effects.

Honor `prefers-reduced-motion`.

---

# 14. Copy

Lumi speaks like:
- a precise operating assistant;
- a calm chief of staff;
- a trustworthy analyst;
- a clear editor.

Use:
- short sentences;
- specific nouns;
- action verbs;
- visible ownership;
- evidence-based claims.

Avoid:
- “unlock productivity”;
- “supercharge your team”;
- “10x your workflow”;
- “AI-powered magic”;
- “revolutionize operations”;
- “seamlessly leverage”.

English and Vietnamese should communicate the same idea, not translate word-for-word when that hurts clarity.

---

# 15. Anti-patterns

Never ship:

- AI glow;
- neon or purple/blue startup gradients;
- 3D orb / brain / robot;
- floating dashboard collage;
- all-glass marketing surfaces;
- giant pill buttons;
- fake customer logos;
- fake testimonial quotes;
- invented ROI;
- unverified security badges;
- unexplained technical acronyms;
- repeated equal feature cards;
- unnecessary animation;
- four products presented as four isolated companies.

---

# 16. Accessibility and quality

- WCAG AA body text.
- 16px minimum body.
- Visible keyboard focus.
- 44px preferred touch hit area.
- 320px reflow without horizontal page scroll.
- Vietnamese tested without shrinking type.
- Reduced motion respected.
- Header glass must have an opaque fallback.
- The page must remain fully understandable with CSS motion disabled.
- Product claims must match actual or intentionally stated roadmap capability.

---

# 17. Review gate

Before merging a visual change:

- [ ] Is the page still unmistakably Lumi?
- [ ] Are canonical colors unchanged?
- [ ] Is blue used as authority rather than decoration?
- [ ] Is Paper White still the dominant canvas?
- [ ] Does each section answer one question?
- [ ] Does the hero explain the operating model before listing products?
- [ ] Does the stack read as one system?
- [ ] Does Assistant read as the front door rather than an isolated fourth tile?
- [ ] Are product visuals inspectable work rather than fake screenshots?
- [ ] Are evidence, permissions, approvals, and worklogs treated as product value?
- [ ] Is the page strong without video?
- [ ] Are EN and VI structurally synchronized?
- [ ] Does mobile preserve the system story?
- [ ] Are focus, reduced motion, contrast, and long Vietnamese labels checked?
- [ ] Did we avoid fake proof?

The target feeling:

> Calm enough to trust. Ambitious enough to redraw how a company works.

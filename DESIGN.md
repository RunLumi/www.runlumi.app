# Lumi Landing Design System

Revision: Civic Editorial Intelligence + restrained liquid glass · September 2026
Narrative revision: RunLumi as the core product · 2026-11-06

> Marketing adaptation of the canonical Lumi design language in
> `RunLumi/lumi-agents/DESIGN.md`. The shared Lumi identity is authoritative.
> This file narrows that system for `runlumi.app`; it does not invent a second brand.
> Product facts come from the `runlumi-core` repository (README.md, vision.md, features.md,
> DESIGN.md, docs/features). Where this file and that repository disagree on a product claim,
> the repository wins and this file is corrected.

## 0. Purpose

The landing page has one job:

> Make a person who does client work on a computer understand, in under a minute, that
> RunLumi keeps a private memory of that work on their own device, helps them find it,
> resume it and account for it, and that they stay in control of what it captures.

It must communicate **promise + how it works + privacy + a concrete next step (the
design-partner pilot)** without becoming an AI spectacle, a surveillance product, a feature
catalogue, or a developer-tool README.

The page should feel closer to a beautifully edited instrument manual or a trustworthy
public-interest explainer than a conventional startup template.

---

# 1. Shared Lumi identity

Preserve these ideas from the canonical design system:

- **Civic Editorial Intelligence** — institutional trust, editorial clarity, warm human texture.
- **Lit operating desk** — warm paper is the desk; white sheets are evidence and work.
- **Light only** — no dark theme. One intentional Civic Navy editorial inversion is allowed.
- **One type family** — Geist for display/body, Geist Mono only for technical fragments.
- **Folded-L geometry** — precise corners, brackets, rails, negative space, handoff lines.
- **Restrained material depth** — warm paper, opaque evidence sheets, and a separate liquid-glass control layer with navy-tinted depth.
- **Evidence before performance** — sources, freshness, permissions, approvals, worklogs.
- **Unconventional restraint** — fewer things, better ordered, with stronger meaning.

The landing page should never visually drift toward futuristic, magical, cyberpunk,
robotic, gamified, crypto-like, or trend-chasing AI aesthetics.

---

# 2. Positioning

## 2.1 Core proposition

**RunLumi** is Lumi's core product: a local-first memory of the work on a person's computer.

Promise: **Your work, remembered. Your AI, your choice. Your data, your control.**
Vietnamese: **Việc đã làm, không còn trôi mất. AI do bạn chọn. Dữ liệu do bạn nắm.**

The system the page explains:

```text
You, on your own computer
  ↕
RunLumi — Recall · Timeline · Timesheet review
  ↕
Local memory on the device (RunLumi Core engine)
  ↕
Capture you control
(opt-in sources · app allowlists · region masks · pause & schedule)
  ↕
Signals you allow
(app names · screen frames · accessibility text · microphone · browser tab title)
```

The page therefore sells **a private record of your own work that you control**, not
productivity tracking, not an AI chatbot, and not a collection of features.

## 2.2 Naming

- **RunLumi** — the product name in every user-facing surface, EN and VI.
- **RunLumi Core** — only the engine underneath: the `runlumi-core` repository and crate,
  the planned Apache-2.0 open-source core, the MCP server and the local API. Use it when
  talking to developers ("RunLumi is built on RunLumi Core"). Never present Core as a tier.
- **Lumi AI Workspace, Lumi BI, Lumi Agents** — Lumi's products for companies.

## 2.3 Product roles

- **RunLumi** — personal memory: recall what you saw, resume interrupted work, draft
  timesheets you approve, give your own AI read-only context.
- **Lumi AI Workspace** — coordinate decisions, commitments, risks, and operating work.
- **Lumi BI** — understand what changed and trace conclusions to evidence.
- **Lumi Agents** — carry out bounded digital jobs with tools, worklogs, approvals, and verification.

**Separation rule:** personal memory belongs to the individual. RunLumi does not connect to
the company products automatically, and the page must never imply that an employer can
see a person's history. Sharing a reviewed timesheet or note into a company product is a
separate, deliberate step. The company products appear on the landing page as one compact
"For teams" section, not as equal chapters beside RunLumi.

## 2.4 Honesty boundary

RunLumi is in early development and the call to action is a design-partner pilot. Describe
the early build accurately, label direction as direction, and do not claim availability,
release dates, benchmarks, customers, platform support beyond the pilot, or an open-source
release that has not happened. Do not name or compare with competitors (including Screenpipe)
without a published comparative benchmark. The first paid job is recovering legitimate,
previously unlogged billable time; never imply that being active at a computer is billable.

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

## 3.3 The practitioner layer

A freelancer, consultant or small-agency owner should understand:

1. what RunLumi is;
2. what it captures, and that nothing is captured until they allow it;
3. what it helps them do (recall, resume, account for time, give their AI context);
4. where their data lives and who can see it;
5. why it can be trusted;
6. how to join the pilot.

Visual polish that does not improve one of those six outcomes is not completion.

---

# 4. Material model

Lumi is a **lit operating desk**.

| Cue       | Meaning                    | Landing expression                                                       |
| --------- | -------------------------- | ------------------------------------------------------------------------ |
| Paper     | calm reading surface       | warm page canvas                                                         |
| Sheet     | product/evidence/work      | white surface, 1px border, lit top edge                                  |
| Ink       | authority                  | Civic Navy / Ink, never pure black                                       |
| Mark      | provenance/attention       | small blue rail, dot, bracket, clarity mark                              |
| Lift      | interaction                | navy-tinted elevation only                                               |
| Glass     | navigation above the work  | floating header and one workflow navigation dock; never reading surfaces |
| Seal      | authority                  | primary Lumi Blue CTA                                                    |
| Inversion | one editorial interruption | Civic Navy context section only                                          |

Every visible material needs a physical reason. Remove decoration that does not explain
hierarchy, state, affordance, provenance, or system structure.

---

# 5. Canonical color contract

Use the shared Lumi values exactly.

```css
--color-lumi-blue: #006093;
--color-lumi-blue-hover: #004f80;
--color-lumi-blue-active: #003e6a;
--color-lumi-blue-soft: #e4f3fc;

--color-civic-navy: #102a43;
--color-ink: #172033;
--color-soft-slate: #5e6677;

--color-paper-white: #f4f0e8;
--color-surface-white: #ffffff;
--color-archive-gray: #e7eaf0;
--color-border-subtle: #e7eaf0;
--color-border: #d9dee8;
--color-border-strong: #c8d0de;

--color-signal-amber: #f4a62a;
--color-amber-soft: #fff4dc;
--color-risk-red: #c2410c;
--color-red-soft: #fff1ec;
--color-success-green: #1f7a4d;
--color-green-soft: #e9f7ef;
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
  Geist, "Noto Sans", "Noto Sans Thai", "Noto Sans Arabic",
  "Noto Sans Devanagari", "Noto Sans JP", "Noto Sans KR", "Noto Sans SC",
  "Noto Sans TC", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;

--font-mono:
  "Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
```

One family. Authority comes from weight and tracking, not a second display face.

## 6.2 Marketing hierarchy

Hero:

```css
font-size: clamp(56px, 6.1vw, 82px);
line-height: 1.08;
font-weight: 560;
letter-spacing: -0.065em;
```

Vietnamese display uses `line-height: 1.14` (1.13 on mobile), lighter tracking
and natural wrapping. Never clip diacritics or shrink Vietnamese body text.
Self-host the variable Geist Latin and Vietnamese subsets with `font-display: swap`;
include the SIL Open Font License. Do not depend on a visitor request to a font CDN.

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
12px large editorial sheet
14px workflow navigation dock
16–20px floating header only
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
  0 1px 2px -1px color-mix(in oklch, #102a43 8%, transparent),
  0 8px 20px -10px color-mix(in oklch, #102a43 10%, transparent);

--shadow-button:
  inset 0 1px 0 0 color-mix(in oklch, white 22%, transparent),
  0 1px 2px 0 color-mix(in oklch, #102a43 22%, transparent);
```

No black drop shadows. No colored glow.

## 8.4 Liquid glass, translated for Lumi

Reference: [Apple Human Interface Guidelines — Materials](https://developer.apple.com/design/human-interface-guidelines/materials).
Apple places glass in the navigation/control layer and recommends restraint for custom controls.
This is a CSS interpretation of that hierarchy, not a claim to reproduce native optical refraction.

**Paper is the content. Glass is how you move through it.**

Use glass only for the floating header and the link dock attached to the hero's example.
Both must be genuine navigation, with keyboard focus and a meaningful destination.
Keep the system diagram, evidence, body text and product chapters opaque.
Never nest glass inside glass or blur a whole section.

```css
/* Opaque first: browsers without filters still get a complete material. */
background: #f9f7f2;
border: 1px solid rgba(255, 255, 255, 0.85);
box-shadow:
  inset 0 1px 0 #fff,
  inset 0 -1px 0 rgba(16, 42, 67, 0.08),
  0 8px 24px -16px rgba(16, 42, 67, 0.28),
  0 0 0 1px rgba(16, 42, 67, 0.07);
/* Within @supports only */
background: rgba(249, 247, 242, 0.84);
backdrop-filter: blur(24px) saturate(1.2);
```

The white edge suggests light from above; the navy edge grounds the control.
Tint comes from the existing paper and ink palette. No spectral rims, rainbow highlights,
animated distortion, pointer spotlights or extra accent colors.

- Keep opaque-enough material for text contrast over every section, including navy.
- Support the prefixed filter for Safari.
- `prefers-reduced-transparency: reduce` and `prefers-contrast: more` use opaque paper.
- Forced colors retain explicit borders and system button colors.
- Hover moves a control at most 1px; reduced motion removes transitions.
- At 320px, preserve the logo, language switch and contact action.
- This layer requires no JavaScript, canvas, WebGL or image generation.

---

# 9. Landing-page composition

The page is an edited explanation of a private work memory, not a catalogue.

## 9.1 Hero — the person first

A short two-part thesis: “Your work, remembered.” / “Việc đã làm, không còn trôi mất.”
The supporting paragraph names what RunLumi keeps (a private, searchable memory of the work on
your computer), what it helps with (find, resume, timesheet you approve) and the promise.
A short note states the development stage, the pilot platform and that capture is off by default.
A visitor must understand the proposition without interpreting the illustration.

Use one recall example on an opaque white sheet. Label it **Illustrative / Minh họa**.
It moves from a remembered phrase to a source with app and time, its context, and a draft
time entry that is explicitly not yet approved. The attached glass dock links to the week below.
Never simulate live capture, a recording indicator, a completed export or a verified result.
No real customer, company or person names; use neutral project names such as “Sen”.

## 9.2 Where work goes missing

A compact editorial bridge describes a recognizable cost: work spread across tabs, meetings,
chats and interruptions; rebuilding context; forgetting what was agreed; under-reporting time.
Avoid a second manifesto or repeated feature grid.

## 9.3 Follow one working week

Show a consultant's week moving through four stages: recall, resume, account, approve.
It is an illustration of the intended workflow, not a customer case study. Make the billing
boundary explicit: suggested time is never billable until the person approves it.

## 9.4 Explain how it works on the computer

RunLumi → Recall / Timeline / Timesheet → local memory (RunLumi Core engine) → capture controls → signals you allow.
Use a quiet dotted document grid, thin connectors and legible sheets.
State that this is the early build's architecture, that each source is off by default and needs
its own operating-system permission, and that features are not yet verified for general release.

## 9.5 Three first jobs

Three editorial chapters: recall & resume, billable time recovery, context for your AI.
Each has a distinct job, a clear explanation and an inspectable, explicitly illustrative
artifact (a recall result, a timesheet draft separating observed / suggested / approved, an
agent request scope). Mark planned capabilities as planned. No fabricated dashboards.

## 9.6 Vietnam first

One Civic Navy inversion explains the Vietnam-first design: Vietnamese and English in the same
work, tone marks in names and searches, modest laptops, browser tabs, spreadsheets and chat.
Treat these as design intent, not benchmark claims. Linked inputs (signals) flow into “your
local memory” and out to recall, resume and account. No glass text panels in this section.

## 9.7 Privacy rules, teams and the pilot

Present the privacy rules as design standards: visible opt-in capture, exclusions before storage,
local by default, no surveillance and no false billing.
Then one compact “For teams” section linking Lumi AI Workspace, BI and Agents, with the
separation rule stated in plain words.
Then the pilot: tell us how you work, install an early build on a machine you control,
reconstruct one week with consent, compare the result.

## 9.8 A reason to begin

The final question is specific and personal: what did you work on last Tuesday?
Invite people who bill clients for their time to join the pilot.
The CTA opens an email draft with prompts for role, how time is tracked and billed today,
computer and operating system, and the apps used most. It must say that it opens email.
No invisible form submission, waitlist counter or invented response-time promise.

Desire comes from recognizing lost work and lost time. Urgency comes from a real recurring cost.
Never manufacture urgency with countdowns, limited places, competitive threats, fake adoption,
unsupported time-recovered figures or claims about what “every freelancer” is doing.

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

## Development default: distinctive, useful icons

Treat icon selection as design work. Icons should make an action immediately
recognizable or give a service a concrete visual identity. Choose the most
specific readable metaphor available; do not fill every section with the same
checkmark, shield, globe, or generic AI sparkle. A consistent drawing language
should still contain varied, purposeful silhouettes. Do not add icons to every
heading merely to fill space.

For this landing site:

- Preserve the existing 1.75–2px line language and folded-L geometry. Reuse an existing SVG before adding a glyph; put repeated glyphs behind one owned component rather than copying paths across templates. Do not add an icon package solely for a few symbols.
- Use objects that explain the workflow: a document for a source, connected nodes for a handoff, and a directional path for an action. Navigation arrows, menu, and close controls stay conventional. An icon must not imply a verified integration, completed run, or evidence-backed result the page has not established.
- Give related product chapters distinct silhouettes while preserving one optical style. Use Civic Navy by default and Lumi Blue for emphasis; status colors still require real semantics. An optional paper/white folded-corner frame or short rail belongs around a prominent editorial glyph, never around every row or button.
- Keep the logo separate. The clarity mark retains its existing meaning and rare use; it is not a generic AI emblem. Inspectable workflow artifacts still carry the product explanation; an oversized interface icon is not a substitute.

Before shipping an icon change, review the glyphs together at their actual
rendered sizes, including 16/20/24px where used. Check recognizable silhouettes,
optical balance, consistent strokes, negative space, and contrast on every
material and state. Remove framing or simplify the symbol if it crowds the glyph.
Keep visible labels for unfamiliar actions; icon-only controls need an accessible
name, visible keyboard focus, and a hit area independent of drawing size. Hide
decorative SVGs from assistive technology when text or a named control supplies
the meaning. Essential status also needs text, never color or a mark alone.

Inspect supported locales at 320/375/768/1440px, including long Vietnamese labels
and diacritics, touch and keyboard use, and forced colors. Keep glyphs from
shrinking or colliding with text. Follow the existing motion rules; no decorative
bounce, glow, or continuous spinning. Replace vague or repetitive metaphors;
remove decoration that contributes no meaning. These are acceptance requirements
for future implementation, not evidence that a UI change has shipped.

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

> Find what you saw, with the source.

Over:

> Unlock total recall with AI-powered continuous context capture.

Prefer:

> Tìm lại được, kèm nguồn gốc.

Over:

> Khai phá sức mạnh ghi nhớ toàn diện với nền tảng AI thông minh.

Describe capture plainly and never euphemistically: say what is recorded, when, and where it is
stored. Avoid “always on”, “sees everything”, “never forget anything” and other surveillance-
or omniscience-flavoured phrasing.

Product names may contain “AI”, “Agents”, or “Autonomous” where those are the actual names.
Do not repeat those terms in surrounding copy merely to signal modernity.

Vietnamese should be chân phương, tự nhiên, mềm và chắc:

- tránh dịch sát tiếng Anh;
- tránh “tối ưu hóa”, “đột phá”, “nâng tầm”, “cách mạng hóa” nếu không có nghĩa cụ thể;
- ưu tiên cách nói một người làm nghề tự do hay chủ agency nhỏ có thể nói lại cho người khác ngay sau khi đọc.

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



### 13.1 Parallax and purposeful alternatives

Updated 2026-10-03. This is a design contract for future changes, not evidence that effects are shipped. Existing brand, material, content, safety, and platform rules remain authoritative.

**Design decision:** earn visual impact through composition and a small number of useful motion moments. Prefer micro-interactions and a bounded scroll-driven sequence over large moving backgrounds. Keep reading, prices, evidence, and primary actions stable.

**Evidence boundary:** scroll-driven animation describes how progress is controlled, not guaranteed performance; parallax can itself be scroll-driven. Rendering cost depends on properties, assets, implementation, and device. WebGL/Three.js is not inherently lighter than simple parallax, and large movement can be uncomfortable with either technique. The limits below are project design choices, not universal research thresholds.

**Landing scope:** explain one concrete workflow, with a stationary hero proposition and immediate next action. Journal reading, candidate application forms, and private hiring/admin decisions stay stable. Preserve the current prohibitions on parallax spectacle, 3D orbs/brains/robots, fake dashboards, and video dependencies. An illustrative workflow remains visibly illustrative throughout its animation.

| Option | Appropriate use | Limits and static equivalent |
| --- | --- | --- |
| Traditional parallax | An optional depth cue in one explanatory marketing composition, where existing surface rules permit it. | Relative travel <=12px; never move essential text or controls. Disable on narrow viewports, coarse pointers, and reduced motion. No full-screen camera travel or fixed-background dependency. |
| Scroll-driven animations | Connect stages of a workflow or reveal an illustrative artifact as its section enters view. | Prefer transform/opacity: travel <=16px, scale 0.98–1.02. Keep content visible by default. Rotation, SVG morphing, and animated masks need explanatory value and profiling; they are not defaults. |
| Immersive 3D / WebGL | An optional explorable object when depth helps the visitor understand something a static view cannot. | Prefer HTML/SVG or modest CSS perspective first. Load 3D only for a justified, measured use; provide a complete static equivalent and accessible controls. Existing prohibitions on decorative 3D remain in force. |
| Kinetic / variable typography | Brief emphasis on one short marketing phrase. | Use only axes supported by the existing font. Keep body, prices, metrics, evidence, primary headlines, and CTA labels stable. No per-letter motion, shifting wraps, clipped diacritics, or continuous font-weight animation. |
| Sticky reveal / pinning | Hold an illustration alongside naturally scrolling explanatory steps. | Prefer CSS sticky; at most one narrative section. Release at its container boundary and use normal flow on short/narrow viewports. No wheel/touch interception, artificial scroll runway, or cards covering readable content. |
| Micro-interactions | Focus, press, disclosure, selected state, validation, and actual request outcomes. | Reuse existing timing tokens and <=1px control lift. Supply equivalent touch/keyboard feedback. No hover-only information, cursor chasing, or decorative loops. |

#### Implementation rules

- Start with complete semantic HTML and visible static content. Add CSS scroll/view timelines behind feature detection; unsupported browsers keep that baseline. A timed entrance is distinct from progress tied directly to scroll position. Do not add a library solely for a reveal.
- Prefer transform and opacity. Avoid animating layout dimensions, large blurs, or shadows while scrolling. Profile exceptions; avoid repeated layout reads/writes in scroll handlers and blanket `will-change` promotion.
- With `prefers-reduced-motion: reduce`, remove parallax, scroll-scrubbed movement, tilt, kinetic text, and animated pinning. Show the final static state, preserve immediate state feedback, and respond to preference changes during the visit. Native surfaces honor native accessibility settings.
- Cursor tilt is optional only on fine pointers with hover. Preserve touch scrolling, keyboard focus, text selection, find, anchor destinations, and browser back/forward scroll restoration. Never require animation, dragging, or canvas to reach an action.
- Any justified WebGL scene loads after essential content, caps resolution, stops rendering offscreen/in hidden tabs, releases resources, and falls back after context loss. No idle rendering loop; essential copy and controls stay outside canvas.
- Use one principal narrative scroll moment per page. Keep the hero understandable immediately; motion cannot simulate a live capability, customer result, completed task, or unobserved progress.

#### Acceptance when implementing motion

Compare the static and enhanced versions on the same device/network. Record asset cost, loading, interaction responsiveness, layout shifts, and a scroll trace. Simplify or remove an effect if it introduces visible stutter, delays content/action access, or shifts layout; desktop smoothness alone is insufficient evidence.

Inspect supported locales at 320/375/768/1440px, short viewports, long labels and Vietnamese diacritics. Test touch, keyboard, reduced motion, no JS where supported, unsupported timelines, CTA anchors, and success/failure states. For application shells, also verify the actual scrolling pane, virtualized lists, selection, and focus survive updates. Record which browsers/devices were actually tested; documentation-only changes do not prove runtime performance.

#### Sources

Reviewed 2026-10-03. Technical references support implementation; trend material is inspiration, not comparative performance evidence.

- [MDN: CSS scroll-driven animations](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations) — scroll/view progress timelines.
- [web.dev: High-performance CSS animations](https://web.dev/articles/animations-guide) — rendering costs and profiling.
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/prefers-reduced-motion) — user motion preferences.
- [MDN: WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) — device limits and resource costs.
- [Figma: Web design trends](https://www.figma.com/resource-library/web-design-trends/) — inspiration for typography, motion, and immersive elements.


# 14. Copy

RunLumi speaks like:

- a careful archivist;
- a calm, honest colleague who keeps good notes;
- a precise instrument maker;
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
- capture or recording theatre (pulsing red dots, live screen previews, “watching” eyes);
- productivity scores, activity heatmaps of a person or employee leaderboards;
- RunLumi presented as part of, or a feed into, the company products.

---

# 16. Accessibility and quality

- WCAG AA body text.
- 16px minimum body.
- Visible keyboard focus.
- 44px preferred touch hit area.
- 320px reflow without horizontal page scroll.
- Vietnamese tested without shrinking type.
- Reduced motion respected.
- Every glass control must have an opaque fallback and a reduced-transparency treatment.
- The page must remain fully understandable with CSS motion disabled.
- Product claims must match actual or intentionally stated roadmap capability.

---

# 17. Review gate

Before merging a visual change:

- [ ] Is glass confined to useful navigation, with opaque and reduced-transparency fallbacks?
- [ ] Are examples clearly labeled and capability scope stated?
- [ ] Does the CTA describe the actual email action?
- [ ] Is the page still unmistakably Lumi?
- [ ] Are canonical colors unchanged?
- [ ] Is blue used as authority rather than decoration?
- [ ] Is Paper White still the dominant canvas?
- [ ] Does each section answer one question?
- [ ] Does the hero lead with RunLumi and its promise before any feature list?
- [ ] Is “RunLumi Core” used only for the engine, never as the product or a tier?
- [ ] Does the how-it-works diagram read as one system on the person's own computer?
- [ ] Is capture clearly opt-in, visible and local, with the development stage stated?
- [ ] Are Workspace/BI/Agents kept separate from personal memory, in one compact section?
- [ ] Are product visuals inspectable work rather than fake screenshots?
- [ ] Are sources, timestamps, exclusions and approval treated as product value?
- [ ] Is the page strong without video?
- [ ] Are EN and VI structurally synchronized?
- [ ] Does mobile preserve the system story?
- [ ] Are focus, reduced motion, contrast, and long Vietnamese labels checked?
- [ ] Did we avoid fake proof?

The target feeling:

> Calm enough to trust. Ambitious enough to redraw how a company works.

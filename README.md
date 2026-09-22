# Lumi landing

Bilingual Astro landing site for [runlumi.app](https://runlumi.app).

## Product story

Lumi is presented as one AI operating layer with four product surfaces:

- **Lumi AI Workspace** — humans and AI coordinate work.
- **Lumi BI** — understand the business with evidence.
- **Lumi Agents** — deploy agentic staff for defined jobs.
- **Lumi Autonomous Assistant** — the universal front door for delegation.

The site uses a stack-as-story information architecture while preserving Lumi's own Civic Editorial Intelligence design language.

## Local development

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run build
```

## Routes

- English: `/`
- Tiếng Việt: `/vi`

Both routes share the same component system and one bilingual content schema in `src/data/content.ts`.

## Deployment

The site is static Astro and is suitable for Cloudflare Pages.

- Build command: `npm run build`
- Output directory: `dist`
- Node: 22+

## Design and agent guidance

Read [DESIGN.md](./DESIGN.md) before changing the visual system and [AGENTS.md](./AGENTS.md) before agent-authored work.

# AGENTS.md

## Mission

Build runlumi.app into the clearest public expression of Lumi as an AI operating layer for real companies.

The site is not a catalogue of unrelated products. Every change should reinforce this system:

```text
people
  ↕
Lumi Autonomous Assistant
  ↕
Workspace · BI · Agents
  ↕
company context / evidence / permissions / workflows
  ↕
existing business software
```

## Non-negotiables

1. Preserve the visual contract in `DESIGN.md`.
2. English and Vietnamese are peers. A structural content change updates both locales in the same PR.
3. Never invent customer logos, testimonials, ROI numbers, security certifications, integrations, or capabilities.
4. Prefer product evidence and concrete workflows over generic AI claims.
5. No video dependency, AI glow, 3D orb, neon gradients, decorative chatbot bubbles, stock people, or fake dashboard collage.
6. Prefer semantic HTML and CSS. Add client JavaScript only when it materially improves comprehension or accessibility.
7. Keep the public landing pages prerendered and fast; dynamic jobs/admin routes may use Worker SSR only when needed.
8. Accessibility is part of quality: semantic landmarks, keyboard-visible focus, reduced motion, measured contrast, readable Vietnamese.
9. Learn from Vercel's information architecture, not its visual identity.
10. Avoid hype copy such as “10x”, “revolutionize”, “supercharge”, or unsupported claims.

## Jobs / ATS contract

- `/jobs` is public and candidate-first.
- `/admin/jobs` is private and decision-first.
- D1 stores structured hiring data; R2 stores candidate files.
- Never store CV/file blobs in D1.
- Candidate files remain private and are served only through authenticated admin endpoints.
- Tests must be small, role-relevant, visible before submission, and manageable per job.
- Every destructive admin action must preserve referential integrity and candidate privacy.
- Do not expose admin credentials, private file URLs, D1 IDs, or secrets in client code.
- Keep the candidate flow usable without client JavaScript.
- Prefer Cloudflare Access as a second production layer around admin routes, but do not make public application routes depend on it.

## Finish gate

Run `npm run build`.

Production deployment for this repository is manual. After the requested changes
are merged to `main`, deploy the Cloudflare Worker with `npm run deploy` (the script
runs preflight, builds the Astro app, and invokes Wrangler). GitHub Actions validates
the repository but does not publish production.

The Journal is backed by EmDash for editorial content management. Public routes
may keep reviewed, prerendered fallback content, but EmDash schema, migrations,
media and `EMDASH_ENCRYPTION_KEY` must remain separate from the ATS data and files.

Review mobile 320–430px, laptop 1280px, large desktop, both locales, keyboard focus, reduced motion, overflow, and factual claims.

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

## Journal writing and publication

Read and follow [docs/writing-standard.md](docs/writing-standard.md) before
researching, writing, translating, illustrating or publishing Journal content,
including CMS-only changes through EmDash API/MCP.

- Every article needs a relevant visible illustration from ChatGPT Images or a
  verified free Unsplash photograph, with provenance, caption and localized alt text.
- EN/VI editions must preserve the same evidence and limitations, use natural
  language, and link to their real translated counterpart.
- Keep material claims traceable to checked sources. Never promise rankings or
  AI citations, invent experience, or fabricate publication/reading-time metadata.
- Create drafts explicitly. Publish only after the writing standard's rubric and
  hard gates pass; read back each CMS revision and its rendered public page.
- Existing articles and fallback content are not automatically compliant. Track
  renderer/schema gaps honestly; a green build alone is not editorial verification.

## Jobs / ATS contract

- `/jobs` is public and candidate-first.
- `/admin/jobs` is private and decision-first; require an active EmDash admin user (`role = 50`).
- All private hiring pages and APIs use the EmDash session and user record. Never introduce a second password or application-owned login cookie.
- D1 stores structured hiring data; R2 stores candidate files.
- Never store CV/file blobs in D1.
- Candidate files remain private and are served only through authenticated admin endpoints.
- Tests must be small, role-relevant, visible before submission, and manageable per job.
- Every destructive admin action must preserve referential integrity and candidate privacy.
- Do not expose admin credentials, private file URLs, D1 IDs, or secrets in client code.
- Keep the candidate flow usable without client JavaScript.
- Prefer Cloudflare Access as a second production layer around admin routes, but do not make public application routes depend on it.

## Collaborator CRM contract

- `/crm` and `/vi/crm` are peer, private sales workspaces using EmDash authentication.
- Admins grant CRM access to existing active EmDash non-admin users through `/admin/crm`.
- CRM membership is an explicit user-ID allowlist in the hiring D1 database; resolve identity details from EmDash when needed. EmDash CMS roles alone grant no CRM or hiring access.
- Contributors see and edit only leads assigned to their EmDash user ID. CRM admins can view all leads and reassign them.
- Enforce ownership and CRM membership on every server route and D1 query; hide other owners' lead records as not found.
- Store leads and activity in the hiring D1 database. Store no EmDash credentials, passkeys, or session data there.
- Every change and note has an actor and timestamp. Versioned updates reject stale edits. Keep prospect records private and never place them in client-side source.
- Hiring and CRM administration requires EmDash admin role; CRM collaborators must never gain access to candidate applications or files.

## Finish gate

Run `npm run build`.

Production deployment for this repository is manual. After the requested changes
are merged to `main`, deploy the Cloudflare Worker with `npm run deploy` (the script
runs preflight, builds the Astro app, and invokes Wrangler). GitHub Actions validates
the repository but does not publish production.

The Journal is backed by EmDash for editorial content management. Public routes
may keep reviewed, prerendered fallback content, but EmDash schema, migrations,
media and `EMDASH_ENCRYPTION_KEY` must remain separate from the ATS data and files.

## EmDash editor login

Use the repository-local CLI to connect to the production EmDash instance:

```bash
node_modules/.bin/emdash login --url https://runlumi.app
```

The CLI prints a device URL and one-time code. Open the URL in Firefox, complete
the passkey or email-link authentication, and leave the CLI running until it
reports that the token was saved. Verify the session without printing credentials:

```bash
node_modules/.bin/emdash whoami --url https://runlumi.app
```

Use the authenticated CLI or EmDash MCP/API for content changes. Never commit
`~/.config/emdash/auth.json`, print bearer tokens, or place EmDash credentials in
source files, `.env` files, logs, PR bodies or `llms.txt`.

Review mobile 320–430px, laptop 1280px, large desktop, both locales, keyboard focus, reduced motion, overflow, and factual claims.

## Maintaining AI engineering guidance

At the first repository task each month (Asia/Ho_Chi_Minh), follow [the monthly practice review](docs/engineering-practices.md#monthly-ai-engineering-practice-review), starting with claude.dev. Apply evidence-backed improvements to this contract and canonical docs; preserve existing ownership, security, product, and release rules. This runs on agent entry, not a background scheduler.

Before long-task interruption/compaction, record a redacted checkpoint and revalidate actual state on resume using [the resume protocol](docs/engineering-practices.md#resuming-agent-work). Claims of better prompt/skill/workflow outcomes require [independent evaluation](docs/engineering-practices.md#evaluating-guidance-changes); source recommendations and green counts alone are not proof.

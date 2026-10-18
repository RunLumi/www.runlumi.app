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

## Ambition with evidence

**Raise the quality of the outcome, not the volume of work.** For non-trivial tasks, apply these lenses in the existing task/PR; small fixes stay small.

- **Altitude:** identify what the visitor, candidate or operator must understand or accomplish, not just the requested page/component. State acceptance evidence, constraints and a stop condition. Offer a better bounded approach when justified; do not silently change approved scope.
- **Depth:** inspect the actual content, code, rendered pages and authorized, redacted evidence. Use professional methods: accessibility inspection, performance measurement, source verification and behavioral tests. Challenge the assumed bottleneck. Treat a demanding target as a testable hypothesis, never an achieved claim.
- **Range:** bring useful methods from editorial fact-checking, information architecture, usability research and security review. Perform those checks rather than role-playing experts or adding decorative complexity.
- **Speed:** shorten the verified feedback loop using existing tooling. Complete the smallest authorized end-to-end slice, verify it and repair in-scope defects. Stop at proven acceptance or a specific blocker, not merely a plan or attractive screenshot.

**Here:** improve a visitor's ability to understand the real offer and take the right next action. For public-page work, verify EN/VI parity, truthful capability claims, keyboard/mobile comprehension and the actual CTA destination; conversion uplift remains unproven without suitable data. For private Workspace/ATS/CRM work, use synthetic role/ownership cases and verify the server boundary, not just hidden navigation. Do not expose applicant or prospect data to support a demo.

**Evidence and authority:** use observable tests and independent review, not the implementing model's confidence. Report actual results, tested revision and missing coverage. Preserve all product, editorial, privacy and release rules; in particular, a content draft is not publication approval and a merge to main is a production release. Propose larger opportunities separately. Evaluate instruction changes on representative tasks before claiming they improve outcomes.

**Credit:** adapted from [Felix Rieseberg, “How to be more ambitious: A tutorial for humans with models”](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/) (13 October 2026). Speed, Altitude, Depth and Range are his framework; the examples and authority safeguards here are Lumi's adaptation.

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

## Workspace roles contract

- Private modules (Hiring, CRM, and later ones) share one EmDash identity, one Workspace allowlist (`workspace_members`), combinable roles (`workspace_roles`) and one permission map in `src/lib/workspace/roles.ts`. See [docs/workspace/README.md](docs/workspace/README.md).
- Roles: System Super Admin (EmDash role 50; never stored), HR (ATS), Sales Manager, Sales Executive, Partner (Cộng tác viên), Finance, Fulfillment, Employee, People Manager, HRM Officer, HRM Admin and Payroll Officer. HRM grants are separate from ATS/CRM grants. Check permissions, never role names, in routes, APIs, queries and navigation.
- HRM requirements and gates live in [docs/specs/hrm/README.md](docs/specs/hrm/README.md); track implementation evidence in `docs/specs/hrm/STATUS.md`. Production HRM stays fail-closed unless policy review, the HRM settings record and the `HRM_LIVE_ENABLED` deployment switch all agree. HRM Admin never self-approves or gains Workspace user/role administration.
- Only Admins manage users and roles (`/workspace/users`); every access change is written to `workspace_audit`. Nobody changes their own access.
- Navigation comes from `src/lib/workspace/nav.ts` and shows only entries the person may open; every private page renders inside `WorkspaceShell` and has a `/vi` peer.
- Finance requirements are in [docs/finance/README.md](docs/finance/README.md) ([Tiếng Việt](docs/finance/README.vi.md)); implementation evidence belongs in [STATUS.md](docs/finance/STATUS.md). This is a proposed System-Super-Admin-only module, distinct from the existing CRM Finance role and `crm.finance`. Do not infer runtime implementation or production activation from the specification.

## Jobs / ATS contract

- `/jobs` is public and candidate-first.
- `/admin/jobs` and `/vi/admin/jobs` are private and decision-first; require the `hiring.access` permission (Admin or HR). Deleting and exporting need their own permissions.
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
- Admins grant CRM roles (Sales Manager, Sales Executive, Finance, Fulfillment) to existing active EmDash non-admin users on `/workspace/users`.
- Workspace membership is an explicit user-ID allowlist in the hiring D1 database; resolve identity details from EmDash when needed. EmDash CMS roles below admin grant no CRM or hiring access.
- Sales Executives and Partners see and edit only opportunities assigned to their EmDash user ID. Partners refer businesses into an unassigned queue (consent required) and then see only stage and outcome; they never report or handle payments. Sales Managers and Admins see every opportunity and reassign them; only Admins configure playbooks, offers and commission policy.
- Companies have many contacts; every new opportunity names one company and one of its contacts. Companies and contacts have a manager (`owner_id`): team-wide roles see all; others see what they manage, contacts at companies they manage, and the contact on their opportunities.
- Enforce ownership and CRM membership on every server route and D1 query; hide other owners' lead records as not found.
- The CRM API (`/api/crm/v1`) and MCP server (`/api/crm/mcp`) accept only personal bearer tokens (hash stored, secret shown once, read or write scope, expiry, rate limit) and act with the token owner's current CRM permissions through the same functions as the pages. Never accept session cookies there, never let tokens reach hiring, and never expose payments, ledger, commission, fulfillment, assignment or configuration through them (`docs/crm/API.md`).
- Store leads and activity in the hiring D1 database. Store no EmDash credentials, passkeys, or session data there.
- Every change and note has an actor and timestamp. Versioned updates reject stale edits. Keep prospect records private and never place them in client-side source.
- Sales models are versioned playbooks and offers (`docs/crm/README.md`). Changes create new versions; never rewrite a playbook, offer, quote snapshot or ledger row that a deal references. Configuration uses safe field types only, never executable SQL, code or expressions.
- The commercial ledger is append-only. Accepted ≠ paid; payments count only after someone with the finance capability confirms them. Credits, refunds and voids are separate entries. Unknown values stay unknown, never 0.
- Finance and fulfillment are CRM capabilities, independent of ATS access and of the EmDash admin role.
- `/api/intake/local` accepts only HMAC-signed enquiries addressed to Lumi from local.runlumi.app. Never route enquiries from customers' Starter sites into this CRM.
- The CRM never messages customers, buys domains, publishes sites, takes payments or pays commission; do-not-contact applies across every channel and playbook.
- Team notifications go only to the internal Lark group through its signed custom-bot webhook (`LARK_CRM_WEBHOOK_URL`, `LARK_CRM_WEBHOOK_SECRET`; `src/lib/crm/lark/`). Owner decisions 2026-10-13: the whole sales team is in the group, amounts are shown, and the feed covers day-to-day activity (notes, detail and pricing changes, quotes, tasks, delivery, companies). Never send contact phone numbers, emails or candidate data; free text (notes, help requests, reasons) goes only as a short excerpt with phone numbers and emails masked; discovery field values are not sent, only which fields changed; customer text stays plain text. Announcements derive from `crm_events` and are claimed once in `crm_notifications`; a Lark outage must never fail a CRM write.
- Commission is a versioned policy (`docs/crm/COMMISSION.md`). An unapproved version is an admin/finance-only simulation; never show estimates to collaborators or record payouts without an approved version. Commission is earned only on confirmed cash for delivered, retained customers.
- User and role administration requires the EmDash admin role. CRM roles must never gain access to candidate applications or files, and HR gains no CRM access.

## Finish gate

Run `npm run build`.

Production deploys automatically when `main` changes. Cloudflare Workers Builds
(connected to this repository, production branch `main`) runs `npm run ci:verify`
(lint, unit tests, build) and then `npm run release` (preflight secrets, a D1 Time
Travel restore point and pending migrations, then `wrangler deploy` tagged with the
commit). Other branches never deploy. Merging to `main` is therefore a production
release: only merge what is ready, keep migrations additive, and check the build in
the Cloudflare dashboard after merging. `npm run deploy` remains the manual fallback.
GitHub Actions validates pull requests but does not publish production. See
docs/crm/RUNBOOK.md §12.

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

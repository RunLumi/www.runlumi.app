# Non-functional requirements

Each requirement has a target and the proof that checks it. A requirement without a proof is marked **Open**.

| ID | Requirement | Target | Proof |
|---|---|---|---|
| NFR-01 | Server boundary | Every private route and API checks a permission (never a role name) on the server. Navigation only hides what the server already denies. | Middleware `areas` in `src/middleware.ts`; per-route allowed/denied tests in `tests/integration/*.integration.test.mjs` |
| NFR-02 | One identity | Every private page uses the EmDash session. No second password, login cookie or account store. | AGENTS.md; `src/lib/workspace/roles.ts` (`workspaceUser`) |
| NFR-03 | Locale parity | Every private page has a `/vi` peer with the same structure and evidence. | Integration tests request both paths; `src/lib/workspace/nav.ts` `switchLocale` unit test |
| NFR-04 | Without client JavaScript | Navigation, menus, filters, forms, pop-overs, sheets and dialogs work without script (`<details>`, links, `:target`, GET/POST forms). Script only adds conveniences. | The shell's one inline script adds Escape, outside-click close, sheet focus and list filters whose fields stay `hidden` without it (`src/layouts/WorkspaceShell.astro`); sheets open by `#id` (`Sheet.astro`). Browser review with JavaScript off is **Open** for the redesign |
| NFR-05 | Small screens | No horizontal page scroll at 320–430 px. Wide tables scroll inside their own region, with frozen leading columns. | Playwright run that measures `scrollWidth − clientWidth` at 320, 390 and 1280 px (handoff `docs/redesign/handoff/claude-rd1-shell.md`) |
| NFR-06 | Keyboard | Visible 2 px focus ring, a skip link, and scroll regions that can be focused. Tab order follows the visual order. | Playwright focus walk recorded in the rd1 handoff |
| NFR-07 | Motion and transparency | `prefers-reduced-motion` removes transitions. `prefers-reduced-transparency` and `prefers-contrast: more` turn the glass header opaque. | `src/styles/crm.css`, `src/styles/workspace.css` |
| NFR-08 | Contrast | WCAG AA for body text and controls on paper and white. | DESIGN.md §5 tokens; a measured contrast audit of the redesign is **Open** |
| NFR-09 | Privacy | No applicant, prospect or HR-private data in client source, logs, notifications or demos. Tests use synthetic data. | AGENTS.md contracts; integration helpers refuse non-local targets |
| NFR-10 | Audit | Every access change writes `workspace_audit`. CRM changes carry an actor and a timestamp. Finance keeps its revision and audit history. | `saveMember` batch; CRM and Finance integration tests |
| NFR-11 | Release safety | `main` is production. Migrations are additive. Nobody deploys from a branch. | AGENTS.md "Finish gate"; `npm run ci:verify` in Workers Builds |
| NFR-12 | Performance | Public landing pages are prerendered. Private pages render on the server with a bounded number of D1 queries per page (the users page reads members, identities, passkeys, tokens and seller terms in ≤ 90-ID chunks). | `src/lib/workspace/access.ts`; a measured server-time budget is **Open** |

# CRM sales processes

Updated 2026-10-17 (Local guide 2.1). `/crm/process` and `/vi/crm/process` are private, server-rendered choice pages with exactly **two sales motions**. They do not install or alter database playbooks.

| Motion | English | Vietnamese | Governing content |
|---|---|---|---|
| 01 Lumi Local | `/crm/process?flow=local` | `/vi/crm/process?flow=local` | `docs/Lumi_Sales_Process.en.md` / `docs/Lumi_Quy_Trinh_Ban_Hang.md` |
| 02 Lumi Agents / Vaults (BI when appropriate) | `/crm/process?flow=agents-vaults` | `/vi/crm/process?flow=agents-vaults` | `docs/Lumi_Agents_Vaults_Sales_Process.en.md` / `.vi.md` |

## Ownership and precedence

Local retains the previously approved free printed Basic -> owner visit -> website with Pro guidance and all historical payment/credit rights. Guide 2.1 (2026-10-17) adds, as operating practice only: a private draft of each business's own page before the visit (link, version and sources in a `[DRAFT_READY]` note, copied into the existing `preview_*` fields once they appear at `owner_talked`), walk-in permission at the counter for street-front clusters, a factual `[PRESENCE_GAP]` note, one introduction asked after every positive outcome (`[REFERRAL]`, referral source), and a weekly funnel review. It changes no prices, offers, stages or fields. The short Agents/BI summary in section 11 of that Local document is historical context; **the dedicated Agents/Vaults guide governs new solution kit work**. Existing customer agreements are never rewritten by new guidance. The two-week/two-person-day free trial is not a default entitlement for new prospects: the new Workflow Kit is bounded to 2 hours with explicit artifacts and no production deployment.

Agents/Vaults starts with a free Workflow Kit: one sample output, exceptions/review checklist, source/access/handover map and measurement/decision sheet. Customers keep their files without buying. Default synthetic data; real Agents/BI samples require separately approved handling. No real data in Vaults before G2, and no broad rollout before G3. Gates in the guide are manual operating checks, not new server enforcement.

The existing `local-preview`, `lumi-solution` and `local-renewal` playbooks remain unchanged. BI is a solution option; renewal is linked lifecycle work, not a third acquisition motion. Do not create free-gift quotes/payments/credits, or count a kit receipt as a paid pilot. New prices, print scope or paid product availability need separately authorized offer versions and technical readiness.

## Implementation boundaries

- `src/lib/crm/sales-process.ts` contains two allowlisted IDs, localized labels, source references and URLs.
- `SalesProcessView.astro` statically imports the four Markdown sources. Unknown `flow` values show the hub; they never become paths or dynamic imports.
- The original route `context()` checks, Workspace roles, no-store headers, private shell and locale switching are retained. No client JavaScript is required.
- No migrations, production CRM records, offer/playbook versions, finance rules, commission or public marketing site changes are part of this work.
- Source references are shown only to Admins as before. Private customer evidence stays out of Git and public shares.

## Validation and release

- Content/navigation: `npm test`, including Local regression contracts and `tests/crm-workflow-kit.test.ts`.
- Authenticated HTTP: `RUNLUMI_INTEGRATION_SCOPE=sales-process npm run test:integration`; the default complete integration gate includes this suite too.
- Synthetic sessions test both locale hubs/deep links, anonymous/outsider denial, correct content, contents anchors, locale preservation, invalid-input fallback, and no commercial/configuration writes from guide reads.
- Run `npm run lint`, full `npm run test:integration`, and `npm run build`; inspect 320/430/1280px layouts, keyboard focus, reduced motion and tables before release. HTTP/content tests alone are not visual or production evidence.
- Main auto-deploys through Cloudflare. Merge authorization is not a claim that deployment succeeded: record actual CI/build state and separately verify rollout and authenticated production rendering where access is available.

No conversion uplift is claimed by this documentation change. Validate paid outcomes, repeat usage, actual delivery/support costs and customer value before expanding either sales motion.

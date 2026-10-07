# Company pages and footer

Updated 2026-10-08. Company information and official social URLs were supplied
by the owner for the Lumi Local update and explicitly requested here as well.
They are not independently verified registry records. Keep the Singapore legal
entity and UEN separate from the Vietnam operations office and tax ID. D-U-N-S
is an identifier, not an endorsement or certification. Preserve the supplied
address; no company phone number is displayed.

`src/data/company.ts` is the single source for these details and EN/VI company
copy. `CompanyFooter.astro` renders them across landing, Journal, company and
public careers pages, retaining the existing email, Careers and GitHub links.
Journal footers also retain RSS. Private workspaces do not use this footer.

English is `/about` and `/vision`; Vietnamese is `/vi/about` and `/vi/vision`.
All four pages are prerendered, have reciprocal language metadata and appear
in the sitemap. Contact CTAs use the existing homepage contact section.

The owner referenced [CJS about](https://cjs.vn/about/) and
[CJS vision](https://cjs.vn/vision/) in the original request; those pages were
read on 2026-10-08. This adaptation carries their practical approach into
Lumi's existing company operating-layer positioning in DESIGN.md and
src/data/content.ts. Do not copy Lumi Local's offer/pricing into this site or
import CJS's experience counts, self-hosted offer, one-time pricing, telephone
number, superlatives or security guarantees.

The system diagram is labeled as a design model. Vision expresses a direction;
it does not establish production integrations, customer results or availability
of every workflow. Scope, evidence, permissions, approval and verification remain
central. Do not add customer logos, testimonials, ROI or certifications without
applicable evidence. No CMS article, candidate data, CRM or production settings
are changed by these public presentation components.

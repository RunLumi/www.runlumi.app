# Business model canvas

`/crm/model` and `/vi/crm/model` show one business model canvas per sales
motion: **Lumi Local** and **Lumi Agents, BI and Vaults**. They are private,
server-rendered and read-only. Only the Sales Manager and the System Super
Admin can open them (owner decision, 18 October 2026). Finance, Sales
Executives, Partners, Fulfillment and HR get 403, and the menu hides the link
from them.

## What the page is for

The page answers one question: which parts of Lumi's business model rest on
evidence, and which are still choices or bets. A canvas that only lists
intentions reads as a plan that already works. Here every statement carries a
grade, and the founder sees where the sources disagree.

| Grade | Meaning |
|---|---|
| Observed | Happened and was recorded, with a date. |
| Decided | An owner decision or written rule. A choice, not proof that it works. |
| Priced | A list price or price proposal. A price is not proof that anyone pays it. |
| Hypothesis | A belief or target that still has to be tested. |
| Unknown | Not decided or not measured yet. |

Each canvas also lists three **load-bearing assumptions**, each with its
cheapest test, pass threshold and stop rule. It ends with the **decisions
waiting on the founder**: places where the strategy, pricing and sales
documents contradict each other.

## Live evidence comes only from the CRM

The "Evidence in the CRM now" panel and the lines inside the blocks are
computed on each request by `src/lib/crm/business-evidence.ts`:

- **Paying businesses and cash kept** count only ledger payments that Finance
  confirmed, minus confirmed refunds. Reported and pending payments are shown
  separately. A business refunded in full does not count.
- **Accepted but not fully paid** stays separate: accepted is not paid.
- **Channels** use the source channel of each paying business's first paid,
  non-renewal deal.
- **Recorded costs** use the same acquisition and delivery categories as the
  cohort report. Estimates and minutes without an amount are never counted as
  money. "Cash after recorded costs" is therefore an upper bound.
- Deals map to a canvas by playbook (`local-preview` and `local-renewal` →
  Local; `lumi-solution` → Solutions). Legacy deals map by their accepted
  offer. Deals that belong to neither model are shown as a count instead of
  being dropped.

The page shows aggregates only: no company, contact or deal names.

## Where the statements live and how to change them

`src/lib/crm/business-model.ts` holds both canvases in English and Vietnamese.
This repository is public, so the file holds only strategy, prices, rules and
hypotheses. Never add customer names, contacts, revenue or customer counts to
it. Those belong in the CRM, where the page reads them.

Sources use `repo:path#Lstart-Lend`:

- `www:` is this repository. `tests/crm-business-model.test.ts` fails if a
  cited file or line range no longer exists.
- `local.runlumi`, `agents.runlumi_app`, `lumi-vaults` and `lumi-hq` link to
  the commit that was read (`pinnedCommits`). When you re-review a source,
  update its commit and `reviewedOn`, and check the cited lines again.

The tests also fail when an English figure is missing from the Vietnamese
text, when a statement has no grade or source, or when the file contains an
email address or phone number.

Review the canvases whenever pricing, the first segment or a gate changes, and
at least monthly. Decisions resolved by the founder move out of the
"Decisions waiting" list and into the relevant block as **Decided**, citing
the decision record.

## Known limits

- The page cannot see work that is not in the CRM. The founder-confirmed BI
  deployment, for example, counts here only once its payments are in the
  ledger.
- The solution motion has one custom offer (`lumi-solution`), so cash cannot
  be split between Agents, BI and Vaults until separate offers exist.
- Source line references in other repositories go stale as those files
  change. Pinned commits keep each link pointing at the text that was read.

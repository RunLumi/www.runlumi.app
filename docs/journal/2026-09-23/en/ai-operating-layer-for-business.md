## The missing work sits between systems

A company can have a reliable accounting system, a carefully maintained CRM and a shared drive full of useful documents, yet still spend Monday morning reconstructing what happened last week. The sales figure is in one place; the exception that explains it is in another; the person allowed to act has not seen either. I use “AI operating layer” for the thin layer that joins those three things: company context, inspectable evidence and bounded work. It is a design description, not a claim that a new category has already solved the problem.

The distinction matters. A chatbot can answer a question about a pasted spreadsheet. An operating layer would need to know which spreadsheet is authoritative, who may see the underlying records, when the data was refreshed, and whether the answer may trigger a change elsewhere. OpenAI’s [Agents overview](https://developers.openai.com/api/docs/guides/agents) separates model responses from the runtime that manages tools, state and longer work. Anthropic’s [trustworthy-agents analysis](https://www.anthropic.com/research/trustworthy-agents) likewise treats the model, harness, tools and environment as different sources of behavior and risk. These are descriptions of agent systems; they do not prove that any particular business product works well.

## A concrete handoff

Consider an illustrative weekly margin review. A finance lead notices that reported margin fell even though order volume rose. The relevant inputs may include approved order records, discounts, returns, the cost table and a definition of margin agreed by finance. A useful assistant could gather the permitted records, calculate comparable periods, show which components moved and prepare a short explanation. It should link the explanation to source rows and mark any missing cost data. The finance lead decides whether the finding warrants a pricing change; the assistant does not quietly change prices.

That example has a deliberately narrow boundary. The system reads five named sources; it may draft an explanation; it cannot edit the cost table or send a customer message. A successful run produces a reproducible comparison and a list of exceptions. A failed run stops when the definition of margin is ambiguous or the data is incomplete. This is more useful than a polished answer whose assumptions cannot be found.

The adjacent Journal notes on [BI with evidence](/blog/business-intelligence-with-evidence) and [bounded agents](/blog/bounded-ai-agents-for-business) go deeper on the evidence chain and action limits. Together they point to a practical sequence: establish the metric, trace its inputs, decide who owns the consequence, then automate only the repeatable part.

## Why continuity now matters

The infrastructure around agents is changing. OpenAI documents [sessions that retain conversation and saved work across turns](https://developers.openai.com/api/docs/guides/agents-api/sessions). Anthropic’s June 2026 [Economic Index report](https://www.anthropic.com/research/economic-index-june-2026-report) says Claude sessions increasingly include longer agentic tasks, which led it to change how it studies usage. That is evidence about Anthropic’s observed products and sampling method, not a population-wide measure of business adoption. It does show why the handoff between one step and the next deserves product attention.

For a company, continuity means a task can be interrupted without losing its owner, source context or approval boundary. The record should distinguish planned, attempted, completed and verified actions. A retry after an API timeout must not be mistaken for a fresh instruction to post the same payment twice. The operating layer earns its place when people can understand and recover the work, not merely watch a longer agent run.

## The strongest objection

An extra layer can become one more system to administer. It may duplicate records, create a new vocabulary that nobody uses, or make access rules harder to audit. That objection is serious. If the team already answers a recurring question quickly and reliably inside existing software, another layer adds cost without useful change.

The cheapest test is one weekly decision with a named owner. Record the current time spent gathering evidence, the number of corrections after review and the delay before the next action. Then run a limited assistant workflow alongside the existing process for several cycles. Keep it only if the output is easier to inspect and the total work, including review and repair, falls without increasing consequential errors. Do not replace the company’s systems merely to make the demo coherent.

## Sources

- [OpenAI: Agents overview](https://developers.openai.com/api/docs/guides/agents)
- [OpenAI: Run and continue sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [Anthropic: Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents)
- [Anthropic Economic Index report: Cadences, June 2026](https://www.anthropic.com/research/economic-index-june-2026-report)

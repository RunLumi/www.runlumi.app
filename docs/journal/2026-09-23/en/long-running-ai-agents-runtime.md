## A task can outlive a model response

The first sign that an agent is doing real work is often mundane: an API times out, a person goes home before approving a change, or the agent must wait for an updated file. A one-turn demonstration can ignore those interruptions. A business workflow cannot. The runtime around the model has to retain enough state to resume the right job with the right authority, without repeating side effects.

OpenAI’s [Agents API sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions) retain conversation and saved work across turns, while its [compaction guidance](https://developers.openai.com/api/docs/guides/compaction) describes how long-running context can be reduced while preserving what is needed to continue. Anthropic’s [context-engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) makes the related point that more context is not always better; the system must choose the information that matters for the next step. These are implementation approaches. They do not remove the need for a company to define the job’s business state.

## Keep three records separate

The job state says where work stands: queued, gathering evidence, awaiting approval, applying an action, verifying or stopped. The context record says which facts and assumptions the agent needs to continue. The worklog says which material tools and decisions were used, with outcomes. Collapsing all three into a long chat transcript makes recovery slow and can hide a partial external action behind fluent prose.

A resume point should include the job owner, its current scope and permission grant, the last verified checkpoint, unresolved exceptions, and identifiers of attempted external actions. It should exclude unnecessary raw personal data. After a pause, permissions and source freshness may need to be checked again. A saved instruction from yesterday is not fresh authorization to make a payment today.

## A weekly reconciliation that pauses

Imagine a weekly order-to-cash review as an illustrative example. The agent reads approved order and invoice records, compares them, and prepares exceptions. It then pauses for the finance lead to approve a correction to one internal record. While it waits, an invoice system becomes unavailable. A durable run stores the proposed correction and its evidence, not a vague instruction to “finish later.” When service returns, it checks whether the approval is still valid and whether the correction was already applied.

If the external API reported a timeout after the attempted write, the run must first verify the target record. A blind retry could produce a duplicate. The record should distinguish “request sent,” “system acknowledged” and “source record now shows the intended state.” Those states can be exposed to a reviewer without showing every internal model token.

The same discipline applies when an agent has multiple helpers. OpenAI’s [orchestration guide](https://developers.openai.com/api/docs/guides/agents/orchestration) explains handoffs and manager-owned specialists; the business owner still needs one place to see who owns the result. More agents do not make the approval, retry or verification problem disappear.

## Longer is not automatically better

The strongest objection to investing in a durable runtime is that many tasks are short and predictable. A scheduled script may complete them more cheaply and with less uncertainty. A runtime is justified when the job genuinely needs tool use across steps, changing context or a human decision in the middle. Do not stretch a task to justify an agent.

Choose one job that currently fails when interrupted. Record its normal completion path, likely timeout, duplicate-write risk and approval step. Run the agent with read-only and draft capabilities first. Advance only when the team can resume from a checkpoint, cancel a pending action and explain every external effect. The note on [bounded agents](/blog/bounded-ai-agents-for-business) sets the authority boundary; the [evaluation guide](/blog/evaluating-ai-agents-before-production) shows how to test the interruption. This article asks whether the work can survive time.

## Sources

- [OpenAI: Run and continue sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [OpenAI: Compaction](https://developers.openai.com/api/docs/guides/compaction)
- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [OpenAI: Orchestration and handoffs](https://developers.openai.com/api/docs/guides/agents/orchestration)

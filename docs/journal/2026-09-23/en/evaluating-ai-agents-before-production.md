## Test the job that the agent will actually do

A fluent demo can hide three failures: the agent chose the wrong tool, used the right tool on the wrong record, or stopped after an attempted action without checking its effect. Production evaluation has to cover the whole workflow: input, permissions, tool calls, human handoff, external result and recovery. A model answer is only one part of that chain.

OpenAI’s [agent-evaluation guide](https://developers.openai.com/api/docs/guides/agent-evals) recommends inspecting traces of model calls, tool calls, guardrails and handoffs, then using repeatable cases to find regressions. Its [evaluation best-practices guide](https://developers.openai.com/api/docs/guides/evaluation-best-practices) also notes that a decision to add multiple agents should be driven by observed results. These are useful engineering methods, though a platform trace cannot by itself prove that a business record was correct after the run.

## Build a small, hard case set

Start from a job the team already performs. For an illustrative supplier-invoice reconciliation, collect cases that represent the real boundary: a clean match; an amount mismatch; a duplicate reference; a supplier with a changed bank account; an unavailable source system; and an invoice containing text that tries to instruct the agent to ignore the approval rule. Use sanitized or synthetic records for tests, and mark them as such. Keep a reviewer-approved expected outcome for each case, including the correct reason to stop.

Run each case end to end with the same tools and permission policy intended for production. Check whether the agent opened the right records, identified the exception, kept the bank-account change out of its permitted actions, and produced a worklog the finance owner could use. Do not grade only the final sentence. The [OWASP agentic-applications guidance](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) describes tool misuse and hostile instructions as risks; tests should exercise those boundaries with realistic, non-destructive examples.

The case set should be versioned. A corrected prompt, new model or connector change is a new candidate that must run against the old failures. Add cases from production near misses after removing private data. This creates a record of why the system became more reliable, rather than an anecdote that the latest demo “felt better.”

## Score the parts that can hurt someone

Completion rate matters, but it is not enough. Track evidence quality, false approvals, silent omissions, unauthorized tool attempts, recovery after timeouts, human review time and total cost per completed job. Separate an incorrect draft from an incorrect external write. A staged report can be corrected; a payment or customer message may be costly to unwind.

For the invoice example, one possible pilot gate is no unauthorized write in the reviewed case set, a clear explanation for every stopped case, and less total staff time on the clean cases once review is included. Those thresholds are illustrative choices for one workflow, not industry benchmarks. Set them with the owner of the consequence before seeing the model’s results, then change them only with a recorded reason.

Anthropic’s [trustworthy-agents analysis](https://www.anthropic.com/research/trustworthy-agents) emphasizes that behavior depends on the harness, tools and environment as well as the model. That is why a test using a harmless mock tool cannot fully stand in for a real integration. Before expanding authority, run a controlled pilot with the actual permission boundary and a rollback plan. The [bounded-agent note](/blog/bounded-ai-agents-for-business) describes that boundary; the [runtime note](/blog/long-running-ai-agents-runtime) covers partial work and retries.

## The limit of a test set

No finite test collection proves an open-ended agent safe. Cases can miss a new supplier format, an unexpected permission combination or a malicious instruction hidden in a different document field. The strongest argument against overconfident evaluation is that test cases are selected by the team that built the system. A clean score may reflect selection bias.

Use evaluation as a gate for a bounded job, then keep monitoring real work. Make it easy for reviewers to report a wrong source, confusing trace or near miss. Shrink scope when those signals show a failure the test set did not catch. The practical question before production is whether the team can explain what this agent may do, detect when it is wrong and recover without asking a customer to bear the experiment.

## Sources

- [OpenAI: Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)
- [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [OWASP: Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [Anthropic: Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents)

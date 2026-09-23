## Start with the consequence

An AI agent is useful when it can move a defined job forward. The hard design question is how far it may move before a person must decide. Reading an invoice, preparing a discrepancy report and releasing a payment are three different permissions, even if they appear in one workflow. An agent should receive authority for the first two only when the team can explain the data it may touch, the outcome it should produce and how errors will be found.

Anthropic describes agents as systems that plan, act, observe and adjust through a harness, tools and an environment. Its [trustworthy-agents discussion](https://www.anthropic.com/research/trustworthy-agents) shows why permissions differ for reading a calendar and sending an invitation. OpenAI’s [human-review guide](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) similarly places approval at the tool action that creates a side effect. These are provider designs, not a universal safety certificate. The practical principle is that a prompt asking an agent to “be careful” does not replace a permission check at the system boundary.

## Four levels of authority

A useful policy distinguishes reading, preparation, reversible changes and consequential changes. Reading may include invoices or sales records within the operator’s scope. Preparation may create a draft reconciliation or proposed customer reply. A reversible change might add an internal note that can be removed with an audit trail. Consequential changes include sending an external message, modifying a price, approving a refund or releasing a payment.

The boundary should be specific to a resource and action. “CRM access” is too broad; “read these account records for this weekly review” is clearer. The same tool can have safe and unsafe operations. A route that can list records should not implicitly inherit permission to delete them. Where possible, issue a short-lived, limited credential for the job and keep the system of record as the final enforcement point.

The [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) documents risks such as tool misuse and adversarial instructions in agent workflows. A vendor framework is a starting map, not proof that one policy covers every environment. It reinforces the need to treat emails, documents and web pages as data that can contain hostile instructions. Untrusted text should not acquire the authority of the user who asked for the job.

## A payment example

Consider an illustrative accounts-payable run. The agent receives a list of invoices and purchase orders that finance has authorized it to read. It checks supplier, amount and duplicate references, then prepares a discrepancy list with source links. A matched invoice may be placed in a review queue. If the agent encounters a new bank account, a missing purchase order or a mismatch, it stops and asks the finance owner. Releasing money is outside this job.

The record of the run should say what was planned, which lookups succeeded, which records were compared, which items were flagged and what remains unverified. “Done” should mean the reconciliation was reviewed, not that the agent produced a confident paragraph. If an API times out after a write attempt, retry only after checking whether the first attempt took effect. This distinction between attempted and verified actions becomes more important as jobs run longer; see the [agent-runtime note](/blog/long-running-ai-agents-runtime).

## The objection: approvals can erase the gain

Excessive approval prompts can make a system slower than the manual process. The answer is not blanket autonomy. Put review where a consequence changes external state or is difficult to reverse, and let low-risk preparation proceed within a narrow scope. A single approval can cover a clearly enumerated batch if the reviewer can inspect every item and the tool enforces the approved set. It should not silently expand to new records found mid-run.

Pilot one repeated job with real exception cases. Compare total time, reviewer effort, missed exceptions and unauthorized attempts with the existing process. The [evaluation note](/blog/evaluating-ai-agents-before-production) gives a case-set method. Stop expansion if a tool call occurs outside scope, if the worklog cannot distinguish attempted from completed actions, or if a reviewer cannot understand the proposed change from source evidence. The point of a boundary is to let a team delegate the part it can verify while keeping responsibility for the part that matters.

## Sources

- [Anthropic: Trustworthy agents in practice](https://www.anthropic.com/research/trustworthy-agents)
- [OpenAI: Guardrails and human review](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)
- [OWASP: Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)

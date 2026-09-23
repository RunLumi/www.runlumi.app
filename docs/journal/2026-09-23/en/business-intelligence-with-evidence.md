## A changed metric is a starting point

“Revenue is up” can be true and still leave the decision untouched. An operator needs to know whether the change came from more orders, a different customer mix, a price change, delayed returns or a reporting definition. A good BI answer preserves a path from the number to the records that produced it. The reader should be able to disagree with the explanation without having to rebuild the entire analysis.

That path starts before an AI model writes a sentence. Snowflake’s [semantic-view documentation](https://docs.snowflake.com/en/user-guide/views-semantic/overview) asks teams to define business entities, relationships, metrics and dimensions, then map them to tables and calculations. Its [Cortex Analyst guidance](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst) uses semantic views and verified examples to guide natural-language questions. These are implementation patterns from one vendor, not evidence that every generated query is correct. They make explicit a general operating requirement: the meaning of the metric must be controlled outside the answer.

## Write the metric contract

Before asking an assistant why margin moved, finance and operations should agree on the unit of analysis, formula, time window, exclusions and owner. Does “revenue” mean booked orders, fulfilled orders or paid invoices? Are refunds counted on the sale date or refund date? Which currency conversion applies? A model may produce fluent SQL while choosing a different answer to any of these questions.

The [Spider 2.0 research benchmark](https://arxiv.org/abs/2411.07763) was built from enterprise text-to-SQL workflows that often require searching metadata, documentation and code across complex databases. Its findings concern that benchmark and the evaluated systems, not a guarantee about your warehouse. The relevant lesson for an operator is narrower: a plausible query is insufficient evidence that a business term has been grounded correctly.

For each recurring question, keep a compact contract: metric name and owner; formula and grain; time zone and comparison period; source tables and freshness; exclusions; and two known-good examples. When the definition changes, record who approved the change and which historical comparisons must be restated. This contract is useful with or without an AI interface.

## An illustrative investigation

Suppose a weekly report shows that revenue rose while gross margin fell. The assistant first checks whether both figures use the same cohort and closing date. It decomposes margin into price, discounts, product mix and cost movements, then links the largest candidate driver to the underlying orders and cost records. If supplier costs have not yet arrived, it labels the conclusion provisional. The finance lead reviews the source rows before changing a discount rule.

There are several valid outcomes. The explanation may identify a real discount change. It may reveal that a refund batch was booked late. It may find a join error that duplicated some orders. Or it may say the available records cannot distinguish the alternatives. The last answer is useful when it prevents a false operational response.

The evidence chain should be short enough to follow: observed metric → candidate driver → source record → business decision. The earlier [operating-layer article](/blog/ai-operating-layer-for-business) describes where that decision sits in the wider workflow; [agent boundaries](/blog/bounded-ai-agents-for-business) matter if the analysis proposes changing a rule or sending a message.

## Speed has a place, and so does review

The strongest objection to this approach is that not every dashboard question needs a forensic trail. A rough orientation for a low-stakes meeting may justify a quick answer. The answer still needs to say what it did not check. When a result will change a price, budget or customer promise, the source path becomes part of the decision, not an optional appendix.

Start with three recurring questions that already lead to action. Save a known-good answer for each, including the source rows and metric definition. Compare the assistant’s explanations against those cases and record where it chooses the wrong period, joins the wrong grain or overstates a hypothesis. If the team cannot agree on the metric contract, fix that first. More natural language will not resolve a disputed definition.

## Sources

- [Snowflake: Overview of semantic views](https://docs.snowflake.com/en/user-guide/views-semantic/overview)
- [Snowflake: Cortex Analyst](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst)
- [Lei et al.: Spider 2.0 enterprise text-to-SQL benchmark](https://arxiv.org/abs/2411.07763)

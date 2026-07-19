# Statistical and evidence analysis plan

Status: **draft 0.1.0; not approved or frozen**.

## Analysis populations

- **Consented-started:** all consented participants who begin at least one task.
- **Protocol-complete:** participants completing both conditions without a critical documented outage.
- **Task-level:** every eligible task attempt, retaining failures and timeouts.
- **Workload:** aggregate office/category windows meeting comparability and small-cell rules.

The primary analysis population must be chosen before freeze. Report both consented-started and protocol-complete summaries; never remove failures merely to improve time results.

## Outcome derivation

- Completion rate: complete attempts / all eligible attempts.
- Time on task: milliseconds from task reveal to completion/timeout; incomplete attempts remain visible and use the frozen time-to-event or capped-time rule.
- Navigation burden: steps, wrong-page visits, backtracks, and reformulations.
- SEQ: item score 1–7 by task and condition.
- SUS: standard ten-item scoring (odd items minus 1, 5 minus even items, sum × 2.5). Do not alter wording/scoring and still call it SUS.
- Retrieval: Recall@k, Precision@k, MRR, and nDCG from frozen expected chunks/documents.
- Answers: reviewer-scored correctness, citation precision/completeness, material unsupported-claim rate, abstention/escalation accuracy.
- Workload: inquiry/duplicate/escalation rates and mean/median response/handling time where denominators and collection procedures are comparable.

## Confirmatory comparisons

- Paired condition difference in completion using a paired binary method or participant/task mixed model appropriate to the final sample.
- Paired duration and navigation differences using distribution-appropriate paired estimates; report median differences and bootstrap confidence intervals when skewed.
- Paired SUS/SEQ differences using protocol-defined tests plus effect sizes and confidence intervals.
- Sequence and carryover diagnostics are reported; they do not automatically erase an unfavorable result.

The exact model/test, alpha, effect-size measure, bootstrap count, and multiplicity family are frozen after pilot diagnostics and before primary data inspection.

## Missing data and exclusions

- Never impute success for an incomplete task.
- Distinguish participant withdrawal, timeout, technical failure, and missing questionnaire response.
- Report missingness by condition and reason.
- Any imputation or sensitivity analysis must be prespecified before freeze.
- Outliers remain in the primary dataset unless a protocol-defined instrument/technical error is proven; include sensitivity analysis when exclusion changes conclusions.

## Quality and reviewer agreement

- Gold retrieval/answer cases require independent review.
- Material answer claims are scored against cited eligible chunks.
- Record reviewer identity, rubric version, disagreement, adjudication, and correction.
- Report inter-rater agreement for subjective answer labels when sample size permits.

## Decision and reporting rules

- Engineering thresholds are release gates, not proof of improved user outcomes.
- Report point estimates, uncertainty, denominators, missingness, effect sizes, and limitations.
- “Faster,” “easier,” “more usable,” “more accessible,” “more satisfying,” or “reduced workload” may be used as achieved findings only when the mapped evidence exists.
- A threshold miss or null/negative result is reported, not relabeled as success.
- Workload “deflection” requires explicit confirmed resolution; generating an AI response is insufficient.
- No causal statement is made beyond what the approved crossover and workload designs support.

## Reproducibility

The analysis export must be pseudonymous and include a codebook plus protocol, corpus, retriever, prompt, model, software, and dataset versions. A clean run must reproduce every reported table/figure with zero reconciliation differences.

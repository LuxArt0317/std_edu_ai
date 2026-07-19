# Research protocol

| Field | Value |
| --- | --- |
| Study code | STU-AI-CAMPUS-2026 |
| Protocol version | 0.1.0 |
| Status | Draft — pending advisor/institutional review |
| Parent specification | GitHub Issue #104 |
| Owner | Research team named in `research.md` |
| Public surface | Non-mutating bilingual information assistant, citations, directory, and campus navigation |
| Comparator | Current official STU website experience |
| Product extension excluded from outcome evidence | Authenticated School OS / CRM |

## Purpose and research questions

The study evaluates whether a governed AI information layer improves finding official university information without replacing university decisions or modifying official records.

- **RQ1:** Does the enhanced public platform reduce time required to locate university information?
- **RQ2:** Does it improve task completion and reduce navigation errors/steps?
- **RQ3:** Does its assistant return accurate, relevant, source-supported answers and abstain safely?
- **RQ4:** Does it improve perceived usability, usefulness, accessibility, trust, citation usefulness, and satisfaction?
- **RQ5:** During an approved pilot, do comparable aggregate administrative inquiry and handling measures change?

## Confirmatory hypotheses

- **H1:** Median time on task is lower in the enhanced condition than the current-site condition.
- **H2:** Complete task success is higher and navigation steps are lower in the enhanced condition.
- **H3:** The enhanced condition attains the frozen retrieval, citation, correctness, abstention, and leakage engineering gates.
- **H4:** Condition-level usability/ease measures favor the enhanced experience.
- **H5:** Comparable pilot workload metrics are reported against baseline; a reduction is claimed only if measured uncertainty supports it.

H1, H2, H4, and H5 are not achieved claims. They remain hypotheses until approved study evidence exists.

## Design

Use a counterbalanced within-subject crossover:

1. Assign participants reproducibly to sequence **AB** or **BA**.
2. Condition A is the current official STU website; condition B is the enhanced public research surface.
3. Use equivalent but non-identical task variants to reduce recall.
4. Randomize task order inside the protocol-defined constraints.
5. Record condition, sequence, protocol/corpus/model version, timing, outcome, navigation steps, wrong-page visits, backtracks, reformulations, and assistance.
6. Administer SEQ after each task and the frozen usability instrument at the protocol-defined condition endpoint.
7. Collect optional open feedback after quantitative measures.

## Population and sampling

Target populations are current students, prospective students/visitors, faculty, and administrative staff who use or support public STU information. The primary analysis population and sample size must be selected by the approved power analysis before protocol freeze.

Inclusion:

- meets an approved target-population definition;
- can understand the approved Traditional Chinese or English consent;
- provides affirmative versioned consent;
- can perform web information tasks with or without ordinary assistive technology.

Exclusion:

- research-team member who built or authored the evaluated task answer;
- no valid consent or withdrawal;
- duplicate participation under the protocol's pseudonymous duplicate check;
- session affected by a documented critical outage, analyzed separately rather than silently discarded;
- task exposure during pilot when the participant is part of the primary sample.

Accessibility needs are not exclusion criteria.

## Task families and gold answers

Each condition receives balanced variants from:

- admissions and enrollment;
- graduation requirements;
- academic rules/procedures;
- programs and courses;
- administrative/student services;
- office or facility location;
- accessible campus routing;
- service hours/contact;
- deliberately ambiguous cases;
- unavailable, expired, conflicting, private, or official-decision cases requiring clarification/abstention.

Each frozen task stores a versioned prompt, condition variants, maximum time, expected official source/place, acceptable answer elements, success rubric, and failure/abstention expectation in `research_tasks.gold_answer`. Task authors may not score their own ambiguous answer without a second reviewer.

## Outcomes

Primary:

- task completion (complete vs not complete);
- duration for completed tasks;
- navigation steps;
- System Usability Scale score, if the approved validated translation and administration point are confirmed.

Secondary:

- partial/failed/abandoned outcome;
- wrong-page visits, backtracks, reformulations, and assistance;
- task-level SEQ;
- usefulness, accessibility, trust, citation usefulness, confidence, and satisfaction;
- retrieval Recall@5 and MRR;
- answer correctness, citation precision/completeness, unsupported-claim rate, abstention accuracy;
- p50/p95 answer latency and estimated cost;
- aggregate inquiry volume, duplicate rate, confirmed resolution, response/handling time, and escalation.

## Consent, privacy, and retention

- Obtain the advisor/institutional review decision before recruitment.
- Participation must not affect grades, enrollment, employment, or university service.
- Store pseudonymous participant codes separately from optional encrypted contact material.
- Consent records and response records are separate RLS-protected entities.
- Do not store passwords, raw credentials, private academic records, or unnecessary PII.
- Query/retrieval telemetry is included in research only with explicit consent.
- Apply the approved retention period, withdrawal procedure, small-cell suppression, and export rules.
- Public assistant usage outside the consented study is operational telemetry, not participant evidence.

## Protocol freeze and amendments

Version 0.1.0 is not frozen. Freeze requires:

1. documented advisor/institutional requirements;
2. approved consent text and retention/deletion procedure;
3. completed pilot and documented changes;
4. power analysis and primary sample definition;
5. frozen tasks, instruments/translations, outcomes, exclusions, and analysis plan;
6. immutable Git commit plus a `research_study_versions` row with `frozen_at` and `frozen_by`.

After freeze, any material change creates a new semantic version and amendment record. Primary results must identify the exact protocol, corpus, retriever, prompt, model, and software versions.

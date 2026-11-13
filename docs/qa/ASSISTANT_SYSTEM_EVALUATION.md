# System-wide student assistant evaluation

Issue [#100](https://github.com/LuxArt0317/std_edu_ai/issues/100). Work in progress. The previous #99 proof verifies a bounded LangGraph loop and five private model examples; it does not establish whole-system answerability.

## Acceptance contract

Discover the authoritative service catalog, registered account tools and copied public-page manifest at run time. Every service has navigation, populated-record, empty-record and action-boundary questions. Additional independently authored cases cover DTM lessons/materials/assignments/grades, current/past/future study records, fees, native academic records, privacy and mixed questions. Public page-context questions cover the captured-page denominator; they prove page recognition/navigation, not every possible factual question within each document.

Grade an answer against independently specified facts, dates, list members, ownership, local destinations, provenance and action requirements. A runtime `verified` flag is necessary for a verified model answer but is not the evaluation oracle. Returning an expected amount alongside a contradictory amount must fail. Refusing a question whose authorized evidence exists must fail answerability. Missing capabilities remain visible separately from safe abstention.

Four distinct evidence levels must never be conflated:

1. Inventory: discovers cases and exposes missing coverage; executes no chatbot.
2. Retrieval contracts: inspect which owned evidence actually reaches the model.
3. Deterministic drafts: isolate routing/date/filtering failures; exercise no model.
4. Live model: uses the actual signed-in or public assistant endpoint, independently seeded disposable records and complete per-case results. Only this level can satisfy the semantic release gate.

The complete gate also requires privacy/action/conversation/browser acceptance. Exact owned records, confirmation-before-write, replay/stale protection, durable observable activity and multiple conversation isolation remain mandatory. A draft, note or personal assignment status must never be described as an official school application, payment or Moodle file submission.

## Running

Use Node24 from the project environment. No new testing service or provider account is required.

```sh
node tests/evaluation/run.mjs --mode inventory --now 2026-11-13T02:00:00Z
node tests/evaluation/run.mjs --mode retrieval --only account:
node tests/evaluation/run.mjs --mode draft --domain dtm
node tests/evaluation/run.mjs --mode live --only public-service-
```

`--only` selects an ID prefix; `--domain` selects one domain; `--max-cases` bounds a diagnostic run. Partial runs are never release-ready. Reports are written atomically with owner-only permissions under ignored `artifacts/assistant-evaluation/`. Inventory exits successfully as a discovery operation and explicitly reports `releaseReady:false`. Other runs exit nonzero unless the complete semantic gate passes.

Signed-in live runs require a repository fixture adapter via `--fixture-module`, with `prepare`, `forCase` and `cleanup` exports. It must create only disposable synthetic accounts, assert the exact client Supabase project, record a cleanup ledger, return a token only in process memory, and prove exact fixture removal. A real user's session must never be silently reused. The runner refuses other origins, arbitrary endpoints and adapters outside `tests/evaluation`. Coordinate database/model leases in `agent/A2A.md` before live work.

Runtime and question-bank fingerprints accompany reports. A source change during a run invalidates release readiness. The current local report is not a claim about a deployed version; production acceptance must name the deployed revision and match it to the tested runtime.

## Repairs under evaluation

- The LangGraph retry can reconsider omitted read tools, refresh owned records, and perform one correction followed by a second verification. Retry cannot change the original proposed action or initiate a new public search.
- Question, record reference, course, academic term and route selection happen before byte budgeting. Whole records, ownership, parent/child lineage and explicit omission counts survive the bounded evidence projection. Citation destinations come only from included records.
- Saved notes can be queried across all service trackers. A local note, filed tracking status or personal assignment flag is never evidence of an official submission, approval or payment.
- DTM answers cover material contents, feedback, linked missed-meeting work and tomorrow filtering. Next-class calculation considers future terms beyond an arbitrary short date window. Named teacher/room questions and unfinished-task filters now preserve the requested scope.
- Evidence review supplies exact JSON field addresses and reports invalid reference feedback to the correction step. An invalid pointer cannot approve a claim even if the model says it is supported.
- Embedded chat preserves its same-origin host page path and query. The public handler reads only checksum-verified captured pages, and signed-in mixed questions keep public page evidence separate from private records. Public dispatch uses the same candidate runtime rather than silently calling production.

These are implemented changes with automated regression coverage, not a claim of completed live-model acceptance.

## Known coverage gaps

The bank includes questions for each of the 94 service entries and the 395 captured public pages. Four service cases cover navigation, populated records, absent records and action boundaries. Account-specific cases cover tool selection, academic history, native grades/attendance/graduation, DTM, fees, privacy, actions and follow-ups. An inventory entry is not evidence that a native workflow exists.

- Many listed services have generic account-owned notes rather than dedicated institutional workflows. The report keeps these capability gaps separate from successful note lookup or a correct refusal.
- Course catalog search, certificate assessments and DTM file-submission/review metadata have dedicated backends. The current account assistant does not yet expose dedicated readers for those stores. The certificate UI deliberately does not issue official documents; the DTM personal tracker is separate from its real file backend.
- Fifteen captured public pages contain AccessDenied/XML error documents with no verified page title. Their tests require an explicit limitation, local link and capture date. Empty strings cannot satisfy a title assertion.
- The disposable live fixture adapter does not publish global notices, elevate administrators, mutate shared course catalogs, or create real payment transactions. Unsupported fixture configurations are setup failures, not model failures or passes.
- Only live endpoint evaluation, matched deployment provenance, fixture readback/cleanup and independent browser observations can satisfy the complete release gate. The existing Vercel preview is protected by SSO and the local approved environment has no model API key; local contracts do not substitute for that gate.

## Current evidence and future runs

Run the offline evaluation contracts with `node --test tests/evaluation/*.test.mjs`. Run the full API regressions with `node --experimental-strip-types --test tests/api/*.test.ts` on Node24. These commands need no live model or database credentials.

For an authorized live run, use `node tests/evaluation/run.mjs --mode live --only account:dtm-feedback --fixture-module tests/evaluation/live-fixtures.mjs`. The adapter creates two fresh synthetic accounts, verifies authenticated snapshot ownership, seeds only owned records, checks readback after each question, and verifies deletion in `finally`. The cleanup ledger is ignored, private and retained on cleanup failure. Read the per-case report even when the process exits nonzero: a diagnostic subset is intentionally not release-ready.

Draft mode is a routing diagnostic, not the complete account graph. It does not run the model planner, verified correction or action receipt preparation, so missing tool/verifier/action checks in a draft report are not live-model outcomes. No recurring paid-model job is installed; the suite is available on demand and should be rerun after material data, tool, prompt or model changes.

## Evaluation method

The design follows task-specific datasets, explicit criteria, tool-selection checks and repeated evaluation described in [OpenAI's evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices). It runs in this repository instead of depending on a hosted evaluation product. Independent facts and executable checks are primary; optional semantic review cannot turn missing test execution or unsupported capabilities into a pass. Human relevance review remains useful for nuanced answers and must be recorded honestly when performed.

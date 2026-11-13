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

Live requests start at least 5.5 seconds apart, including signed-in requests that may delegate to public research. `--interval-ms` can increase this interval to 60,000 milliseconds; it cannot disable the minimum. Slow model responses already satisfy the interval and incur no additional delay. Reports include the configured pacing and each request's wait. A 429 or other failure remains an observed failure: the runner never automatically retries it into a pass.

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
- Course catalog search, certificate assessments and DTM file-submission/review metadata have dedicated backends. Four supplemental readers are integrated in the working tree and undergoing independent review; they are not yet accepted on the deployed assistant. The certificate UI deliberately does not issue official documents; the DTM personal tracker is separate from its real file backend.
- Tuition settlement statements are a separate native store from cumulative charge balances. Its supplemental reader preserves literal saved text; it cannot establish a dated payment ledger, issued receipt, waiver/refund transaction or extended-study record.
- Fifteen captured public pages contain AccessDenied/XML error documents with no verified page title. Their tests require an explicit limitation, local link and capture date. Empty strings cannot satisfy a title assertion.
- The disposable live fixture adapter does not publish global notices, elevate administrators, mutate shared course catalogs, or create real payment transactions. Unsupported fixture configurations are setup failures, not model failures or passes.
- Only live endpoint evaluation, matched deployment provenance, fixture readback/cleanup and independent browser observations can satisfy the complete release gate. The existing Vercel preview is protected by SSO and the local approved environment has no model API key; local contracts do not substitute for that gate.

## Current evidence and future runs

Run the offline evaluation contracts with `node --test tests/evaluation/*.test.mjs`. Run the full API regressions with `node --experimental-strip-types --test tests/api/*.test.ts` on Node24. These commands need no live model or database credentials.

For an authorized live run, use `node tests/evaluation/run.mjs --mode live --only account:dtm-feedback --fixture-module tests/evaluation/live-fixtures.mjs`. The adapter creates two fresh synthetic accounts, verifies authenticated snapshot ownership, seeds only owned records, checks readback after each question, and verifies deletion in `finally`. The cleanup ledger is ignored, private and retained on cleanup failure. Read the per-case report even when the process exits nonzero: a diagnostic subset is intentionally not release-ready.

Draft mode is a routing diagnostic, not the complete account graph. It does not run the model planner, verified correction or action receipt preparation, so missing tool/verifier/action checks in a draft report are not live-model outcomes. No recurring paid-model job is installed; the suite is available on demand and should be rerun after material data, tool, prompt or model changes.

## November 13 acceptance findings

The first deployed candidate failed before model execution because an emitted API entry imported a TypeScript source file absent from the Vercel function bundle. The subsequent `ecf5a5e9e2a665fa5f9d01ec735476db0bcd1004` hotfix moved the unchanged shared handler into an emitted JavaScript module. Both public assistant endpoints then returned their expected JSON method/validation errors, and compiled-import regression coverage was added.

Three serial real-model native suites ran against that recovered deployment using disposable actual-JWT accounts. They did **not** establish acceptance:

- Grades returned supported transcript, warning and ranking facts. The suite stopped on an overly literal ASCII-parenthesis ranking assertion despite correct Traditional Chinese punctuation. The assertion now normalizes Unicode and checks both semantic labels and literal rankings; the rest of the suite still requires a rerun.
- Graduation withheld the answer after two failed evidence checks. Independent inspection found an exact-reference guide that exhausted its per-source allowance before required/matched/other course fields, plus unsupported administrator-maintenance attribution. The pending fix makes reference guidance fair within the existing global caps and removes that unsupported attribution. Strict claim/reference validation remains mandatory.
- Empty attendance returned a generic unverified answer instead of the specific missing-current-term limitation. Pending correction guidance distinguishes an explicitly absent designation from a failed or incomplete read; a corrected answer still requires independent verification. The saved artifact contains the final failure reason, not the reason for each earlier attempt.

All three runs removed their exact fixtures, preserved the existing owner, and were followed by an independent reserved-identity query reporting zero leftovers. These are failure/cleanup observations, not an aggregate model pass. Corrected runtime files must be deployed and the suites rerun before changing their acceptance status.

The separate conversation-persistence migration `20261112190000` passed a rollback-only PostgreSQL preflight at 127 migrations and 144 public RLS tables. It tested 8,000-character answers, 40 observable activity steps, reopening, replay/stale edits, Unicode, exact 24-message/190,000-JSONB-byte limits, own/cross-account/administrator/anonymous/non-Google boundaries, and the 100-conversation quota. Function definition, ACL, baseline counts and protected-owner fingerprints were restored with no synthetic rows remaining. This establishes SQL/RLS behavior only; permanent migration application and actual HTTP/browser persistence acceptance remain separate release steps.

## Additional backend coverage audit

Inspection of the current `affairs-data` dispatch and default snapshot found a tool for each of the 17 default collections. The working-tree integration adds four selected supplemental readers and their bounded presentation: published catalog/syllabus, own certificate assessment, own committed-file/revision reviews, and own tuition statements. Discovery now lists 21 tools while preserving the 17 default collections. Their helper and graph tests are not proof of deployed answerability.

The audit also identified narrower gaps that must not disappear from the coverage report:

- The syllabus options endpoint exposes available terms/departments. The catalog helper does not yet read those options or support every legacy catalog filter. Instructor, weekdays, periods, credits, program and language filters require a published-only implementation; the administrative catalog reader must not become a personal assistant shortcut.
- Saved conversations can be reopened in the UI, but the model cannot search all previous sessions. Historical assistant answers would need to remain distinct from authoritative academic records if that feature is added.
- Some source-specific identity/contact fields in housing, student aid, leave and native academic reports are deliberately omitted from general evidence. Direct questions about them need explicit requested-field projections on selected owned records, not indiscriminate inclusion of sensitive application fields.
- Snapshot history has explicit collection caps. A capped result cannot answer “all my history” as complete without a query-specific paginated read.
- Signed file-download URLs are short-lived capabilities, not model evidence. The authenticated assignment page remains the appropriate download destination.
- The new student-conduct implementation is a separate pending release. Generic service notes for its route do not establish native conduct-report coverage.

The deployed persistence harness `tests/integration/assistant-conversation-http-live.mjs` requires the exact production revision and applied migration `20261112190000`. It uses two disposable real-JWT accounts, actual HTTP writes/reads, cache-empty browser restoration, 40 expandable observable steps, an 8,000-UTF-16-unit answer, replay/stale protection, cross-account isolation and real local-scope sign-out. Its answer text is an explicitly synthetic persistence fixture, and its report always states `modelAcceptance:false`. Passing this harness cannot substitute for model/SSE or whole-site browser acceptance.

## Evaluation method

The design follows task-specific datasets, explicit criteria, tool-selection checks and repeated evaluation described in [OpenAI's evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices). It runs in this repository instead of depending on a hosted evaluation product. Independent facts and executable checks are primary; optional semantic review cannot turn missing test execution or unsupported capabilities into a pass. Human relevance review remains useful for nuanced answers and must be recorded honestly when performed.

## Reviewed November13 repair candidate

Independent reviews passed native field-guide/course-selection repairs, per-conversation persistence and account isolation, fixture lifecycle recovery, bounded protocol diagnostics and the no-model deployed conversation harness. The exact isolated candidate passed594 API/source checks,252 unit checks and289 offline evaluations; the added HTTP harness passed9 offline contracts separately. TypeScript/build/lint/handoff/audit passed, with existing lint warnings. These counts are offline contracts, not successful model answers.

Migration190000 passed repeated rollback preflight at128 migrations/146 RLS tables, restoring function/ACL/owner/baseline exactly. The reviewed migration plan then applied only190000; current client129/146,200000 deferred. The application preserves its existing8000 UTF16-unit text limit without splitting code points; PostgreSQL permits8000 code points. The synthetic8000-BMP fixture satisfies both.

Production persistence verification uses `ASSISTANT_ORIGIN=https://stu.best EXPECTED_RELEASE_REVISION=<full-reviewed-sha> node tests/integration/assistant-conversation-http-live.mjs` under the root's serialized lease. It uses actual deployed HTTP/caller JWTs and browser reload/40-step expansion, labels synthetic answer provenance, and reports modelAcceptance:false.

## Production reruns on 772ec95

The native/durability runtime `772ec95ae0196499251c8ae0df3ab586b52e6c74` is deployed. Conversation run `727423ae-60aa-4813-b460-70e3ff00251a` passed all four groups with 13 HTTP and 22 browser requests: durable long-answer/40-step restoration, replay and stale protection, account isolation, actual browser autosave and local sign-out. Exact fixture cleanup and protected-owner preservation passed. No model calls occurred in that persistence run.

Graduation run `97c178c3-9a3b-4577-83f1-ebb17961a5d7` passed all four groups, including actual-model verified answers, separate modern/legacy report selection, account isolation, deployed navigation/layouts and actual-JWT mutation/replay/conflict checks. Cleanup completed with no failures and the owner fingerprint was preserved. Earlier run `4fca9264-52b4-40f2-984c-94aaf23bf601` was interrupted during a disk-space incident: read-only reconciliation found no matching records, operation receipts or recent synthetic accounts, but its final report and original owner-preservation result were not observed. It is not counted as a pass.

Grades run `679298e5-822e-429d-8d59-e305d82270d9` passed all four groups, including the five actual-model answers, literal transcript/warning/ranking values, a supported grade-view clarification, account isolation, deployed page layouts and manager replay/conflict/clearing checks. Exact cleanup completed without failures and the owner fingerprint check passed. The test-only clarification fix accepts legitimate English/Chinese choices while still requiring supported views, local grounding and no implicit write.

Attendance run `1b97e0d5-de4d-4628-a1fb-415c6cbc2d77` still failed its initial missing-current-term question: the actual model withheld the answer after two evidence checks with `unsupported_claims`. Cleanup and the owner's final fingerprint check passed. Live provider-log metadata reported one unsupported claim on each review, with `answersQuestion:true` and no unmatched references; the specific rejected claim was not retained. This remains a real answerability failure; the harness has not been relaxed to accept a generic refusal.

# System-wide student assistant evaluation

Issue [#100](https://github.com/LuxArt0317/std_edu_ai/issues/100). Work in progress. The previous #99 proof verifies a bounded LangGraph loop and five private model examples; it does not establish whole-system answerability.

## Acceptance contract

The user's four reported prompts must run in order under one disposable signed-in session. Use the [protected Preview transcript runner](../../tests/evaluation/README.md) to verify each saved turn, request scope, evidence and cleanup. Two independent helpfulness reviews are required alongside factual grading. The committed offline replay runs in CI and gives no live acceptance credit.

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

- The signed-in leave reader covers saved history, archive, periods and an exact form. The test bank maps all four previously untested leave routes. Forty-two new native cases and nine retained legacy cases require pinned live fixture coverage before release acceptance.
- Native Moodle assignment and grade clauses select distinct readers and use field-level references. Failed verification withholds the new scoped result cards. The 32 native Moodle questions count toward the suite, and their independent live fixture remains pending.
- The LangGraph retry can reconsider omitted read tools, refresh owned records, and perform one correction followed by a second verification. Retry cannot change the original proposed action or initiate a new public search.
- Question, record reference, course, academic term and route selection happen before byte budgeting. Whole records, ownership, parent/child lineage and explicit omission counts survive the bounded evidence projection. Citation destinations come only from included records.
- Saved notes can be queried across all service trackers. A local note, filed tracking status or personal assignment flag is never evidence of an official submission, approval or payment.
- DTM answers cover material contents, feedback, linked missed-meeting work and tomorrow filtering. Next-class calculation considers future terms beyond an arbitrary short date window. Named teacher/room questions and unfinished-task filters now preserve the requested scope.
- Evidence review supplies exact JSON field addresses and reports invalid reference feedback to the correction step. An invalid pointer cannot approve a claim even if the model says it is supported.
- Embedded chat preserves its same-origin host page path and query. The public handler reads only checksum-verified captured pages, and signed-in mixed questions keep public page evidence separate from private records. Public dispatch uses the same candidate runtime rather than silently calling production.

These are implemented changes with automated regression coverage, not a claim of completed live-model acceptance.

### Housing, native Moodle and teaching feedback

Housing application questions have their own receipt and submission-time cases. The oracle checks saved data, exact source links and observed tool selection. A dormitory bed case cannot satisfy that source check. The native DTM grade cases compare saved report and overview values against caller-bound fixture rows, including blank and zero grades. The 14-case DTM packet uses offline fixtures, and the live multi-course adapter remains open.

The [teaching feedback admission](TEACHING_FEEDBACK_LIVE_EVALUATION.md) puts 40 independent cases in the full runner denominator. They remain unexecuted setup failures while caller-bound fixtures and trusted request observations are unavailable. Test passes for the admission code do not satisfy those question gates.

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


## November 14 candidate and acceptance

The candidate adds scoped conduct and loan readers, preserves an explicitly named academic term, and keeps a prior user-named course consistent across evidence, review, correction and record cards. General career coaching reads no student records. Mixed course catalog and Moodle questions compose from both selected sources before the first review. Correlation IDs join private evaluator reports to count-only model diagnostics.

The current bank has 959 API cases. Source discovery includes 576 route patterns, 74 uncovered semantic routes and 586 required browser observations. The runner also records 50 browser-dispatch questions across ten native scopes as a separate unexecuted acceptance requirement. Graph API results cannot satisfy these cases.

Run the reported conversation against the pinned candidate with `node tests/evaluation/run.mjs --mode live --only account:reproduction- --fixture-module tests/evaluation/live-fixtures.mjs --out artifacts/assistant-evaluation/issue100-reproduction.json`. The six SAMP cases require an exact read-only binding of the five published sample sections and the saved sample quiz. The adapter seeds only disposable account records, reads them back through the actual authenticated API, and verifies fixture and protected-owner cleanup. The other relevant prefixes are `account:student-conduct-`, `account:student-loan-`, `account:catalog-` and `account:tuition-`. Run serially under the shared lease. A partial packet remains ineligible for the whole-system release gate.

An existing model-enabled deployment must match the evaluated Git revision. The reproduced career coaching and record overview require separate evidence-bound helpfulness assessments. Retain the original failed or unreviewed reports and save independent review to a new report.

## Aid claims and salary next candidate

The browser sends saved aid claim and salary questions to the account verification graph. The reader uses the caller's existing aid inquiry RPC. It supports count-only queries and literal details for the selected claim or salary view. It separates a completed zero-row read, missing fields, a failed view, and an excerpt. The assistant does not receive bank suffixes or use saved salary amounts to establish a bank transfer.

Eight aid cases cover registered tools, claim status, multiple pay periods, tax zero versus missing, both inquiry views, empty records, unknown bank settlement and foreign access. The two-owner fixture checks actual scoped detail and summary replies before and after a question. Its tests simulate both sides of a lost transaction acknowledgement and reject unplanned owned rows. The Chromium entry suite with synthetic responses confirms that a compound salary request enters the graph endpoint and retains activity. No model or live database acceptance has been established for this candidate.

## Native Moodle grades

Plain Moodle grade prompts select the caller's saved native report. A personal grade-tracker request still selects the tracker, and a file review or assignment request selects its own records when asked separately. The result preserves stored text and prioritizes requested totals and feedback when the report is large. Detail citations open the exact course report. The fixture independently covers missing reports, missing totals, zero weight, stored totals in a 20-item report and late-item feedback. It journals both sides of a transition and checks the caller-owned detail endpoints and cross-owner denial before and after a model request. The authenticated handler and Chromium dispatch were checked with synthetic responses. No live fixture or model run has verified this revision.

The study-planning repair passed injected-source checks with the recorded first-week prompt. Its actual model response still needs review against the public-resource and helpfulness criteria. The current inventory lists 975 cases across 576 routes. It still has 73 route omissions and 45 separate direct-reader browser questions that require execution. Counts describe the inventory. Titles, links and generic saved notes alone cannot establish native workflow behavior.

## Remote-learning enrollment with DTM assignments

The signed-in browser previously returned a separate remote-learning reply before the verification graph could read DTM assignments. The replacement uses the caller's native remote-learning workspace, joins saved enrollments to their catalog titles, and passes that evidence alongside DTM assignments to the same answer review. Course listings without an owned enrollment stay outside the model evidence. Remote-learning personal grades, assignments, submissions and attendance remain unlinked. An unavailable lookup stays distinct from a successful lookup with zero enrollments.

The four new signed-in cases cover saved enrollment, a compound assignment question, an empty enrollment list and an unlinked-grades answer. The fixture checks its saved catalog references, the two disposable owners' distinct enrolled course IDs, exact readback, and the before/after digest without changing shared catalog rows. The release runner verifies the exact manifest before fixtures or assistant requests and checks it again after each request and cleanup. A protected preview counts only once the runner can read and verify it through authorized access.

With mocked Auth and HTTP responses, the School Affairs Chromium suite reopened the combined answer after reload and expanded both recorded checks. The remote-learning Chromium suite observed the authenticated graph request for courses and grades from My courses. A separate planner regression verifies that the page supplies the remote-learning scope for unqualified course wording. The independent formatter test rejects enrollment dates attached to an unrelated course, unsupported grades from DTM or Academic Services, and a response that treats a failed lookup as a confirmed empty list.

The combined worktree passed 1,219 API/source tests and 612 evaluator tests. The inventory now contains 980 cases, 72 route omissions out of 576 routes, and 40 direct-reader questions awaiting live browser acceptance. The facility repair packet exercises owned status, handling notes and a compound timetable question offline. Its reader still needs mounting through the graph. Course-outline activity questions also require a separate evidence reader. The protected `c77b3c7` preview verified the earlier public first-week reply with three links. Its signed-in model gate and the combined candidate's live evaluation remain open.

## Facility repair status and next class

The account assistant sends repair history questions through LangGraph. A specific report returns its saved status and, when requested, its latest saved handling note. The source does not identify the note author or confirm physical completion. Combining repair status with the next class requires both the repair reader and School Affairs timetable. A failed repair lookup leaves the requested status unknown, even if the timetable can be read independently.

The facility fixture verifies both disposable owners before touching report or event rows. It journals the previous and pending plans, checks exact persisted fields, reads both caller-authorized lists and details, and requires 404 for missing and other-account reports. It reads both owners before and after each response. The grader requires unchanged owned-record digests for signed-in repair cases. A case with uncertain cleanup cannot count toward live acceptance.

Fifteen native repair cases include both repair-plus-class question orders. They bind the published sample timetable and freeze the next occurrence in Taipei before the request. The evaluator checks that the same occurrence still applies immediately before the assistant POST and after the fixture readback. Synthetic failed reads and incomplete event histories remain in the offline packet. The inventory now has 996 cases and 35 separate direct-reader questions. The public production manifest still identifies `076c79a`. The prior enrollment candidate `1b97a1c` matched all 99 allowlisted files and passed GitHub Quality `43593442884`. Its public guide passed in the authorized preview browser. Vercel device authorization is still pending for the signed-in runner.

### Dormitory notices and remote-learning outlines

The browser sends both sources through account verification. A dormitory notice at 34-2 reads only the signed-in caller's saved metadata and distinguishes the stored values `empty` and `unknown` from a missing notice or failed read. A request for a bed number, housing fee or tuition balance uses its separately selected source. The outline reader uses the course and activity selectors available to the caller. Its answer retains the exact activity and section together with the local link. It cannot infer file content, attendance, completion or enrollment from the outline.

Ten authored dormitory cases and five outline cases each declare required and forbidden tools, facts, local links and unchanged owned records. Add `--only account:dormitory-conduct-` or `--only account:elearning-outline-` to the pinned live command. The adapter journals exact preceding and pending records before changing disposable notices or access links, reads the native endpoints as both fixture users, verifies cross-course access, and checks exact cleanup. The published outline rows are never changed for a run. Offline transport and browser tests are separate from a signed-in actual-model result.

### Tuition remission and fee balance

School Affairs service 21-3 provides the caller's saved tuition-remission history. LangGraph uses the caller's fee-remission reader for that question and separately reads the caller's charges when an independent balance is requested. The balance reader checks the associated student and charge rows. The fee-remission reader preserves literal year, semester, category, amount and checking status. Empty text, missing data and stored zero remain distinct. Payment, approval, eligibility and document issuance need their own evidence. The assistant asks which academic period the student means when the records cannot establish the requested period.

The local handler tests inject the two source responses and the verification model. They cover refusal of foreign-account requests, guest sign-in links, both orders of the compound question, a failed charge read with an independently verified remission answer, and an independently checked correction after a source reread. The browser entry test uses synthetic authentication and checks that the combined question sends one graph request and preserves both activity labels. The independent bank adds 20 prospective live cases and seven offline controls. Signed-in model acceptance requires an accessible pinned Preview, both disposable owners' native readbacks and verified cleanup.

### Health examination availability

Service 36-1 questions use the signed-in account's existing paged inquiry. The assistant receives examination codes, the paired report-availability flag, and explicit page counts. The verification graph can retry the same selected page, keep the total distinct from the number of rows on that page, and distinguish a failed read from an empty result. Clinical content, examination dates and file authorization stay in their existing service flows. Navigation questions give the relevant page link. Signed-out inquiries return to sign-in with the requested local page preserved. Combined tuition questions read charges separately and retain verified facts if one source is unavailable.

The 26-question health packet includes 19 planned live cases and seven offline controls. Sixteen planned cases use only disposable health metadata or verify an access boundary. Three need a separately prepared charge ledger. The pure fixture plan includes two account owners, exact paged DTOs and cleanup contracts. Its planned rows keep all report flags false. The true-flag control uses a synthetic native response. The API and Chromium checks run with injected provider boundaries. Signed-in deployed-model evaluation, private object testing for live true flags, and fixture cleanup acceptance remain pending.

### Counseling appointment history

Questions about counseling appointments enter the verification graph with the current caller's native appointment reader. The answer keeps a preferred date or period separate from a scheduled time, and treats cancelled and closed appointments as historical. A successful empty response and a failed read produce distinct answers. A response at the native 50-row limit leaves the total unknown. Booking, cancellation, private notes, identities, files and coordinator views have no authority through this reader.

An exact combined fee question reads the caller's charge records separately. Both sections use bounded evidence, and the independent review can reject the draft and force both readers to refresh. The displayed charge card uses the same evidence as the answer. The signed-in endpoint and browser tests exercise both question orders, an unavailable source and unrelated or excluded questions with injected dependencies. The 28-question independent packet includes 21 planned model cases and seven offline controls. The fixture plan specifies both disposable owners and exact cleanup. Three planned cases require an independent charge ledger. Deployment acceptance still requires the isolated live fixture adapter and authorized runner access.

### Graduation clearance

The assistant reads saved clearance applications and assigned windows through the caller-only School Affairs endpoint. Each decision retains its term and office. An office note is included only when requested for that office. The separate Academic Services graduation reports remain independently routed.

For a combined question, a narrow enrollment read calculates the next class in Asia/Taipei and links to My Subjects. The two sources refresh after a rejected draft. A failed timetable read, an unlinked student, and a successful lookup with no future meeting have distinct results. An unsuccessful source does not prevent the other part from being verified.

The independent packet covers 34 questions, including 25 planned fixtures and nine offline controls. The planned cases require a verified binding to existing academic terms and assigned windows. They report a setup failure before any model request until the binding and disposable-owner fixture adapter are available. Local browser and HTTP checks use synthetic authentication, scoped data and model responses.

### Tutor evaluation

Service 28-1 answers questions about the student's saved questionnaire. The assistant reads submission status and time, plus numbered responses and comments when requested. Tracking notes remain available through the separate notes page. The assistant makes no questionnaire changes. The saved form does not establish a school term, approval, delivery or receipt.

For a combined fee question, the account graph checks the selected fee and questionnaire independently and rereads both after a rejected draft. A failed read stays distinct from a successful lookup that found no submission. Private profile fields from the form never enter the assistant's evidence. Questions about other students are refused without a record lookup.

The independent packet covers 33 scenarios, with 27 planned live cases and six offline controls. Three planned cases need separate charge fixtures. The live fixture and two-account cleanup checks remain unmounted. Local HTTP, graph and browser tests use synthetic accounts, model responses and record fixtures.

### Private tracking notes

The standalone 80-question packet covers seven services (27-1, 30-1, 30-2, 31-1, 31-2, 32-1 and 35-1). `tests/api/service-notes-assistant-graph.test.ts` checks the actual graph and API against injected Supabase and model transports. `tests/integration/service-notes-assistant-dispatch-ui.mjs` tests the seven rendered pages using synthetic browser authentication. The packet still requires a live fixture adapter, approved protected Preview access and runner readback before live release acceptance.

### Student conduct at 38-1

The browser dispatch uses the verified account path for native conduct and nearby privacy or navigation requests. The conduct reader checks the signed-in account and returns literal saved cells, including blank and zero. Compound tuition and timetable requests use separate account sources. A campus conduct report and a dormitory notice have separate tools. The browser, injected HTTP and graph tests check foreign denial, latest exclusion, public and sign-in return links, independent evidence and retry. Signed-in provider evaluation remains pending.

### Aid claims and salary at 37-1

The focused API tests exercise direct account and guest navigation, wrong owners, skipped reads, page selection, stale history, and an actual caller-scoped reader behind the verification graph with synthetic HTTP. The reader uses the same saved ordering and 25-row pagination as the visible page. Rejected drafts cause a fresh read of the same selected page. The tests distinguish a failed read, zero total, an empty later page and null financial fields.

Run `node --experimental-strip-types --test tests/api/aid-payments-assistant-routing.test.ts tests/api/account-aid-payments-evidence.test.ts`. These tests use synthetic credentials and responses. The independent aid question bank and its observation checks are offline. They do not count toward signed-in acceptance on a protected deployment.

## Teaching feedback coverage

The independent 40-question offline packet models both student teaching feedback views, caller ownership, exact course filters, anonymous-response limitations and companion School Affairs requests. Intercepted API tests exercise the verification graph, including deliberate rejection and a draft that omits a requested part. The packet is outside the live fixture manifest and carries no live model acceptance.

# Student assistant evaluation

System-wide question bank, independent grading, discovered coverage and per-case evidence reports for Issue #100. See [acceptance criteria and commands](../../docs/qa/ASSISTANT_SYSTEM_EVALUATION.md).

- `surface-inventory.mjs`: discovers current catalog, tool and public-page denominators.
- `service-cases.mjs`: per-service student questions and explicit capability limitations.
- `account-cases.mjs`, `fixtures.mjs`: independent account/DTM/academic facts and questions.
- `public-cases.mjs`: captured-page context, campus navigation and anonymous privacy questions.
- `grading.mjs`, `coverage.mjs`: deterministic scoring and full-run eligibility.
- `run.mjs`: inventory, retrieval, draft, live endpoint evaluation and independent review of saved responses. Reports stay in ignored private paths.
- `client-dispatch-inventory.mjs`: source-derived questions that require execution through the signed-in browser dispatcher.

`*.test.mjs` tests grade integrity and retrieval behavior. No evaluation imports private university captures or uses a real student's records. A model's own verification result is never sufficient for passing.

`academic-grades-handler.test.mjs` replays 11 frozen Academic Services questions through the streaming handler and native row validator with controlled transport. It checks compact semester selectors, named courses, saved summaries and rankings, null versus zero, English requirement metadata, and records owned by another student. Standalone requests read only the tables for the selected view. Unsupported grade views use the capability description without a database read.

The protected Academic Services operator binds those 11 questions to two disposable callers. It checks the four native grade tables against the journaled rows and verifies both owned and crossed JWT scopes before and after every pinned answer. The operator requires native verification that rebuilds the answer, table and citation from complete caller-owned data for the selected term and view. Ambiguous or excerpted evidence retains the general verification path. The null and zero case uses the second caller. Cleanup proves the reserved rows and identities are absent. The operator checks that neither fixture acquires a School Affairs student record or a Moodle course.

```sh
node tests/evaluation/run-academic-grades-preview.mjs --preflight
node tests/evaluation/run-academic-grades-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

`dtm-native-runner.mjs` registers 18 assignment and 14 native grade questions. Controlled handler tests cover exact RPCs, caller ownership, excluded fields, nulls and blanks, grade and assignment clauses in both orders, and verification retries. The runner records these cases as pending until a caller-bound live fixture and independent observations are available.

Live fixture creation records each reserved identity's email and run marker in the ignored owner-only ledger before sending the Auth request. Cleanup reconciles both values before deleting a fixture. An ambiguous creation timeout with no matching row remains unresolved: its recovery ledger is retained and the run cannot pass cleanup. A pre-existing account or mismatched run marker is never adopted or deleted. No password or session token is written to that ledger.

The assistant registers 15 supplemental readers alongside its 17 default collections. The signed-in browser sends aid payments, native Moodle grades, remote-learning enrollments and outlines, dormitory notices and facility repair questions through the verification graph. Select the new packets with `--only account:elearning-outline-` or `--only account:dormitory-conduct-` on a revision-matched deployment. The fixture adapter checks both disposable accounts before and after each request. The grade-report fixtures include a missing report, a saved report with no total, and a 20-item report with its own stored total. Earlier native browser fixtures remain baseline evidence.

The read-only integrations are:

- Catalog: the supplemental reader calls published-only `loadSyllabusSearch` and `loadSyllabusDetail` with validated selectors and bounded pagination. It does not use the administrative catalog reader. Offering fields and syllabus sections retain local detail/syllabus links, sample provenance and explicit counts; a published offering never establishes personal enrollment.
- Certificate assessment: call caller-scoped `loadEnrollmentCertificate` from `server/enrollmentCertificate.js`. Project only the explicit term, pending-fee flag, status, result text, assessment timestamp and revision, with `/school-affairs/services/17-1`. Preserve nulls and `local_demo` provenance. Never call the admin reader for personal chat or expose document metadata as issued, verified or downloadable documents: the own endpoint deliberately returns `documents: []`.
- DTM submissions: resolve an owned assignment, then read the `dtm_submission_workspace` RPC with the verified caller's credentials. The projection includes committed/current and reviewed historical revisions, filenames, commit timestamps, review status, literal grade text and feedback joined by `upload_id`. Pending upload reservations are not submitted work. Storage paths, upload tokens, signed download URLs and reviewer identifiers stay outside model evidence. Links open the local assignment detail page; downloads remain separate authenticated UI actions.
- DTM grade reports use caller-scoped native course and report reads. A saved total, a grade item, the personal grade tracker and an assignment file review stay independent. The fixture verifies the expected response for each owner plus both cross-owner denials, and includes it in the before/after state digest. A pending transition keeps both report bindings in the recovery ledger.
- Facility repair cases check the saved status and latest handling note for the cited report. The fixture compares persisted rows, both callers' lists and details, and cross-account denials. It records previous and pending plans before writing and rejects any unexpected record change. For compound timetable questions, the independent Taipei clock oracle checks the exact published next class before transport and after readback.
- Dormitory notice cases distinguish saved empty, saved unknown and missing metadata at 34-2. The fixture verifies complete rows and the absence of actor receipts. Bed assignments and tuition balances come from their own tools, and the notice cannot establish detailed conduct history or official clearance.
- Remote-learning outline cases compare each requested activity title, section and native link against the published records. Both callers' exact course access and crossed empty responses are verified before and after each answer. The fixture creates disposable access links only and leaves shared course content intact. An empty response without course access cannot establish that materials are absent.
- Digital Academy catalog cases replay the real assistant handler and verification graph with intercepted catalog RPC responses. Independent expectations cover exact search filters, the visible result order, total counts, the empty page boundary, failed and crossed reads, and the guest sign-in return. Sixteen ordinary catalog cases and six metadata cases are eligible for protected Preview grading. Fault injection and the guest handoff remain covered by controlled handler tests.
- Tuition: read the caller's literal settlement statements separately from charge balances. Null, blank text and the literal text `0` have distinct meanings; none proves a payment, issued receipt or completed refund.
- Tuition remission uses the saved history at School Affairs service 21-3. The independent case bank checks exact literal periods, amount and status, missing fields, unauthorized account references and combined charge requests. Its fixture plan verifies both callers' complete remission and charge records independently. The planned cases remain outside default live execution.

The dedicated counseling evaluator grades nine own-appointment questions on a protected Preview, including historical statuses, preference versus scheduled time, empty history, a capped result and a follow-up. The run verifies both disposable callers through the private appointments read, compares persisted rows before and after each question, checks for counseling operation or access changes, and removes only reconciled fixture rows. Its report contains case results and hashes without raw appointment replies or caller identifiers. File activity is checked in the response stream. The operator does not observe downstream network egress.

```sh
node tests/evaluation/run-counseling-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Supply the authorized Development OIDC identity for the exact deployed project and use a clean checkout of the deployed revision. Compound tuition, access, booking, reporting and deliberately failed-read cases remain pending for independent hosted coverage.

The separate counseling cancellation packet checks the guest handoff, independent owner reads and proposal, crossed-owner and stale confirmations, one committed revision, exact replay, changed replay, and unchanged second account. It uses an owner-only report of request and state digests and verifies the exact appointment, audit operation and disposable identities are gone before acceptance. Only the known synthetic scheduled appointment can be cancelled. Booking and clinical records are outside this packet.

```sh
node tests/evaluation/run-counseling-cancellation-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION" --preflight
node tests/evaluation/run-counseling-cancellation-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

To list the isolated fee packet without contacting a provider, run:

```sh
node tests/evaluation/run.mjs --mode inventory --case-family fee-remission
```

An authorized release operator can evaluate the same 20 questions by choosing `--mode live`, supplying `--fixture-module tests/evaluation/live-fixtures.mjs`, and setting `--origin` and `--approved-preview-origin` to the same exact approved Preview. The checkout must be clean and match the pinned Preview manifest. The isolated adapter verifies both disposable student bindings, the complete fee and charge records, and the absence of operations or audit records before and after the requests. The anonymous case sends no account credential. The run verifies cleanup before reporting completion. This packet is a subset of the systemwide release evaluation.

Each integration has a selected planner capability, own-account and parent/child validation, bounded evidence, source-linked verification and observable tool events. Certificate/tuition fixtures create only exact disposable caller-owned records and verify complete scoped readback for both accounts. Published catalog cases bind through both fresh caller JWTs before model requests, save their concrete expectations and final fingerprint, and reject record/revision drift before and after each answer. Missing bindings remain setup failures with zero model calls. Catalog-only cases do not reseed private data or mutate the shared catalog.

Real file-upload fixtures remain deferred pending a reviewed Storage cleanup lifecycle; metadata-reader tests do not prove live submission behavior. Actual upload actions and certificate issuance are separate capabilities. The runner's minimum 5.5-second request-start interval avoids burst retries; errors remain failures. These are implementation and test-method statements, not a claim that the entire current deployment passes the full evaluation.

Long live runs renew only their synthetic session in memory before expiry, with fixed caller/session identity and a bounded single-attempt refresh. Failed renewal is an infrastructure/setup failure, never a model retry. Run and per-call cancellation are both honored; cleanup clears credentials before I/O.

The November13 correction batch adds a preexisting protected-owner fingerprint before fixtures and after cleanup, blocks adoption/deletion of that owner, and retains unresolved cleanup ledgers. State integrity sorts object keys only while preserving array order, timestamps and null/blank/zero; the older base ownState normalization remains a separate limitation. Browser route/auth/frame scenarios are acceptance obligations, not evidence of completed browser runs; the current inventory predates three new Loan subroutes. Repaired tuition grading must reject unsupported payment-confirmation/issued-document claims and backend-failure-as-no-records answers while preserving literal saved text. Original failed real-model runs are retained.

The verified client dispatch inventory includes accommodation beds (34-1). Route linkage is source-level evidence. Signed-in browser and model acceptance require a separately authorized evaluation run.

The 22-question accommodation bank runs through the real API with synthetic authentication, captured record reads and a controlled reviewer. An independent oracle checks facts, source scopes and limits. It does not measure live model quality or browser behavior.

The reported four-turn conversation has its own protected Preview runner. Run from a clean checkout of the deployed commit. Use `--preview-auth oidc` with an authorized Development `VERCEL_OIDC_TOKEN` already in the process environment, or `--transport-module` with an authorized operator module that exports `fetchPreview(url, init)` and follows the exact-origin contract.

```sh
node tests/evaluation/run-transcript-preview.mjs \
  --origin "$PREVIEW_ORIGIN" --approved-preview-origin "$PREVIEW_ORIGIN" \
  --revision "$PREVIEW_REVISION" --preview-auth oidc
```

This command creates disposable Supabase accounts through the client fixture adapter only after verifying the Preview release. It saves each answer through the conversation API and checks both the authenticated API response and its owner-scoped persisted row before continuing. The output reports collection, failed or pending cases, and cleanup separately. Detailed responses and the request journal are written to the ignored owner-only evaluation directory.

The Preview runner creates the same UUIDv7 chat ID as the browser. The operator transport must relay that exact conversation ID. The offline transcript tests exercise planning, all four saves, durable readback and isolated cleanup; the hosted run requires independently observed data and model responses.

### Third-stage model comparison

The benchmark runs the existing LangGraph repair and evidence review with two identical earlier rejections. It holds the evidence, question, draft, feedback, time budget and reasoning effort fixed. It uses one fictional notice and two checksum-verified school captures. An independent rubric checks the requested facts, citation, snapshot date and the distinction between a specific missing detail and a generic withholding.

Run the offline transport and scoring checks with `node --test tests/evaluation/verification-escalation-benchmark.test.mjs`. An authorized operator can explicitly run the paired calls from a clean checkout with an already provisioned `OPENAI_API_KEY` in the process environment.

```sh
node tests/evaluation/verification-escalation-benchmark.mjs \
  --live --revision "$CHECKOUT_REVISION" --report "$NEW_PRIVATE_REPORT_PATH"
```

Each repetition permits up to 12 Responses requests. The default stronger arm is GPT-6.1 Sol. Choose `--stronger gpt-5.6-sol` if that is the available comparison model. Use `--repeats 2` or `--repeats 3` to repeat the fixed cases with alternating model order. The report records whether the paired repair request bodies match apart from the model, each provider status, resolved model, token counts and stage timings. A rejected or unattempted call stays visible. An independent reviewer can rescore factual language from the public answers with the model names masked.

This tests repair plus verification after a request has already qualified for a third check. Live retrieval, natural escalation frequency, paid account access, hosted sessions and overall release acceptance require their own evidence.

The main evaluation runner also accepts `--preview-auth oidc` with `--mode live`, `--origin` and `--approved-preview-origin`. Use the deployment-specific host verified for the exact Vercel project. The transport checks the pinned revision before fixture setup and relays the token only to that host. It rejects branch aliases and keeps the Vercel header separate from the fixture user's Supabase authorization. Direct Supabase, Auth renewal and SQL connections retain their existing credentials and guards. [Vercel Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)

Club attendance has 18 independently specified cases. The live fixture verifies disposable caller-owned attendance for two accounts before and after the request. Native reader results can satisfy the corresponding live case contract without earning model execution credit. See `node --test tests/evaluation/club-attendance-runner.test.mjs` for the local runner and grading contracts.

The service-note runner registers 100 questions for the seven local-note services and separates the 99 cases eligible for hosted testing from the single controlled note-reader failure case. The two next-class cases require an independently bound Taipei occurrence and verify it through the end of the request. The signed-in fixture verifies exact owned rows and crossed access directly against Supabase for two disposable callers, alongside the pinned assistant response. The companion fixtures also verify the complete published initial timetable or exact billing rows for both disposable students. The fourteen navigation and write-boundary cases require the exact local destination, one streamed boundary event and unchanged notes. Run `node --test tests/evaluation/service-note-runner.test.mjs` to exercise the real handler with controlled transports and verify the fixture contracts.

The direct tuition payment case is a native signed-in capability check. The response must state the payment limit and link to the pending-fees page without invoking an account reader, model or payment proposal.


For Student Leave, `runStudentLeaveDataPreflight` in `live-fixtures.mjs` is the operator-only data check. It requires a clean checkout of the exact protected Preview, the authorized Development Preview token passed as `previewToken`, and the existing client fixture configuration. It creates two disposable callers and checks eight seeded data families. Each family must match the complete stored rows and all eight own/crossed PostgREST results before and after verification. The append-only recovery journal covers reserved IDs, every transition and cleanup. The operator must retain an active recovery ledger if reconciliation cannot be verified.

The preflight takes `{origin, sourceRevision, previewToken, signal}` and returns only the release, per-family digests, probe counts and cleanup proof. It runs zero assistant requests. Run `node --test tests/evaluation/student-leave-database-fixture.test.mjs` for fail-closed admission. The opt-in `STU_LEAVE_TEST_PG_SOCKET` case uses an owner-only scratch Unix socket and checks the exact migrations, journal, RLS, uncertain commit recovery and cleanup against PostgreSQL.

`runStudentLeaveHostedEvaluation({origin, sourceRevision, previewToken, caseIds?, signal?})` separately admits 18 caller-only native questions across the ordinary, archive, exact-sibling, and prior-date fixture families. It uses the same pinned protected Preview, disposable identities and fixture lease. The operator compares signed ingress, scoped database read and selected record digests against the independent plan, grades the actual terminal reply, and rechecks both callers' database state. Acceptance requires a signed native exact check and zero completed provider operations. A model review remains separately identified and earns no credit for these cases. Reports retain case IDs, digests, counts, failure codes and cleanup proof.

For the separate 14-case boundary packet, pass `caseIds: studentLeaveHostedBoundaryCaseIds()` from `student-leave-hosted-observation.mjs`. The signed receipt binds the same request, deployment, verified caller and terminal response as the read packet. A boundary passes only when the signed disposition agrees with the frozen case and both read and provider counts are zero. The 14 cases cover two navigation routes, exclusions, other-owner requests, a tampered owner parameter, ambiguous selectors, unsupported fields and a write or attendance boundary. Each request has unchanged fixture state and a paired deployment pin. Run the two packets separately to stay within the per-caller request limit. Reference-clock, reader-failure, companion and legacy cases still require separate fixture evidence. Run `node --experimental-strip-types --test tests/evaluation/student-leave-hosted-observation.test.mjs` for the controlled real-handler replay. A hosted run still requires the pinned Preview and verified fixture cleanup.


`assessTranscriptPreview(report, {reviews})` verifies request and saved-message digests and evaluates the report against the frozen cases. Supply independent review artifacts for the account overview and interview response. A completed collection can still fail evaluation. An unresolved write retains its journal for reconciliation. Never replay a pending write or use this packet alone as the production gate.

The School Affairs menu question bank covers the keyword search control and General Affairs application and lookup sections. Cases require the named controls or service entries and their exact destinations. Generic page links do not pass. The API tests exercise both signed-out public and verified signed-in paths with the model unavailable.

### Housing receipts, native Moodle grades and teaching feedback

The housing cases distinguish application receipts at 26-1 from bed assignments at 34-1. They check literal fields, missing or unreadable records, separate tool execution and each native source link. The bed-only and dormitory-plus-bed cases bind their preserved bed and fee facts to the unique published housing period for the fixture’s academic year and semester. The adapter fingerprints the independently read published inventory before setup, before dispatch and after dispatch, and checks that the second disposable account sees no housing records. Empty bed cases only check empty owned history. An absent target term keeps positive cases in setup. Housing receipt cases retain the exact agreement and application-period guard.

`dtm-native-route-cases.mjs` contains 14 independently authored cases exercised offline through the native reader and formatter, with API tests for the actual dispatch, transport contract and retry. The multi-course fixture is not mounted in the live runner.

The [teaching feedback evaluation](../../docs/qa/TEACHING_FEEDBACK_LIVE_EVALUATION.md) registers forty independent cases in the main suite. Each remains a setup failure until the native fixtures and request-bound observations are mounted.

The 12 native Moodle material cases are in `dtm-material-cases.mjs`. The protected operator mounts 11 unchanged cases for detail, list, missing link and record, bounded lists, and access and action boundaries. The simulated reader outage stays in the controlled handler evaluation. The file-content question checks only the explanation that the linked file was never opened.

```sh
node tests/evaluation/run-dtm-material-preview.mjs --preflight
node tests/evaluation/run-dtm-material-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Use the exact clean deployed source and the authorized fixture environment with the Development `VERCEL_OIDC_TOKEN`. The operator journals two disposable Google callers and every reserved course and material ID under the common database lease. Before and after each assistant request, exact SQL checks the fixture rows, both caller JWTs query the same material ID domain under RLS, and both callers read their native app view and receive an app-specific denial for the other caller’s course. The frozen grader also checks the response and account Activity. A passing report needs all 11 cases, a finished deployment pin, exact row and identity cleanup, and the unchanged protected owner. Reports store proof hashes in an owner-only directory. No Storage fixture or file download is part of this packet.
### Native internship

Complete Internship answers verify the selected typed fields, text, tables and record links directly, including an independently readable tuition balance or a unique next meeting with a saved room. Protected Preview receipts distinguish that native check from model review and from requests that perform no read. The grader still verifies raw paired reads, the selected projection and the same row-level facts in the answer. Partial, unclear, failed and other compound reads retain the regular verification path. A tied next meeting or missing saved room also stays outside the exact timetable path.

[The internship packet](../../docs/qa/INTERNSHIP_NATIVE_READ.md) registers 30 bilingual native questions for the contract, self-assessment, company application and directory. It retains four prior questions with a fixture rebind requirement. The default runner reports the unresolved setup before calling a hosted model or creating fixtures.

The School Affairs directory adds 22 bilingual catalog cases and an explicit browser-local Custom menu case. Controlled public and signed-in handlers verify links and sibling exclusions without forwarding account data. The Student Leave lifecycle stages caller and foreign sentinels, records uncertain transactions durably, and checks both owners before making any cleanup claim. The lifecycle tests do not authorize the live fixture adapter.

The protected operator mounts 26 of these questions. Run `node tests/evaluation/run-internship-preview.mjs --preflight` for the exact case counts and fixture states. See the linked packet for authorized Preview replay, independent caller and query proofs, and the remaining controlled-only cases.

The protected Internship operator includes both question orders that ask for saved contracts and the tuition balance. It binds the charge companion in the signed request, verifies the caller’s student lookup and charge projection independently before and after each answer, and checks that each disposable account can read only its own rows. The compound tuition cases require a native verification event and no provider operations. The grader checks the exact recalculated balance in the answer alongside each Internship record’s state. The two transport-failure cases remain controlled. The two frozen next-class cases still need a safe catalog binding for the exact dated meeting.

### Native venue requests

The [Venue booking evaluator](../../docs/qa/VENUE_BOOKING.md#protected-preview-ownership-replay) covers seven protected signed-in and guest cases. Its two disposable accounts hold isolated historical pending requests. The approved T0308 and fee-companion cases require a separate scratch database. Controlled outage and legacy note cases remain listed by the operator preflight.

### Confirmed facilities repair cancellation

```sh
node tests/evaluation/run-facility-repair-cancellation-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Use the exact clean deployed revision, an authorized Development `VERCEL_OIDC_TOKEN`, and the existing client fixture configuration. The 13 cases check that the assistant proposes cancellation from an exact owned report without changing it, that confirmation records one cancel event, and that a retry returns the identical receipt. They also cover the guest, unselected, other-owner, unrelated, ineligible, wrong-version, stale, and changed-retry paths. Each step compares the native API projections for both disposable callers with independently read database rows and events.

The operator report in `artifacts/assistant-evaluation` contains safe status, counts, request and receipt digests, and cleanup proof. The private fixture journal records the exact allowed native event before confirmation. Uncertain or unexpected writes leave the journal for recovery. Run `node --test tests/evaluation/facility-repair-cancellation-preview.test.mjs tests/evaluation/vercel-preview-transport.test.mjs` for the local acceptance and transport contracts.

The separate `--published-timetable` packet checks both orders of an Internship and next-class question against the currently published sample timetable. It preserves the original 30-question denominator and independently calculates the scheduled meeting in Taipei time.

### Moodle assignment lists

`dtm-assignment-list-handler.test.mjs` grades all 25 list cases through the actual endpoint using synthetic callers and controlled row requests. It checks the selected course, global personal/sample fallback, Taipei dates, exact counts, tracker states, access, retry and distinct submission and grade capabilities. Four original cases retain their earlier oracles and wait for updated fixture binding.

The isolated `dtm-assignment-list` family mounts 16 cases on protected Preview. It exercises course and account scope, a fixed Taipei due date, tracker filters, titles, exact counts, the selected sample course and signed-in and guest access boundaries. A selected foreign course must have two unavailable reads, an unverified reply and no links or records. The `dtm-assignment-list-empty`, `dtm-assignment-list-sample` and `dtm-assignment-list-partial` families add four independent scenarios. They check an empty course, sample rows hidden by existing personal courses, accurate sample fallback with no personal courses, and exactly 20 displayed links for 21 matching rows. Each family uses a separate fixture lease. Both caller projections must match the independently specified rows before and after each request. Cleanup verifies that the reserved courses and assignments are gone. Four relative-date cases need a trusted Taipei reference clock. The reader outage and four older tracker cases retain separate fixture requirements.

### Saved Moodle courses and meetings

```sh
node tests/evaluation/run-dtm-study-preview.mjs --preflight
node tests/evaluation/run-dtm-study-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Preflight lists the mounted count without accessing credentials. Run the protected command from the exact deployed revision with the disposable-fixture environment and an authorized Development `VERCEL_OIDC_TOKEN`. It mounts the five original questions about courses for a term, course roles, meeting notes, the next meeting, and attendance. It uses the original independent answer grader and requires that the assistant verify each answer from the caller's native records. Two separate JWTs verify owned and crossed reads of the exact courses and meetings before and after each pinned request. Independent SQL checks the same rows, and cleanup verifies the disposable rows and identities are gone. The local test also covers unavailable reads, invalid owner lineage, and missing meeting start times.

### Native Moodle grade reports

```sh
node tests/evaluation/run-dtm-grade-report-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Run from the exact clean deployed revision with the disposable-fixture environment and an authorized Development `VERCEL_OIDC_TOKEN`. The default runner covers ten questions about native report feedback and weight, literal item zero, an absent report, a saved report with no course total, an explicit saved total, the twentieth report item, a follow-up, unknown-course handling, and two-owner access. Each case reads both owned reports and verifies both crossed reads fail. Independent SQL verifies exact courses and report and tracker rows before and after every assistant request. The tracker has deliberately different grades and feedback for the same item labels. The runner persists pending report transitions before writes and verifies cleanup.

Three cases check different outcomes. A saved report can have no total, a selected course can have no saved report, and a complete course lookup can find no matching course. The authenticated endpoint verifies each concise answer and its link directly against the corresponding account read. The wording criteria and paired readbacks still apply. A lookup failure or incomplete coverage cannot establish absence.

Append `--overview` for six separate cases. Four entry points show the same three owned courses with null, blank, and literal zero totals. The other two cases request all feedback from a two-item report and read the second account's genuinely empty overview. This run creates only the profiles and exact fixtures needed for grades so there are no default Moodle courses. Each case checks two authenticated overviews, all three exact owner reports, all three crossed denials, independent SQL state and exact cleanup. Together the two runs mount 13 of the original 14 grade cases. The outage case stays in the controlled API test, where a 503 can be injected without interrupting a shared data source.

### Saved Moodle submission timing

```sh
node tests/evaluation/run-dtm-submission-timing-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Run from the exact clean deployed revision with the existing disposable-fixture environment and an authorized Development `VERCEL_OIDC_TOKEN`. The runner journals a two-owner fixture under the shared lease. It compares the saved submission time with the deadline captured at that upload, including an edited current due date, a missing historical due date, and a UTC follow-up. The paired authenticated workspace reads exercise all three exact assignments for each caller. The assistant tests cover the crossed caller and a guest sign-in return. SQL before and after each case verifies that the fixture metadata, audit scope, queue and Storage state are unchanged. The fixture creates submission metadata without a Storage object. Cleanup removes the exact generated rows, their trigger-created queue paths, and the two disposable accounts. The private report contains case verdicts, safe failure codes, digests, and cleanup status.

```sh
node tests/evaluation/run.mjs --mode live --case-family dtm-assignment-list \
  --origin "$PREVIEW_ORIGIN" --approved-preview-origin "$PREVIEW_ORIGIN" --preview-auth oidc \
  --fixture-module tests/evaluation/live-fixtures.mjs \
  --out artifacts/assistant-evaluation/dtm-assignment-list-live.json
```

Use the exact deployed commit, project credentials and Vercel Development OIDC identity. This command evaluates 15 fixed cases and records cleanup. Ten cases require verified saved rows, including an explicitly selected sample course. Five require a sign-in, ownership, file, grade, or bulk-submission response with the exact destination where applicable and an empty tool stream. All 15 bind the payload, endpoint, credential presence, and response correlation to before-and-after readbacks from two separate disposable accounts. The guest request goes to the public endpoint without a caller token.

### Confirmed assistant task actions

`confirmed-assistant-action.test.ts` runs the real handlers with controlled authentication and database transport. The compiled browser check `tests/integration/assistant-confirmed-action-ui.mjs` verifies the **Confirm action** button, receipt mismatch handling and reuse of the same operation ID. Run it against the local compiled preview.

The protected operator checks verified proposals, zero writes before the operator submits the confirmation, owned creation and completion, exact same-body replays, changed-payload conflict, and crossed-owner denial while the task is open and after a receipt exists. It reads the task, audit and receipt tables independently after each stage. It serializes two disposable caller identities under the shared fixture lease and verifies the task, audit, receipt and identity cleanup. The protection identity and caller JWT travel in separate headers. [Vercel Trusted Sources](https://vercel.com/changelog/trusted-sources-for-deployment-protection)

```sh
node tests/evaluation/run-confirmed-task-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Run from the clean deployed client revision with the authorized exact-client environment and Vercel Development identity. The owner-only report lists the completed operations and readback digests. This packet covers local task actions; service requests, profile changes, assignment tracking and administrative publishing have separate acceptance requirements.

### Private tuition ledger Preview

```sh
node tests/evaluation/run-tuition-ledger-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Use the clean deployed revision, the existing exact-client fixture environment and an authorized Development `VERCEL_OIDC_TOKEN`. The dated tuition migrations must already be present. The run binds two new Google-qualified student accounts under the shared fixture lease and seeds four synthetic dated events on two reserved sample charges. It checks two own reads, two crossed reads, distinct assistant month totals including a reversal and an undated balance, and anonymous denial. The selected-charge GET and the account-wide assistant answer use separate undated-balance scopes. An independent SQL read confirms that the student requests left the ledger, audits, and operation receipts unchanged. Cleanup verifies the exact charge, event, and Auth rows are absent. An unresolved row retains the private recovery ledger. Every run writes a separate owner-only report with cleanup status and sanitized failure fields when a check fails. The report covers student reads and contains no raw answers or account IDs. Staff reads and writes require separate evidence.

Conversation cleanup binds the serialized message array as text and casts it to JSONB in PostgreSQL before the exact row comparison. The fixture retains its deletion witness when automatic cleanup fails. Record any verified manual recovery separately from the original hosted report.

The Digital Academy Preview packet contains 16 course-list and search cases and six category and notice cases. Two disposable callers independently read the exact authenticated catalog or metadata RPC before and after each assistant request. The grader compares both projections with the committed source oracles and ties the response and verification events to the exact request and deployment. Catalog grading also checks each visible course title against its local link. The isolated adapter uses the existing published catalog without changing it. The two fault-injection cases and the guest handoff still require independent hosted observations.

```sh
node tests/evaluation/run.mjs --mode live --origin "$PREVIEW_ORIGIN" \
  --approved-preview-origin "$PREVIEW_ORIGIN" --preview-auth oidc \
  --fixture-module tests/evaluation/live-fixtures.mjs \
  --only account:elearning-catalog- --domain elearningCatalog --max-cases 16 \
  --out artifacts/assistant-evaluation/elearning-courses-live.json
```

For the six metadata questions, use `--only account:elearning-catalog-pending-` and omit the course domain and limit. Supply the authorized Vercel Development OIDC identity for the exact client project. A passing subset does not establish full release acceptance.

### Protected Preview School Affairs service boundaries

Run the 20 signed-in cases from the clean checkout of the exact Preview release. Use the existing disposable-fixture environment and the authorized Development `VERCEL_OIDC_TOKEN`.

```sh
node tests/evaluation/run.mjs --mode live --only account:service-notes-protected-services- \
  --origin "$PREVIEW_ORIGIN" --approved-preview-origin "$PREVIEW_ORIGIN" --preview-auth oidc \
  --fixture-module tests/evaluation/live-fixtures.mjs
```

Each of emergency injury (30-1), Student Health equipment (30-2), rental (31-2) and student insurance (35-1) has five cases. They check English and Traditional Chinese outcome requests, the exact service link, caller-owned tracking details without a university outcome, and direct requests to submit to the university. The fixture confirms distinct notes for two disposable identities and both crossed-owner denials independently through SQL and RLS before and after every request. The grader also requires unchanged rows, no proposed write, and no public research. Outcome, navigation and submission cases must emit zero account-read events. The four tracking cases must read the selected caller-owned note.

The catalog cases for dormitory notices (34-2), student-aid claims (37-1) and student conduct (38-1) use their native readers. The record cases require the exact source link and saved facts. They distinguish a missing notice, zero claim rows and zero conduct rows from financial settlement or disciplinary clearance. The 34-2 change boundary has a zero-read requirement. These services retain explicit capability gaps for unavailable documents, settlement and underlying incidents. Older saved-note controls still exercise explicit note questions independently.

The runner saves an owner-only report under `artifacts/assistant-evaluation`. A complete packet needs 20 passing results, a finished matching deployment pin and verified cleanup. The full-suite release gate still reports an incomplete run for this subset, even when every selected case passes. A successful packet verifies local navigation, tracking and safe limits. No external approval, submission, rental registration or insurance payout is part of the fixture.

### Protected Preview health-examination metadata

The isolated 36-1 packet exercises 16 independent questions about saved codes and availability, selected and empty pages, ambiguous selectors, and access or capability limits. Two disposable callers read the native metadata-only endpoint before and after each assistant request. The runner checks those results against the frozen oracle, the exact pinned assistant request, and unchanged synthetic rows. Inserts and deletes are limited to the independently reconciled synthetic metadata rows with false report flags. The cleanup journal retains the reserved IDs until absence is verified.

```sh
node tests/evaluation/run.mjs --mode live --case-family health-examination-metadata \
  --origin "$PREVIEW_ORIGIN" --approved-preview-origin "$PREVIEW_ORIGIN" --preview-auth oidc \
  --fixture-module tests/evaluation/live-fixtures.mjs \
  --out artifacts/assistant-evaluation/health-metadata-live.json
```

The packet uses no report files, real student records or tuition fixtures. The controlled real-handler test intercepts transport and verifies zero report authorization or Storage requests. A hosted result grades the visible response and account-tool events and does not supply private provider or Storage telemetry. True-report availability, forced reader failures and tuition companions remain separate controlled or unmounted cases. This subset does not establish full release acceptance.

### Protected Preview tutor evaluation

The isolated 28-1 packet grades 11 current questionnaire reads. It covers saved and unsaved states, the submission time, exact numbered scores in English and Chinese, a literal or blank comment, comment exclusion, no verified student profile, and a conversation follow-up. The two disposable accounts have distinct submissions. An independent table query asks for both owners with each caller's credential and must return only that caller's row. A separate protected API read verifies the native questionnaire for each caller. The exact synthetic rows and request keys must match before and after every assistant question.

```sh
node tests/evaluation/run-tutor-evaluation-preview.mjs "$PREVIEW_ORIGIN" "$SOURCE_REVISION"
```

Use the authorized Development OIDC identity from the clean checkout of the pinned Preview revision. The operator uses only synthetic database fixtures and calls no submission or file endpoint. Cleanup reconciles the exact disposable questionnaire rows, request keys and linked identities. Its report retains case IDs, results and hashes without raw questionnaire replies. Unsupported semester/history, approval, delivery, identity and receipt requests have no corresponding native source. Separate action, guest/navigation, tuition companion and simulated read failure cases retain their own coverage status. The controlled handler test intercepts transport to verify no form submission or Storage request, while the hosted operator checks the response stream and unchanged saved rows.

### Protected Preview club equipment readback

Use `node tests/evaluation/run-club-equipment-preview.mjs <protected-preview-origin> <source-revision>` from the clean checkout of that Preview. It uses the existing disposable-account lease and `VERCEL_OIDC_TOKEN` used by the other protected Preview operators. The run covers the latest saved status and scheduled return date, the Traditional Chinese record list, filtered count, exact request, second-account visibility, other-owner request ID, foreign-account wording, public sign-in guidance and unauthenticated API denial.

The two accounts see distinct borrowing records from an inactive fixture club. The readback checks that both can see their saved rows while both lack eligibility to book new equipment and both are denied manager review. Each request produces an independent before-and-after database digest. Cleanup verifies absence of the exact club, three borrowing rows, operation receipts, and the two disposable Auth identities. A successful report requires all nine cases and `liveAcceptance: true`. Run `node --test tests/evaluation/club-equipment-hosted.test.mjs` for the local contracts and controlled end-to-end replay.

Pass `--confirmed-cancellation` to continue with the disposable owner's submitted equipment request. The operator requires verified assistant proposals, records the exact cancellation intent before calling the action endpoint, and checks both owners and the private operation receipt after every request. It verifies crossed-owner denial, stale revision denial, one confirmed transition, stable replay, changed-payload denial, the final assistant status, exact cleanup, and the pinned release. Keep the operator's structured report owner-readable.

### Housing and dormitory conduct in scratch PostgreSQL

The replay grades the existing positive 34-1 bed and costs questions and the combined 34-2 conduct and housing question against fixed facts. The actual HTTP handlers read two synthetic Google student accounts under the real ownership policies. SQL verifies both crossed-owner denials and checks that the published period, records, receipts and audit rows stay unchanged. The transport uses a controlled answer reviewer and a private Unix socket. Hosted and model acceptance require separate runs.

The test skips unless you opt in. Run the command from the repository root with PostgreSQL's `initdb` and `pg_ctl` on PATH.

```sh
(
  set -eu
  housing_pg=$(mktemp -d /var/tmp/stu100-housing-pg.XXXXXX)
  housing_pg=$(cd "$housing_pg" && pwd -P)
  mkdir -m 700 "$housing_pg/socket"
  trap 'pg_ctl -D "$housing_pg/data" -m fast stop >/dev/null 2>&1 || true; rm -rf "$housing_pg"' EXIT
  initdb -D "$housing_pg/data" --no-locale --encoding=UTF8 --username=postgres --auth=trust
  pg_ctl -D "$housing_pg/data" -l "$housing_pg/postgres.log" -w \
    -o "-k $housing_pg/socket -c listen_addresses='' -c unix_socket_permissions=0700" start
  STU_HOUSING_TEST_PG_SOCKET="$housing_pg/socket" \
    node --experimental-strip-types --test tests/evaluation/housing-scratch-postgres-replay.test.mjs
)
```

The separately named `--published-timetable` packet checks both orders of the Internship plus next-class question. It binds the existing published sample course, term and section rows without updating shared catalog data. Two disposable students receive their own enrollment IDs from the normal insert trigger. Paired readbacks establish both own and crossed access before and after each answer. An independent PostgreSQL calendar query supplies the Taipei meeting date, course, section, room and time. The run requires exact signed Internship and timetable reads, native verification with zero provider operations, and verified cleanup. A date rollover that changes the next meeting invalidates the affected run.

```sh
node tests/evaluation/run-internship-preview.mjs "$PREVIEW_ORIGIN" "$DEPLOYED_REVISION" --published-timetable
```

The separate two-case packet leaves the original count at 26 of 30. The two original QAP201 timetable cases still require their frozen shared source, and the two intentional read failures are covered by controlled tests.

### Club equipment page context

The default inventory registers the nine existing protected equipment questions
and three page-context checks. The general runner reports these twelve cases as
setup-unexecuted until it can ingest the isolated paired-owner proof. The
`--route-context` packet exercises the new-request form and the edit page for
the same submitted request as both its owner and a second student. The exact
owned request ID comes from the fixture and appears only in the edit route.
The fixture preserves the original facts and checks readback and cleanup for
both accounts. The browser acceptance gate retains its own requirements.

```sh
node tests/evaluation/run-club-equipment-preview.mjs <protected-preview-origin> <source-revision> --route-context
node --experimental-strip-types --test tests/evaluation/club-equipment-{hosted,runner}.test.mjs
```

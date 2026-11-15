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
- Digital Academy catalog cases replay the real assistant handler and verification graph with intercepted catalog RPC responses. Independent expectations cover exact search filters, the visible result order, total counts, the empty page boundary, failed and crossed reads, and the guest sign-in return. The registry marks these cases as offline and keeps six category and notice metadata cases pending.
- Tuition: read the caller's literal settlement statements separately from charge balances. Null, blank text and the literal text `0` have distinct meanings; none proves a payment, issued receipt or completed refund.
- Tuition remission uses the saved history at School Affairs service 21-3. The independent case bank checks exact literal periods, amount and status, missing fields, unauthorized account references and combined charge requests. Its fixture plan verifies both callers' complete remission and charge records independently. The planned cases remain outside default live execution.

The health and counseling packets include exact own-account fixture plans. The normal evaluator reports their live cases as pending until the corresponding adapters are mounted. Counseling uses the private appointments page and reads tuition separately when requested.

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

The service-note runner registers all 80 questions for the seven local-note services and separates the 61 currently bound cases from the 19 that require additional setup. The signed-in fixture verifies exact owned rows and crossed access directly against Supabase for two disposable callers, alongside the pinned assistant response. Its transport stays separate from Vercel OIDC. Run `node --test tests/evaluation/service-note-runner.test.mjs` for the local fixture and grading contracts.

For Student Leave, `runStudentLeaveDataPreflight` in `live-fixtures.mjs` is the operator-only data check. It requires a clean checkout of the exact protected Preview, the authorized Development Preview token passed as `previewToken`, and the existing client fixture configuration. It creates two disposable callers and checks eight seeded data families. Each family must match the complete stored rows and all eight own/crossed PostgREST results before and after verification. The append-only recovery journal covers reserved IDs, every transition and cleanup. The operator must retain an active recovery ledger if reconciliation cannot be verified.

The preflight takes `{origin, sourceRevision, previewToken, signal}` and returns only the release, per-family digests, probe counts and cleanup proof. It runs zero assistant requests. Run `node --test tests/evaluation/student-leave-database-fixture.test.mjs` for fail-closed admission. The opt-in `STU_LEAVE_TEST_PG_SOCKET` case uses an owner-only scratch Unix socket and checks the exact migrations, journal, RLS, uncertain commit recovery and cleanup against PostgreSQL.

`runStudentLeaveHostedEvaluation({origin, sourceRevision, previewToken, caseIds?, signal?})` separately admits 18 caller-only native questions across the ordinary, archive, exact-sibling, and prior-date fixture families. It uses the same pinned protected Preview, disposable identities and fixture lease. For each request, the operator compares signed ingress, scoped database read and selected record digests against the independent plan, checks the actual terminal reply, and rechecks both callers' database state. A model review is counted only when the provider returns a completed structured response. Reports retain case IDs, digests, counts, failure codes and cleanup proof. The remaining native boundary, reference-clock, failure and companion cases and the legacy cases stay outside this hosted adapter.


`assessTranscriptPreview(report, {reviews})` verifies request and saved-message digests and evaluates the report against the frozen cases. Supply independent review artifacts for the account overview and interview response. A completed collection can still fail evaluation. An unresolved write retains its journal for reconciliation. Never replay a pending write or use this packet alone as the production gate.

The School Affairs menu question bank covers the keyword search control and General Affairs application and lookup sections. Cases require the named controls or service entries and their exact destinations. Generic page links do not pass. The API tests exercise both signed-out public and verified signed-in paths with the model unavailable.

### Housing receipts, native Moodle grades and teaching feedback

The housing cases distinguish application receipts at 26-1 from bed assignments at 34-1. They check literal fields, missing or unreadable records, separate tool execution and each native source link. The exact published-period fixture guard still applies.

`dtm-native-route-cases.mjs` contains 14 independently authored cases exercised offline through the native reader and formatter, with API tests for the actual dispatch, transport contract and retry. The multi-course fixture is not mounted in the live runner.

The [teaching feedback evaluation](../../docs/qa/TEACHING_FEEDBACK_LIVE_EVALUATION.md) registers forty independent cases in the main suite. Each remains a setup failure until the native fixtures and request-bound observations are mounted.

The 12 native Moodle material cases are in `dtm-material-cases.mjs`. `dtm-material-assistant.test.ts` grades replies from the actual account handler with controlled PostgREST responses and exact route, ownership, projection, and retry checks. Hosted evaluation still requires a caller-bound disposable fixture. A passed controlled check supplies no live acceptance credit.
### Native internship

[The internship packet](../../docs/qa/INTERNSHIP_NATIVE_READ.md) registers 30 bilingual native questions for the contract, self-assessment, company application and directory. It retains four prior questions with a fixture rebind requirement. The default runner reports the unresolved setup before calling a hosted model or creating fixtures.

The School Affairs directory adds 22 bilingual catalog cases and an explicit browser-local Custom menu case. Controlled public and signed-in handlers verify links and sibling exclusions without forwarding account data. The Student Leave lifecycle stages caller and foreign sentinels, records uncertain transactions durably, and checks both owners before making any cleanup claim. The lifecycle tests do not authorize the live fixture adapter.

### Moodle assignment lists

`dtm-assignment-list-handler.test.mjs` grades all 25 list cases through the actual endpoint using synthetic callers and controlled row requests. It checks the selected course, global personal/sample fallback, Taipei dates, exact counts, tracker states, access, retry and distinct submission and grade capabilities. Four original cases retain their earlier oracles and wait for updated fixture binding.

The registered action cases check exact proposed payloads, relevant named reads and review text. `confirmed-assistant-action.test.ts` runs the real handlers with controlled authentication and database transport. The compiled browser check `tests/integration/assistant-confirmed-action-ui.mjs` verifies confirmation, receipt mismatch handling and reuse of the same operation ID. Run it against the local compiled preview. Hosted writes require separate acceptance.

Conversation cleanup binds the serialized message array as text and casts it to JSONB in PostgreSQL before the exact row comparison. The fixture retains its deletion witness when automatic cleanup fails. Record any verified manual recovery separately from the original hosted report.

The six Digital Academy category and notice cases use the authenticated native assistant and its deterministic verifier on an exact protected Preview. The adapter uses two disposable callers to read the exact scoped metadata RPC before and after each assistant request. The grader compares those responses with frozen category and notice projections, and binds the observed endpoint progress to the request and deployment checks. This proof is limited to endpoint telemetry and the independent RPC results. The 19 separate Digital Academy course-list and search cases still require their own live fixtures.

```sh
node tests/evaluation/run.mjs --mode live --origin "$PREVIEW_ORIGIN" \
  --approved-preview-origin "$PREVIEW_ORIGIN" --preview-auth oidc \
  --fixture-module tests/evaluation/live-fixtures.mjs \
  --only account:elearning-catalog-pending- \
  --out artifacts/assistant-evaluation/elearning-metadata-live.json
```

This subset can record six passing case results while the full release assessment remains blocked by other cases. Supply the authorized Vercel Development OIDC identity for the exact client project.

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

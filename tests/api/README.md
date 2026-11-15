# API contract checks

`public-release-assets.test.ts` verifies the generated copied documents and their assistant/CSP assets, including absence of the removed floating public-page notice/account-status widget. It uses local captures only.

## Account verification and chat regression checks

`answer-verification*.test.ts` covers bounded graph repair, refreshed records, source-quote/link checks, timeouts, provider failures and no writes during retry. `account-assistant-actions.test.ts` covers exact owned targets, ambiguity, protected data, evidence-derived record views and safe persistence. `assistant-conversations.test.ts` verifies caller-derived ownership, stripping executable data and the exact deletion receipt. Provider doubles in these tests are not real-model acceptance; run the integration suite below after release.


Run with `npm test`. `affairs-assistant.test.ts` covers School Affairs directory breadth, account isolation, personal-record limits and image validation; the other suites cover protected and public API contracts.

`assistant-stream.test.ts` checks that directory activity precedes the final result and that the browser reader handles split frames and incomplete streams. `affairs-assistant.test.ts` also checks private DTM account progress after verified auth.

`affairs-record-answers.test.ts` checks Taipei timetable dates, current/past/future subjects, assignments, tuition arithmetic and sample provenance. The assistant contract also checks that signed-in assignment and tomorrow follow-ups remain on the private path.

`supabase-activity.test.ts` verifies the exact client target, one read-only request, fixed expiry and manual stop without a request, and visible failures for missing credentials or unexpected provider responses.

`scholarship-workspace.test.ts` checks local scholarship answers, explicit-topic precedence over page/history context, private versus manager snapshot isolation, complete applicant identity resolution, and caller-token RPC dispatch. The rolled-back database test and browser workflow are documented in the integration checks.

Pending-fee suites verify complete pagination, caller/admin separation, strict API validation, exact-cent totals, contact answers and contextual private routing. Credit-load-history tests cover owner-filtered answers and the manager RPC contract.

`course-selection.test.ts` verifies seven-column field mapping, all14 timetable periods, source-phase/term filtering, private ownership and complete pagination, validated manager transport, model-context exclusion and local history/timetable links. Class-location and next-class questions remain private queries; explicit page-opening questions use the directory. Current/relative-term questions do not silently reuse historical phase snapshots.

`answer-verification-sources.test.ts` checks exact public-capture matching, dated provenance and checksum rejection when a source cannot be read.

Verification quote checks also cover pretty-printed JSON excerpts, altered values, invented joins and image-source presence during correction.

Structured evidence checks resolve exact JSON pointers, automatically include linked DTM assignments, and verify Taipei calendar evidence across UTC midnight. Missing correction evidence and unsupported links are distinguished from actual provider failures; all withhold the draft and action proposal.
## Native academic coverage

`academic-grades`, `graduation-review`, `academic-attendance` and `native-academic-*` tests cover strict mappings, account scope, explicit query selection, evidence bounds and routing through the existing private assistant. They use synthetic records; live persistence and deployed model acceptance are separate checks documented in [integration tests](../integration/README.md).

The `dtm-submissions*`, `dtm-admin-selection`, and `enrollment-certificate*` suites cover strict helpers, authenticated handler dispatch, ownership, versioned retries, cleanup failure after a durable receipt and dedicated certificate query envelopes. `release-manifest` validates platform-derived revision metadata and routing. These mocked transport tests do not establish deployed persistence.

The reference-catalog, empty-record and graduation-course-selection suites cover bounded evidence guidance and overlapping parent/child course titles. Activity-budget/persistence/schema suites cover full observed traces, Unicode and SQL payload bounds; they are offline contracts.

`student-loan.test.ts` and `student-loan-handler.test.ts` check literal metadata, caller/admin isolation, strict API dispatch, replay envelopes, bounded errors and deadlines offline. [Scope and live limits](../../docs/qa/STUDENT_LOAN.md).

The `dormitory-conduct*` suites cover validation, bounded handler dispatch, ownership and offline lifecycle contracts. Rollback/HTTP live harnesses require separate exact-baseline execution. See [Dormitory Conduct QA](../../docs/qa/DORMITORY_CONDUCT.md).

Supplemental correction regressions exercise actual reader/formatter chains for coordinated certificate identity and class/document privacy, literal tuition period labels and explicit document capability requests, and the exact local attendance-detail citation for unavailable subterm hours.

`dtm-dashboard-layout*.test.ts` checks strict own-account layout DTOs, isolated handler dispatch, bounded transport and draft migration preflight contracts. Mock HTTP and rollback SQL are separate from real concurrent requests.

`dtm-grade-report*.test.ts` verify exact literal schemas, response budgets, caller ownership, paginated scopes, operation receipts and endpoint dispatch without network access. The rollback-only SQL and separate actual-JWT gates are documented in [grade-report QA](../../docs/qa/DTM_GRADE_REPORTS.md).

`dtm-course-content.test.ts` and `dtm-course-content-handler.test.ts` cover ordered-reference/DTO contracts and actual handler authentication, strict selectors, administrator dispatch and durable receipt boundaries with synthetic transport only.

`dtm-course-resource*.test.ts` covers exact caller/course/material reads, strict dispatch, URL bounds, error redaction and unavailable records without live calls.

The student profile intent test checks bilingual separation of confirmation status and form instructions.

Announcement email tests check status intent, caller validation, worker authorization, provider idempotency and acknowledgement.

The certificate award intent checks distinguish status from navigation and enrollment certificates.

The housing bed tests cover the caller-only projection, field and term selection, signed-out handoff and mixed School Affairs questions through the real API handler with captured transports. The two-check tests exercise fresh evidence and confirm a twice rejected answer withholds the housing view.

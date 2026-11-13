# API contract checks

## Account verification and chat regression checks

`answer-verification*.test.ts` covers bounded graph repair, refreshed records, source-quote/link checks, timeouts, provider failures and no writes during retry. `account-assistant-actions.test.ts` covers exact owned targets, ambiguity, protected data, evidence-derived record views and safe persistence. `assistant-conversations.test.ts` verifies caller-derived ownership and stripping of executable data. Provider doubles in these tests are not real-model acceptance; run the integration suite below after release.


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

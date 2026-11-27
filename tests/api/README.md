# API contract checks

The authenticated dispatch suite also covers the seven formerly misrouted public families, public route registration and qualified personal/foreign/write compounds. Private reads and non-auth network calls are forbidden by fixtures. The separate41-case offline bank audit verifies route selection only, not model quality or a real browser session.

`public-club-source-contacts.test.ts` verifies actual captured music-club contacts survive compaction and link checks, rejects unsafe/unrelated URLs and bounds the projection. `course-planning-intent.test.ts` checks bilingual/paraphrased advice selects only mixed course/degree records while factual, foreign, write and multi-domain requests keep their existing boundaries. These are offline contracts, not signed-in acceptance.

The provider suite also checks optional source-audit effort does not alter answer or grader reasoning and invalid settings preserve request behavior. Scholarship response-needs checks require source-present roles/conditions and exclude reference amounts, grades and language thresholds from the instructions.

The provider suite checks evaluation grading receives its configured time window while preserving the selected model/output cap and shorter caller deadlines. Planner calls retain their15-second transport limit.

`answer-verification-provider.test.ts` verifies focus-only rejection forwards bounded detail labels into repair, rejects invalid references/oversized labels and independently checks the correction. `answer-verification-review-retry.test.ts` verifies one public checker-only recovery without new reads or rewrites, including repeated interruption, short budget, quota and proposed-action boundaries. These use provider fixtures, not real-model acceptance.

The native academic evidence suite checks that graduation guidance links the actual curriculum directory while retaining the requested current/legacy report kind. It also checks that page capabilities do not expose private values or turn current year level/total credits into an entry cohort or eligibility decision.

`scholarship-workspace.test.ts` binds assistant navigation/evidence to the catalog's scholarship destination, preserves period and application fields, and prevents pending review from becoming an award/payment claim. It retains caller-only reads and confirmed student/manager writes.

The leave suite verifies that count responses describe request units, all-status/date scope and an explicit clarification for ambiguous usage in English and Chinese. The private grading suite verifies caller-bound leave reconstruction through the existing read-only reader and blocks a different run actor before any read. Fixture checks do not establish a live signed-in evaluation score.

`affairs-public-dispatch.test.ts` checks authenticated funding/admission public dispatch before private reads, public route preservation, JSON/SSE parity, and mixed personal-request isolation. These fixtures prove routing and privacy contracts, not real-model answer quality.

`public-release-assets.test.ts` verifies the generated copied documents and their assistant/CSP assets, including absence of the removed floating public-page notice/account-status widget. It uses local captures only.

## Account verification and chat regression checks

`answer-verification*.test.ts` covers bounded graph repair, refreshed records, source-quote/link checks, timeouts, provider failures and no writes during retry. `account-assistant-actions.test.ts` covers exact owned targets, ambiguity, protected data, evidence-derived record views and safe persistence. `assistant-conversations.test.ts` verifies caller-derived ownership, stripping executable data and the exact deletion receipt. Provider doubles in these tests are not real-model acceptance; run the integration suite below after release.

`student-leave-draft-action.test.ts` verifies that the assistant proposes a draft only from the current message, asks for missing fields, and directs guests back to Student Leave after sign-in. A restored chat retains the answer and expires the executable draft.


Run with `npm test`. `affairs-assistant.test.ts` covers School Affairs directory breadth, account isolation, personal-record limits and image validation; the other suites cover protected and public API contracts.

`assistant-stream.test.ts` checks that directory activity precedes the final result and that the browser reader handles split frames and incomplete streams. `affairs-assistant.test.ts` also checks private DTM account progress after verified auth.

`affairs-record-answers.test.ts` checks Taipei timetable dates, current/past/future subjects, assignments, tuition arithmetic and sample provenance. The assistant contract also checks that signed-in assignment and tomorrow follow-ups remain on the private path.

`supabase-activity.test.ts` verifies the exact client target, one read-only request, fixed expiry and manual stop without a request, and visible failures for missing credentials or unexpected provider responses.

`scholarship-workspace.test.ts` checks local scholarship answers, explicit-topic precedence over page/history context, private versus manager snapshot isolation, complete applicant identity resolution, and caller-token RPC dispatch. The rolled-back database test and browser workflow are documented in the integration checks.

Pending-fee suites verify complete pagination, caller/admin separation, strict API validation, exact-cent totals, contact answers and contextual private routing. Credit-load-history tests cover owner-filtered answers and the manager RPC contract.

`course-selection.test.ts` verifies seven-column field mapping, all14 timetable periods, source-phase/term filtering, private ownership and complete pagination, validated manager transport, model-context exclusion and local history/timetable links. Class-location and next-class questions remain private queries; explicit page-opening questions use the directory. Current/relative-term questions do not silently reuse historical phase snapshots.

`answer-verification-sources.test.ts` checks exact public-capture matching, dated provenance and checksum rejection when a source cannot be read. `public-library-sources.test.ts` exercises the exact library-hours capture through the research handler, including independent weekday and holiday evidence, language, and discovery when the page cannot be read. It also checks separate directory and library clauses in both orders and retention of a verified directory result during library research failure. Exact weekday reading-area cases also run without a model key through both endpoints. Malformed or conflicting cells, hidden content, and non-primary redirects are rejected.

`affairs-public-dispatch.test.ts` verifies that signed-in contact follow-ups can use an identified public service across languages. The public bridge receives only the constructed question, with no prior messages, route selectors, or old attachments. Mixed and private questions retain their account routing.

Verification quote checks also cover pretty-printed JSON excerpts, altered values, invented joins and image-source presence during correction.

Structured evidence checks resolve exact JSON pointers, automatically include linked DTM assignments, and verify Taipei calendar evidence across UTC midnight. Missing correction evidence and unsupported links are distinguished from actual provider failures; all withhold the draft and action proposal.
## Native academic coverage

`academic-grades`, `graduation-review`, `academic-attendance` and `native-academic-*` tests cover strict mappings, account scope, explicit query selection, evidence bounds and routing through the existing private assistant. They use synthetic records; live persistence and deployed model acceptance are separate checks documented in [integration tests](../integration/README.md).

The `dtm-submissions*`, `dtm-admin-selection`, and `enrollment-certificate*` suites cover strict helpers, authenticated handler dispatch, ownership, versioned retries, cleanup failure after a durable receipt and dedicated certificate query envelopes. `release-manifest` validates platform-derived revision metadata and routing. These mocked transport tests do not establish deployed persistence.

The reference-catalog, empty-record and graduation-course-selection suites cover bounded evidence guidance and overlapping parent/child course titles. Activity-budget/persistence/schema suites cover full observed traces, Unicode and SQL payload bounds; they are offline contracts.

`catalog-detail-assistant.test.ts` checks actual assistant handlers and the selected published detail RPC with controlled data. It covers exact links, a literal zero, missing grading weights, a wrong-ID retry, an empty lookup, and a failed lookup.

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

`learning-support-withdrawal-assistant.test.ts` uses the actual signed-in assistant and student action handlers with controlled database transport. It checks exact and ambiguous selection, guest and cross-account denial, stale state, and stable replay after a lost receipt. The rendered confirmation check is in `tests/unit/learning-support-routing.test.tsx`.

Hybrid planning is covered by `hybrid-answer-planning.test.ts`: three-pass plan/read/observe/correct/check ordering, planner outage, action isolation, short budgets and immediate verified completion. `answer-verification-account.test.ts` exercises the real private handler and multipart replanning. `assistant-activity-persistence.test.ts` round-trips plan and observation events through the conversation API. All use synthetic transports and do not claim hosted model acceptance.

Verification fallback assertions expect conversational uncertainty wording. Stored verification status, unsupported-value suppression and empty citations remain unchanged. The public-source fallback comparison uses the actual verification reason.

Heading-only card extraction and stable paragraph locators are covered in knowledge-acquisition.test.ts. answer-verification-provider.test.ts checks that registered public-page composition cannot replace mixed account contracts and that quota failures are not presented as a brief wait.

`public-office-directions.test.ts` verifies actual captured office locations outside main-article text and rejects tampered contact content before it reaches model evidence.

`runtime-import-lint.test.ts` verifies source import detection, file locations, explanatory diagnostics, and allowed type-only/JavaScript dependencies. `assistant-user-settings.test.ts` covers slash preferences and request isolation.

`answer-navigation-url.test.ts` checks URL equivalence through the real answer-link verifier and rejects foreign-host or changed-selector destinations. Office-source checks cover actual administrative-directory labels and keep private grades outside public contact intent.

Public campus-support, funding, learning-resource, academic-rule and DTM-submission tests check actual source projections or mounted workflow contracts, intent/privacy boundaries and source tampering. The provider tests verify that a selected answer model cannot overwrite the configured independent auditor. Shared public recovery/context checks passed65cases after the sanitized-question routing correction.

Staff parking checks verify exact source sections and exclude private approvals/student prices. Office-handler tests prove a rejected but relevant saved-source draft is corrected and independently reviewed before new search, while public-context recovery tests still require new source reads for drafts that do not answer the question.

Public guidance repair tests exercise consistent mixed guidance across rejection and correction. Contact-directory tests verify literal published fields, unknown extensions, native route precedence, page context and the actual handler without duplicate source reads. Faculty/communication/academic source tests preserve source boundaries.

Enrollment evidence tests preserve admission selectors and event roles. Study-option tests validate literal procedure clauses and source scope; housing terminology tests prevent continuing/resuming student categories from merging.

public-prospectus-financial-context.test.ts checks that deduction queries retain the subsidy timing source and separate sign-in-required native record links, while language eligibility avoids irrelevant financial navigation.

assistant-request-budget.test.ts rejects malformed/unbounded budgets and proves nested requests cannot extend parent deadlines. Financial projection tests check parsed source operands, conditional tiers, gross-vs-reduced subtotal arithmetic and delayed subsidy scope. Housing scope tests bind contract clauses to their actual audience heading.

Saved-public-link tests cover eligible/denied correction boundaries and an actual handler sequence with no web fallback. Mixed coverage tests prove initial focus notes and reviewer missing-details survive. Academic response-needs tests derive coverage only from available public clauses and navigation.

Prospectus response-needs tests require actual section-role evidence, reject unsupported contexts and preserve exception alternatives. Academic navigation tests distinguish curriculum plans from graduation-review aliases and avoid asserting universal placement/activity requirements.

Admission coverage tests validate source-gated language and timeline focus notes without hardcoded expected dates/thresholds.

The guidance history test now validates the existing24-message/64kB/8000-character context contract, role filtering and Unicode-safe clipping instead of an obsolete six-message cap.

Account-judge evidence tests enforce current-caller ownership, exact saved case scope, read failures versus empty records, and redacted summaries; saved chatbot flags and views never become independent evidence. Admission/training tests also cover bounded approval-year clauses and registration/schedule source projections.

Q13 account grading tests cover caller/version/route isolation, complete timetable evidence, unlinked-student uncertainty, failed/partial reads, and value-free provenance summaries. These fixtures do not establish signed-in model acceptance.

Course-selection term-guide checks cover bilingual missing-term navigation and exclusions for explicit terms, conversation context, foreign owners, compounds and writes.

Academic outcome intent checks cover both independent evidence families, retained transcript/rank scope ambiguity and exclusions for other owners, writes, extra domains and lone record requests.

Issue108 discovery checks: website-discovery tests cover source retrieval, semantic fallback, registered reads, guest isolation and unread-source coverage recovery; website-discovery-build checks automatic new-page indexing, expected-answer exclusion and checksum failures. discovery-embeddings checks vector/transport validation. Run with node --experimental-strip-types --test tests/api/website-discovery*.test.ts tests/api/discovery-embeddings.test.ts.

Issue109 tests cover empty-transcript to alternate-source recovery, duplicate/read-only enforcement, released assessment ownership and generic exact-reference verification. Existing provider/retry/native-routing checks also pass.

`local-dtm-library.test.ts` checks persistent SQLite imports, repeatable upserts, caller isolation, credential-bearing URL rejection and hosted disablement. It uses temporary databases and never reads or changes the user capture database.

`imported-dtm-grade-evidence.test.ts` covers literal imported totals versus percentages, dash preservation, caller gating and native UUID source restrictions. The local library test also exercises the established grade evidence entry point against a temporary SQLite import.

The activity persistence round-trip also verifies that the optional immediate acknowledgment survives authenticated save/restore (Issue #112).

`conversational-updates.test.ts` checks adjacent identity follow-ups, stale-topic rejection, bounded activity-only commentary input, and persisted interim messages. Commentary is never final-answer evidence.

Issue #119: contextual Moodle course/term/grade/activity API reads, exact record-link evidence admission, evidence-preserving final composition and clarification review. See `server/local-dtm/README.md` for API parameters and local-only capture limits. Focused regression coverage includes owner isolation, page context, pagination and safe destination links.

Issue #120: temporary academic sample rows are excluded from student snapshots and dynamic API evidence. Restored assistant tables hide sample subjects/grades; actual captured DTM records are retained. No database rows are deleted.

Issue #121: semantic social-conversation routing acknowledges user self-reports and recalls recent user-shared context without school tools or verification badges. Current records, account authorization and actions still require their existing lookup paths. No cross-chat memory promise or personal-fact write is made. Completed social replies omit the temporary lookup acknowledgment.

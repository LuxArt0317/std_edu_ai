# Server helpers

## Verified account assistant (Issue #99)

`answerVerification.js` runs the LangGraph retrieve → draft → verify → (fresh retrieval → one correction → verify) flow. Account records and drafts stay in request-local closures rather than graph traces/checkpoints. `answerVerificationModel` requires independently referenced evidence and approved links; `answerVerificationSources` reads actual web pages through the acquisition safeguards. The endpoint has a shared 55-second deadline and withholds unverified drafts/actions. A verifier is fallible; this is not proof of perfect factual accuracy.

`answerVerificationAccount` selects named account lookups and fixed public research topics without sending private records to web search. `accountAssistantActions` prepares only reviewed, owned-record actions. `accountRecordViews` produces bounded tables directly from the snapshot. `assistantConversationData` strips action payloads, image bytes and provider fields before persistence. See [QA criteria](../docs/qa/ANSWER_VERIFICATION.md).


Shared server-only retrieval, authorization and validation helpers for `api/`. `schoolAffairsDirectory.js` reads the captured School Affairs catalog; `schoolWebSearch.js` verifies public STU web sources. These modules do not grant access to official school systems.

`schoolWebSearch.js` classifies both singular and plural personal class questions before public search. Nexus answers those questions from the caller's verified account context; anonymous research hands them to School Affairs sign-in.

`affairsWorkspace.js` reads DTM and service records through the verified caller's token and RLS. `dtmAnswer.js` produces account-specific links, filters unfinished work and uses the meeting foreign key to find assignments for a missed class. `schoolAffairsDirectory.js` gives public navigation links with verified campus sources.

`assistantStream.js` emits only observed lookup stages as SSE events, with a JSON fallback for older clients. It is shared by public and School Affairs assistant endpoints and does not transmit model reasoning.

`affairsSchedule.js` calculates current, past, future, today and next classes from account enrollments in Asia/Taipei time. `affairsAnswer.js` uses those records plus account-scoped assignments and charges for common personal questions. `affairsWorkspace.js` calls the audited manager RPC through the verified caller token; it never uses a service key for browser requests.

`scholarshipRecords.js` maps caller-scoped scholarship records and answers status, award, service-hour and period questions locally. Explicit assignment, DTM, leave, internship and other account topics supersede scholarship page/history context. Scholarship applications and manager context are excluded from generative-model input. The manager resolves every applicant profile in bounded ID batches; ordinary snapshots retain the caller-only filter.

`studentAidRecords.js` and `housingRecords.js` map private records and produce deterministic answers with local service links. Personal form/contact/health data and admin snapshots are excluded from model input. Explicit other-service questions supersede the page context. Housing replies include application receipts, window status and assigned beds/fees; student-aid replies distinguish unknown amounts from zero.

`courseCatalog.js` validates authenticated catalog queries and admin writes through caller-JWT RPCs. Catalog questions route to the offering catalog rather than substituting enrolled courses. Catalog rows never enroll an account.

`pendingFeesAnswer.js` and `creditLoadHistory.js` answer account fee/contact and credit-history questions locally. Full stable pagination supplies complete balances; manager rows are kept outside personal replies, and fee/credit-history records are excluded from model input. History writes use version checks and durable request receipts.

`courseSelection.js` maps phase-specific account records and answers history/weekly-timetable queries locally with exact local links. Multiple matching phases require clarification instead of silently merging schedules. Raw remarks never determine timetable inclusion. Selection snapshots and manager data are excluded from generative-model input; current/today/next-class answers continue to use explicitly dated enrollment records.

`assistantConversations.js` handles owner-only chat storage behind the existing account-data function. The public `/api/affairs-conversations` rewrite preserves the client URL without exceeding the verified 12-function Hobby deployment limit.

Web verification uses independently fetched source text. If a source is unavailable, an exact URL match to the versioned public-capture manifest may supply checksum-verified, explicitly dated text from stu.best; it is never represented as a live page.

Evidence quote matching tolerates JSON formatting whitespace only outside string values. Unsupported claims and invented/noncontiguous excerpts still fail; aggregate diagnostic counts never contain questions, records, quotes or drafts.

The claim reviewer supplies up to four independent verbatim quotes per claim, so arithmetic/time comparisons can cite separated operands without fabricating one joined excerpt. Every quote still has to occur in the referenced evidence.
# Evidence reference validation

The independent answer reviewer uses validated JSON field pointers for structured account records and exact excerpts for prose. Pointer resolution uses only own fields in the supplied evidence; missing fields, another source ID, malformed pointers and unsupported claims fail. A pointer establishes where the evidence is stored, while the independent semantic review checks its meaning, arithmetic and completeness.

Moodle lookups retrieve the separate assignments collection with course records, joining through `dtmCourseId`. Enrollment evidence includes a server-calculated Asia/Taipei day and today/next meetings so a model need not guess the campus date from UTC. These calculations describe retrieved records, not a synchronized university calendar. Native academic collections stay excluded from the legacy model snapshot; the explicit native tools below provide their strict projections.

Missing evidence and a correction with unsupported source IDs/links remain evidence failures; they are recorded separately from a correction-provider outage. Neither condition can approve or display the unsupported draft.

## Native academic records (Issue #98)

`academicGrades`, `graduationReview` and `academicAttendance` provide separate native record mappings, strict validation and bounded literal answers. `nativeAcademicWorkspace` validates paginated caller-JWT reads; `affairsWorkspace` dispatches eight administrator operations to versioned RPCs. `nativeAcademicEvidence` projects explicitly owned scalar fields; model lookups never infer official history completeness, GPA, graduation eligibility or absence hours from detail counts.

The verified account assistant explicitly selects `academicGrades`, `graduationReview` and `academicAttendance`; local links, requested modern/legacy report kinds, coverage and whole-row UTF-8 limits remain attached. Retries reread without initialization. Native collections remain excluded from the legacy generic model snapshot. See [native acceptance](../docs/qa/ACADEMIC_RESULTS.md).

`dtmSubmissions.js` provides caller-JWT private Storage workflows, versioned revision reviews, short-lived downloads and bounded queue cleanup. `enrollmentCertificate.js` separates personal assessment reads, verified administrator maintenance and inert document metadata. Both use strict request validation and operation deadlines; neither connects to the university backend. See [acceptance](../docs/qa/DTM_SUBMISSIONS.md).

`researchAssistantHandler.js` owns the shared public research implementation. Both TypeScript API entrypoints import this deployable JavaScript module; do not import an API `.ts` source from another emitted function. The compiled-entrypoint regression runs without TypeScript loading, and the live deployment smoke checks JSON405 method boundaries without model or database writes.

`syllabusSearch.js` implements published course search/options/detail and a separate audited metadata write. It uses caller-JWT reads, stable complete pagination, nullable explicit current/term fields and no inferred enrollment. [Syllabus acceptance](../docs/qa/SYLLABUS_SEARCH.md) records verified local and deployed account acceptance.

## Tuition statements and document metadata (next batch)

`tuitionDocuments.js` and its type contract provide strict personal reads, selected-account administrator reads and four save/delete operations for literal settlements and summer/evening document metadata. Personal reads stay caller-owned even when the caller is an administrator. Stable 200-row cursor pages are fully validated; reads over 1,000 rows per source fail instead of returning a truncated result. One helper deadline bounds authorization, pagination and response reads within the API's remaining request budget.

`20261112180000_tuition_documents.sql` defines `affairs_tuition_settlements` and `affairs_tuition_document_metadata` with own-account RLS, audited administrator RPCs, expected versions, durable request receipts and deletion tombstones. Owner and document kind are immutable; revocation is terminal. Settlement text preserves `null` as unknown and `""` as a literal blank. No academic year, amount, payment status or eligibility is inferred from a period label or statement.

Document metadata has only `metadata_only` or `revoked` status and the local issuer `stu.best`. Both loader contracts return `documents: []`; no file bytes, URL, Storage capability, issuance or payment workflow exists. The working-tree supplemental tuition reader exposes owned settlement statements; its deployed model acceptance is tracked separately.

Rollback-only preflight passed five groups at the unchanged 127-migration/144-RLS-table baseline. The migration is now applied (128 migrations/146 RLS tables), and actual-JWT local API/browser acceptance passed with exact cleanup. Production acceptance remains pending. See [tuition acceptance](../docs/qa/TUITION_DOCUMENTS.md) for UI, handler and schema evidence.

Assistant verification now distributes bounded exact-field guidance fairly across academic records, preserves parent/course lineage, and removes unsupported maintenance attribution. Conversation sanitization shares byte/activity budgets with the client; hidden reasoning, images and executable proposals are excluded.

## Selected supplemental assistant reads (Issue #100)

`accountSupplementalLookup.js` adds four capabilities to the existing 17: published `courseCatalog`, owned `enrollmentCertificate`, owned `dtmSubmissions` file/revision metadata, and owned `tuition` settlement statements. The API captures verified credentials in request-local callbacks. The model selects a fixed capability and validated catalog selector, never an account ID, credential, administrator endpoint or arbitrary URL. A retry refreshes only authorized selected sources, checks the unchanged caller, and preserves the proposed action.

The four `account*Evidence` helpers validate complete source records before projecting model-safe fields. Their aggregate evidence fits 54KB within the 70KB private and 100KB total budgets. Failed or omitted reads remain unknown. `supplementalAccountAnswers.js` renders bounded literal answers and tables with local links, keeping catalog versus enrollment, gradebook/tracker versus saved files, assessment versus issuance, and settlements versus charge balances distinct. It cannot issue documents, upload files or execute payments.

Verifier diagnostics may include fixed lexical topic categories and local claim indexes, alongside counts. They contain no claim text, record values, identities, pointers, prompts or private model reasoning; categories are diagnostic hints rather than the reviewer's rationale. See [system evaluation](../docs/qa/ASSISTANT_SYSTEM_EVALUATION.md) for independent fixtures, live acceptance and remaining gaps.

`studentConduct.js` provides strict own/admin loaders and versioned administrator operations for migration200000. Complete bounded reads reject malformed/partial results; no document capabilities are returned. Migration is applied and actual-JWT local/production acceptance passed. See [conduct QA](../docs/qa/STUDENT_CONDUCT.md).

`studentLoan.js` validates and reads one account-owned loan metadata snapshot, with separate live-admin access and versioned save/delete RPCs. Null is unknown, not a negative application. See [Student Loan QA](../docs/qa/STUDENT_LOAN.md).

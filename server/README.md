# Server helpers

`venueBooking.js` validates the public schedule, persists room occupancy, and serves caller-scoped requests and review operations.

`permanentCourses.js` serves the published course list and exact-code descriptions to the catalog and campus assistant. `permanentCourseSource.js` parses the public source and uses each source-issued description identifier only in its original request session.

`graduationClearance.js` validates caller-bound reads, office decisions and submission receipts. Its assistant reply uses persisted office statuses.

`teachingFeedback.js` validates separate student and administrator requests and formats caller-bound completion and review status for the campus assistant.

`earlyGraduation.js` validates caller-bound reads and confirmed, retry-safe application and review operations. Its assistant answer uses the same window and history.

`creditTransfer.js` reads account-scoped application history and applies validated draft, submission and review operations through the caller’s Supabase session.

`courseWithdrawal.js` and its contract validate account and term binding, confirmed withdrawal or restore receipts, and direct assistant answers from the saved window and course records.

## Public answer verification

`answerVerification.js` reserves time for unread school pages during a rewrite or review. After a timeout or temporary provider failure, `researchAssistantHandler.js` checks eligible queued pages within the existing page-read window. Unreadable pages and mirrored text do not end the search while another page fits that window. Distinct evidence can support a fresh draft and independent check within the original request deadline. Hard quota failures stop the lookup. Chat Activity records the interruption separately from evidence checks that actually ran.

`publicPageContext.js` answers narrow university founding-year questions from the verified About page capture. It cites the captured date of approval to establish the school and admit students. These public questions need no student-record lookup or model call.

For the signed-in saved overview, current subjects with year level, and standalone fee balances, `answerVerificationAccount.js` checks a deterministic answer against the exact selected account evidence and citations. Complete and explicitly limited reads can pass on the first check. Missing or malformed evidence retries the selected account scope and never supports an amount or enrollment by itself.


## Learning support actions

The signed-in assistant prepares one 27-1 withdrawal by exact ID, one active request, or a uniquely newest submission. The caller-scoped lookup reads only the identifying fields, saved status, version and submission timestamp. The confirmation button posts the saved ID, expected version and original operation ID to the existing student action endpoint. The native operation checks ownership and version, and replay returns the same receipt.

## Dated charge payment history

`accountChargePaymentHistory.js` handles exact signed-in date and month questions before the aggregate fees path. It reads the caller’s saved payment entries through the shared payment ledger contract and uses the verification graph on the same date selection. The answer uses exact cents and reports reversals separately. Tuition totals use the saved category, and uncategorized rows remain separate. Undated paid totals and unread or incomplete histories never contribute to a dated amount. The source link opens the private payment history page with its date filter.

## Verified account assistant (Issue #99)

`accountStatusIntent` limits sign-in questions to the current session. `accountStatusAnswer` uses the verified Google identity and projects the email only when the user asks for it. The lookup does not load a student profile or contact the model.

`studentLeaveEvidenceIntent` resolves the requested view, date, field or exact form. `accountStudentLeaveEvidence` reads the signed-in user's records and requested linked local review state. The fixed request plan keeps unrelated records out of both the initial review and one fresh retry.

For a complete, simple Student Leave lookup with fixed selectors, the verifier compares the answer, table and link with the exact native formatter output. It uses the selected evidence and no model. Named, relative-date, compound, partial and failure responses retain their existing paths.

`dtmAssignmentEvidenceIntent` selects the assignment and requested fields. `accountDtmAssignmentEvidence` uses the existing caller-scoped assignment RPC and bounds the projection before model input. `dtmNativeClauseScope` keeps independent assignment and native grade clauses separate. The reviewer must cite the requested assignment fields and a grade value or recorded availability when applicable.

`dtmSubmissionTimingIntent` resolves a timing question to the exact assignment page. `accountDtmSubmissionTiming` verifies the current committed file's saved submission instant and its deadline at submission through the existing owner-checked workspace RPC. The answer preserves microsecond precision and defaults to Taipei time. An explicit UTC follow-up changes the display zone. Previous file revisions retain no comparable deadline in this read. Timing retries refresh the same record in LangGraph.

For a complete Moodle grade overview or an exact question about saved report feedback, weight or a course total, the account graph verifies the requested row labels, literal cells and links directly against the validated reader output. Feedback-only questions keep weight and grade cells out of the answer. Missing, blank and zero cells remain distinct. Failed, partial, ambiguous and mixed requests follow their existing evidence path.

`answerVerification.js` runs retrieval, drafting and verification in LangGraph. A failed first check can trigger a fresh read and correction. A second failure can trigger a deeper review when evidence and time remain and the reviewer identified a specific gap. Signed-in answers reuse refreshed evidence from the authorized scope. Account records and drafts stay in request-local closures. `answerVerificationModel` requires independently referenced evidence and approved links, and `answerVerificationSources` reads the cited pages. The endpoint uses a shared 55-second deadline and withholds unsupported drafts and actions. A summary of an exact archived page uses only the saved text and is checked independently of its title and capture date.

Public school research can follow eligible leads up to four checks across a request. After a partial answer passes review, the next review needs fresh source content. The graph follows another lead when a verified revision resolves a missing detail or a rejected draft identifies a specific claim to correct. Corrections continue from the best verified answer. Duplicate sources, verified revisions that lose coverage, an unavailable reviewer, and insufficient time leave that answer in place. Conversation activity preserves the individual follow-up and review steps.

`answerVerificationAccount` selects named account lookups and fixed public research topics without sending private records to web search. `accountAssistantActions` prepares only reviewed, owned-record actions. `accountRecordViews` produces bounded tables directly from the snapshot. `assistantConversationData` strips action payloads, image bytes and provider fields before persistence. See [QA criteria](../docs/qa/ANSWER_VERIFICATION.md).


Shared server-only retrieval, authorization and validation helpers for `api/`. `schoolAffairsDirectory.js` reads the captured School Affairs catalog; `schoolWebSearch.js` verifies public STU web sources. These modules do not grant access to official school systems.

`publicServiceFollowup.js` resolves text-only contact follow-ups about named campus offices. It recognizes the latest user question against a fixed bilingual service list and constructs a new question from the selected service and contact field. The signed-in handler forwards the constructed question with an empty history and root route.

Explicit two-part public requests can combine a supported registrar contact or Wi-Fi setup directory entry with a separate library inquiry. Only the library clause goes to research. The directory answer keeps its citation when the library source or verifier is unavailable.

`schoolWebSearch.js` classifies both singular and plural personal class questions before public search. Nexus answers those questions from the caller's verified account context; anonymous research hands them to School Affairs sign-in.

`affairsWorkspace.js` reads DTM and service records through the verified caller's token and RLS. `dtmAnswer.js` produces account-specific links, filters unfinished work and uses the meeting foreign key to find assignments for a missed class. `schoolAffairsDirectory.js` gives public navigation links with verified campus sources.

`assistantStream.js` emits only observed lookup stages as SSE events, with a JSON fallback for older clients. It is shared by public and School Affairs assistant endpoints and does not transmit model reasoning.

`affairsSchedule.js` calculates current, past, future, today and next classes from account enrollments in Asia/Taipei time. `affairsAnswer.js` uses those records plus account-scoped assignments and charges for common personal questions. `affairsWorkspace.js` calls the audited manager RPC through the verified caller token; it never uses a service key for browser requests.

`scholarshipRecords.js` maps caller-scoped scholarship records and answers status, award, service-hour and period questions locally. Explicit assignment, DTM, leave, internship and other account topics supersede scholarship page/history context. Scholarship applications and manager context are excluded from generative-model input. The manager resolves every applicant profile in bounded ID batches; ordinary snapshots retain the caller-only filter.

`studentAidRecords.js` and `housingRecords.js` map private records and produce deterministic answers with local service links. Personal form/contact/health data and admin snapshots are excluded from model input. Explicit other-service questions supersede the page context. Housing replies include application receipts, window status and assigned beds/fees; student-aid replies distinguish unknown amounts from zero.

`courseCatalog.js` validates authenticated catalog queries and admin writes through caller-JWT RPCs. Catalog questions route to the offering catalog rather than substituting enrolled courses. Catalog rows never enroll an account.

`pendingFeesAnswer.js` and `creditLoadHistory.js` answer account fee/contact and credit-history questions locally. Full stable pagination supplies complete balances; manager rows are kept outside personal replies, and fee/credit-history records are excluded from model input. History writes use version checks and durable request receipts. The assistant responds to standalone tuition payment requests with the pending-fees link and does not open account records.

`courseSelection.js` maps phase-specific account records and answers history/weekly-timetable queries locally with exact local links. Multiple matching phases require clarification instead of silently merging schedules. Raw remarks never determine timetable inclusion. Selection snapshots and manager data are excluded from generative-model input; current/today/next-class answers continue to use explicitly dated enrollment records.

`firstSelectionNotice.js` reads the public schedule, audiences and fee notes from Supabase in one joined request. The assistant can cite the saved term in Chinese or English. Personal selection, eligibility and fees use their existing account scopes.

`courseAdjustment.js` reads the public late-add notices and private student eligibility. The shared contract validates selectors and versioned manager requests. The personal scope binds the verified caller and resolves the term in Asia/Taipei. Saved decisions never create enrollment records.

`assistantConversations.js` handles owner-only chat storage behind the existing account-data function. The public `/api/affairs-conversations` rewrite preserves the client URL without exceeding the verified 12-function Hobby deployment limit.

Web verification uses independently fetched source text. If a source is unavailable, an exact URL match to the versioned public-capture manifest may supply checksum-verified, explicitly dated text from stu.best; it is never represented as a live page. The library-hours source includes the regular hours table and separately labeled, public weekend and holiday tabs. The verifier reads both from the original URL or its exact capture. An explicit request for regular weekday reading-area hours can use both validated table cells directly. The source must be the exact library schedule URL or its checksum-verified capture, with a unique complete row. Holiday, current-date and other library questions continue through the broader evidence review.

If a search draft is unusable, the research handler can read official links returned by the search tool and compose a fresh draft from their contents. Checks across a managed-to-web source switch share the three-check limit. A remaining check can use more specific evidence or actionable reviewer feedback when time permits. The final Activity entry records the reason a request stopped.

Explicit public questions about Shu-Te University's founding, mission and motto can start with the checksum-verified About STU capture. The response cites its date, and a separate review checks the factual draft. A rejected draft can trigger a focused official source read in the same verification loop. Current information requests go through the regular public research flow.

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

The four `account*Evidence` helpers validate complete source records before projecting model-safe fields. Their aggregate evidence fits 54KB within the 70KB private and 100KB total budgets. Failed or omitted reads remain unknown. The supplemental reader preserves timer expiry as a deadline and discards records returned at or after the shared deadline. `supplementalAccountAnswers.js` renders bounded literal answers and tables with local links, keeping catalog versus enrollment, gradebook/tracker versus saved files, assessment versus issuance, and settlements versus charge balances distinct. It cannot issue documents, upload files or execute payments.

`chargePaymentHistory.js` uses the verified School Affairs caller and bounded shared RPC transport for dated tuition payments. The browser read scope `fee-payment-history` accepts optional inclusive `from` and `through` Taipei dates, `charge_id`, and `page` from 1 to 201 with 25 rows per page. The reply includes the matching row count and an undated-payment flag for the selected charges. Administrator readback uses `fee-payment-history-admin` with required `student_id` and `charge_id` and the same date and page options. Each staff row includes `canReverse`. Administrator writes use `record_charge_payment` and `reverse_charge_payment` on `/api/affairs-manage`, with the database verifying role, ownership, balances and replay identity. `chargePaymentContract.js` checks the exact wire records and receipts. These operations record local ledger entries and corrections.

`serviceNoteIntent.js` recognizes School Affairs service destinations and requests for details that a private tracking note cannot establish. The guest handler keeps the recognized local service path while dropping query parameters. Equipment borrowing on the Student Health page uses that destination unless the question explicitly asks about club equipment.

Verifier diagnostics may include fixed lexical topic categories and local claim indexes, alongside counts. They contain no claim text, record values, identities, pointers, prompts or private model reasoning; categories are diagnostic hints rather than the reviewer's rationale. See [system evaluation](../docs/qa/ASSISTANT_SYSTEM_EVALUATION.md) for independent fixtures, live acceptance and remaining gaps.

`studentConduct.js` provides strict own/admin loaders and versioned administrator operations for migration200000. Complete bounded reads reject malformed/partial results; no document capabilities are returned. Migration is applied and actual-JWT local/production acceptance passed. See [conduct QA](../docs/qa/STUDENT_CONDUCT.md).

`studentLoan.js` validates and reads one account-owned loan metadata snapshot, with separate live-admin access and versioned save/delete RPCs. Null is unknown, not a negative application. See [Student Loan QA](../docs/qa/STUDENT_LOAN.md).

`dormitoryConduct.js` provides strict caller-owned empty/unknown snapshots and separately authorized administrator save/delete operations. It never infers a populated disciplinary history. See [Dormitory Conduct QA](../docs/qa/DORMITORY_CONDUCT.md).

The account verification graph renders standalone dormitory notices and exact notice-plus-bed questions from their selected evidence. After an initial rejected review it repeats the scoped reads, rebuilds the answer and compares the result, table and links with the refreshed evidence. The standalone health examination reader uses the same exact recovery for the selected page's paired codes and availability flags. Multi-page ambiguity and health write requests produce scoped limitations without a metadata read. Standalone counseling requests also verify the exact refreshed metadata from the caller's mine view. UTC timestamps render with the Z designator while keeping the saved instant and other offsets.

The supplemental-answer correction separates coordinated student identity requests from class/document numbers, preserves explicit tuition-settlement intent across season labels, and cites attendance detail for unavailable weekly/monthly hours. These are evidence-selection repairs; they do not create records, payment confirmation, issued documents or new permissions.

`dtmDashboardLayout.js` reads and validates owner-only dashboard preferences for the three observed built-in blocks. The dedicated data scope and save/reset actions use caller JWTs, bounded transport and exact versioned snapshots. Reset is a persisted version increment; durable command receipts preserve retries after later edits. No administrator cross-account access, HTML, arbitrary content or course mutation is added. Migration `20261113230000_dtm_dashboard_layout.sql` is an unapplied draft pending separate SQL and live acceptance.

`dtmGradeReport` provides owner/course-bound literal reports, paginated own-course totals and a narrow selected-student administrator course index. Numeric metadata never determines displayed report cells. Exact payloads, shared deadlines, bounded responses, versions and durable receipts apply; private report data remains outside generic assistant snapshots while Issue #100 is paused. See [grade-report QA](../docs/qa/DTM_GRADE_REPORTS.md).

`dtmCourseContent.js` validates bounded section references and canonical account/course-scoped responses, forwards caller JWTs to dedicated RPCs and validates durable save receipts. Course-wide revision checks support consistent inventory pagination. See [course content QA](../docs/qa/DTM_COURSE_CONTENT.md).

`dtmCourseResource.js` reads one caller-owned course/material through RLS and validates literal destinations without fetching them. Source provenance remains separate. See [resource QA](../docs/qa/DTM_COURSE_RESOURCE.md).

`feeRemission.js` forwards private history operations with the caller’s token. `feeRemissionContract.js` validates the bounded request and response shared by the server and browser.

`exchangeGrant.js` uses the caller JWT for the dedicated grant RPCs. `exchangeGrantContract.js` validates the exact request and response shapes, including version receipts and account identity.

`tutorEvaluation.js` forwards caller-bound evaluation requests to the private workflow’s RPCs. The directory maps TA report, TA self-evaluation and tutor evaluation navigation to their local routes.

`accountTutorEvaluationEvidence.js` projects the question's requested fields from the caller's saved questionnaire for the assistant's verification graph. It omits the form's student profile and has no write capability.

The service directory routes Service Leadership navigation locally. Account evidence uses a dedicated subject records destination and caller-owned Moodle material IDs.

The service directory links parking-permit navigation and instructions to their distinct local destinations. Application-status requests stay outside the public navigation shortcut.

The curriculum plan viewer reads a public PDF from the fixed university endpoint using a captured, allowlisted plan code. It forwards no caller credentials and bounds response size and time. The separate private account scopes retain their existing verification.

The curriculum map lookup sends validated year and track selectors to the fixed university query page. It bounds time and response size and checks the returned year and track before extracting text. Source HTML and account credentials stay outside the response.

`interdisciplinaryPrograms.js` reads the public interdisciplinary catalog for both the directory API and campus assistant. Program citations link to the local viewer when the directory has a verified PDF.

`programRegistration.js` handles caller-scoped registrations and assistant evidence. The shared registration contract checks owner, fields, program code and versioned receipts.

`courseSubstitution.js` reads the public form, resolves the exact department code, validates returned selection and groups, and supplies the same evidence to the assistant. `readSchoolHtml.js` bounds and validates the shared university HTML reads.

The facility repair helper uses caller-JWT RPCs for versioned updates and private status reads. The public repair guide contains navigation and contact guidance.

The summer eligibility reader uses the existing caller-JWT course adjustment authorization. The separate public notice accepts an exact ROC academic year.

`studentProfile.js` validates the caller-JWT RPC contract and limits the assistant response to confirmation status and a form link.

Announcement email uses a caller-JWT preference reader and a separately authorized, fenced delivery worker. The chatbot receives only saved setting status.

Certificate awards use a bounded caller-JWT reader and send status fields only to the assistant. The Storage policy checks the exact proof reservation.

### School Affairs private note evidence

`serviceNoteIntent.js` validates service scope for the seven tracking pages. `loadOwnServiceNotes` reads the selected records with the caller’s School Affairs token, an exact row count and a 200-record ceiling. `answerVerificationAccount.js` checks direct replies against the exact selected note text, status and service links. Exact note and next-class or tuition questions use the selected independent readers and deterministic verification. An explicit request to skip notes preserves the named tuition selection. A note’s filed status is self-marked. Empty results and unavailable reads have distinct messages. Standalone note-page navigation uses the local service directory. A combined note edit and university submission request returns the note page and explains which steps are available there.

### Student conduct evidence

`studentConductEvidenceScope.js` defines the same caller-owned conduct scope for the browser, API and graph. The native reader preserves the permitted database fields and omits student identity unless directly requested. It is a read-only local record source. The independent reviewer rechecks unsupported answers against fresh data.

### Salary and aid claim evidence

`aidPaymentsEvidenceIntent.js` validates the view, owner scope and page. `accountAidPaymentsEvidence.js` reads the requested page through the caller's existing session, preserves literal saved amounts and omits bank and row identifiers. The evidence separates collection totals from returned and included page rows. A failed review refreshes the selected source before correction.

### Current subjects and year level

`ownAffairsTimetable.js` reads the caller's enrolled rows and term dates. `ownAffairsStudyYear.js` reads only the same caller's saved year level and its provenance. The verification graph checks the current term against the timetable and the year against its own source. After a rejected answer, it rereads both sources once, rebuilds the answer from the refreshed fields and checks the result against those fields. An unavailable source remains unavailable and the other verified part can still be shown.

### Teaching feedback evidence

The account graph reads only the selected student teaching feedback views for focused questions. It checks the literal course, status, questionnaire window and requested comment against each view. A combined teaching feedback, semester and year question requires a reviewer reference to each requested field or its precise missing or failed record state.

For eligible read-only account questions, the graph may reconsider a rejected correction with the deeper verification model. This step needs actionable review feedback or a review-output limit, selected evidence, and sufficient time for both a revision and an independent check. It reuses the authorized evidence and stops after the third check. The deterministic course/year repair, record-free coaching guide and proposed-action validation retain their existing paths.

In public web answers, a missing or insufficient initial source can trigger a focused search of official school pages before the correction. The search uses the screened public question. The draft from the search provider supplies no evidence. The response verifies independently fetched page content, deduplicates sources, and can use a deeper check on the collected sources within the request deadline.

### Saved account overview

`accountOverviewEvidence.js` projects seven bounded account sources with separate totals, excerpt and failure states. The assistant checks each source in LangGraph and refreshes the same scope on retry. URL text inside a saved label displays literally, and the answer's navigation links still need matching sources. The overview does not assign a current term to DTM or interpret tracker counts as official outcomes.

### Accommodation bed evidence

The 34-1 reader projects caller-owned bed assignments and their referenced period metadata. It returns distinct complete, partial and unavailable outcomes. The LangGraph verification retry rereads the selected scope. An unverified draft withholds its accommodation table. Saved amount cells and period records establish neither payment nor current occupancy.

Housing companion intent keeps positive, excluded and foreign requests separate. Each selected caller-owned lookup retains its own availability and evidence.

A short question about saved housing records selects the bed lookup on the 34-1 page. A complete empty lookup verifies the literal absence and destination directly in the graph. Failed or partial lookups retain their own limitations.

School Affairs search and menu context use the captured service catalog. Public menu answers can be returned before opening the model or research corpus.

### Housing receipts and native Moodle grades

`accountHousingApplicationEvidence.js` reads the caller's receipt metadata and only referenced period rows. It exposes complete, partial, empty and unavailable states. The graph preserves whole selected housing rows when it fits the evidence budget and reports omissions. Receipt views carry a record count, retrieval time and scope note so reopened chats display the same evidence context.

A focused native DTM grade request selects its reader directly. The reader validates the caller and route, and the verifier uses saved report cells or grade-overview rows. Compound questions can select independent sources. Storage revisions and the personal assignment tracker require their own tools.

`dtmMaterialIntent` selects the saved Moodle materials list or one exact local resource before broad account routing. `accountDtmMaterialAnswer` projects the owner-checked DTO, deterministically checks the answer inside the shared LangGraph and retries the same read on failure. The list selects only material metadata and shows up to twelve entries. The exact reader never opens the destination or passes destination URLs to a model.

`elearningCatalogPageIntent` binds the question and Google sign-in return to the exact Digital Academy search or category URL. `accountElearningCatalogAnswer` uses the caller's verified `elearning_catalog` RPC result, renders literal titles and local links, and checks the answer in the shared LangGraph. A retry uses the same page and filter. Category names and trees and saved notice bodies require narrower sources than the workspace query.
### Verified internship evidence

A protected Preview request can attest an Internship lookup for a reserved disposable owner. A short-lived signed request binds the exact release, caller, route and question. The receipt binds the exact response and digests of the caller REST query, returned rows and selected field projection. Ordinary requests have no attestation. The diagnostics count completed model operations separately from record reads, including zero-read ownership and operation boundaries.

`accountInternshipEvidence.js` reads exact internship rows using the verified caller's token and requested fields. Review status comes from an explicitly requested caller-owned linked service request. `internshipEvidenceContract.js` validates the active subtype, count and availability state before formatting. The verifier checks the selected evidence and refreshes the same scopes once. The local directory contains the caller's own company tracker records. See the [native internship evaluation](../docs/qa/INTERNSHIP_NATIVE_READ.md).

### Verified Moodle assignment lists

`loadDtmAssignmentList` uses the exact caller's course and student joins and publishes bounded metadata and exact counts. `accountDtmAssignmentListAnswer.js` verifies the formatted saved fields locally with the same scope and Taipei reference clock on retry. The metadata contains local tracker status only. Personal/sample course selection follows the My assignments UI.

`accountActionIntent` reads one explicit action from the current user message. The account handler checks the minimum authorization and saved target state before asking for confirmation. The read-only graph cannot produce proposals from a model plan or a rewritten follow-up. For announcements, the database’s existing administrator check verifies the saved role with the caller session. Confirmation uses the existing reviewed action RPC and its operation ID.


`studentLeaveObservation.js` attests protected Preview Student Leave evaluation requests at the native database reader and terminal response. The request must match the exact deployment host, deployed revision, short-lived nonce and Auth-verified disposable evaluation caller. Separate derived HMAC keys bind the request and receipt. The receipt limits its contents to caller and request binding, data digests, and completed provider operation names.

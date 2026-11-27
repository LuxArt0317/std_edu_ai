# Server helpers

## Automatic application API tools (Issue #104)

`applicationApiCatalogBuild.js` inventories root `api/<lowercase-hyphen>.ts` handlers and static Vercel API aliases. `applicationApiTools.js` dispatches the actual compiled handlers; `applicationApiAgent.js` lets the model discover operations, inspect schemas, read results, propose changes and independently verify factual answers. This is an adaptive bounded tool loop alongside the existing specialized assistant flows, not an MCP server or a replacement for endpoint authorization.

New root API handlers become discoverable on the next compilation/server restart without editing an AI tool list. Export an optional static JSON-literal `assistantApi` object with `description`, `methods`, `readMethods`, `querySchema` and `bodySchema` to describe their contract. Only explicitly declared read methods execute without action review. Undocumented methods default to reviewed effects. Literal scope/action hints are extracted from source; this cannot infer every undocumented payload. Nested API directories, unsupported names and runtime TypeScript imports fail compilation rather than silently disappear. Assistant/control endpoints remain visible but non-callable to prevent recursion.

`npm run compile:application-apis` generates ignored JavaScript handlers and the catalog. `npm run lint:application-apis` checks inventory conventions; build and local development run compilation automatically. The hosted packaging check loads all callable handlers with TypeScript absent and verifies a denied authenticated API call.

Enable locally with `ASSISTANT_API_TOOLS_ENABLED=true`. Set `ASSISTANT_API_ACTION_STORE` to an absolute private directory for durable local reviews. The development server and tool reads still use online providers and the signed-in account. Local file reviews are forbidden on Vercel. Hosted reviews require the unapplied migration `20261126090000_application_api_action_reviews.sql` and a stable server-only `ASSISTANT_API_SIGNING_SECRET` (existing server provider key is a fallback). This change does not apply migrations or enable production.

Calls forward only the original verified account token. Native handlers retain roles, validation and RLS. Model input cannot set credentials, headers or arbitrary destinations. Responses are bounded and credential-redacted. Writes show the exact request in chat and require a short-lived account-bound confirmation. Atomic claims prevent duplicate execution; timeout or interrupted outcomes require checking records rather than blind retries. Hosted reviews and receipts are server-signed. Existing conversation persistence does not retain confirmation capabilities.

Verification: `node --experimental-strip-types --test tests/api/application-api-*.test.ts`, `npm run typecheck:api`, `npx tsc -b --pretty false`, `npm run lint:application-apis`, and `npm run verify:api-packaging`. Signed-in browser/model acceptance remains separate from fixture verification.


`publicSignedInDispatch.js` keeps public-source guidance public after authentication using the same domain predicates as research. It distinguishes generic repair instructions from report/status/write requests and treats harmless “my department”/“my learning” as public context while rejecting qualified own/foreign-record compounds. It forwards only registered public page routes; account routes, query strings, history and credentials are excluded.

`publicClubIntent.js` retains exact named Instagram contacts from the verified club-directory capture, with64-contact/8KB bounds and strict HTTPS/profile/query validation. These are outgoing source-published contact links, not mirrored social pages, verified meeting locations, live account content or membership outcomes. An ambiguous club name needs clarification.

Own course-planning advice uses mixed factual/guidance review and only the selected course-selection and graduation-review tools. The bounded bilingual grammar excludes factual lookups, foreign-student requests, write commands and mixed-domain requests. It supplies no course recommendation, next-term mapping, credit threshold or authorization to enroll; missing selectors still require clarification.

Scholarship response-needs notes use only source-present form, policy, tier and obligation sections. They explicitly separate the applicant group, programme obligations and award conditions, and include a repayment consequence only when the supplied policy text contains it. They contain no expected-answer values.

`evaluation_match_review` uses up to its caller's existing30-second deadline rather than the planner's15-second transport cap. It keeps the explicitly selected grader and2400-token output budget; source-auditor selection and planner limits are unchanged.

Focus-only verification rejection retains bounded missing-detail labels as repair hints. They supply no facts or authorization, and the rejected draft never becomes a verified partial answer. Public review interruption can use one review-only retry when an answered draft, existing evidence, no proposed action and at least25seconds remain; quota exhaustion and time limits still stop. This rechecks the same draft without another read/rewrite and stays within the existing check/request limits.

`graduationPageGuide.js` links the implemented curriculum-plan directory with the selected current or legacy graduation report. It describes programme/department/admission-year selectors and the report's explicit requirement/language fields. It supplies no universal graduation threshold or eligibility decision and does not claim every curriculum PDF is available or has been read. The account evidence link allowlist includes the real curriculum directory for graduation lookups.

`scholarshipRecords.js` exposes a page guide tied to the existing service catalog entry and scholarship workspace fields. Account evidence includes this guide only when scholarship records are selected. Navigation questions receive a useful starting draft; the model can rewrite it against the same evidence. Pending review, award approval and payment remain distinct. No evaluation reference is imported into the producer.

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

### Club memberships and current subjects

`clubMembershipIntent.js` routes membership questions to the signed-in verification graph and refuses another student's records before any lookup. `accountClubMembershipAnswer.js` reads the caller's first page of saved roles. Its status column describes the club. A question that also asks about this semester reads the caller's saved enrollments separately. Each source can be retried independently, and the result identifies what remains unavailable.

### Campus Wi-Fi and leave guidance

`studentSupportGuidance.js` answers three standalone service intents from the Computing Center, the Registrar and the university Student Leave portal. Wi-Fi setup and named-network password questions use the same 802.1X or web sign-in guidance. Both assistant handlers resolve these questions before account tools or conversational follow-up routing. Class absence and taking a semester off have separate destinations. Mixed questions and requests to view or change private leave records still reach their existing handlers. The sources and relevant limits are included in each reply.

### Student Leave draft confirmation

`studentLeaveDraft.js` validates the category, calendar dates, periods, mental-health time slot and optional notes. The signed-in assistant compares the proposed draft with the fields supplied in the current message in LangGraph. The confirmation links to the existing workspace edit page. The corresponding database RPC stores one owned draft and a replay receipt in the same transaction. It requires the Student Leave draft migration before release.

## Hybrid evidence planning [Issue #100]

`answerVerification.js` runs a high-level Plan-and-Execute cycle with reactive observation between evidence reads and answer checks. The request-local LangGraph follows `plan -> retrieve -> observe -> draft -> verify`. Conditional failure or missing-detail edges go through `retry -> plan`; a verified answer exits immediately. Existing public-source recovery can choose a new eligible page. Dynamic account answers may call the existing read-only account planner again before refreshing records, including after initial multipart composition and on a third evidence pass. Fixed native selectors and proposed actions do not widen their scope.

The optional `replanEvidence` callback receives attempt, bounded verification feedback, previous failure and a short deadline. Its account implementation preserves the caller, route validation, available-tool allowlist and action permissions. It checks its deadline before applying a new selection. Planner failure retains the prior selection. A late result cannot replace that selection. The third dynamic account pass refreshes evidence after replanning rather than merely redrafting from the old snapshot.

Activity includes distinct `agent-plan-N` and `agent-observe-N` summaries for adaptive reviews. These contain operational descriptions, never private chain-of-thought, record values, raw verifier feedback or provider errors. Conversation storage uses the existing activity persistence contract. Replanning is not verification, and observations never approve unsupported claims. The original request deadline, quota stops, confirmed-write boundary and three account/four eligible public verification limits remain enforced. A rejected multipart answer can require six model calls across its first two checks, including the additional planner call.

Research references: [LangGraph workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents) and [Oracle pattern comparison](https://blogs.oracle.com/integration/react-vs-plan-execute-choosing-the-right-agent-thinking-pattern-in-oracle-integration). No new package, database migration, deployment configuration or external tracing service is required.

Unconfirmed answers use conversational, reason-specific wording in English and Chinese. No-source replies ask for a relevant page, notice or screenshot; timeout replies offer another attempt; provider failures explain temporary unavailability. These messages do not publish rejected drafts, invent citations or alter verification status. Public source annotation compares against the same reason-specific fallback.

`assistantConversationFollowup.js` handles narrow clarification of a preceding timeout/service-error reply without account, web or model reads. It recognizes only known failure messages and never treats history as evidence about a signed-in user. Account identity questions use `accountStatusAnswer.js` and the authenticated caller, not model inference or caller-provided history. Exhausted model credits produce a clear administrator-action message, and account composition stops immediately on that hard quota failure.

`assistantImageAnswer.js` handles explicit image-description requests directly from validated attachments. Composition, verification and correction receive the same current-message images. This route does not search school pages or infer account-record facts from an image. A failed image read acknowledges receipt and never asks for an attachment already supplied. The ordinary public verification/correction path also retains attachments.

`assistantReasoning.js` validates optional server-only `OPENAI_REASONING_EFFORT` (`low`, `medium`, `high`). Without it, existing reasoning defaults remain unchanged. `OPENAI_VERIFICATION_REASONING_EFFORT` optionally selects effort for source audits only; it changes neither answer composition nor evaluation grading. Invalid/unset values retain the request/default effort. Current local QA uses Luna answers and Terra6.1 grading/source auditing; see `.env.example` for the optional controls, rather than older local credential/model snapshots.

Signed-in screenshot-description requests are dispatched before page/history-based record selection. The shared predicate includes requests to give the contents of a screenshot, transcribe and extract. Public image parsing remains responsible for validating the image bytes and size; no caller identity or private conversation is forwarded, and no account records are read.

Language-only requests are acknowledged through the conversational route without any model, record lookup or web search. Generated answer/correction prompts use the latest explicit user language preference, including English-only suggestions. The preference lasts while its user instruction remains in the retained conversation context.

`assistantModelConfig.js` supplies AsyncLocalStorage model and reasoning overrides for the local [Answer Lab](../tools/evaluation-lab/README.md). The public/account composers, verifier and web-search calls read the request-scoped selection; concurrent requests retain independent settings and production defaults are unchanged. Selected models and evaluator attempts are recorded by the lab.

`evaluationLabHosted.js` adapts the Answer Lab to authenticated Supabase RPC storage and protected actual-agent model overrides. Hosted revisions use database compare-and-swap; images are caller-bound and never public. See the [lab deployment notes](../tools/evaluation-lab/README.md).

## Task-aware answer strategy and public source retrieval
`assistantAnswerStrategy.js` supplies shared task-level instructions to public, private and corrective model composition. It contains no expected FAQ answers. `campusHelpGuides.js` provides public Moodle/grade navigation and third-party access guidance before unrelated account reads. Generic directory keyword matches now require a navigation/list intent instead of replacing policy answers. `studentLeaveEvidenceIntent.js` accepts form/page/section destinations and isolated Chinese interface labels without selecting private leave history.

`publicProspectusEvidence.js` ranks physical-page text from the imported public 115 IPIAC draft, preserving source checksum, capture date, entry-year scope and excerpt limitations. It enters the existing independent verification path; it never establishes a personal award or another cohort’s rules. The local development runner uses only an allowlisted loopback origin for checksum-pinned public page reads. Production still reads its deployed public captures. See [review](../docs/guides/CHATBOT_ANSWER_STRATEGY_REVIEW.md).

## Published financial guidance
`publicTuitionAnswer.js` projects the published Accounting fee rows with sum/header checks and the source prospectus’s program/award row. `publicPaymentAnswer.js` projects the readable registration notice’s payment channels, term-specific deadlines and reconciliation periods. Both decline personal balance/status questions and are shared by the public and authenticated assistant routes; sign-in does not turn a general policy question into a private fee lookup. Native projections use raw source records/checksums, never expected answers. `publicTuitionEvidence.js` retains separate Accounting and IPIAC evidence for broader source composition.

## Conversational source guidance
`conversationalGuidance.js` uses checked public guidance as a factual brief, composes a response for the current question and history, and independently verifies the new wording. It retains the checked guidance if the provider or review is unavailable. Published financial and Moodle-navigation responses use this in both public and signed-in handlers. `publicScholarshipIntent.js` distinguishes public IPIAC rule explanations from private award outcomes. Prospectus retrieval prioritizes its scholarship section and fee/rights tables over generic admission keywords. The evaluator references are never imported into these modules.

Registered prospectus page context is accepted by `publicProspectusContext(question, route)` even when the user does not repeat the program name. Unregistered routes confer no document context. Tuition-deduction questions use the prospectus rather than an unrelated general tariff. Calculation guidance leads with inputs and arithmetic, separates an awarded amount from an application, and distinguishes the tuition component from the final balance.

Broad IPIAC-policy retrieval includes the scholarship section and published exceptions alongside the rights/obligations text. Saved-document composition now receives up to28 seconds within the original request limit while reserving22 seconds for review; the former12-second wrapper no longer overrides the public document model budget. This does not make a failed or unsupported answer verified.

## Public calendar and map navigation
`publicCalendarAnswer.js` uses checksum-verified calendar download records, including source-issued student/staff/English editions and academic-year labels. It does not answer personal deadlines or invent unavailable years. `publicMapAnswer.js` resolves the registered School Map destination without promising a live or accessible walking route. Both feed the shared conversational composition/verification path, so they are factual briefs rather than verbatim expected-answer lookups.

`publicCourseNavigationAnswer.js` supplies checked route purposes for offerings, permanent descriptions, curriculum plans and signed-in selections. Shared published guidance composes and independently verifies conversational wording. `publicPageContext.js` resolves generic school-background questions to the registered About capture while excluding personal and named-other-school questions.

`publicDocumentRequestIntent.js` separates public transcript/certificate application procedures from account reads, downloads and application status. Both assistant APIs route procedure questions to the registered transcript notice; the original dated notice remains evidence, not an assertion that applications are currently open.

`publicClubIntent.js` routes directory/recruitment questions to the registered club capture and compacts duplicate lines and parenthesized social URLs while preserving source labels and office contacts. Personal memberships remain account-scoped. HTML extraction preserves heading-only cards with distinct locators without renumbering paragraph references. Saved public HTML evidence now shares the public-only composer and28-second drafting allowance; mixed account evidence keeps its full contracts and independent review.

Club skill recommendations are mixed guidance: match listed resource types to optional practice interests, while independently checking every asserted fact. Generic “my skills” does not imply a private-membership lookup. `publicAdmissionLanguageIntent.js` selects the existing115-entry prospectus language/admission and scholarship sections as cohort-limited evidence; it does not establish personal eligibility or rules for other tracks. `publicResourceIntent.test.mjs` covers these boundaries.

`publicCalendarEvidence.js` selects institution-wide calendar event rows with actual source dates/locators, excluding private schedule/eligibility and live-change requests. `publicCalendarDatesAnswer.js` supplies literal source-row fallback tables and scoped event examples; conversational rewriting still undergoes independent review, while failed rewriting retains checked source rows. Public-only reviews omit unrelated private contracts but keep strict references, provenance, completeness and untrusted-data rules. Mixed/account reviews keep their original contracts. Focus-only failures remain rejected but may revise against the same already-valid source before unnecessary discovery.

`publicHousingPolicyIntent.js` separates general rates/application/checkout procedures from private bed assignments, amounts, receipts and refunds. `publicHousingEvidence.js` retrieves the two checked public policy pages before private-bed shortcuts, with recurring-window and approval limits. `publicDormWirelessAnswer.js` supplies checked dorm-specific registration/setup guidance before generic wireless navigation; it does not invent a local registration page or expose credentials.

`publicStudentCardIntent.js` retrieves the registered card-information capture for replacement questions and preserves the distinction between initial issuance, replacement, temporary access and iPASS activation. It does not invent a replacement fee or accept personal application-status requests as public guidance.

Office-direction questions read the existing campus map, directories and office contact captures together. Contact blocks outside the main article are included only when requested and only after the capture checksum passes; no room is inferred from a directory label.

Chat model choices are served from the provider-backed `assistantAvailableModels.js` catalog. `assistantUserSettings.js` validates explicit model/thinking headers and installs per-request overrides for both website assistant endpoints. Evaluation and chat share catalog validation; no browser key or global per-request environment mutation is used. Saved conversations retain validated model settings. Hosted evaluation compiles its shared handler with `compile:assistant-runtime`; no runtime loader uses an API .ts path.

Office navigation/contact retrieval now preserves verified directory-button labels alongside contact blocks. Ambiguous destination questions offer supplied directories rather than assuming the most detailed office. Public-source drafts can proceed to independent verification when they cite any source actually supplied, not just the initially selected map. `answerNavigationUrl.js` compares Unicode/encoded and canonical stu.best URLs without dropping host, path, query or fragment boundaries.

Public source coverage now includes `publicCampusSupportEvidence` (lost-property contact limitations and safety resources), `publicLearningResources` (library discovery without assumed subjects), `publicFundingEvidence` (dated program sources), `publicAcademicRulesEvidence` (literal academic-rule articles) and `publicDtmSubmissionGuide` (the mounted native file workflow). Primary contexts preserve all verified navigation URLs; fallback search receives sanitized question text rather than intent flags. The answer-model override affects composition, while an explicitly configured `OPENAI_VERIFICATION_MODEL` remains the independent source auditor.

`publicStaffParkingEvidence.js` serves actual staff car/motorcycle/contact sections from a checksum-verified projection, without student-price or staff-approval inference. Saved-source claim failures get one correction on already-read evidence only when the independent reviewer confirms the draft addresses the question; that correction still requires independent review. Missing-answer failures continue source discovery.

Public guidance uses one shared mode predicate for initial composition, source correction and fallback. Faculty-training, communication and academic-contact evidence stays tied to checksum-verified captures; omitted sections are distinguished from absent source content. The native partial contact directory supplies only published rows and never infers missing extensions.

Public composition preserves the scope of negative evidence: a selected source or lookup without a feature cannot prove site-wide nonexistence. Communication evidence explicitly marks the site-wide feature inventory as unknown.

Enrollment-date evidence keeps admission tracks, academic years and event roles separate; historical IPIAC milestones do not establish a current general application window. Study-option evidence includes literal, versioned suspension and credit-transfer clauses from the regulations directory. Housing terminology distinguishes 舊生 from 復學生 rather than collapsing both into returning students.

Academic-rule clauses carry individual applicability rather than inheriting the broad document-part title. The procedure index points to separately evidenced suspension/credit-transfer instructions; it is navigation, not a replacement for those clauses.

Tuition-deduction retrieval also includes the actual financial-obligation page so delayed accommodation subsidies remain distinguishable from immediate tuition reductions. Native scholarship and pending-charge navigation is separate capability evidence, never a private award or bill.

assistantRequestBudget.js controls a bounded server-only request budget. Default is 55,000ms; ASSISTANT_REQUEST_BUDGET_MS accepts 5,000–115,000ms and nested research cannot outlive its parent deadline. Local evaluation currently uses115,000ms. This does not raise any hosting limit: deployed60-second functions must retain the default unless their platform duration is separately configured. The financial projection parses literal AnnexA rows/tier amounts and exposes conditional arithmetic plus both gross and reduced subtotals; it never treats a prospectus as a personal bill.

composeSavedPublicSource permits one same-evidence correction only for a well-formed initial public draft with invalid links. Unknown sources, images, private contexts, actions and still-invalid corrected links are rejected; no draft is approved by this helper. Initial drafting notes now reach composition, and source-derived responseNeeds are carried through composition, correction and independent review. Mixed public reviews report missing requested details as well as factual support.

`publicProspectusResponseNeeds` derives coverage notes only from present application/policy/tier/obligation sections. It preserves all alternatives in source exceptions without inserting FAQ values. Academic navigation separately describes the real curriculum-plan directory; the 15-1 service remains an alias of the current graduation review, not a new capability.

Admission response needs use only present source clauses/event roles: they distinguish English-taught admission requirements from later language obligations, and historical application openings from document deadlines/class starts. Missing track/year selectors stay explicit; no threshold or date is inserted from an evaluation reference.

Funding evidence includes only exact verified source aliases plus registered local destinations. This repairs a proven metadata/allowlist mismatch; it does not establish which URL a previous model draft used. Training response-needs notes preserve the supplied Faculty & Staff starting point and distinguish captured examples from current eligibility/registration.

`accountJudgeEvidence.js` supports current-record grading for Q03 tuition charges, Q12 leave usage and Q13 timetable questions. A server-verified current caller and matching saved case/actor are required; actor matching is a selection guard, not historical execution attestation. It uses the existing exact owned-charge, scoped leave or caller-owned timetable reader and returns ephemeral evidence plus value-free hashes/time/selection summaries. Other private cases and failed or mismatched contexts remain reference-only. No service role or supplied chatbot view is accepted as record proof.

Leave count presentation distinguishes request rows from approved days or class periods. It makes the selected date/status scope explicit and asks for the intended unit and semester when usage is ambiguous. This does not infer approval, attendance or remaining allowance.

Admission language evidence retains literal numbered obligations and program-approval-year scope separately from entry cohort. Faculty discovery includes published event schedules and registration-button labels; unread registration destinations are not treated as absent links.

Q17 missing-term course questions receive a bounded bilingual navigation clarification before record reads. Exact terms, follow-ups, images, writes and other owners retain existing handling; no term or enrollment is inferred.

`academicOutcomeIntent.js` recognizes bounded first-person combined graduation/ranking guidance in English and Chinese. It selects academic-grade and graduation-reference evidence independently. Existing explicit-term grade selection and graduation-status limits remain authoritative; the intent grants no eligibility prediction, rank forecast or write capability.

## Guest privacy and semantic routing (Issue #105)

`guestAssistantAccess.js` runs before public answer shortcuts. It classifies personal versus public meaning with bounded recent user questions, ignoring prior assistant claims as identity evidence. Explicit personal fee/record wording also gates independently of the model. Personal questions receive a sign-in handoff with authentication-only activity and no source lookup. Public semantic paraphrases can select the existing published guidance; answer composition still receives the original question. Classification failure retains public-only retrieval and existing privacy guards; this classifier does not grant access or expose account tools. Image descriptions remain separate and never authorize account access.

The signed-in client revalidates its token with `getUser` before any private dispatch/progress. Server authorization remains authoritative. Regression command: `node --experimental-strip-types --test tests/api/guest-assistant-access.test.ts`. Live local intent checks covered the reported tuition question, an unpaid-bill paraphrase and public payment options/deadlines. Broader wording coverage and signed-in browser acceptance remain separate checks.

## Grades API recovery (Issue #106)

Established academic and native DTM grade intents bypass the generic API preflight. Other API exploration is capped at40seconds so established handlers retain a fallback window. A rejected draft yields control to those handlers rather than becoming the generic incomplete-answer response. Tool activity and citations use user-facing record labels, not HTTP routes; mutation reviews still show exact requests. The API metadata documents academic grade views and DTM overview/course selectors. `scope=academic-grades` defaults to the supported transcript reader, accepts only `scope`/`view`, and uses the original caller-bound native grade reader. Unsupported current/GPA/transfer/cycle models remain explicitly unavailable; no grades are invented.

Verified28focused tests, including real handler dispatch against a mocked auth/data transport, owner-only filters, invalid selector rejection,400recovery, draft fallback and guest isolation. Types, catalog/import lint and JS-only packaging pass. Signed-in browser acceptance remains unverified.

## Identity and academic grade isolation (Issue #107)

Standalone academic-grade requests select only academicGrades in planning and evidence, and use the caller-only native reader even from the homepage with conversation history. Practice/enrolled-course quizzes and unrelated DTM sources cannot substitute for an empty transcript. Explicit Moodle/practice and compound requests retain separate routing. Stored non-sample data is described as account records; concise sample labels remain, with no unsolicited unofficial/demonstration boilerplate.

Codex browser acceptance verified a restored signed-in session, the new email/sign-out controls, successful sign-out with private chat removal, and a signed-out grades question producing only the login handoff. No private account data appeared in that anonymous answer. This tests the local setup; no production deployment occurred.

## Unified website/database discovery (Issue #108)

Local-first entry point: `applicationApiAgent.js`, orchestrated by the request-scoped LangGraph in `discoveryGraph.js`. The model chooses website search/read, operation discovery/schema inspection, authenticated reads, reviewed proposals, clarification and answer verification. The same graph runs before question-specific answer handlers for guests and signed-in users when enabled. Existing handlers remain a fallback; image interpretation and evaluation probes retain their established boundaries. This is a staged replacement, not a claim that every old handler has been deleted.

`websiteDiscoveryBuild.js` indexes checksum-verified mirror HTML, raw public source text/pages/sections from `server/data/*.json`, and navigation-only service directory entries. It never reads the Q&A README, expected answers, evaluation results or private account rows. New registered captures, public document projections and service entries enter the next build automatically. Indexed pages/documents are snapshots; this does not crawl the live university or make missing documents available. A selected document is read with bounded full text and links, with explicit truncation; links marked unindexed cannot be read by this tool. Account destinations in the directory are navigation, not access.

Retrieval combines lexical relevance and normalized512-dimensional `text-embedding-3-small` vectors with reciprocal-rank fusion. A semantic reranker and query-focused previews help select relevant source text. Query expansion and lexical retrieval remain available during embedding outages. Relevance ranking is not factual verification. The agent must read a registered source before answering, and coverage review can follow a known unread source before accepting a premature incomplete answer. Date/edition conflicts remain explicit. The graph has per-request step/deadline bounds and cannot run indefinitely.

The local generated index currently contains842excerpts from491source/directory destinations, with842cached vectors. Generated artifacts are ignored by Git. `npm run compile:website-discovery` rebuilds source text. With `ASSISTANT_EMBEDDINGS_ENABLED=true`, compilation/startup updates only missing vectors; alternatively run `npm run compile:discovery-embeddings` with the existing server credential. Only public source text is embedded; private records are fetched with the verified account token on demand. [OpenAI embedding API documentation](https://developers.openai.com/api/docs/guides/embeddings).

Enable **both** `ASSISTANT_DISCOVERY_ENABLED=true` (server) and `VITE_ASSISTANT_UNIFIED_DISCOVERY=true` (frontend), then restart the local runner and refresh the page. `ASSISTANT_EMBEDDINGS_ENABLED=true` enables dense query retrieval. `OPENAI_DISCOVERY_PLANNER_MODEL` chooses the internal tool planner; local testing uses `gpt-6.1-terra`. The final answer composer still uses the chat/evaluation-selected answer model (currently Auto resolves to Luna), and the independently configured verifier remains separate. All providers remain online; local-first does not mean offline. No production flags, database migrations or deployments were changed.

Anonymous requests have no account object or executable account tools; forged identity text cannot authorize reads. The existing signed-out personal-information gate runs before discovery. Signed-in calls reuse the API registry, endpoint authorization, RLS, bounded responses, credential redaction and exact-request confirmation. No arbitrary SQL, URL fetch, authentication header override or automatic write is available. API operations become discoverable from their source contracts, not a per-question keyword list. Accurate required inputs still need accurate API metadata; undocumented business rules cannot be inferred reliably.

Verification includes local live discovery of the commencement date from the actual calendar PDF, an unseen stage/commencement paraphrase through the HTTP endpoint, anonymous forged-account rejection, generated-index tamper checks, new-page auto-discovery, semantic fallback, source-following, and API/action contracts. Signed-in end-to-end model acceptance is still separate from mocked authorization tests. This change does not establish that every possible school question passes.

Run focused checks with `node --experimental-strip-types --test tests/api/website-discovery*.test.ts tests/api/discovery-embeddings.test.ts tests/api/application-api-*.test.ts tests/api/guest-assistant-access.test.ts tests/api/academic-grade-isolation.test.ts`; also run API/full TypeScript, runtime-import lint and JS-only packaging checks.

Actual local HTTP acceptance also passed “How can I get my laptop online while on campus?” through search, page read, coverage follow-up and verification; no Wi-Fi keyword predicate or expected answer was used. The anonymous forged-account grades endpoint check remained authentication-only.

## Alternate account-source completion (Issue #109)

Discovery completion review now inspects callable read-only API operations, described contracts and previous read results, including alternate scopes of the same endpoint. A single empty view is insufficient for a broad record question when another relevant authorized read can answer it. Recovery may describe and read that operation using returned/user-provided selectors; writes and repeated equivalent reads are excluded. An unresolved coverage result is returned to planning instead of silently approved. Explicit source/term restrictions remain part of the review.

GET affairs-data with scope=released-assessments reads only the current account’s released enrollment assessment items through owner/student/enrollment filters. It returns literal score/maximum, labels, course/term context, sample flags and bounded-completeness metadata. It does not compute transcript grades, final course totals or GPA, seed records, or modify the database. Assessment scores can answer broad grade questions under their own labels; they never substitute for an explicitly requested transcript or final total.

Generic API evidence uses a compact source-based composition/audit instruction set rather than unrelated legacy collection contracts. Exact-reference, citation, scope and unsupported-claim validation remain in place; fabricated JSON pointers are still rejected. Raw field names/null values are phrased for users.

Local signed-in browser acceptance retrieved an existing released assessment score after the empty transcript. The DTM overview had a blank total and its course report could not load; these remain distinct from missing assessment items. No production migration or deployment was applied.36focused checks and18existing verification/native-routing regression checks passed, along with full types, import lint and JS-only packaging.

## Local original Moodle library (Issue #110)

Original authorized DTM captures now live in a separate private, owner-scoped SQLite database, exposed by the existing verified `affairs-data` API under `dtm-library`. Courses, activity metadata, source pages, literal grade rows and import history are stored transactionally. The built-in Node SQLite module adds no package dependency. Hosted runtime and imports remain disabled. See [storage, import and coverage](local-dtm/README.md). No Supabase schema or production records were changed.

Imported Moodle grade questions now share the local website database through both API discovery and the established DTM evidence reader. Capture administration queues are excluded from normal account answers. See [Moodle reader details](local-dtm/README.md#assistant-grade-reads-issue-111).

Conversation persistence now allowlists a bounded optional acknowledgment separately from final answer content (Issue #112); no database migration is needed because saved conversations already use JSON messages.

## Conversational commentary and identity continuity (Issue #114)

`conversationUpdates.js` handles the `conversation-update` resource on the existing research API. It uses bounded recent context and tool statuses to generate short commentary, never answer evidence. It defaults to GPT6Luna with a shared8second generation/check deadline and no overlapping client requests. `OPENAI_CONVERSATION_UPDATE_MODEL` can override this auxiliary model. A bounded per-instance12/minute address limiter and24KB input bound limit requests; this is not a distributed quota system. No new Function is added. Adjacent identity confirmations resolve from recent user turns and recheck the current verified session. Identity replies are model-written from verified facts and independently checked, with the verified direct answer retained during provider failures. They run before unrelated discovery tools.

A separate commentary checker rejects underlying answers, identity claims, access claims, unsupported findings or retractions before any interim text is displayed. A failed/late update is skipped; it does not replace or delay the main answer. The10second cadence schedules requests, rather than guaranteeing provider delivery every10seconds.

## Durable assistant memory (#115)

`assistantMemory.js` is called after verified account authentication in `api/affairs-assistant.ts`. It loads the owner's source-linked historical answer snapshots through Supabase RLS, outside the rolling conversation window. Retrieval reserves 16KB for relevant/recent memory and 40KB for recent messages. It is context only: no remembered entry is supplied as fresh source evidence. Only final `answered` results that passed server verification, contain permitted citation URLs, and have no proposed action/common credential markers can be saved. This is bounded historical answer memory, not lossless raw tool storage or a guarantee that a verifier cannot make mistakes. It uses the user's JWT for reads/clear and a server-only service-role credential for writes. No key enters model context, client responses or logs.

Apply `20261127010000_assistant_memory.sql` before enabling `ASSISTANT_MEMORY_ENABLED=true`; provide `SUPABASE_SERVICE_ROLE_KEY` through server secrets. No additional Vercel function, SQLite dependency or in-process durable store is used. The migration provides owner read policies, no client insert/update grants, service-only save/purge RPCs, owner-scoped transactional locking, 30-day visibility expiry, an 80-entry owner cap and a generation counter. Clear increments that counter so pre-clear requests cannot reinsert snapshots. User deletion cascades. Schedule `select public.assistant_memory_purge_expired()` daily through the database scheduler for physical deletion; RLS immediately hides expired rows even if cleanup is delayed. Provisioning that scheduler is a deployment prerequisite, not performed by this code change.

Evaluation headers (`x-stu-evaluation-model` or `x-stu-evaluation-run`), evaluation routes and internal probes bypass memory. Missing configuration/migration or store errors leave normal answering available and make memory commands explicitly unavailable. Writes finish before the response ends (bounded 2.5-second store timeout), so serverless suspension cannot silently abandon a fire-and-forget save. Failures never expose private payloads. Operationally monitor store failures/cleanup before release; do not claim hosted memory acceptance from fixture checks.

Release sequence: run `npm run verify:assistant-memory`, runtime import lint, API typecheck, compilation and JavaScript-only packaging checks; apply migration to a staging Supabase project, configure the server-only key/flag and daily purge, then verify two real accounts, sign-out, cross-device recall, clear during an active answer and evaluator isolation. Promote only after those hosted checks. Disable the flag to roll back execution; retain or explicitly delete the tables according to retention policy. Do not drop state counters while older requests can still run.

Discovery clarification decisions emit a `clarification-request` progress event before returning a clarification result. The UI can surface the needed detail during processing and pause its pending queue. The response ends normally; the user's answer starts a new verified request with conversation history. No unattended write or open serverless worker waits for input.

Release hardening (#117): the legacy public path keeps deterministic access routing when unified discovery is disabled; semantic guest classification belongs to the enabled discovery flow. Explicit native service and campus-route contracts take precedence over broad public-guidance matching. Standalone grades exclude explicit course/year/graduation questions, preventing a page route from replacing the requested account collection. Client auth is still revalidated with getUser before private progress. Fixture mocks reflect this extra validation rather than removing it.

Production assistant and hosted-evaluation entry functions allow120seconds on the verified Fluid-enabled Vercel project. `ASSISTANT_REQUEST_BUDGET_MS=115000` keeps application work inside that limit; unified discovery uses at most90seconds and leaves fallback/response headroom. Defaults remain55seconds when the server flag is absent. The budget is server-owned, never a client argument.

Issue #119: contextual Moodle course/term/grade/activity API reads, exact record-link evidence admission, evidence-preserving final composition and clarification review. See `server/local-dtm/README.md` for API parameters and local-only capture limits. Focused regression coverage includes owner isolation, page context, pagination and safe destination links.

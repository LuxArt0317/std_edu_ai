# Browser service clients

## Assistant conversations

`assistantSessions.ts` handles account-bound conversation API calls and a bounded tab cache. `assistantConversation.ts` preserves observed activity, verification results and record views while dropping executable proposals and raw images on restore. Guest chats stay in the tab; signed-in chats sync to owner-only database rows. Account/scope changes discard the prior account's local view. The UI exposes save/conflict failures rather than pretending a chat was synced.

Account follow-ups preserve complete Unicode characters within the existing history limit. The browser and server share the eight-column persistence limit for assistant record cards.
Public campus follow-ups use the same Unicode-safe truncation.

Browser clients call the public, School Affairs and protected Nexus endpoints. `schoolAffairsAssistant.ts` uses only the isolated School Affairs session. Provider secrets stay on the server.

`researchAssistant.ts` reads bounded SSE progress/result events, accepts the JSON fallback, and passes observed activity to the public chat. `schoolAffairsAssistant.ts` uses the same reader after verifying the isolated Google session.

`assistantConversation.ts` merges streamed and final activity, retains up to 24 messages in current-tab session storage, and strips images, tokens and transient action capabilities before writing. It discards transcripts when the verified identity changes and marks an interrupted in-flight response clearly on restore.

`schoolAffairsWorkspace.ts` reads account-scoped School Affairs and DTM data and sends student record edits to the audited RPCs. Its manager call uses the verified Google session and is separately authorized by the database.

`performSchoolAffairsAction` and `manageSchoolAffairsRecord` also accept optional `{expectedUserId, signal}`. The separate administrative page supplies both, preventing a pending form from acquiring a different account's token. Payloads, existing callers and server permissions are unchanged. Cancellation cannot undo a write already accepted by the server.

`savePersonalSchoolRecord(action, {expectedUserId, signal})` optionally binds a mutation to its initiating caller. It captures the expected ID before session lookup, requires the returned session's user ID to match, and checks cancellation before sending the POST and after reading the response. The DTM account-menu course creator supplies both the caller ID and a signal aborted when its editor unmounts, preventing an old draft from being sent with a newly switched account's token. Existing callers without the options retain their API shape; server authorization and payloads are unchanged.

`scholarship.ts` defines local scholarship periods and application records, Taipei date/window helpers, and unambiguous applicant labels. The existing School Affairs action/manager clients submit versioned requests with stable retry IDs to the dedicated scholarship RPC.

`studentAid.ts` defines masked, account-owned aid records and safe amount/date display. `housing.ts` defines published housing windows, consented applications, receipts and bed history. Their writes use the existing School Affairs action/manager clients with database authorization and stable retry identities. Catalog offers and syllabus data remain independent of personal enrollment.

`pendingFees.ts` preserves nullable metadata and computes positive balances in cents; occurrence dates never inherit payment deadlines. `creditLoadHistory.ts` defines administrator-authored local history, display labels and timestamps without inventing school eligibility rules.

`courseSelection.ts` defines the observed course-selection phases, fourteen timetable periods, owner-scoped record types and native display helpers. Manager writes carry typed meeting arrays, explicit timetable membership, expected versions and retry IDs through the existing authorized manager API.

`academicGrades.ts`, `graduationReview.ts` and `academicAttendance.ts` validate and scope native result bundles and manager edits. The shared workspace client exposes separate grade, graduation and attendance collections; explicitly requested report kind/current term is never inferred from another collection or the latest historical row.

`dtmSubmissions.ts` coordinates private upload reservations, durable Save/Cancel receipts and revision-specific downloads; detail/editor adapters preserve saved versus pending state. `dtmSubmissionMaintenance.ts` exposes bounded manager cleanup without caller-provided paths. Certificate transports validate dedicated own/admin response shapes, abort on identity changes, preserve retry IDs and never accept document capabilities.

`assistantActivityBudget.js` applies shared byte/message/observable-activity limits and whole-codepoint clipping within existing UTF16 field limits. Conversation serialization/cache retain complete bounded turns and expose save failures instead of silently losing activity.

`studentConduct.ts` defines literal own-account records. `studentConductClient.ts` validates complete bounded reads and sends caller-JWT personal/admin requests with deadlines, cancellation and exact receipt validation. See [conduct QA](../../docs/qa/STUDENT_CONDUCT.md).

`studentLoan.ts` defines literal loan state and local routes; `studentLoanClient.ts` provides strict caller-scoped transport, selected-admin reads and validated durable receipts. See [Student Loan QA](../../docs/qa/STUDENT_LOAN.md).

`dormitoryConduct.ts` and `dormitoryConductClient.ts` define strict personal/admin projections, bounded caller-JWT transport and durable write receipt checks. See [Dormitory Conduct QA](../../docs/qa/DORMITORY_CONDUCT.md).

`dtmDashboardLayout.ts` provides the owner-bound dashboard preference client. It reads only `affairs-data?scope=dtm-dashboard-layout` and sends `save_dtm_dashboard_layout` or `reset_dtm_dashboard_layout` through the existing action endpoint, without an account selector. Shared backend validators enforce exactly the three built-in blocks, visibility/region/weight bounds, version rules and canonical version-zero defaults. The client freezes write payloads before session lookup, checks the exact caller before dispatch and after reading the response, limits each request including session reads to30 seconds and the response to4096 bytes, and verifies returned versions and saved blocks. Cancellation aborts pending work; a saved layout never supplies HTML, file or assistant capabilities. Dashboard state retains exact request IDs for uncertain retries and requires explicit reload after a409 conflict. Backend migration/live acceptance is separate from the offline client tests.

`dtmGradeReport.ts` reads and manages literal reports through the verified School Affairs caller. It rechecks identity before and after requests, bounds transport, validates exact owner/course responses and preserves retry command IDs. It does not calculate displayed grades or merge personal score trackers.

`dtmCourseResource.ts` loads one owned course/material through the dedicated `dtm-course-resource` scope. It checks the caller before and after transport, enforces a 30-second total deadline and 196608-byte UTF-8 response limit, and validates the exact response scope. Stored `targetUrl` is separate from Moodle `sourceUrl` provenance; neither this client nor its renderer fetches the destination. Missing materials and failed reads remain distinct. The shared material type exposes an optional nullable `targetUrl` for compatible older snapshots. See [URL-resource QA](../../docs/qa/DTM_COURSE_RESOURCE.md).

`dtmCourseContent.ts` provides caller-guarded course layout reads, exact assignment lookup and administrator mutations. Its bounded full-page assembler rejects inconsistent revisions and incomplete results. It does not query generic assistant snapshots.

`feeRemission.ts` reads history and dispatches administrator changes with the initiating account’s session. The shared contract validates literal cells, the returned owner, and the write receipt.

`exchangeGrant.ts` reads and updates account-owned grant drafts. It checks the initiating Google session before sending a request and before returning the result.

`tutorEvaluation.ts` loads and submits the account’s evaluation, checks the initiating session before and after the request, and verifies the response owner and request ID.

`programRegistration.ts` binds registration requests to the initiating School Affairs session. `interdisciplinaryPrograms.ts` provides the public catalog reader used by the registration and directory pages.

The facility repair client verifies the active School Affairs session around private reads and writes, and validates the mutation receipt before navigating.

The course adjustment client reads caller-owned summer decisions. Summer notice reads use a separate public scope.

The student profile client uses the School Affairs session and rechecks the caller before presenting a response.

The announcement email client reloads the caller-owned preference and preserves the same request ID when a confirmation receipt is lost.

The certificate award client uses the School Affairs session for application and Storage requests, checks account binding and uses only the private proof bucket.

Accommodation bed questions from service 34-1 use the common account verification endpoint. The signed-out assistant can show the service route and sign-in return link.

Housing receipt and bed questions go through the School Affairs verification endpoint. Its returned record cards include the same metadata shape as other assistant cards, so the conversation serializer retains the count, timestamp and source note.

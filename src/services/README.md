# Browser service clients

## Assistant conversations

`assistantSessions.ts` handles account-bound conversation API calls and a bounded tab cache. `assistantConversation.ts` preserves observed activity, verification results and record views while dropping executable proposals and raw images on restore. Guest chats stay in the tab; signed-in chats sync to owner-only database rows. Account/scope changes discard the prior account's local view. The UI exposes save/conflict failures rather than pretending a chat was synced.


Browser clients call the public, School Affairs and protected Nexus endpoints. `schoolAffairsAssistant.ts` uses only the isolated School Affairs session. Provider secrets stay on the server.

`researchAssistant.ts` reads bounded SSE progress/result events, accepts the JSON fallback, and passes observed activity to the public chat. `schoolAffairsAssistant.ts` uses the same reader after verifying the isolated Google session.

`assistantConversation.ts` merges streamed and final activity, retains up to 24 messages in current-tab session storage, and strips images, tokens and transient action capabilities before writing. It discards transcripts when the verified identity changes and marks an interrupted in-flight response clearly on restore.

`schoolAffairsWorkspace.ts` reads account-scoped School Affairs and DTM data and sends student record edits to the audited RPCs. Its manager call uses the verified Google session and is separately authorized by the database.

`scholarship.ts` defines local scholarship periods and application records, Taipei date/window helpers, and unambiguous applicant labels. The existing School Affairs action/manager clients submit versioned requests with stable retry IDs to the dedicated scholarship RPC.

`studentAid.ts` defines masked, account-owned aid records and safe amount/date display. `housing.ts` defines published housing windows, consented applications, receipts and bed history. Their writes use the existing School Affairs action/manager clients with database authorization and stable retry identities. Catalog offers and syllabus data remain independent of personal enrollment.

`pendingFees.ts` preserves nullable metadata and computes positive balances in cents; occurrence dates never inherit payment deadlines. `creditLoadHistory.ts` defines administrator-authored local history, display labels and timestamps without inventing school eligibility rules.

`courseSelection.ts` defines the observed course-selection phases, fourteen timetable periods, owner-scoped record types and native display helpers. Manager writes carry typed meeting arrays, explicit timetable membership, expected versions and retry IDs through the existing authorized manager API.

`academicGrades.ts`, `graduationReview.ts` and `academicAttendance.ts` validate and scope native result bundles and manager edits. The shared workspace client exposes separate grade, graduation and attendance collections; explicitly requested report kind/current term is never inferred from another collection or the latest historical row.

`dtmSubmissions.ts` coordinates private upload reservations, durable Save/Cancel receipts and revision-specific downloads; detail/editor adapters preserve saved versus pending state. `dtmSubmissionMaintenance.ts` exposes bounded manager cleanup without caller-provided paths. Certificate transports validate dedicated own/admin response shapes, abort on identity changes, preserve retry IDs and never accept document capabilities.

`assistantActivityBudget.js` applies shared byte/message/observable-activity limits and whole-codepoint clipping within existing UTF16 field limits. Conversation serialization/cache retain complete bounded turns and expose save failures instead of silently losing activity.

`studentConduct.ts` defines literal own-account records. `studentConductClient.ts` validates complete bounded reads and sends caller-JWT personal/admin requests with deadlines, cancellation and exact receipt validation. See [conduct QA](../../docs/qa/STUDENT_CONDUCT.md).

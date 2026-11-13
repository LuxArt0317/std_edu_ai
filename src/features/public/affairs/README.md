# School Affairs UI

Service 6-4 opens the local course withdrawal table, confirmation and restoration. The existing School Affairs administration page configures the term window. See [course withdrawal QA](../../../../docs/qa/COURSE_WITHDRAWAL.md).

The captured 94-link service catalog opens local pages. Shared routes cover the homepage, notifications, bookmarks, DTM and the student SSO information page. Other entries open a service workspace with its university destination and private tracking records.

The calendar entry opens the captured Academic Affairs calendar directly, with its six local Chinese and English academic-year PDF downloads. Source query parameters and section anchors are preserved; previously shared `/school-affairs/services/4-4` links redirect to the same document. This dated public calendar is independent of personal DTM deadlines and does not use a tracking form.

The logged-out entry uses the 16 public campus photos captured from `info.stu.edu.tw/ePortal/login.asp`. It starts on a varying photo, advances every five seconds, and offers previous, next and pause controls. Reduced-motion visitors start paused. Photo URLs and hashes are recorded in `public/stu-reference/provenance.json`.

Google sign-in starts from a full browser page. A login page opened in an assistant iframe first navigates the parent to `/school-affairs/login`. The OAuth URL is generated without an automatic frame redirect, validated against the configured Supabase Auth endpoint, then opened in the top-level page. A stalled start returns a retryable error after 15 seconds.

Successful School Affairs sign-out clears the current tab's assistant transcript, including account-specific answers and activity. The assistant keeps that bounded transcript only for the verified Google identity while the session remains active; see the linked assistant QA guide for restore and privacy behavior.

`/school-affairs/services/leave` and its history page save leave dates, type, periods and an optional reason. The internship workspace tracks contracts, self-assessments and companies. Requesting site review sends a summary to the existing stu.best admin queue after confirmation. The owner retains private notes. Use the official leave and internship links to file with the university.

The custom **My School Affairs** summary and its **個人資料** menu entry are removed. Old `/school-affairs/records` links replace history with the native portal index. Saved enrollment, tuition, assignment, task and request data remain available through the existing account-scoped APIs and assistant. `SchoolAccountRecords.tsx` retains only the sign-in privacy page.

Existing maintenance is separate at `/school-affairs/admin/records`, rendered by `SchoolAccountAdmin.tsx`. Its menu entry appears only after the current caller's administrator role is verified; direct student access cannot load the admin snapshot. Administrative writes capture the initiating caller, reject switched sessions and abort on unmount, without changing server authorization. Private reads and audited writes retain `/api/affairs-data`, `/api/affairs-action` and `/api/affairs-manage`. [School Affairs assistant and account data](../../../../docs/qa/SCHOOL_AFFAIRS_ASSISTANT.md).

The signed-in index follows the university's notice and menu layout. **請假填單** opens the standalone form at `/school-affairs/services/leave`. The leave menu includes the system index, saved history, historical records through academic year 107 and class periods. Submitting the form saves a private stu.best draft. A separate review action shares the title, dates and class periods with the site admin. Internship opens its own index with four Student Zone destinations. Enrollment, timetable, grades, attendance, credit history, student details and fees use the account snapshot. The official service link is available for university records and submissions.

`/school-affairs/services/9-1` provides the source-shaped scholarship application and history screen. Administrators publish clearly labeled local demonstration periods and review applicant awards and service hours in the record manager. Applications can be cancelled and resubmitted only before review during the server-enforced window. Stable request receipts and record versions protect retries and concurrent edits; each period retains one application per account. No period or award is seeded from official personal data. Review rows include account email (or a stable account ID), including applicants outside the first manager page.

`/services/22-1` renders the observed student-aid record table, including its empty state and query disclosure. It has no invented student application form. The record manager saves nullable amounts, review labels and masked identifiers with version checks and stable retry IDs. Complete identity numbers are rejected.

`/services/26-1` provides local housing periods, agreement, entry, confirmation and durable receipt/reprint. `/services/34-1` shows administrator-maintained room history. Administrators maintain periods and bed/fee records; publishing is explicit, deadlines run on server time, and the accepted agreement is retained. No historical university window is automatically opened. National ID is not collected; local receipts use opaque identifiers.

`/services/12-4` is the authenticated course-offering catalog, separate from enrollment. It retains source filters, the21-column result table, sorting, paging and distinct course details. Only the site administrator edits published local sample offerings. Native standalone services retain the existing floating assistant because they do not have the portal account menu.

`/services/39-1` has the measured eight-column pending-fees table with stored occurrence date, category, contact and payment units. Positive outstanding balances remain read-only; manager edits use the existing audited charge RPC. `/services/11-3` has the measured six-column credit-load history with account-owned records and a versioned admin editor. The open-period7-1 application is not implemented by this history page.

`/services/11-1` and `/services/11-2` use separate academic-year/semester/selection-phase snapshots. The source-shaped query form displays seven history columns or all fourteen weekly periods, including multiple meetings and unscheduled courses. Administrators explicitly maintain timetable membership; source remarks are preserved without deriving selection success from them. Legacy assistant enrollment citations to `/records` now reach the portal index; this presentation change does not alter the assistant's stored evidence or paused evaluation work.

`/services/6-1` reads the dated initial-selection schedule and opens a separate `/fees` notice. The final control shows the observed return-to-portal behavior. The open enrollment form was unavailable. Previously saved notes remain at `/services/6-1/notes`. See [initial selection QA](../../../../docs/qa/FIRST_SELECTION.md).

`/services/6-2` and `/services/6-3/entry` display account-owned decisions. `/services/6-3` links to selection and fee notices. The admin panel can maintain decisions per phase and term. Earlier notes remain at each service's `/notes` route. See [course adjustment QA](../../../../docs/qa/COURSE_ADJUSTMENT.md).

`/services/13-1` has native transcript, warning, ranking, current, transfer and cycle destinations. `/services/15-1` opens the modern graduation report; `/services/15-2` renders its independent legacy report. `/services/14-1` and `/detail` show stored absence statistics and dated roll-call details, with an explicitly designated current term. Source dates and closed/empty query states are preserved without fabricating unseen forms.

`AcademicGradesManager`, `GraduationReviewManager` and `AcademicAttendanceManager` maintain account-owned local demonstration records. Their expected versions and stable request IDs prevent silent stale edits and duplicate retries. Zero, missing values, literal result text and fractional-second timestamps remain distinct. Native views retain the floating assistant and source-derived layouts; measured parity limits are in [academic QA](../../../../docs/qa/ACADEMIC_RESULTS.md).

Service `17-1` now mounts the separate source-shaped enrollment-certificate assessment. It loads only the caller-scoped certificate endpoint and immediately hides stale account data. The record manager offers selected-student assessment maintenance and read-only document metadata; no issuance or download control is inferred from the blocked source screen.

`/services/12-3` provides a separate source-shaped syllabus search. It collects complete published results with revision checks and opens local18-week course outlines. Historical includes current; current membership and term labels are explicit nullable administrator metadata. The course and metadata editors prevent each other from discarding unsaved drafts. See [syllabus acceptance](../../../../docs/qa/SYLLABUS_SEARCH.md); database, real-account and deployed browser acceptance passed.

`TuitionDocumentsWorkspace.tsx` now mounts four separate native routes under `/school-affairs`: `/services/48-1` summer PDF instructions, `/services/48-2` the observed extended-study Index destination, `/services/48-3` evening fee PDF instructions, and `/services/49-1` settlement selection/query. It reuses the measured `TuitionDocuments.tsx` shell and keeps an explicit query separate from selecting a period. The source observation contained no settlement periods or result rows; local records therefore display stored literal statements, without inventing a fee table or university payment result. Unknown (`null`), literal blank and no matching record remain distinct.

`SchoolRecordManager.tsx` opens `TuitionDocumentsManager.tsx` explicitly for the selected student's account using the authenticated manager identity. Settlement and document metadata saves/deletes preserve versions, request receipts and unsaved drafts. An uncertain unchanged request retains its request ID; HTTP 409 requires refresh and comparison. A committed metadata creation whose response was lost can replay the same request after refresh finds that exact record, while another record with the same document kind still blocks creation. Account changes abort pending reads/writes and hide the prior account's data.

The mounted student workspace always supplies no document and no open-file callback. Every Print control remains disabled; neither metadata nor the observed PDF instructions creates an issued PDF, payment or Storage capability. Parent-level independent-site disclosure and the local footer remain intact. The new tuition tables are not yet registered with assistant tools. Offline checks cover source-known dimensions and 390/320 containment, not complete pixel equivalence or live document behavior. Migration `180000` and actual-JWT local acceptance passed; publication/deployed acceptance remain pending; see [tuition acceptance](../../../../docs/qa/TUITION_DOCUMENTS.md).

`StudentConductWorkspace` mounts native38-1 with independently loaded caller identity and strict private rows. `StudentConductManager` supplies versioned administrator maintenance; collapsing its host preserves drafts and uncertain retry IDs, while identity changes reset them. Downloads and unobserved record detail remain unavailable. [Conduct scope and QA](../../../../docs/qa/STUDENT_CONDUCT.md).

`StudentLoanWorkspace` mounts21-1 and its progress/history/document states. `StudentLoanManager` maintains selected-account literal metadata; hidden editors retain drafts and uncertain requests. Document navigation opens only a local status page. See [Student Loan QA](../../../../docs/qa/STUDENT_LOAN.md).

`DormConductWorkspace` mounts34-2 as the observed event-message page. It separately verifies the caller's account identity and loads strict caller-owned `empty` or `unknown` metadata. Missing, foreign or invalid data never establishes an empty history. HomePage returns to the local School Affairs index. `DormConductManager` opens explicitly for the selected account using the authenticated manager ID; collapsing it retains the draft and exact uncertain request, while changing the account aborts and clears the previous editor. No populated disciplinary table, housing application or document capability is inferred. This integration is verified offline only; draft220000 remains unapplied. See [Dormitory Conduct scope and QA](../../../../docs/qa/DORMITORY_CONDUCT.md).

`/services/21-2` opens `EducationFundWorkspace`, reproducing the observed Education Fund instructions and dated closed application period. This source state has no application controls or personal records. Local navigation replaces the source footer links; the capture date remains metadata. See [Education Fund QA](../../../../docs/qa/EDUCATION_FUND.md).

Legacy numeric service URLs 20-1, 33-1 and 53-1 replace history with the canonical Leave, Leave history and Internship routes while preserving query and fragment. Leave, Scholarship and generic service mutations capture the initiating account, reject account changes through the existing transport guard, abort pending operations on unmount and prevent duplicate dispatch. Cancellation of a client request does not imply rollback of an already accepted server write.

The observed selection-confirmation entry `6-6` redirects to the native selection query `11-1`, as the captured source does. It does not expose or invent a confirmation transaction.

Catalog entry `4-5` opens the copied homepage as a full document, so its static page loads instead of the SPA mirror fallback. Native portal and DTM routes keep their existing navigation.

`/services/7-1` and `/school-affairs/course-selection` provide the observed credit-load instructions/closed-period acknowledgment and selection-system index. The three student-facing review links return to that index as observed; this does not implement staff review. Existing selection and credit-load history Index links now remain within that system. See [credit-load entry scope and QA](../../../../docs/qa/CREDIT_LOAD_APPLICATION.md).

`DtmGradeReportManager` is available from selected-student administrator maintenance. Its independent course picker can discover that student's personal courses without widening legacy course RLS. It preserves item order, exact cells and explicit totals; unsaved or uncertain operations lock course switching until replay/reload or explicit draft discard. See [grade-report QA](../../../../docs/qa/DTM_GRADE_REPORTS.md).

`DtmCourseContentManager` provides selected-student course placement and order maintenance within the existing guarded manager. Its hidden disclosure retains drafts; pending edits and uncertain operations lock course/student switching. Stale references require explicit removal. It adds no authoring controls to the copied student course page.

`/school-affairs/services/21-3` shows the captured tuition-reduction instructions and seven-column account history. Previous notes are accessible at `/school-affairs/services/21-3/notes`. Administrators maintain history for the selected student through `/school-affairs/admin/records`.

Grant service 23-1 opens the observed index and four distinct local destinations. The conference form saves private drafts, and the report page saves a reflection against a selected draft. The operations manual is available on the index. The earlier personal notes are at `/school-affairs/services/23-1/notes`.

Catalog 25-1 and 25-2 open the teaching-assistant index, which has separate report and self-evaluation links. Catalog 28-1 opens the ten-question tutor evaluation. Previously stored personal notes stay available under each service’s `/notes` route.

Service Leadership (42-1) opens the observed index and four distinct entry pages. The entry pages provide the exact university destinations while protected workflows are unobserved. Existing 42-1 notes remain at `/school-affairs/services/42-1/notes`. The assistant’s subject evidence opens `/school-affairs/records/subjects` with the same account’s enrollment rows and Taipei schedule.

General Affairs parking (46-1) opens the dedicated permit entry and `/school-affairs/services/46-1/instructions`. The instructions embed the current university PDF with a direct link. The permit button opens the university service in a new tab. Existing account-owned notes are at `/school-affairs/services/46-1/notes`.

Historical curriculum plans (12-5) has a table for each program and archive, a local PDF preview, and existing notes at `/school-affairs/services/12-5/notes`. The tables describe published program curricula. Personal enrollment stays in the account’s subject and timetable views.

Curriculum maps (12-7) has a four-college directory, department overview pages and an interactive year/track course lookup. Career and competency pages hand off to university sign-in. Existing private notes remain at `/school-affairs/services/12-7/notes`.

`/services/12-6` reads the published interdisciplinary program catalog from Supabase. It keeps the six observed sortable columns and opens each available PDF on a dedicated local route. Existing private notes are available at `/services/12-6/notes`.

`/services/7-3` displays the observed registration history and lets the signed-in student manage their local program registrations. Each change requires confirmation. Existing tracker notes are at `/services/7-3/notes`.

`/services/12-8` offers the public substitution search. Its result path stores the exact cohort, track and department, and an optional course anchor expands that row. Existing private notes are at `/services/12-8/notes`.

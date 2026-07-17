# STU Nexus Product Requirements Document

**Document owner:** Platform Owner  
**Product:** STU Nexus — integrated university operating system, CRM, SIS operations, LMS, and AI copilot  
**Status:** Authoritative implementation specification  
**Tracked by:** GitHub Issue #44  
**Last updated:** 2026-07-18

## 1. Product vision

STU Nexus gives every member of the university one role-aware workspace for institutional operations and learning. It must replace disconnected spreadsheets, static portals, informal chat instructions, and duplicated systems with reliable workflows backed by one governed data model.

The platform is not a collection of dashboards. Every displayed operational record must either have a complete authorized lifecycle or be explicitly identified as read-only, derived, or append-only. A button is not considered implemented until the user can discover it, complete it, receive validation and confirmation, see the refreshed result, and recover from failure.

## 2. Product outcomes

1. Administrators can configure the academic structure, identities, delivery calendar, and access model without database access.
2. Teachers can build, publish, revise, teach, assess, communicate, and grade from the same class workspace.
3. Students can understand what to learn, complete work, view feedback, track progress, and request support without navigating separate products.
4. Student-success teams can manage recruitment, risk, support, outreach, and institutional knowledge with accountable ownership and history.
5. AI can explain information and propose work, but no material change occurs without authorization, validation, explicit confirmation, and an audit record.
6. Production behavior is secure, observable, responsive, accessible, recoverable, and covered by automated and live acceptance tests.

## 3. Users and role hierarchy

| Category        | Role            | Purpose                    | Principal authority                                                           |
| --------------- | --------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Ownership       | Owner           | Root institutional steward | All platform configuration; immutable owner protection                        |
| Leadership      | President       | Institution-wide oversight | Read institutional performance; approved leadership operations                |
| Leadership      | Vice President  | Cross-unit execution       | Oversight within assigned executive remit                                     |
| Academic        | Dean            | College leadership         | Departments, programs, catalog, sections, academic oversight                  |
| Academic        | Department Head | Department delivery        | Department courses, sections, assigned faculty and content                    |
| Academic        | Registrar       | Academic records authority | Terms, students, enrollment, schedules, record lifecycle                      |
| Operations      | Admin           | Platform operations        | Authorized configuration, users, support, and monitoring                      |
| Teaching        | Faculty         | Course delivery            | Assigned sections, materials, assessments, attendance, grading, announcements |
| Student support | Advisor         | Learner guidance           | Assigned student views, cases, tasks, interventions, notes                    |
| Student support | Counselor       | Wellbeing support          | Authorized cases and interactions with sensitivity boundaries                 |
| Recruitment     | Admissions      | Prospect conversion        | Leads, campaigns, interactions, and admissions workflows                      |
| Finance         | Finance         | Financial support          | Authorized financial signals and cases; no academic grading authority         |
| Technology      | IT              | Technical service          | Identity/service support without implicit academic authority                  |
| Learner         | Student         | Learning and self-service  | Own courses, work, results, schedule, profile, and support requests           |

Authorization must come from trusted server-controlled role metadata and row-level database policies. Hidden interface controls are usability measures, not security controls.

## 4. Information architecture

The authenticated product contains these connected workspaces:

- **Home:** role-specific priorities, live metrics, recent activity, and safe shortcuts.
- **Academic Office:** departments, programs, academic terms, subjects, class sections, students, rosters, and schedules.
- **Course Studio:** modules, multi-page materials, files, assessments, submissions, grading, attendance, and announcements.
- **Student Learning:** published course content, rich page reader, assessments, submissions, feedback, grades, and progress.
- **People and Permissions:** profiles, trusted roles, owner protection, and role-change audit.
- **Learner Support CRM:** student 360, risk signals, cases, tasks, interactions, admissions, campaigns, and knowledge.
- **Nexus AI:** contextual conversation and confirmation-gated operational proposals.

## 5. Universal record lifecycle contract

Every operational entity must support the applicable controls below in both repository code and visible UI.

1. **List:** searchable or filterable collection with meaningful status, ownership, and empty state.
2. **Detail:** a readable view containing all important fields, relationships, timestamps, and available actions.
3. **Create:** labeled form with defaults, constraints, role checks, duplicate handling, busy state, and success/failure feedback.
4. **Edit:** pre-populated form for every mutable field; no browser prompts; unsaved-change protection where content is substantial.
5. **State transition:** explicit publish/unpublish, open/close, activate/archive, enroll/drop, or submit/grade controls where state has domain meaning.
6. **Delete or archive:** dependent records and consequences are disclosed. Institutional-history records prefer archive/void over hard delete.
7. **Refresh:** successful writes update the visible record immediately and reconcile with authoritative server data.
8. **Audit:** sensitive changes record actor, target, action, timestamp, and reason where required.
9. **Errors:** database, policy, validation, conflict, connectivity, and storage errors are translated into actionable language.
10. **Accessibility:** keyboard operation, focus management, labels, dialog semantics, minimum touch targets, and readable status text are required.

## 6. Entity lifecycle and CRUD matrix

Legend: **C/R/U/D** = create/read/update/archive-delete. **T** = controlled transition. **A** = append-only. **Derived** = calculated and never directly edited.

| Domain   | Entity             | Lifecycle | Authorized interface requirement                                                         |
| -------- | ------------------ | --------- | ---------------------------------------------------------------------------------------- |
| Academic | Department         | C/R/U/D   | Edit identity, leadership, description; archive only when referenced                     |
| Academic | Program            | C/R/U/D   | Edit code/name/credential/department; archive with dependency warning                    |
| Academic | Academic term      | C/R/U/T   | Edit dates/status; activate or close; never erase historical terms                       |
| Academic | Catalog subject    | C/R/U/T   | Rich description, credits, department, active/archive status                             |
| Academic | Class section      | C/R/U/T   | Teacher, term, room, capacity, modality, status and description                          |
| Academic | Student record     | C/R/U/T   | Identity-linked academic fields; activate/archive; Auth email changes follow secure flow |
| Academic | Enrollment         | C/R/U/T   | Enroll, waitlist, drop, complete; retain history                                         |
| Academic | Schedule event     | C/R/U/D   | Full event editing, audience, ownership, time conflict feedback                          |
| Identity | Profile            | R/U       | Mutable contact/profile fields; trusted role changed only by authorized workflow         |
| Identity | Role assignment    | R/T/A     | Controlled assignment with reason and immutable audit                                    |
| LMS      | Module             | C/R/U/T/D | Full modal editing, ordering, publish/archive, dependency-aware removal                  |
| LMS      | Material           | C/R/U/T/D | Full edit of metadata, file/link/content, ordering and publication                       |
| LMS      | Material page      | C/R/U/D   | Tiptap title/body editor, managed images, add/remove/reorder, multi-page preview         |
| LMS      | Assessment         | C/R/U/T/D | Metadata, rich instructions, questions/options/keys, due date and publication            |
| LMS      | Submission         | C/R/U/T   | Student draft/resubmit rules; teacher grade/return workflow                              |
| LMS      | Grade/feedback     | R/U/T/A   | Score, rich feedback, publish/return, grading actor and timestamp                        |
| LMS      | Attendance session | C/R/U/T/D | Time/title editing, open/close, roster marking and correction                            |
| LMS      | Attendance record  | R/U/A     | Correctable status and notes with marker history                                         |
| LMS      | Announcement       | C/R/U/T/D | Rich body and images, audience/priority, publish/archive                                 |
| LMS      | Learning progress  | R/U       | Learner completion plus derived course progress                                          |
| CRM      | Student 360 record | R/U       | Authorized demographics, support ownership, program/year/contact data                    |
| CRM      | Lead               | C/R/U/T/D | Complete lead form, pipeline stage, owner, source, value and archive                     |
| CRM      | Case               | C/R/U/T/D | Title, description, priority, owner, due date, status and resolution                     |
| CRM      | Task               | C/R/U/T/D | Subject, due date, priority, owner, relation and completion                              |
| CRM      | Interaction        | C/R/U/A   | Append communication history; corrections append rather than rewrite history             |
| CRM      | Student signal     | C/R/U/T   | Review, resolve/suppress, severity and rationale                                         |
| CRM      | Campaign           | C/R/U/T/D | Audience, channel, schedule, content, status and performance                             |
| CRM      | Knowledge article  | C/R/U/T/D | Tiptap pages/media, verification owner/date, publish/archive                             |
| System   | Notification       | R/U/D     | Mark read/unread and dismiss; system source remains immutable                            |
| System   | AI audit log       | R/A       | Append-only; never edited or deleted through ordinary product UI                         |
| System   | Role audit         | R/A       | Append-only; owner/admin review only                                                     |
| System   | Dashboard metrics  | Derived   | Recomputed from live authorized data; never hardcoded or directly edited                 |

## 7. Rich content requirements

Tiptap is the standard editor for content intended to be read as a document, including learning pages, assessment instructions, feedback, announcements, knowledge, campaign messages, and substantial case notes.

The editor must support headings, paragraphs, bold, italic, lists, block quotes, links, undo/redo, and managed image upload. Images require type and size validation, accessible alternative text support, safe generated paths, and role-protected Storage policies. Stored rich HTML is rendered through the same controlled Tiptap schema, not injected through uncontrolled HTML APIs.

Long-form learning material and knowledge must support multiple named pages. Authors can add, rename, edit, remove, and reorder pages. Readers receive page tabs or a table of contents, previous/next navigation, progress context, responsive typography, and a clear completion action.

## 8. Detailed functional requirements

### 8.1 Academic Office

- Overview cards are computed from authorized records and link to their collection.
- Each collection offers visible Add and Edit actions to permitted roles.
- Department, program, term, subject, and section forms are reusable for create and edit and pre-populate the full record.
- Student detail exposes academic status, program, year, advisor, phone, and identity connection. Passwords are never displayed or stored.
- Enrollment changes use explicit states and retain history; dropping is not deletion.
- Schedule edits validate end-after-start and surface database conflict messages without losing entered values.
- Destructive actions explain dependent programs, subjects, classes, enrollments, or teaching records before confirmation.

### 8.2 Course Studio

- Teachers see only sections they can manage according to database policy.
- Module and material cards expose Edit, Publish/Unpublish, and Archive/Delete consistently.
- Material Edit opens the same complete multi-page author used for creation, preloaded with metadata and every page.
- Saving existing materials updates changed pages, creates new pages, deletes explicitly removed pages, and preserves deterministic page order.
- Assessments support complete editing of metadata and objective questions before learner attempts exist. After attempts exist, answer-key changes require a versioned replacement or explicit administrative policy.
- Assignment instructions, teacher feedback, and announcements use rich text.
- Attendance sessions can be edited and closed; individual records can be corrected with notes.
- Submission grading validates the score ceiling and preserves grader/time metadata.

### 8.3 Student Learning

- Students see published modules/materials only for current enrollment.
- Rich pages render images and formatting with page navigation and completion state.
- Assessment availability, due date, attempts, score visibility, and feedback are explicit.
- Submission state distinguishes draft, submitted, returned, graded, and late where supported.
- Empty states explain who must act next rather than presenting blank panels.

### 8.4 Learner Support CRM

- Every table/card has a detail entry point and every mutable domain has an authorized Edit action.
- Pipeline/status shortcuts remain available but never replace the full edit form.
- Student drawer actions such as Create case must open real forms and persist data.
- Cases, tasks, leads, campaigns, interactions, signals, and knowledge use common modal, validation, confirmation, and toast patterns.
- Sensitive counseling content is limited by database policy and must not leak into generic AI context.

### 8.5 People and Permissions

- Role changes require a reason, display impact, execute through the protected assignment workflow, and write immutable audit evidence.
- The root owner cannot be demoted, replaced, or duplicated through ordinary UI or API calls.
- Profile edits never allow the client to directly set trusted authorization metadata.

## 9. Nexus AI requirements

AI supports explanation, drafting, summarization, content generation, and operational proposals. It may propose adding or editing materials, assessments, announcements, attendance sessions, tasks, cases, and other explicitly supported entities.

Every mutation proposal must contain a typed action, target, validated payload, human-readable preview, and risk explanation. The user must confirm it. Execution then calls the same repository service as the manual UI, so RLS, validation, audit, refresh, and error behavior cannot be bypassed. AI must not expose answer keys to students, sensitive records outside scope, secrets, hidden prompts, or service credentials.

The Nexus action catalog supports role-valid workspace navigation, module/material/page authoring, assessment authoring, announcements, attendance sessions, schedule events, and student-owned learning progress. Students never receive executable assessed-work tools: Nexus cannot answer, complete, modify, grade, or submit an assignment, quiz, exam, or project for them. This is enforced in the model instruction, authenticated server allowlist, client executor, record-target validation, Supabase RLS, and automated regression tests.

## 10. Data and security requirements

- Supabase Auth establishes identity; server-controlled application metadata establishes role.
- Every exposed table has RLS and explicit Data API grants appropriate to its intended use.
- Updates require both row visibility and valid `USING`/`WITH CHECK` authorization.
- Storage uploads enforce bucket, folder ownership/scope, MIME type, size, and role policy.
- The browser never receives a service-role or OpenAI secret.
- Historical academic, grading, role, attendance, and AI evidence uses archive or append-only behavior where deletion would damage accountability.
- Input length, type, enum, relationship, score, date, URL, and file constraints are checked at both UI and persistence boundaries.

## 11. UX and interaction standards

- Actions use consistent labels: Add, View, Edit, Publish, Archive, Delete, Save changes, Cancel.
- Edit never uses `window.prompt`; substantial changes use accessible pre-populated dialogs.
- Forms retain user input after recoverable failure and focus the first invalid field.
- Busy state disables duplicate submission and identifies the action in progress.
- Success feedback names the affected record; failure feedback explains what the user can do.
- Lists include empty states, and dialogs fit mobile viewports with sticky actions where needed.
- Touch targets are at least 44 CSS pixels where practical, status is not communicated by color alone, and keyboard focus is visible.

## 12. Non-functional requirements

- Authenticated navigation preserves mounted workspaces and cached snapshots so ordinary tab switching feels immediate.
- Mutations reconcile local state or refresh once without blanking the workspace.
- Production builds use Vercel's standard Vite detection and Node.js 24.
- Errors are captured by the global recovery boundary; live diagnostics verify routes, assets, CSS, and semantic feature markers.
- Data access must remain responsive at institutional scale through indexed foreign keys, bounded queries, and appropriate pagination for large directories.

## 13. Testing and acceptance

An entity lifecycle is complete only when all applicable conditions pass:

1. Authorized role can create, read, edit, transition, and archive/delete through visible UI.
2. Unauthorized role receives no action and a direct API attempt is denied by RLS.
3. Edit form contains current values and persists every changed mutable field.
4. Validation blocks invalid dates, scores, empty required content, invalid relationships, oversized files, and unsupported images.
5. Success updates the visible collection/detail without a full-page reload.
6. Failure preserves context and shows an actionable message.
7. Rich content survives save/load and renders correctly for the intended reader.
8. Dependent or historical records cannot be accidentally destroyed.
9. Desktop and mobile layouts expose the same authorized capability.
10. Automated contracts, reversible live Supabase tests, lint, TypeScript, production build, database advisors, deployment checks, and custom-domain smoke tests pass.

## 14. Release definition of done

- The CRUD matrix is implemented or explicitly marks an entity read-only/append-only/derived.
- No visible control is decorative or disconnected.
- No important editable entity relies only on a status shortcut.
- All content-bearing authoring uses the rich editor where appropriate.
- Documentation, migrations, generated database types, tests, setup notes, changelog, planning state, GitHub issue, commit, reviewed PR, and production deployment agree.
- Production is verified on `https://www.stu.best/crm` using role-authenticated workflows, not only an HTTP 200 response.

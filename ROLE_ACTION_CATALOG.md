# STU Nexus Complete Role and Action Catalog

**Status:** Authoritative product and implementation contract  
**Tracked by:** GitHub Issue #48  
**Security rule:** Navigation never grants authority. Supabase Auth trusted `app_metadata`, database RLS, scoped workflow functions, record relationships, confirmation, and audit evidence determine whether an action succeeds.

## Action lifecycle required everywhere

Every mutable operational record must provide the applicable **list, search/filter, detail, create, pre-filled edit, controlled transition, archive/delete, refresh, audit, loading, empty, success, and actionable error** states. Historical academic, identity, attendance, grading, submission, interaction, role, and AI evidence is archived, corrected, versioned, or appended rather than silently erased.

## Owner

- Accounts: create every non-owner account; invite; generate/rotate temporary credentials; resend access; view identity detail; edit directory fields; assign department/program/classes/advisees; activate, suspend, archive, restore, revoke sessions, and inspect last login/activity.
- Roles: assign/change every non-owner role with a reason; review immutable role history; preview any role UI; never create, transfer, demote, archive, or delete a second/protected owner.
- Academics: full department, program, term, catalog subject, section, student, enrollment, room, capacity, modality, and schedule lifecycle; assign heads, teachers, advisors, and institutional owners.
- LMS: institution-wide module, material/page, assessment/question/key, announcement, attendance, submission-review, draft-grade, feedback, publication, correction, and archive oversight.
- CRM: institution-wide Student 360, lead, case, task, interaction, signal, campaign, knowledge, assignment, transition, reporting, and audit work.
- Nexus: institution-wide grounded answers and confirmation-gated permitted actions; never bypass authorization or protected workflows.

## Administrator

- Create and maintain non-owner accounts when delegated; never create/alter the owner.
- Operate departments, programs, terms, subjects, sections, students, enrollment, schedules, rooms, and institutional events.
- Coordinate announcements, knowledge, cases, tasks, campaigns, reports, audit review, account status, and incomplete workflows.
- Review LMS delivery and authorized grading/attendance evidence without impersonating teachers or students.

## President

- View institution-wide enrollment, retention, attendance, academic, CRM, admissions, finance, service, campaign, and performance analytics.
- Review departments/programs and high-priority cases; assign strategic initiatives; approve institutional policy/campaign work; publish institution-wide announcements.
- Request grounded reports through Nexus; no routine grade, answer-key, attendance, submission, or account mutation without separately delegated authority.

## Vice President

- View and manage delegated institutional portfolios, cross-department cases, initiatives, tasks, announcements, campaigns, and operational outcomes.
- Review academic/service/admissions/finance performance; escalate to President/Owner; no implicit individual grading authority.

## Dean

- Govern assigned colleges, departments, programs, curricula, teaching plans, faculty allocation, sections, capacity, schedules, delivery, assessment activity, grade completion, attendance completion, and college announcements.
- Assign/recommend department leadership and faculty work; create interventions; require audited correction instead of casually rewriting final grades.

## Registrar

- Create and maintain student identities/SIS records; validate, enroll, waitlist, transfer, drop, withdraw, complete, graduate, archive, merge, and correct records using controlled history-preserving transitions.
- Operate terms, enrollment windows, catalog, sections, rooms, schedules, capacity/conflict resolution, class lists, official record exports, grade-publication checks, and term locks.
- Never change a finalized teacher grade without the documented correction workflow.

## Department Head

- View and maintain department staff directory fields; assign faculty, classes, workload, rooms, advisors, and department responsibilities; recommend accounts and leadership changes.
- Manage/propose subjects and sections; review/publish/archive department learning delivery and announcements; review assessment, attendance, grade completion, student risk, cases, tasks, interventions, and analytics.
- No institution-wide executive-role assignment or owner operation.

## Faculty / Teacher

- View assigned sections/rosters/schedules and only authorized students.
- Create, detail, edit, reorder, publish/unpublish, archive/delete and preview topics, modules, materials, files, links, videos, activities, and rich multi-page lessons with managed images.
- Create/edit/version/publish quizzes, exams, assignments, and projects; manage rich instructions, multiple-choice/true-false/short-answer questions, options, keys, explanations, points, score ceiling, windows, duration, due date, and attempts.
- Open submissions; return for revision; grade within ceiling; add rich feedback; save draft/reviewed grades; publish and audit corrections. Never impersonate a student.
- Create/edit/open/close/delete attendance sessions; mark/correct individual records with notes/history.
- Create/edit/archive rich course announcements and schedule events.
- Create authorized referrals/cases/tasks/interactions/signals for enrolled students without accessing unrelated sensitive records.
- Nexus may draft and propose teaching work after confirmation; it never publishes a final grade automatically.

## Academic Advisor

- View assigned Student 360, program/year, enrollment, schedule, academic standing, permitted attendance, published-grade summaries, risks, cases, tasks, and intervention history.
- Create/edit/assign/transition advising cases and tasks; append interactions/notes; schedule meetings; refer/escalate; track and resolve outcomes.
- Recommend enrollment/schedule corrections but never directly grade, reveal keys, answer work, or alter authoritative enrollment/grades.

## Admissions

- Create/detail/edit/assign/archive prospects and applicants; manage source, campaign, value, ownership, duplicate resolution, communication history, tasks, visits/interviews, pipeline stages, follow-ups, campaigns, messages, conversion analytics, and accepted-to-student handoff.
- No class enrollment, grading, answer-key, or unrelated student-record authority.

## Finance

- View authorized financial indicators/cases; create/edit/assign/transition financial cases/tasks/interactions; record arrangements; resolve/escalate registration blockers; publish deadlines; review service analytics.
- No academic answer, grade, attendance, enrollment, or unrelated counseling authority.

## Student Support

- View authorized Student 360 context; create/detail/edit/assign/transition support cases/tasks/signals/interactions; schedule appointments; refer/escalate; publish support knowledge; review response outcomes.
- Sensitive information remains purpose-scoped; no grading or assessment-answer authority.

## Librarian

- Create/detail/edit/verify/organize/publish/unpublish/archive/delete rich knowledge and learning resources with managed images and links.
- Create library announcements/events, support course-resource curation, and review usage within authorized context.
- No grade, attendance, enrollment, submission, or key mutation.

## Student

- View/edit permitted personal fields; view dashboard, enrollment, published content, announcements, notifications, schedules, deadlines, attendance, own attempts, own submissions, released feedback, and own published grades.
- Navigate rich lesson pages; access permitted files/links/video/activity; mark in-progress/completed; view derived progress.
- Personally start permitted assessments, select/change/save answers before submission, submit answers, upload/text-submit assignments, resubmit when returned/policy allows, and view resulting status/feedback. Never access keys or another learner's work.
- Request attendance/profile/support correction instead of directly rewriting authoritative records.
- Nexus may explain, summarize, plan study, navigate, and update self-owned learning progress. Nexus must never select an active graded answer, write hand-in work, start/finish/modify/submit an attempt, upload a submission, impersonate the learner, or change a grade.

## Entity action matrix

| Domain   | Entity             | Required actions                                                                                                                                     |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity | Account            | Create/invite, detail, edit directory, assign responsibilities, activate/suspend/archive/restore, rotate credential, revoke sessions, activity/audit |
| Identity | Profile            | Read/update mutable fields; authorization columns excluded                                                                                           |
| Identity | Role               | Read, reasoned controlled assignment, immutable audit; owner protected                                                                               |
| Academic | Department         | Create/read/edit, assign head, activate/archive with dependency warning                                                                              |
| Academic | Program            | Create/read/edit, assign department, activate/archive with dependency warning                                                                        |
| Academic | Term               | Create/read/edit, open/close enrollment, activate/close; history retained                                                                            |
| Academic | Subject            | Create/read/edit rich description/credits/ownership, activate/archive                                                                                |
| Academic | Section            | Create/read/edit teacher/term/room/capacity/modality/status, activate/close/archive                                                                  |
| Academic | Student            | Create identity/SIS, detail/edit, advisor/program/year/status, archive/restore/merge/correct                                                         |
| Academic | Enrollment         | Enroll/waitlist/transfer/drop/withdraw/complete/graduate with retained history                                                                       |
| Schedule | Event              | Create/read/edit audience/owner/time/location/type, conflict validation, delete/archive                                                              |
| LMS      | Topic/module       | Create/read/edit/reorder/publish/unpublish/archive/delete                                                                                            |
| LMS      | Material/page      | Create/read/edit rich multi-page content/images/files/order/status, preview, archive/delete                                                          |
| LMS      | Assessment         | Create/read/edit/version questions/options/keys/settings, publish/unpublish/archive/delete before attempts                                           |
| LMS      | Attempt/submission | Learner draft/start/submit/resubmit; teacher open/return/grade; void/version instead of silent deletion                                              |
| LMS      | Grade/feedback     | Read authorized, edit draft/review, publish, reasoned correction, immutable evidence                                                                 |
| LMS      | Attendance         | Session create/edit/open/close/archive; record mark/correct with history                                                                             |
| LMS      | Announcement       | Create/read/edit rich content/audience/priority, publish/archive/delete                                                                              |
| LMS      | Progress           | Learner read/update; course result derived                                                                                                           |
| CRM      | Student 360        | Authorized read/edit support fields, ownership and history                                                                                           |
| CRM      | Lead               | Create/read/edit/assign/stage/convert/archive/delete duplicate                                                                                       |
| CRM      | Case               | Create/read/edit/assign/status/resolve/reopen/archive with plan and audit                                                                            |
| CRM      | Task               | Create/read/edit/assign/complete/reopen/archive/delete                                                                                               |
| CRM      | Interaction        | Create/read; corrections append rather than destroy history                                                                                          |
| CRM      | Signal             | Create/read/edit/review/resolve/suppress with rationale                                                                                              |
| CRM      | Campaign           | Create/read/edit/audience/schedule/content/approve/send/pause/complete/archive                                                                       |
| CRM      | Knowledge          | Create/read/edit rich pages/media, verify/publish/unpublish/archive/delete                                                                           |
| System   | Notification       | Read, mark read/unread, dismiss; source immutable                                                                                                    |
| System   | Audit              | Append/read by authority; never ordinary edit/delete                                                                                                 |
| System   | Metrics            | Derived from live authorized data; never hand-edited                                                                                                 |

## Controlled-action requirements

Final grade publication/correction, answer-key changes after attempts, withdrawal, enrollment completion, account suspension/archival, role assignment, term closing, program archival, student merge, submission voiding, attendance correction, sensitive-case access, bulk communication, and permanent deletion require explicit confirmation, trusted authorization, actor, timestamp, reason, affected-record preview, and immutable evidence.

## Definition of done

An action is complete only when it has a visible role-valid control, complete form/detail/state UX, repository implementation, validation, RLS or trusted-function authorization, success/error refresh behavior, necessary audit evidence, automated contract coverage, and reversible live role verification. Documentation or a hidden backend function alone does not count.

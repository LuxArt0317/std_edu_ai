# STU Nexus relationship-first action and input contract v3

**Status:** Authoritative schema-connected usability contract  
**Tracked by:** GitHub Issue #103  
**Builds on:** `needed.md` (role/action history), `neededv2.md` (entity lifecycle completeness), and `docs/PLATFORM_SCHEMA_MAP.md` (foreign-key graph)  
**Completion rule:** A relationship is complete only when the user chooses an authorized existing record by a human-readable label, dependent options are scoped by the already-selected parent, the stored value is an authoritative foreign key, the saved relationship is visible from both useful directions, invalid/stale combinations are rejected server-side, and automated plus live production evidence exists.

## Non-negotiable interaction rules

1. Never ask a user to type or paste a database UUID, profile ID, student ID, class ID, curriculum ID, or another record's code in order to form a relationship.
2. Never duplicate an existing entity's identity fields inside a relationship form. For example, curriculum placement chooses a catalog subject; it does not retype that subject's code, title, description, or units.
3. Codes and names remain editable only in the owning entity's explicit Create/Edit workflow. A relationship workflow shows them as read-only context.
4. Dependent choices must narrow immediately: Department → Program → Curriculum/Subject → Class; Student → Case; Program → Advisor; Class → LMS/assessment/grade/schedule records.
5. “Create new” is an explicit branch that opens the owning entity workflow and returns the created record to the original relationship workflow. It is never a blank pseudo-record embedded in a selector.
6. Historical snapshots may preserve labels for reporting, but the active relationship must use the foreign key when the schema has one.
7. Stale options are refreshed and explained. The application must not silently save a different record or leave a detached label.
8. Empty states show the missing parent and provide the exact creation/linking action authorized for the signed-in role.
9. Nexus uses the same exact-ID catalog and validation as the manual UI. It may not invent or resolve relationships by approximate labels when authoritative candidates are available.

## Authoritative relationship chain

`Department → Program → Curriculum plan → Curriculum subject mapping → Catalog subject → Class section → Academic term / Faculty → Enrollment → Student → LMS / Assessment / Attendance / Grade / Schedule`

Supporting chains:

- `Student → Signal / Interaction / Case → Task → Responsible staff`
- `Program → Admission lead → Registrar handoff → Student identity`
- `Campaign → Audience definition → Recipient students → Delivery outcome`
- `Profile → Department / Program / Class responsibility`
- `Schedule event → Class or owner / role audience`
- `Knowledge article → Contributor / source event / class / audience / reviewer`
- `Initiative → Creator / approver / accountable owner`
- `Chat thread → Messages / queued prompts / private attachments`

## A. Identity and responsibility

- [x] **V3-ID-01** Profile department is selected from RLS-visible departments and stores `profiles.department_id`.
- [x] **V3-ID-02** Profile program options are limited to the selected department and store `profiles.program_id`; changing department clears an incompatible program.
- [x] **V3-ID-03** Class-responsibility options are limited to the selected program/department where supplied and store `profile_section_assignments.section_id`.
- [x] **V3-ID-04** Role assignment uses canonical `role_definitions` rather than typed role names.
- [x] **V3-ID-05** Audit actor/target identities are derived from signed-in and selected profiles; audit IDs are never user-entered.

## B. Academic structure, curriculum, and delivery

- [x] **V3-ACA-01** Program department is selected from active departments and stores `academic_programs.department_id`.
- [x] **V3-ACA-02** Subject program options are limited to the selected department; shared subjects remain an explicit choice and incompatible department/program pairs are rejected.
- [x] **V3-ACA-03** Curriculum is created from a selected existing program and stores `curriculum_plans.program_id`; program code/name are read-only context in manual workflows.
- [x] **V3-ACA-04** Every manual curriculum row chooses an existing `courses` record and stores its `course_id`; code/title/description/credits are read-only and edited only in Subject management.
- [x] **V3-ACA-05** Curriculum prerequisites use a multi-select of earlier subjects already placed in the same plan and persist `curriculum_course_prerequisites.prerequisite_course_id`; comma-separated codes are forbidden.
- [x] **V3-ACA-06** “Create subject” exits to the real catalog-subject workflow and returns the saved subject for placement; no inline guessed `NEW1` identity exists.
- [x] **V3-ACA-07** Curriculum source payload retains selected `courseId` and prerequisite course IDs so normalized mappings and editable drafts cannot drift from catalog identity.
- [x] **V3-ACA-08** New curriculum versions use a structured suggested effective-year choice and remain linked to the same program; users never re-enter the program identity.
- [x] **V3-ACA-09** Opening a class uses a chained Program → Subject selector, an active-term selector, and an eligible-faculty selector; the saved section stores course, term, and faculty foreign keys.
- [x] **V3-ACA-10** Enrollment chooses an existing student and class, persists both foreign keys, and exposes conflict/capacity validation.
- [x] **V3-ACA-11** Class workspace links back to its subject, program, curriculum placement, term, faculty, roster, schedule, LMS, assessments, attendance, and grades.

## C. Student identity and academic record

- [x] **V3-STU-01** Student program uses `students.program_id` and synchronizes the compatibility label from the selected program.
- [x] **V3-STU-02** Advisor choices are scoped to eligible advisor/faculty profiles in the student's selected program or department, with “Unassigned” explicit.
- [x] **V3-STU-03** Duplicate-student merge uses a searchable existing-student picker that excludes the source record and shows number, name, program, and status; typed student numbers are forbidden.
- [x] **V3-STU-04** Enrollment, grades, attendance, cases, tasks, signals, and interactions derive the student from the selected Student 360 or roster context.
- [x] **V3-STU-05** The Learner Support student editor uses the same authoritative program selector/foreign key as Academic Office instead of editing the legacy program label directly.

## D. Learning, assessment, grades, and attendance

- [x] **V3-LMS-01** Modules are created inside a selected class and store `learning_modules.section_id` without asking for a class identifier.
- [x] **V3-LMS-02** Materials are created inside a selected module and pages inside a selected material; parent identities are contextual and read-only.
- [x] **V3-LMS-03** Assessments, announcements, attendance sessions, and grade items inherit the selected class and store its section foreign key.
- [x] **V3-LMS-04** Questions/options/keys inherit assessment/question parents and never ask for parent IDs.
- [x] **V3-LMS-05** Assignment submissions, attempts, answers, grades, and attendance records derive student and parent records from enrollment/roster context.
- [x] **V3-LMS-06** Attendance correction status uses an explicit allowed-value selector and confirmation form; free-text status prompts are forbidden.
- [x] **V3-LMS-07** Grade scan candidates resolve existing roster students and grade item before any reviewed save.

## E. Schedule and calendar

- [x] **V3-SCH-01** Class events choose an authorized class; personal events derive the current owner; role-wide events choose a canonical role.
- [x] **V3-SCH-02** Event scope is dependency-aware: selecting a class disables unrelated personal/role ownership, while personal/role scope clears class linkage before save.
- [x] **V3-SCH-03** Calendar items deep-link to their authoritative class, assessment, attendance, material, grade, enrollment, term, or institutional source.

## F. CRM, learner support, and accountability

- [x] **V3-CRM-01** Cases choose an existing student and store `cases.student_id`.
- [x] **V3-CRM-02** Case owner is chosen from eligible support/advisor/admin profiles and stores `cases.owner_id`; creating/editing a case does not silently assign the current user unless explicitly selected.
- [x] **V3-CRM-03** Task student and case choices are chained: after choosing a student, only that student's cases are available; choosing a case derives its student.
- [x] **V3-CRM-04** Task assignee is chosen from eligible staff and stores `crm_tasks.assigned_to`; it is not silently replaced by the current user.
- [x] **V3-CRM-05** Signals and interactions inherit the selected student context.
- [x] **V3-CRM-06** Sensitive access inherits the selected case and signed-in actor; only the purpose is entered.

## G. Admissions and campaigns

- [x] **V3-ADM-01** Admission lead program interest chooses an active academic program, stores `admission_leads.program_id`, and retains `program_interest` only as a reporting snapshot.
- [x] **V3-ADM-02** Admission owner chooses an eligible admissions/admin profile and stores `admission_leads.owner_id`; stage validation requires accountable ownership where appropriate.
- [x] **V3-ADM-03** Registrar handoff inherits the admitted lead and selected/created student identity; handoff IDs are never entered.
- [x] **V3-CAM-01** Campaign audience is structured as Institution, Program, Class, Role, Risk segment, or Explicit students rather than an ambiguous text field.
- [x] **V3-CAM-02** Program/class/role audience choices use authoritative records and generate reviewable `campaign_recipients` before approval.
- [x] **V3-CAM-03** Campaign recipient management shows included/excluded students and delivery status; users never paste student IDs.

## H. Communication, governance, and knowledge

- [x] **V3-COM-01** Communication recipient is selected from authorized profiles and stores `communication_requests.recipient_id`.
- [x] **V3-GOV-01** Initiative owner assignment uses an eligible-profile picker and stores `institutional_initiatives.owner_id`; typed profile IDs are forbidden.
- [x] **V3-GOV-02** Approval derives the signed-in approver and initiative; only a reason/outcome is entered.
- [x] **V3-KNW-01** Knowledge contributor/reviewer identities derive from the signed-in/reviewer profile.
- [x] **V3-KNW-02** Knowledge source event is selected from visible personal/class/campus events and stores `source_event_id`; linked class is derived from the event.
- [x] **V3-KNW-03** Knowledge class/role/staff audience uses authoritative class, canonical role, or profile choices.

## I. Nexus exact-record behavior

- [x] **V3-AI-01** Platform context exposes exact IDs with human-readable parent labels.
- [x] **V3-AI-02** When authoritative candidates exist, Nexus proposes their exact IDs and must not create/retype duplicate department/program/subject/student/profile/class identities.
- [x] **V3-AI-03** Stale relationship IDs trigger refreshed candidate resolution and same-goal continuation.
- [x] **V3-AI-04** Every mutation is revalidated by client repository and Supabase RLS/RPC before confirmation/execution.

## Verification gate

- [x] Every v3 implementation item has evidence in UI, repository/RPC, schema/RLS, lifecycle/audit behavior, automated tests, and reversible live role tests. Production release evidence is recorded separately below.
- [x] A static verifier fails if a relationship-bearing field regresses to UUID/code/name free text or an unscoped selector.
- [x] Live production-data tests prove curriculum catalog linking/prerequisites, database mismatch rejection, CRM ownership/task chaining, admissions program snapshots, and campaign recipient generation; static contracts cover the dependent selector, merge, initiative, and Nexus exact-ID UI paths.

- [x] The released production bundle and `https://www.stu.best/crm` custom-domain assets are verified after deployment (`dpl_Buos2NzKBoCbcbjShy7udHRMwp22`).

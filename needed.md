# STU Nexus Required Role and Action Catalog

**Status:** Authoritative implementation checklist  
**Tracked by:** GitHub Issue #48  
**Completion rule:** An action exists only when its visible control, complete workflow, trusted authorization, audit behavior where required, automated contract, live role verification, and production deployment are confirmed.

Below is the complete required role-and-action catalog for STU Nexus. It includes existing functionality and controls required to make the platform operationally complete.

Legend:

- **View** — read authorized records
- **Create/Edit** — maintain records
- **Assign** — connect responsibility or ownership
- **Approve/Publish** — controlled state change
- **Archive** — preserve history instead of permanent deletion
- **AI** — Nexus may prepare the action, but the user confirms it

# 1. Platform Owner

The protected owner has institution-wide governance authority.

## Accounts and permissions

- Create staff, teacher, specialist, administrator, and student accounts
- Edit account directory information
- Activate, suspend, or archive accounts
- Reset or rotate temporary passwords
- Assign every non-owner role
- Change an existing user’s role
- Review role-change history
- Review account activity
- Revoke sessions
- Preview the interface as another role
- Configure role permissions
- Cannot create a second owner
- Cannot transfer or demote the protected owner through ordinary controls

## Academic administration

- Create and edit departments
- Assign department heads
- Create and edit programs
- Assign programs to departments
- Create academic terms
- Open and close enrollment periods
- Create catalog subjects
- Create class sections
- Assign teachers to sections
- Assign rooms, modality, capacity, and schedules
- Enroll, waitlist, transfer, drop, or complete students
- Resolve schedule and capacity conflicts
- Archive inactive academic records

## LMS and teaching oversight

- View every course and LMS workspace
- Create and edit modules, topics, lessons, and pages
- Create and edit assessments
- Publish or unpublish learning content
- View attendance and gradebooks
- Review grading history
- Review announcements
- Archive content according to retention rules

## CRM and operations

- View institution-wide Student 360 records
- Manage cases, tasks, signals, campaigns, leads, interactions, and knowledge
- Assign cases and tasks to staff
- Review analytics and intervention outcomes
- Configure institutional workflows

## Nexus AI

- Ask institution-wide questions
- Generate reports and summaries
- Prepare authorized platform changes
- Confirm AI-proposed actions
- Review AI action logs
- Cannot use AI to bypass RLS, confirmations, or protected workflows

---

# 2. Administrator

Administrators handle daily platform and school operations without owner-level protection controls.

## Accounts

- Create non-owner staff and student accounts
- Edit account directory information
- Activate or suspend accounts
- Reset temporary credentials
- Assign operational roles if delegated
- Cannot assign or create the Owner role
- Cannot modify owner protection

## Academic operations

- Manage departments, programs, terms, subjects, and sections
- Assign teachers and rooms
- Manage student records
- Enroll, waitlist, drop, and transfer students
- Manage schedules and institutional events
- Review attendance and academic activity
- Resolve operational conflicts

## Platform management

- View institution-wide dashboards
- Review audit records
- Manage announcements and knowledge
- Coordinate cases and tasks
- Review system errors and incomplete workflows

---

# 3. President

The President primarily has executive oversight.

## Actions

- View institution-wide dashboards
- View enrollment, retention, attendance, performance, and CRM analytics
- View department and program summaries
- View high-priority institutional cases
- Review campaign and admissions results
- Review financial and operational indicators
- Publish institution-wide announcements
- Approve major policies and institutional initiatives
- Assign high-level initiatives to vice presidents or deans
- Request reports through Nexus AI
- Cannot ordinarily edit grades, answer keys, attendance, or student submissions
- Cannot perform routine account provisioning unless explicitly delegated

---

# 4. Vice President

Vice Presidents manage delegated institutional areas.

## Actions

- View institutional and assigned-area analytics
- Review departments, programs, and service performance
- Create and assign strategic tasks
- Manage cross-department cases
- Review admissions, finance, support, or academic operations
- Publish authorized announcements
- Approve delegated campaigns and initiatives
- Escalate matters to the President or Owner
- Use Nexus to summarize operations and prepare reports
- Cannot edit individual student grades without an academic role and assignment

---

# 5. Dean

The Dean governs a college or academic unit.

## Academic actions

- View departments and programs under the college
- Create or propose programs and subjects
- Review curriculum structures
- Assign or recommend department heads
- Review teacher assignments
- Review class sections and schedules
- Review section capacity
- Approve department teaching plans
- Review academic performance
- Review assessment and gradebook activity
- Resolve department-level conflicts

## LMS oversight

- View courses within the assigned college
- Review modules, topics, materials, and assessments
- Request content corrections
- Publish authorized college announcements
- Review attendance and grade completion
- Cannot answer student assessments
- Should not directly alter grades without an audited correction process

---

# 6. Registrar

The Registrar manages authoritative academic records.

## Student records

- Create student accounts and SIS records
- Edit student names, numbers, programs, year levels, and status
- Validate enrollment eligibility
- Enroll, waitlist, transfer, drop, or complete students
- Correct enrollment records
- Archive withdrawn or graduated student records
- Manage academic standing
- Review academic history

## Academic structure

- Manage academic terms
- Open and close enrollment
- Manage catalog subjects
- Manage class sections
- Validate schedules
- Review capacity and timetable conflicts
- Assign rooms where authorized

## Records and reporting

- Generate class lists
- Generate enrollment reports
- Produce official academic record exports
- Review grade publication status
- Lock finalized term records
- Cannot independently change a teacher’s finalized grade without a documented correction workflow

---

# 7. Department Head

The Department Head manages teachers, courses, and delivery inside a department.

## People and assignment

- View department teachers
- Assign faculty to subjects and class sections
- Recommend faculty account creation
- Edit department staff information
- Review teacher workload
- Assign advisors
- Cannot assign institution-wide executive roles
- Cannot create or transfer the Owner role

## Course management

- Create or propose department subjects
- Create class sections
- Assign teachers, rooms, modality, and capacity
- Review course modules and materials
- Review assessments
- Review attendance completion
- Review gradebook completion
- Publish department announcements
- Archive obsolete department content

## Monitoring

- View department student performance
- Identify at-risk classes or students
- Create intervention cases
- Assign follow-up tasks to teachers or advisors
- Review department analytics

---

# 8. Faculty / Teacher

Teachers operate assigned classes and teach students.

## Course preparation

- View assigned classes
- View assigned class rosters
- Create and edit course topics
- Create and edit modules
- Reorder modules
- Publish, unpublish, or archive modules
- Create lessons, links, videos, activities, and files
- Create multi-page learning materials
- Add text, images, links, lists, quotations, and formatted content
- Edit and reorder lesson pages
- Preview content as a student

## Assessments

- Create quizzes
- Create exams
- Create assignments
- Create projects
- Add assessment instructions
- Add multiple-choice questions
- Add true/false questions
- Add short-answer questions
- Configure options and correct answers
- Configure points and maximum score
- Configure due date, availability, duration, and attempt limit
- Save assessments as drafts
- Publish or unpublish assessments
- Edit assessments before attempts
- Create a new version when answer-changing edits are unsafe
- Open student submissions
- Return work for revision
- Grade submissions
- Add rich feedback
- Save draft grades
- Review grades
- Publish grades
- Correct grades with an audit reason
- Cannot impersonate a student or answer assessments for them

## Attendance

- Create attendance sessions
- Open or close attendance
- Mark present, absent, late, or excused
- Add attendance notes
- Correct attendance records
- Review attendance summaries

## Communication

- Create course announcements
- Add images and rich formatting
- Mark announcements as normal, important, or urgent
- Edit or archive announcements
- Answer student questions
- Create class schedule events

## Student support

- View students enrolled in assigned classes
- Create support cases or referrals
- Add academic interactions
- Assign follow-up tasks
- View relevant risk signals
- Cannot access unrelated sensitive counseling or financial records

## Nexus AI

- Ask Nexus to create modules, lessons, pages, assessments, announcements, attendance sessions, and schedule events
- Ask Nexus to draft lesson content and quiz questions
- Review every AI-generated question and answer key
- Confirm actions before saving
- Nexus cannot publish final grades automatically

---

# 9. Academic Advisor

Advisors guide assigned students.

## Actions

- View assigned Student 360 profiles
- View programs, year levels, courses, schedules, and academic standing
- View authorized attendance and published-grade summaries
- Review risk signals
- Create advising cases
- Create follow-up tasks
- Record advising interactions
- Add advising notes
- Recommend class or schedule changes
- Refer students to faculty, finance, counseling, library, or support
- Track intervention outcomes
- Resolve or escalate cases
- Schedule advising meetings
- Send approved communications
- Cannot edit assessment answers
- Cannot grade student work
- Cannot alter official enrollment or grades directly

---

# 10. Admissions Officer

Admissions handles applicants and prospective students.

## Actions

- Create prospective-student records
- Edit applicant identity and contact information
- Record source and campaign attribution
- Move applicants through pipeline stages
- Record calls, emails, visits, and interviews
- Create admissions tasks
- Assign lead ownership
- Schedule follow-ups
- Create and manage recruitment campaigns
- Draft and send approved campaign messages
- Convert an accepted applicant into a student-account request
- Transfer accepted records to the Registrar
- Archive duplicate or withdrawn leads
- View admissions conversion analytics
- Cannot enroll students into classes
- Cannot access grades, answer keys, or unrelated student records

---

# 11. Finance Officer

Finance handles authorized financial support information.

## Actions

- View students with authorized financial cases or signals
- View account-balance indicators
- Create financial-support cases
- Add payment or financial-aid interactions
- Create follow-up tasks
- Assign cases to finance staff
- Record payment arrangements
- Mark financial blockers resolved
- Escalate unresolved registration blockers
- Publish finance deadlines and announcements
- View financial-support analytics
- Cannot see protected assessment answers
- Cannot grade work
- Cannot modify attendance
- Cannot access unrelated counseling details

---

# 12. Student Support Officer

Support staff coordinate non-academic assistance.

## Actions

- View authorized Student 360 information
- Create support cases
- Edit case priority, owner, due date, and status
- Create and assign support tasks
- Record interactions
- Review and resolve support signals
- Escalate cases to advisors, faculty, finance, or leadership
- Schedule support appointments
- Publish support information
- Manage support knowledge articles
- Review service response times
- Cannot edit grades or answer assessments
- Cannot access unrelated confidential records

---

# 13. Librarian

The Librarian manages learning resources and institutional knowledge.

## Actions

- Create knowledge articles
- Edit rich knowledge content
- Add images and links
- Organize resources by subject or program
- Verify article accuracy
- Publish, unpublish, or archive articles
- Add library links and learning resources
- Create library announcements
- Create library events
- Assist teachers with course resources
- View limited course context where authorized
- Review resource usage
- Cannot modify grades, attendance, enrollment, or assessment answers

---

# 14. Student

Students access only their own enrollment and learning records.

## Home and profile

- View personal dashboard
- View enrolled classes
- View upcoming deadlines
- View announcements
- View personal notifications
- View and edit permitted profile fields
- Submit a support request
- View own support-case status where appropriate

## Learning materials

- View published modules
- Open lessons and multi-page materials
- Navigate between learning pages
- View permitted files, videos, links, and activities
- Mark a lesson in progress
- Mark a lesson complete
- View course progress
- Ask questions about lesson concepts

## Assessments

- View available quizzes, exams, assignments, and projects
- Read assessment instructions
- Start an available quiz or exam
- Select and change answers before submitting
- Save permitted drafts
- Submit answers
- Upload assignment files
- Submit assignment text
- Resubmit when teacher policy allows
- View attempt status
- View own score when released
- View teacher feedback
- View correct-answer explanations only when explicitly released
- Cannot view protected answer keys
- Cannot view another student’s answers
- Cannot edit a submitted attempt unless returned or policy permits
- Cannot change a grade

## Student and Nexus AI boundary

The student personally may answer and submit their own assessment through the assessment interface.

Nexus AI may:

- Explain concepts
- Give examples unrelated to the active graded answer
- Create a study plan
- Summarize published lessons
- Help navigate the portal
- Mark learning materials complete when requested
- Explain teacher feedback
- Suggest study resources

Nexus AI must never:

- Select quiz answers
- Generate answers for an active graded question
- Complete an assignment
- Write a submission intended to be handed in
- Upload or submit work
- Start or finish an assessment
- Modify an assessment attempt
- Change a grade
- Pretend to be the student

## Schedule and communication

- View personal class schedule
- View exams, deadlines, meetings, and campus events
- Receive course announcements
- Contact teachers or support through approved channels
- View attendance records
- Request an attendance correction
- Cannot directly alter attendance

---

# 15. Necessary account-management actions

These should exist in **People & Roles** for the protected Owner, with delegated subsets for administrators.

## Account creation

- Add administrator
- Add president
- Add vice president
- Add dean
- Add registrar
- Add department head
- Add teacher
- Add advisor
- Add admissions officer
- Add finance officer
- Add support officer
- Add librarian
- Add student
- Bulk-import accounts
- Invite users by institutional email
- Generate a temporary password
- Require password change on first login
- Resend invitation

## Account maintenance

- Open account details
- Edit name, email, phone, department, and title
- Assign or change role
- Assign department
- Assign program
- Assign classes
- Assign advisees
- Activate account
- Suspend account
- Archive account
- Restore account
- Reset password
- Revoke sessions
- Review last login
- Review assigned responsibilities
- Review role-change audit
- Review account activity

## Account safeguards

- Never display stored passwords
- Never allow a second owner
- Require a reason for role changes
- Require confirmation for suspension and archival
- Prevent deletion when academic history exists
- Refresh Auth claims after a role change
- Preserve immutable audit history

# 16. Necessary controlled actions

Some operations should never be ordinary CRUD:

- Final grade publication
- Grade correction after publication
- Assessment answer-key changes after attempts
- Student withdrawal
- Enrollment completion
- Account suspension
- Role assignment
- Term closing
- Program archival
- Student-record merging
- Submission deletion or voiding
- Attendance correction
- Sensitive-case access
- Bulk communication
- Permanent data deletion

These require confirmation, an actor, timestamp, reason, authorization check, and audit record.

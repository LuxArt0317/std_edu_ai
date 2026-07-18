# STU Nexus required actions v2

**Status:** Executable schema-wide completeness contract  
**Tracked by:** GitHub Issue #76  
**Supersedes:** `needed.md` for implementation verification; `needed.md` remains the role-policy source history.  
**Completion rule:** An action is complete only when it has a discoverable UI control, a real repository/RPC workflow, role/RLS authorization, lifecycle or audit behavior where required, an automated contract, and released production evidence.

## Legend

- `[x]` implemented and verified in the application
- `[ ]` required gap; Issue #76 cannot close while any item remains
- **Immutable** means view/export/review actions are required, but edit/delete is intentionally forbidden
- **Archive/transition** replaces destructive deletion for institutional records
- **AI-assisted** means Nexus may prepare the action but the authorized user confirms it

## Role authority matrix

| Capability | Owner | Admin | President / VP | Dean | Department head | Registrar | Faculty | Advisor | Specialist roles | Student |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Platform governance and account lifecycle | Full | Delegated | Review | Unit review | Unit review | Student identity | No | No | No | Own account |
| Academic structure | Full | Full | Review/approve | College | Department | Records/terms | Assigned view | View | Scoped view | Own program |
| Curriculum lifecycle | Full | Full | Review | Create/review | Create/edit | Validate/publish | Review assigned | View | Scoped view | Published view |
| Teaching and LMS | Full oversight | Oversight | Analytics | College review | Department review | Record review | Assigned CRUD | View | Scoped | Enrolled learning |
| Assessment and grades | Audited oversight | Audited oversight | Analytics | Review | Review | Publication controls | Assigned CRUD | Advisee view | Scoped | Own attempts/results |
| CRM/admissions/service | Full | Full | Analytics | Scoped | Scoped | Handoff | Referral | Advisee | Role-specific | Own requests |
| Nexus mutations | Confirm any authorized action | Confirm delegated actions | Governed actions | Scoped actions | Scoped actions | Records actions | Assigned teaching | Advisee actions | Scoped actions | Never assessed work |

# A. Identity, roles, and accountability

## `profiles`, Auth identities, and role definitions

- [x] View the authorized people directory with role, department, program, status, and responsibility context
- [x] Create/invite every non-owner account type and create linked student identities
- [x] Edit name, email, phone, job title, department, and program
- [x] Assign/change non-owner roles with impact preview, reason, confirmation, and history
- [x] Configure non-owner role capabilities
- [x] Activate, suspend, archive, restore, revoke sessions, and rotate temporary credentials
- [x] Protect the sole Owner from creation, demotion, archival, and ordinary lifecycle operations
- [x] Assign/remove department and class responsibilities
- [x] Require first-login password replacement for temporary credentials

## Audit and onboarding records

- [x] View role-change, account-lifecycle, account-access, controlled-action, sensitive-access, onboarding, and AI audit evidence
- [x] Export/filter audit evidence for authorized governance roles
- [x] Keep audit/event rows immutable; no ordinary edit or delete action exists
- [x] Keep onboarding runtime disabled while retaining its historical records

# B. Academic structure and curriculum

## Departments

- [x] View department → programs → staff → subjects relationships
- [x] Create and edit departments
- [x] Assign or replace department heads
- [x] Activate/archive departments through governed status changes
- [x] Prevent destructive deletion when dependent programs, people, or subjects exist

## Programs

- [x] View program → department → curricula → subjects → classes → staff → students
- [x] Create and edit programs, including department, duration, level, description, and status
- [x] Archive programs with a reason and preserved history
- [x] Identify programs missing curricula and provide the correct creation action
- [x] Prevent ambiguous program labels by persisting authoritative program IDs

## Curriculum plans

- [x] View each curriculum inside its owning program and department pathway
- [x] Create a complete curriculum atomically, including program, subjects, placements, prerequisites, and block templates
- [x] Open a clearly visible curriculum editor from the curriculum card
- [x] Edit draft curriculum metadata: effective year, description, duration, and status
- [x] Add, edit, remove, and reorder curriculum subjects with year, semester, units, category, and description
- [x] Add, edit, and remove prerequisite links with ordering/self-reference validation
- [x] Add, edit, and remove yearly block templates and capacities
- [x] Approve or retire a curriculum through an explicit lifecycle action; adopted versions never return to draft
- [x] Prevent silent destructive deletion and prevent unsafe edits to adopted curricula
- [x] Preserve the normalized mappings and source payload in one atomic transaction
- [x] Duplicate/version an existing curriculum into a new effective year without overwriting history
- [x] Show total units, curriculum year/semester structure, block templates, and source program

## Subjects and curriculum mappings

- [x] View subject → department → program → curriculum placements → classes
- [x] Create and edit catalog subjects
- [x] Place subjects in curricula through the curriculum workflow
- [x] Show subjects not placed in any curriculum
- [x] Create a class directly from a selected subject while preserving context
- [x] Archive/deactivate subjects without deleting historical classes or grades

## Academic terms

- [x] View terms and enrollment windows
- [x] Create and edit term dates, enrollment dates, name, and status
- [x] Open/close enrollment through status/window controls
- [x] Close/finalize terms with a reason and controlled audit evidence
- [x] Prevent ordinary edits that would invalidate locked term records

## Class sections, responsibilities, enrollment, and schedule

- [x] View class → subject/program/term/faculty/roster/schedule/LMS/assessment/grade relationships
- [x] Create and edit class code, term, faculty, room, modality, capacity, and status
- [x] Assign/reassign primary faculty and additional class responsibilities
- [x] Detect room, faculty, student, capacity, and timetable conflicts
- [x] Enroll, waitlist, transfer, drop, and complete students with reasons where controlled
- [x] Export class lists and enrollment reports
- [x] Create, edit, and remove class, exam, deadline, meeting, and campus events
- [x] Carry a selected class into Teaching, Learning, Assessments, Grades, and Schedule

# C. Student identity and academic record

## Students

- [x] View student identity, authoritative program, advisor, year, standing, status, classes, grades, attendance, cases, tasks, signals, and interactions
- [x] Create a confirmed Auth identity and linked SIS record in one compensated workflow
- [x] Edit names, preferred name, number, email, program, year, phone, advisor, standing, and status
- [x] Withdraw, archive, merge duplicates, and preserve lineage/history
- [x] Prevent destructive deletion of institutional student records
- [x] Keep profile and student program identities synchronized by foreign key
- [x] Restrict students to their own authorized record and published results

## Enrollment and history

- [x] View current and historical enrollments
- [x] Validate eligibility, capacity, duplicates, and schedule conflicts before enrollment
- [x] Transition waitlisted/enrolled/dropped/completed states with controlled evidence
- [x] Preserve completed/dropped enrollment history

# D. Learning management and teaching

## Modules, materials, pages, files, and progress

- [x] View course modules and learner progress by authorized class
- [x] Create, edit, reorder, publish/unpublish, and delete/archive draft modules
- [x] Create, edit, publish, preview, and delete/archive materials
- [x] Create, edit, reorder, and remove multiple rich-content pages
- [x] Author formatted text, links, images, and protected files through Tiptap and managed Storage
- [x] Restrict private files to authorized teachers and enrolled learners
- [x] Open lessons, navigate pages, resume progress, and mark completion
- [x] Preserve class context when entering teacher or learner workspaces

## Announcements

- [x] Create, edit, publish, schedule, and delete/archive course announcements
- [x] Show authorized announcements to enrolled learners

## Assignments and submissions

- [x] Create and edit assignment-type assessments with instructions, dates, limits, and score settings
- [x] Submit assignment text/files as the enrolled student
- [x] View submission history and status
- [x] Grade submissions with feedback as assigned teaching staff
- [x] Return or void submissions through controlled transitions
- [x] Prevent Nexus from completing or submitting assessed work for students

# E. Assessments, grades, and attendance

## Assessments, questions, options, keys, attempts, and answers

- [x] Create quizzes/exams with questions, choices, protected keys, explanations, points, timing, attempts, availability, and release rules
- [x] Open, preview, edit, publish/unpublish, and delete/archive assessments
- [x] Add, edit, reorder, and remove questions and choices
- [x] Submit enrolled-student attempts and deterministically score objective answers
- [x] Keep keys, unreleased scores, and explanations hidden by policy
- [x] Show only the student’s own attempts and teacher-authorized results
- [x] Preserve submitted attempts and answers as immutable academic evidence

## Grade items, grades, and AI scan

- [x] View class gradebook and each learner’s own published grades
- [x] Create grade items through assessment/class workflows
- [x] Edit draft grades and rich feedback
- [x] Scan a grade sheet with AI into review-only candidates
- [x] Require human review before saving scan candidates
- [x] Publish grades with a reason and audit evidence
- [x] Correct published grades only through the governed correction workflow
- [x] Prevent AI from independently publishing grades

## Attendance

- [x] Create, edit, and remove draft attendance sessions
- [x] Record/update present, absent, late, and excused states for the roster
- [x] Let students request corrections only for their own attendance
- [x] Approve/reject correction requests with reasoned audit evidence
- [x] Preserve finalized attendance history

# F. CRM, learner support, admissions, and outreach

## Signals, interactions, cases, tasks, and sensitive access

- [x] View Student 360/Learner Support with program and academic context
- [x] Create, edit, assign, resolve, reopen, and archive cases
- [x] Create, edit, assign, complete, reopen, and archive tasks
- [x] Create, acknowledge, resolve, dismiss, and archive student signals
- [x] Record, edit, and archive interactions
- [x] Let students open support requests against only their own record
- [x] Require and record authorized sensitive-case access
- [x] Prevent permanent deletion of CRM institutional evidence

## Admissions, handoff, campaigns, and recipients

- [x] Create, edit, progress, assign, convert, and archive admission leads
- [x] Hand accepted applicants to Registrar with identity/provisioning context
- [x] Create, edit, approve, schedule, launch, pause, complete, and archive campaigns
- [x] Manage recipients and preserve delivery outcomes
- [x] Require approval for bulk delivery and prevent self-approved privileged sends
- [x] Review admissions and campaign results

## Knowledge

- [x] Create, open, edit, publish/unpublish, and archive knowledge articles
- [x] Author rich text and images where rendered content benefits from them
- [x] Search/filter knowledge and retain revision ownership metadata

# G. Communication, governance, notifications, and AI

## Notifications and communication requests

- [x] View and mark personal notifications read/unread
- [x] Submit portal/email/SMS communication requests to authorized recipients
- [x] Approve/reject governed communications and record delivery evidence
- [x] Prevent users from inserting arbitrary delivered notifications

## Institutional initiatives

- [x] Create policy, initiative, teaching-plan, and content-correction proposals
- [x] Review, approve, assign, escalate, reject, complete, and preserve initiatives
- [x] Require role authority and reasoned controlled transitions

## Nexus AI, threads, messages, and audit

- [x] Create/open persistent threads and restore the newest conversation position
- [x] Persist messages and keep active goal work mounted when the drawer closes
- [x] Show thinking, confirmation, executing, refreshing, completed, impossible, and stopped states
- [x] Expose real authorized tools across academic, LMS, communication, support, and governance workflows
- [x] Continue dependent multi-action goals using returned IDs and refreshed context
- [x] Require confirmation for mutations and re-check the trusted signed-in role server-side
- [x] Prohibit credentials, owner replacement, direct unsafe role changes, grade publication, binary uploads, and student assessed-work automation
- [x] Record privacy-minimized AI audit evidence

# H. Cross-cutting usability and operational completeness

- [x] Every primary entity has a discoverable View action
- [x] Every mutable entity has a visible Create/Edit action or an explicitly documented lifecycle reason why not
- [x] Every relationship can be reached from both parent and child context where operationally useful
- [x] Empty states identify the missing prerequisite and offer the correct next action
- [x] Workspace switching preserves loaded data and does not block on tab visibility/token refresh
- [x] Forms validate required fields and show actionable server errors
- [x] Dangerous or institutional transitions require reason, confirmation, authorization, and audit evidence
- [x] Destructive deletion is unavailable for institutional records; archive/retire/void/merge transitions preserve history
- [x] Automated verification fails when a `neededv2.md` required action lacks implementation evidence
- [x] Production verification confirms every Issue #76 gap is released and reachable

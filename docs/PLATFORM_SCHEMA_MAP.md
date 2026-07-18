# STU Nexus platform schema map

This map is derived from `src/types/database.generated.ts` and the production migration history. Solid arrows represent persisted foreign keys. Dashed conceptual paths are intentionally resolved through their intermediate records rather than duplicated columns.

```mermaid
flowchart LR
  subgraph Identity[Identity, roles, and accountability]
    roles[role_definitions]
    profiles[profiles]
    roleAudit[role_change_audit]
    lifecycle[account_lifecycle_audit]
    accessAudit[account_access_audit]
    onboarding[onboarding_progress]
    onboardingEvents[onboarding_events]
    controlled[controlled_action_audit]
    aiAudit[ai_audit_logs]
  end

  subgraph Academic[Academic structure and delivery]
    departments[departments]
    programs[academic_programs]
    curricula[curriculum_plans]
    planCourses[curriculum_plan_courses]
    prerequisites[curriculum_course_prerequisites]
    blocks[curriculum_block_templates]
    courses[courses / subjects]
    terms[academic_terms]
    sections[course_sections / classes]
    sectionAssignments[profile_section_assignments]
    enrollments[section_enrollments]
    schedule[schedule_events]
    announcements[announcements]
    topics[course_topics]
  end

  subgraph Learning[Learning content and progress]
    modules[learning_modules]
    materials[learning_materials]
    pages[learning_material_pages]
    progress[learning_progress]
  end

  subgraph Assessment[Assessment, attendance, and grades]
    assessments[assessments]
    questions[assessment_questions]
    options[assessment_options]
    keys[assessment_answer_keys]
    attempts[assessment_attempts]
    answers[assessment_answers]
    submissions[assignment_submissions]
    gradeItems[grade_items]
    grades[grades]
    scans[grade_scan_jobs]
    attendanceSessions[attendance_sessions]
    attendanceRecords[attendance_records]
    attendanceCorrections[attendance_correction_requests]
  end

  subgraph Student[Student identity and learner support]
    students[students]
    signals[student_signals]
    interactions[interactions]
    cases[cases]
    tasks[crm_tasks]
    sensitive[sensitive_case_access]
  end

  subgraph Admissions[Admissions and outreach]
    leads[admission_leads]
    handoffs[admission_handoffs]
    campaigns[campaigns]
    recipients[campaign_recipients]
  end

  subgraph Collaboration[Communication, governance, knowledge, and AI]
    threads[chat_threads]
    messages[chat_messages]
    communications[communication_requests]
    notifications[notifications]
    initiatives[institutional_initiatives]
    knowledge[knowledge_articles]
  end

  departments --> programs
  departments --> courses
  departments --> profiles
  profiles -->|department head| departments
  programs --> curricula
  programs --> courses
  programs --> profiles
  curricula --> planCourses
  curricula --> blocks
  planCourses --> courses
  planCourses --> prerequisites
  prerequisites -->|required subject| courses
  courses --> sections
  terms --> sections
  profiles -->|faculty| sections
  sections --> enrollments
  sections --> sectionAssignments
  sections --> schedule
  sections --> announcements
  sections --> topics
  sections --> modules
  modules --> materials
  materials --> pages
  materials --> progress

  sections --> assessments
  assessments --> questions
  questions --> options
  questions --> keys
  assessments --> attempts
  attempts --> answers
  questions --> answers
  assessments --> submissions
  sections --> gradeItems
  assessments --> gradeItems
  gradeItems --> grades
  gradeItems --> scans
  sections --> attendanceSessions
  attendanceSessions --> attendanceRecords
  attendanceRecords --> attendanceCorrections

  profiles --> students
  programs -->|program membership| students
  students --> enrollments
  students --> signals
  students --> interactions
  students --> cases
  students --> tasks
  cases --> tasks
  cases --> sensitive
  students --> recipients
  campaigns --> recipients

  profiles --> leads
  leads --> handoffs
  profiles --> handoffs
  profiles --> campaigns
  profiles --> threads
  threads --> messages
  profiles --> communications
  profiles --> notifications
  profiles --> initiatives
  profiles --> knowledge
  profiles --> roleAudit
  profiles --> lifecycle
  profiles --> accessAudit
  profiles --> onboarding
  onboarding --> onboardingEvents
  profiles --> controlled
  profiles --> aiAudit
```

## Authoritative academic path

`Department → Program → Curriculum plan → Curriculum subject mapping → Subject → Class section → Term / Faculty → Enrollment → Student`

- A curriculum is already database-linked to exactly one program through `curriculum_plans.program_id`.
- A curriculum subject is linked through `curriculum_plan_courses.plan_id` and `curriculum_plan_courses.course_id`.
- Prerequisites point from a curriculum subject mapping to another subject.
- A class is an offering of one subject in one academic term, optionally assigned to one faculty profile.
- A student reaches a class through `section_enrollments`, and reaches learning, assessment, attendance, schedule, and grades through that class.

## Relationship gaps found before implementation

1. The Academic Office renders programs and curricula in separate lists, hiding their real foreign-key relationship and leaving programs without a visible curriculum state.
2. Subjects show their department but not their optional program, curriculum placement, class offerings, or prerequisite dependents.
3. Classes show subject and term labels but do not expose the complete department/program/curriculum origin or contextual links to roster, schedule, teaching, and assessment workspaces.
4. Student records store a legacy `program` label but no direct `program_id`; a profile can have `program_id`, but SIS-only students cannot be joined reliably. This must be normalized and backfilled.
5. Empty and orphan states do not identify the missing relationship or provide the correct next action.
6. The UI lacks a reusable selected-program context, so actions such as adding a subject or opening a class do not preserve the user’s academic path.

## Intended connected experience

Every department exposes its programs. Every program exposes its curriculum versions, subjects, classes, staff, and students. Every curriculum identifies its owning department and program and exposes the structured subject sequence. Every subject identifies its department, program, curriculum placement, prerequisites, and sections. Every class identifies the originating subject/program, term, teacher, roster, schedule, modules, assessments, attendance, and grade items. Every student identifies the program and active class memberships.

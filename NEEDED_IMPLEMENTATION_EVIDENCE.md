# `needed.md` Implementation Evidence

This document records the production evidence for the authoritative role/action catalog. It does not replace `needed.md`; `npm run verify:needed` parses every actionable catalog bullet and fails when its UI, repository, database, audit, or explicit high-risk evidence disappears.

## Identity and roles

- **UI:** People & Roles provides Owner/Administrator provisioning, invitations, bulk import, identity editing, responsibility assignment/removal, lifecycle controls, role changes, credential rotation, session revocation, activity, and immutable history. Department-head edits are limited to staff sharing the head’s relational department.
- **Server boundary:** `provision-role-account` v8 uses verified JWT role metadata, never returns or stores passwords, prohibits a second Owner, protects the Owner target, and marks temporary credentials `must_change_password`.
- **First login:** `/crm` blocks all workspace access until the account holder replaces the temporary password; completion clears the trusted Auth flag and creates account-access evidence.
- **Database:** profile responsibilities, lifecycle changes, role changes, removals, and scoped department edits are RLS/trusted-function protected and audited.

## Academic administration and Registrar records

- Academic Office provides editable departments, programs, terms/enrollment windows, subjects, sections, faculty/room/modality/capacity, students, advisors, rosters, enrollment transitions, and conflict-safe schedules.
- Registrar controls include reasoned withdrawal, merge lineage, standing/status editing, completion/waitlist/enrollment/drop transitions, term closure, program archival, class-list CSV, enrollment CSV, and official-record index CSV.
- Historical records use archive or controlled transitions instead of destructive deletion.

## Teaching, LMS, assessment, grading, and attendance

- Teacher Studio provides topic/module/material/page/file CRUD, Tiptap rich content and managed images, ordering, publication, learner preview, quizzes/exams/assignments/projects, protected questions/choices/keys, submissions, return/void, rich feedback, grading, announcements, attendance, and schedule events.
- Assessment configuration includes opening time, due time, duration, attempt limit, maximum score, publication, immediate-score release, and explanation release.
- Direct explanation-column reads are revoked. The governed question reader returns explanations only to class managers or after explicit teacher release.
- Direct attempt-score reads are revoked. Submission responses and persisted result history return `null` for scores held by the teacher, then reveal the result through the governed reader when release is enabled.
- Final-grade publication, later correction, answer-changing edits after attempts, submission voiding, and attendance correction use controlled workflows and immutable evidence.

## CRM, admissions, finance, support, and library

- Student 360, cases, tasks, signals, interactions, prospects, campaigns, knowledge, and analytics use live Supabase repositories and role-aligned RLS.
- Admitted prospects create a reasoned student-account handoff and notify active Registrar/Administrator recipients.
- Bulk campaigns require authorized approval, deliver recipient-scoped portal notices, update delivery state, and preserve before/after evidence.
- Sensitive-case opening records actor, purpose, and time. Finance case/signal/interaction work and Librarian knowledge/announcement work are explicitly authorized.
- Permanent DELETE privilege is revoked for CRM institutional records. The UI closes, resolves, completes, or archives them.

## Executive and academic governance

- Institutional policies, initiatives, teaching plans, and content-correction requests have visible proposals, priority/scope/due data, authorized approval/rejection, accountable assignment, escalation, completion, and immutable transition evidence.
- President, Vice President, Dean, Department Head, Registrar, and Administrator visibility is enforced by RLS; mutations remain narrower than reads.

## Student and Nexus boundaries

- Students see their own enrollment, published content, progress, assessments, submissions, released results/feedback, attendance, schedule, notifications, communications, and support requests.
- Protected answer keys and unreleased explanations remain inaccessible. Students cannot mutate official enrollment, grades, or attendance.
- Nexus may explain, summarize, navigate, plan study, and update learning progress for students. Prompt filtering, structured action validation, client validation, confirmation, repository authorization, RLS, and audit all prohibit answering, creating, uploading, modifying, or submitting assessed work for a student.

## Verification

- `npm test` runs the 401-action catalog gate plus source contracts.
- `npm run test:live-accounts` authenticates all 14 canonical production identities and confirms trusted Auth/profile roles.
- `npm run test:live-needed-roles` checks required table visibility, controlled-workflow allow/deny behavior, account-boundary access, protected answers, and unreleased explanations for every role using real production sessions.
- `npm run test:live-roles` performs reversible faculty/student RLS, grade-denial, protected-key, quiz-scoring, and cleanup checks.
- `npm run build` performs TypeScript, Vite production compilation, and semantic bundle verification.
- `npm run diagnose:production` recursively verifies the deployed route shell and assets.

# STU Nexus School Platform Guide

## What this portal is

STU Nexus is the authenticated operating platform for the university. It gives each person a role-specific home while keeping one shared source of truth for academics, teaching, learning, assessment, grades, schedules, communications, student success, admissions, and service work.

The public STU website helps visitors discover the university. STU Nexus handles the signed-in work that follows. Students can learn, take quizzes, review feedback, see published grades, and follow their schedule. Teachers can manage visible classes, content, assessment review, gradebooks, AI-assisted grade capture, and calendars. Leaders and administrators can oversee the academic structure, people, permissions, and original CRM operations.

## Who uses it

Supabase Auth verifies every account. Database row-level security filters each query and mutation for the trusted role and the person's teaching, enrollment, ownership, or operational relationship. The interface then presents the same boundary in an understandable workspace. The protected platform owner can safely preview every role's interface without changing the owner's database authority.

See [../platform/ROLE_MATRIX.md](../platform/ROLE_MATRIX.md) for the complete hierarchy and permission model.

## Academic and learning workspaces

### My Day / School Overview

Shows role-relevant courses, assessments, upcoming events, announcements, and the fastest next actions. Owners and leaders receive institution-wide oversight; students see only their learning scope.

### Academics and Teaching

Organizes departments, programs, courses, active sections, teachers, rooms, modality, and rosters. Faculty receive assigned-class views while leadership receives the wider academic catalog permitted by policy.

### Learning Topics

Delivers sequenced course material with summaries, full topic content, estimated study time, and publication state. Students see published content for enrolled sections.

### Assessments

Students answer a real seeded quiz and receive transactional scoring plus per-question explanations. Correct answers are stored separately and are invisible to students. Teachers and authorized leadership can review assessment structure and submitted attempts.

### Grades and AI Scan Review

Students see only their own published results. Teachers can review class gradebooks, publish a reviewed grade, or upload a JPEG, PNG, or WebP grade sheet. OpenAI vision extracts candidate rows with confidence and warnings; a teacher must review before candidates are stored as drafts, and publishing remains a separate explicit action.

### One Calendar

Combines classes, examinations, deadlines, meetings, and campus events. Policies derive visibility from enrollment, teaching assignment, personal ownership, and intended role audience.

### People and Roles

The owner and authorized leadership see the role hierarchy and provisioned identities. Role changes use an audited server-side function that updates Auth metadata and the profile atomically. The protected owner cannot be demoted or deleted and a second owner cannot be assigned.

## Main workspaces

### Command Center

Provides a daily operational overview of urgent cases, overdue tasks, student-risk alerts, admissions activity, and work requiring staff attention.

### Student 360

Brings a student's academic, engagement, support, interaction, and case information into one staff-facing profile. This reduces the need to search across disconnected systems before helping a student.

### Success Radar

Surfaces students who may need early support based on recorded signals such as falling academic performance, attendance concerns, reduced engagement, or unresolved service needs. Signals support staff judgment; they do not make automatic high-impact decisions.

### Admissions

Tracks prospective students through the admissions relationship lifecycle: inquiry, application, review, acceptance, and enrollment. Staff can see pipeline status and record the next follow-up.

### Case Management

Organizes academic, counseling, financial, IT, and administrative support cases. Each case can have an owner, priority, status, history, and next action so concerns remain visible until resolved.

### Tasks

Assigns follow-up work to staff, records due dates, and tracks completion. Tasks connect operational responsibility to student, applicant, or case activity.

### Campaigns

Supports organized outreach to applicants or students, such as admissions reminders, orientation information, registration notices, and targeted support communications.

### Knowledge Hub

Stores policies, procedures, frequently asked questions, and internal guidance. It provides a grounded source for staff searches and AI-assisted answers.

### Analytics

Summarizes admissions progress, student-success signals, case workload, task activity, and operational trends for school leadership and teams.

## Nexus AI

Nexus AI is a persistent, role-aware school chatbot. Depending on the user's visible context, it can:

- summarize a student's current situation;
- explain the evidence behind a success-risk signal;
- recommend reviewable next actions;
- answer questions using institutional knowledge;
- help draft clear, supportive communications; and
- turn scattered operational information into a concise staff brief.
- explain a learner's next topic or assessment;
- summarize a teacher's class and schedule; and
- suggest grounded next actions with visible citations.

Conversation threads and messages are saved in Supabase for their owner. Only bounded, privacy-minimized context is sent to OpenAI. The endpoint authenticates the Supabase bearer token, derives the trusted role from Auth metadata, applies rate limits, requests structured output, and disables provider-side response storage. People remain responsible for decisions and communications.

## Example student-support workflow

1. Attendance or academic concerns are recorded as student signals.
2. The student appears in Success Radar for staff review.
3. An authorized staff member opens the Student 360 profile to understand the broader context.
4. Nexus AI produces an evidence-based summary and suggests possible interventions.
5. The staff member opens or updates a support case and assigns a follow-up task.
6. Interactions and case outcomes are recorded until the concern is resolved.

## Example admissions workflow

1. A prospective student enters the admissions pipeline as an inquiry.
2. Admissions staff record interactions, requirements, and the next action.
3. The applicant moves through application, review, and decision stages.
4. Tasks and campaigns help staff deliver timely reminders and follow-ups.
5. An accepted applicant can be tracked through enrollment handoff.

## Current production status

The platform is connected to production Supabase Auth and Postgres. Authentication, role enforcement, database row-level security, live reads, transactional assessment scoring, reviewed grade workflows, persistent chat, and supported CRM mutations are active.

The records currently included are safe seed records created to demonstrate and verify the workflows. They are not real university student records. Before operational rollout, the university should establish approved data integrations, staff-account provisioning, privacy governance, retention rules, and owner-specific workflows.

## In one sentence

STU Nexus gives the whole school one permission-aware place to learn, teach, assess, schedule, administer, support students, and use human-reviewed AI assistance.

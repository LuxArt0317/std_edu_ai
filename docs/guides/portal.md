# STU Nexus School Platform Guide

## What this portal is

STU Nexus is the authenticated operating platform for the university. It gives each person a role-specific home while keeping one shared source of truth for academics, teaching, learning, assessment, grades, schedules, communications, student success, admissions, and service work.

The public STU website helps visitors discover the university. STU Nexus handles the signed-in work that follows. Students can learn, take quizzes, review feedback, see published grades, and follow their schedule. Teachers can manage visible classes, content, assessment review, gradebooks, AI-assisted grade capture, and calendars. Leaders and administrators can oversee the academic structure, people, permissions, and original CRM operations.

## Who uses it

Supabase Auth verifies every account. Database row-level security filters each query and mutation for the trusted role and the person's teaching, enrollment, ownership, or operational relationship. The interface then presents the same boundary in an understandable workspace. The protected platform owner can safely preview every role's interface without changing the owner's database authority.

See [../platform/ROLE_MATRIX.md](../security/roles.md) for the complete hierarchy and permission model.

## Academic and learning workspaces

### My Day / School Overview

Shows role-relevant courses, assessments, upcoming events, announcements, and the fastest next actions. Owners and leaders receive institution-wide oversight; students see only their learning scope.

### Academics and Teaching

Organizes departments, programs, courses, active sections, teachers, rooms, modality, and rosters. Faculty receive assigned-class views while leadership receives the wider academic catalog permitted by policy.

### Learning Topics

Delivers sequenced course material through a wide page-aware reader. Teachers compose each page in a full course studio and can place multiple uploaded images, uploaded videos, or safe YouTube/Vimeo/HTTPS videos between text blocks. Students see published content for enrolled sections, retain page/progress context, and can expand into an immersive reading view.

### Assessments

Students answer real transactionally scored quizzes. Correct answers remain separate and protected until the teacher's post-attempt review mode permits them. Teachers configure score/question/answer review, fullscreen, tab/window focus, extended-display, camera-device, multiple-camera, and clipboard signals. Students receive a clear preflight disclosure; supported signals are append-only evidence for authorized human review, not automatic misconduct findings, and the camera preflight stores no media.

### Grades and AI Scan Review

Students see only their own published results. Teachers can review class gradebooks, publish a reviewed grade, or upload a JPEG, PNG, or WebP grade sheet. OpenAI vision extracts candidate rows with confidence and warnings; a teacher must review before candidates are stored as drafts, and publishing remains a separate explicit action.

### One Calendar

Combines personal and role-wide events, enrolled or taught classes, assessment and standalone grade deadlines, attendance sessions, learning releases, assigned institutional work, enrollment windows, and term milestones. Month, week, and agenda views share filters and compact event details. Students can turn their authorized class view into a configurable high-resolution STU-branded PNG with rooms, deadlines, weekend selection, and color themes. Policies derive visibility from enrollment, teaching assignment, personal ownership, intended role audience, and each source domain's RLS.

### Users

The owner and authorized leadership see a searchable account directory with status/role filters and pagination. Active accounts are shown by default. The fourteen permission templates are separate from real accounts and appear under Role settings. Role changes use an audited server-side function that updates Auth metadata and the profile atomically. The protected owner cannot be demoted or deleted and a second owner cannot be assigned.

## Student services in the same School OS

Open Students, Alerts, Admissions, Cases, Messages, Knowledge and Reports from the sidebar. Tasks contains staff follow-ups. There is no workspace switch or separate login. Existing database policies still determine which records each person can access.

## Main workspaces

### Tasks

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

Stores policies, procedures, frequently asked questions, event outcomes, and internal guidance. Authorized staff can contribute rich knowledge from their own expertise or link it to a personal, class, or whole-campus calendar event. Each contribution has an audience and review state: contributors submit drafts for review, while platform owners, administrators, and librarians can verify and publish trusted guidance. Nexus uses only verified knowledge that the signed-in user is permitted to see.

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

In the Nexus composer, Enter sends the current message and Shift+Enter inserts a new line. Input-method composition is allowed to finish before submission.

For an actionable request, Nexus creates a visible goal and works through one authorized step at a time. It observes the real portal result after each step and continues until complete. Navigation can happen automatically; every database change stops on a review card and requires confirmation. A user can cancel at any point. Nexus stops with a clear explanation when the goal is unauthorized, unsupported, stale, repeatedly makes no progress, exceeds eight steps, or runs longer than five minutes.

Authorized academic leaders can request a complete degree curriculum in ordinary language. Nexus prepares all years, semesters, subjects, units, prerequisite relationships, and yearly block sections, then shows the full plan for confirmation. One confirmed action saves the draft atomically; an invalid subject or prerequisite saves nothing. The plan appears in Academic Office → Curricula and remains subject to formal curriculum review and approval.

The review card also identifies the owning active department. Nexus retains a valid department from context, selects it automatically when only one active department exists, or requires the user to choose from the active Academic Office directory before confirmation.

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

## Account menu

Open your name at the bottom of the sidebar to change Appearance (System, Light or Dark) or sign out. Owners can preview another role from this menu. A preview changes navigation only; actions still use the owner account permissions.

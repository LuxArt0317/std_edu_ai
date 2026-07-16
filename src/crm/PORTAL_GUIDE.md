# STU Nexus CRM Portal Guide

## What this portal is

STU Nexus is an internal school relationship-management and student-success platform. It is designed for authorized university staff, not as a replacement for the public university website or as a general student self-service portal.

The public STU website helps people discover the university and find public information. STU Nexus helps staff manage the relationships and operational work that follow: prospective-student inquiries, admissions, enrolled-student support, cases, tasks, outreach, institutional knowledge, and school-wide reporting.

## Who uses it

Access is intended for authorized staff roles such as administrators, academic advisors, admissions personnel, support teams, and faculty. Supabase Auth verifies each account, while database row-level security enforces the permitted access on the server.

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

Nexus AI is the staff copilot inside the CRM. Depending on the available context, it can:

- summarize a student's current situation;
- explain the evidence behind a success-risk signal;
- recommend reviewable next actions;
- answer questions using institutional knowledge;
- help draft clear, supportive communications; and
- turn scattered operational information into a concise staff brief.

The AI receives privacy-minimized context and returns suggestions for human review. Staff remain responsible for decisions and communications.

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

The CRM is connected to production Supabase Auth and Postgres. Authentication, role enforcement, database row-level security, live reads, and supported mutations are active.

The records currently included are safe seed records created to demonstrate and verify the workflows. They are not real university student records. Before operational rollout, the university should establish approved data integrations, staff-account provisioning, privacy governance, retention rules, and owner-specific workflows.

## In one sentence

STU Nexus gives authorized school staff one coordinated place to manage applicants, support students, resolve cases, organize outreach, use institutional knowledge, and receive human-reviewed AI assistance.

# Unified Calendar Data Contract

The calendar is a role-aware projection of existing authoritative records. It does not copy deadlines into a second table, which prevents stale or contradictory dates.

| Calendar source | Authoritative record | Audience rule | Calendar meaning |
|---|---|---|---|
| Scheduled event | `schedule_events` | Personal owner, accessible section, or matching role | Classes, meetings, exams, campus and personal events |
| Assessment | `assessments.due_at` | Existing section RLS and publication rules | Quiz, exam, assignment, and project deadlines |
| Attendance | `attendance_sessions` | Existing section RLS | Required class sessions |
| Learning release | `learning_modules.unlocks_at` | Existing section and publication rules | When class learning becomes available |
| Grade work | `grade_items.due_at` | Existing section RLS | Standalone graded work not already linked to an assessment |
| Institutional work | `institutional_initiatives.due_at` | Assigned owner, creator, or authorized leadership | Policy, accreditation, teaching-plan, and institutional deadlines |
| Academic milestone | `academic_terms` | Authenticated academic audience | Enrollment opening/closing and term opening/closing |

## Schedule-event targeting

- `section_id`: event belongs to an enrolled or taught class.
- `owner_profile_id`: event is assigned to one person.
- `audience_roles`: event is relevant to one or more school roles.
- `created_by`: establishes mutation ownership and audit context.
- `event_type`, `starts_at`, `ends_at`, `location`, and `description`: provide display and conflict-checking data.

The existing check constraint requires at least one audience target. Existing RLS allows reads only for the personal owner, a user who can access the section, a matching role, or authorized institutional oversight. Create, edit, and delete remain separately restricted.

## Deliberate design decisions

- No new calendar table or permissive view was added because the current schema already represents the necessary audience relationships.
- Derived items link back to their source domain instead of becoming independently editable calendar copies.
- Assessment-linked grade items are omitted to avoid duplicate deadlines.
- Cancelled attendance sessions and completed/rejected initiatives are omitted.
- Visibility remains database-first; the client only composes records already returned through RLS.

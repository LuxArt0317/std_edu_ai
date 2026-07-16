# STU Nexus Role and Permission Matrix

## Security model

Every signed-in identity has one trusted role in Supabase Auth `app_metadata` and a matching profile role. Navigation is tailored for usability, but database RLS and trusted functions are the authorization boundary. Course visibility is further narrowed by teaching assignment or student enrollment.

| Tier | Roles | Primary workspace and authority |
| --- | --- | --- |
| Ownership | `owner` | Full institutional oversight, safe role preview, audited role governance, academic operations, CRM, and immutable owner protection |
| Leadership | `admin`, `president`, `vice_president`, `dean`, `registrar` | Institution-wide academic, schedule, people, reporting, and operational oversight according to policy |
| Academic | `department_head`, `faculty`, `advisor` | Department or assigned-class teaching, learning, assessment, grades, advising, schedule, and student-success work |
| Operations | `admissions`, `finance`, `support`, `librarian` | Role-relevant learning/knowledge, schedule, service, admissions, finance, support, library, and CRM workflows |
| Learner | `student` | Enrolled courses, published topics, quizzes, own attempts, own published grades, announcements, schedule, and own chatbot history |

## Protected owner

`winsonbaring10@gmail.com` is the single protected owner. Database triggers prevent owner demotion, deletion, or creation of a second owner. The People & Roles workspace never offers an owner role for other identities. Role preview changes only the visible interface; it does not reduce or alter the authenticated owner's database permissions.

## Academic data boundaries

- Students see only sections reached through their SIS enrollment, only published topics and assessments, their own attempts, their own published grades, and their own or audience-relevant calendar items.
- Faculty see assigned sections, their rosters, assessment structure and protected answer keys, class gradebooks, and relevant schedules.
- Leadership and the owner receive wider institutional scope. Specialist staff receive only the platform and CRM surfaces required by their role.
- Correct-answer keys are isolated from question and option records. Students cannot select, infer, or query them through the Data API.
- Objective quiz scoring runs inside `submit_assessment`; the function validates identity, enrollment, publication window, attempt limits, and answer ownership before committing one result.
- Role changes run inside `assign_platform_role`; the function checks the actor, prevents owner changes, synchronizes Auth/profile state, and writes an audit row.
- Authenticated clients have no direct insert or update grant for profile authorization columns; editable profile fields are granted separately from `role` and `is_platform_owner`.

## AI boundaries

- The school chatbot accepts only authenticated requests and derives the role from trusted Auth metadata, not request JSON.
- Conversation history is first-party data in Supabase and is available only to the thread owner.
- Grade scanning is restricted to teaching/leadership roles and returns structured candidates, confidence, and warnings.
- AI never decides the correct answer to an objective quiz, never assigns a role, and never directly publishes a grade.
- A teacher must review scan output before saving draft grades and must publish each result explicitly.

# Role and workflow audit — Issue #74

A passing source assertion alone is not a completed workflow. Each row below needs authorization checks and rendered interactions appropriate to its lifecycle.

| Domain | Expected lifecycle | Primary actors | Evidence status |
| --- | --- | --- | --- |
| Identity/roles | Create/invite, read, amend, role change, suspend/restore/archive; immutable owner | Owner/authorized administrators | Existing contracts; all-role browser sweep in progress |
| Academic structure | Departments/programs/terms/subjects/sections/enrollment and governed archive/delete | Academic managers/registrar | Existing contracts; client browser CRUD in progress |
| Institutional curricula | Draft CRUD, prerequisites/blocks, approve/retire, audited deletion | Academic managers | Existing contracts; regression checks in progress |
| Teacher curriculum | Assigned plan read, request create/edit/withdraw, independent review, program-editor handoff | Assigned teacher/academic reviewer | Gap implemented; live and browser verification in progress |
| Learning content | Module/lesson CRUD, files/media, publication, exact learner view | Assigned teacher/enrolled learner | Shared controls migrated; browser publishing checks in progress |
| Assessment/grades | Build/publish, attempts/submissions, grading/review, controlled publication/correction | Teacher/enrolled learner | API contracts; role-denial/browser checks in progress |
| Attendance | Sessions, records, corrections and decisions | Teacher/student/reviewer | Existing contracts; regression checks in progress |
| Calendar | Event CRUD, filters/details, composed deadlines, export | Scoped staff/learner | Migrated controls; responsive/keyboard checks in progress |
| Learner support/CRM | Students/leads/cases/tasks/campaigns/interactions, retention and sensitive access | Scoped staff | Existing contracts; browser sweep in progress |
| Communication | Compose, recipient scoping, review/approve/reject, notifications | Scoped staff/reviewers | Existing contracts; interaction checks in progress |
| Knowledge/research | Source discovery, ingestion/review, evaluations, consent/withdrawal, operations | Knowledge managers/reviewers/participants | Existing contracts/public accessibility; external approvals separate |
| Nexus AI | Authentication, role tools, Ask/confirmed Agentic, files, threads, queue and cancellation | Authorized roles | Existing tests/live baseline; migrated interaction checks in progress |

## Findings

- Scattered runtime/test/provider Markdown moved into docs/reference, docs/security, docs/guides and docs/operations.
- The 3,900-line portal is now a small shell plus separate view modules.
- Modal editors, sidebars, the student drawer and browser prompts use shared shadcn/Radix interactions; non-modal AI popups retain their concurrent-workspace behavior.
- Teachers previously had lesson-module authoring but no program curriculum inspection/change-request path. The new scoped workflow preserves academic approval authority.
- Auth metadata alone does not synchronize an existing profile role. Isolated QA provisioning now follows the production provisioner's profile synchronization contract; no production authorization rule was weakened.

Initial browser checks passed owner login, zero application exceptions, Academic Office dialog opening, and Escape close. Final release and cleanup evidence will be recorded after the full checks finish.

Additional verified defects and fixes:

- CRM disk recovery could expose a prior account's saved records or fictional local demo data. Recovery now validates the active identity, uses a role-scoped generation-guarded memory cache, discards the old browser key, and shows a retry state when no authorized data is available. Account changes during a load cannot populate another identity's cache. Zero-row optimistic writes fail visibly.
- CRM signal cards and several metric captions contained fabricated names/times or fixed values. They now come from canonical records, including zero-safe admission rates and actual workload/case counts. Case status summaries are functional filters.
- Old low-contrast captions, unnamed class selection/read-only lesson surfaces and unassociated tab panels were identified by rendered Axe scans and corrected. The scanner covers every owner portal and CRM workspace.
- Teacher curriculum requests now include program/class/requester/date context, bounded pagination and reviewer/teacher notifications using the existing private notification channel. Review still does not auto-publish institutional curricula.

## Review checkpoint

Earlier checkpoint (superseded by the verified follow-up below): 21 passed, 2 failed. The unresolved cases are learner-support case editing (editor did not close) and mobile CRM navigation (trigger click timed out). Teardown removed 13 temporary accounts, exact fixture records and one remaining fixture file, then deleted the session state file. A later public accessibility run timed out at page navigation; its earlier 10-state run passed. This checkpoint is not a completed QA sign-off or production release.

## Unified School OS follow-up [Issue #74]

The user requested a single workspace. Learner Support is now a controlled feature workspace in the School OS shell. Its second sidebar/header/sign-out and bridge navigation are removed; direct student-service links retain all existing feature screens. Institutional records and server-enforced roles remain unchanged.

Live read-only account inventory on 2026-11-01: 1 Auth identity, 1 active protected-owner profile, 0 test-named identities, and 0 orphaned identities in either direction. The 14 entries are role templates, not extra user accounts. The People & Access directory defaults to active accounts and has search, role/status filters and 25-account pagination. Detailed role policies are collapsed under Advanced role permissions. The owner banner resolves the actual protected profile rather than labelling every viewer as owner.

Source/API tests: 170 passing. Component tests: 8 passing. Public accessibility: 10 states passing, zero serious/critical, unnamed controls, focus, target-size or overflow failures. Final evidence is recorded below.

The live case editor failure was traced to an existing enum mismatch: the UI sent normal while PostgreSQL accepts medium. Both case and task saves now use one validated conversion and confirm the written ID. Regression coverage includes normal-priority form submission, completed tasks and the student-to-staff shared-case handoff.

The new student-to-staff handoff check exposed a conflicting relationship trigger that rejected unassigned student intake despite the self-service RLS policy. Migration 20261101150000 restores only own-student open intake without an owner. Staff creation and triage still require an active eligible owner; student update permissions remain unchanged. Applied to the exact client target after a dry run (100 migrations, 101 RLS tables).

## Verified follow-up outcome

All 26 E2E scenarios have passed across the full run and focused regressions. Full run: 23/24, followed by passing case CRUD, account filtering, task form and student form-to-staff triage (4/4) after the identified fixes. The owner module/accessibility sweep and all fourteen role navigation checks passed; both mobile navigation checks passed. Fresh owner sessions isolate independent QA checks from revoked shared tokens without weakening authentication. Eight unit tests and 170 API/source checks pass. Build/assets, handoff links, dependency audit and ten public accessibility states pass. Live client verification also passed owner CRUD cleanup, RLS/storage, both Edge Functions and authenticated non-mutating OpenAI QA.

Final teardown: thirteen temporary Auth accounts and exact isolated records removed, session state deleted. Post-cleanup SQL: one real owner, zero test-named users, zero orphaned identities, 100 applied migrations and 101 RLS tables. UI changes remain local; no new Vercel release is claimed. Institutional/manual acceptance items remain outside automated evidence.

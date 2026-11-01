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

## Taste-led transactional UI verification

User requested a complete visual/copy overhaul, keeping green and using shadcn. Main changes: compact headings and grouped navigation, no promotional heroes or repeated role/context banners, one global assistant launcher, real case/department tables, academic Add/Export menus, separate change requests, plain copy, and account-menu appearance/preview/sign-out. Institutional data, URLs, field names, role boundaries and approval controls are preserved. Technical diagnostics are collapsed by default.

Evidence on 2026-11-01:

- 170 API/source checks and eight unit/component checks pass. Presentation-only source assertions now verify actual controls rather than retired slogans; authorization and mutation assertions remain intact.
- All 29 E2E scenarios verified across full/focused runs: initial full run 23/27, then final focused regressions 6/6 covering two mobile flows, account filtering, appearance/preview, academic tabs/menu actions and assistant keyboard/focus behavior. The initial failures were stale hidden breadcrumb/renamed label checks and a closing-menu scan. Final checks use visible workspace readiness and wait for menu removal. Real role navigation, curriculum review/notifications, LMS APIs/publication, department CRUD, case CRUD, tasks and student support handoff passed.
- Rendered scans cover 15 main pages in Light and Dark (30 states), with zero serious/critical violations, no application errors or page overflow. Ten public accessibility states pass with zero measured accessibility/focus/overflow failures.
- Sign-in Lighthouse desktop: performance 98, accessibility 100, LCP 0.7s, CLS 0 and total blocking time 0ms. The missing main landmark was corrected. This is a local lab result, not field Core Web Vitals evidence.
- Button enable/disable opacity no longer animates through low-contrast states. The assistant message log is keyboard-focusable; its fields have labels and close restores launcher focus.
- TypeScript/build/recursive assets, documentation links and dependency audit pass (zero vulnerabilities). Lint exits successfully with inherited React warnings.
- Final fixture teardown removed 13 temporary identities and isolated records/session state. Independent SQL confirmed one real protected owner, no QA/test-named users and no orphaned Auth/profile identities. Schema remains 100 migrations and 101 RLS tables; no migration or permission change in this UI work.

Screenshots, raw traces and reports remain ignored under artifacts/. The UI is local at http://localhost:5173/crm; it is not pushed or deployed. Manual assistive-technology and institutional/research acceptance remain external.

## Client release and separate routes — 2026-11-01

Added React Router 8 with `/login`, protected `/app` and section URLs, safe post-login return paths, role-aware courses, browser history/refresh and old `/crm` link compatibility. Existing Supabase recovery callbacks and all permissions remain unchanged. The auth browser test exposed an unstable password label and competing logout redirects; corrected both and verified the real sign-in, sign-out and browser-back flow.

Release evidence: 170 API/source tests, 11 units, all 32 E2E scenarios verified across full/focused runs (31/32 initial full run, then two route regressions and the final corrected auth scenario). All 14 roles and actual curriculum/LMS/CRUD/support flows passed. Build/assets, lint (inherited warnings), documentation links and zero-vulnerability dependency audit pass. Ten public accessibility states and live client verification pass, including owner CRUD cleanup, RLS/storage, both account functions and authenticated non-mutating OpenAI requests. Production deployment is verified separately in the handoff record.

Production acceptance: code `64ebf12`, Vercel `8VJNpQEEaUR3gVMyFfQ5hj4DzqSD` Ready, GitHub quality run `41321537236` successful. Verified real owner form login to the requested academic page, section URLs/refresh/back, old `/crm` redirect, unknown-page handling, external return URL rejection, dashboard/mobile-login accessibility and zero browser app errors. Live client verification passed all five entry paths with 27 recursive assets each plus API, RLS/storage, owner CRUD cleanup, both account functions and authenticated OpenAI QA. SQL after fixture teardown confirms one real owner and no test/orphan identities.

## Readability and student signup — Issue #75

Verified 170 API/source checks, 13 units and all 38 E2E scenarios across full/focused runs. Full 36/36 passed; focused route/confirmation/mobile-task checks 5/5 passed; extended auth/security/confirmation checks 3/3 passed. Formatting-only source assertions tolerate whitespace without weakening the authentication invariant.

100 unique states across desktop/mobile, light/dark, all 15 main modules, academic tabs, assistant, quiz/outline and auth screens pass serious/critical accessibility, overflow and selector/action clipping checks after fixes. The initial 84-state sweep found two mobile-task theme failures; both pass in the targeted 20-state follow-up. Eight auth states also pass. Ten public accessibility states and dependency audit pass; lint retains inherited warnings. Local desktop signin Lighthouse: performance 98, accessibility 100, LCP 0.5s, CLS 0.071.

Real public signup API accepted a confirmation request; unconfirmed login is denied, verification grants student access only, editable owner/admin metadata and direct profile edits cannot elevate privileges, and staff rows are protected. Temporary signup/role accounts were removed. Server rejects short passwords and missing required symbols; UI respects the 72-byte maximum including multibyte text without truncation. Migration dry-run/apply: 101 migrations/101 public RLS tables.

Production code fa01a84 is Ready as Vercel 751pwPAFk66kfybEqVgg7zGPPMEU; independent quality workflow 41325153100 passed. Live signin/signup UI, owner login/navigation, seven paths/26 recursive assets and client backend verification pass. Public mailbox delivery is not complete: Supabase built-in email is limited to approved team addresses and two emails/hour. The user chose Supabase after discussing Gmail; a production sender remains needed. #75 stays open for that dependency.


## Alerts Plan and remaining nested UI — Issue #75

The reported Plan failure came from opening a modal student sheet and a non-portal sibling assistant together. The student modal made the assistant inert. Plan now has independent context and one shadcn sheet; opening it from a student profile creates a proper nested sheet. Escape, close, focus restoration, editable requests and response scrolling work. Closing cancels requests; late results cannot populate a reopened conversation.

The expanded audit specifically opens previously missed student-preview, notification, quiz, nested assistant, source-review, assistant-usage, answer-test, service-status and workload states. It found and corrected blank contact links, a dark-mode risk badge override, mobile service-table overflow and missing keyboard scrolling. A populated follow-up exposed a separate task-row overflow; text, status and actions now have independent wrapping. Alert rows explicitly target shadcn card markup instead of obsolete article selectors.

Verified: 170 API/source checks, 13 units and all 43 E2E scenarios across runs (41/42 full, then 7/7 focused including the corrected task regression and added service-table keyboard scenario). The focused checks include real task CRUD and all four new assistant/upload/dialog scenarios. Expanded audit: 48 desktop/mobile/light/dark nested states, zero serious/critical accessibility failures, horizontal overflow or app errors. Explicit computed color/background checks supplement Axe because gradients can otherwise produce incomplete contrast results. Ten public accessibility states, lint/build/assets, docs and dependency audit pass. Live authenticated CRM support-plan API returns a valid OpenAI response using synthetic context; client RLS/storage/owner CRUD cleanup/Edge Function/school AI verification passes.

Fixture teardown and independent SQL confirm one real protected owner, zero test-named accounts and no orphaned identities. Schema unchanged: 101 migrations and 101 public RLS tables. Authenticated screenshots and raw results remain ignored under artifacts/alerts. Public-email delivery remains the separate documented dependency; this UI change does not alter Auth settings.

A follow-up Lighthouse check exposed a skipped heading level and an account-name override; fixed both. The account trigger now derives its accessible name from its content. The audit tags now include WCAG 2.1 A as well as A/AA and 2.1 AA. A separate rendered pass covers all fifteen owner workspaces with zero serious/critical findings. Authenticated local Alerts Lighthouse: accessibility 100 after fixes; measured performance 83 on the first cold run and 100 warm, CLS 0 (local measurements, not a production load claim).

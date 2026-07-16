# Task Plan

## Phase 8: Production account for every school role [Issue #15]

### Secure provisioning

- provision one confirmed Supabase Auth identity for every canonical STU Nexus role
- use owner-controlled `winsonbaring10+<role>@gmail.com` aliases for non-owner role validation accounts
- generate a unique high-entropy password for every new identity and store it only in the local macOS keychain for `www.stu.best`
- preserve `winsonbaring10@gmail.com` as the only immutable platform owner

### Trusted role synchronization

- synchronize trusted Auth `app_metadata.role` and `public.profiles.role` through one idempotent reviewed migration
- assign production-shaped names, departments, and job titles while retaining the existing faculty/student roster links
- validate that all expected accounts exist before committing any role updates

### Production verification

- authenticate every account through the live password-token endpoint and verify its returned trusted role
- verify all 14 Auth identities are confirmed and match their profile role, with exactly one platform owner
- add a repeatable credential-safe live account test and an operator account directory
- run application tests, lint, production build, Supabase security/performance advisors, deployment verification, and documentation synchronization

## Current execution

- GitHub issue #15 created and provisioning progress recorded
- canonical 14-role catalog and three existing owner/faculty/student identities verified
- current Supabase Auth and trusted `app_metadata` guidance reviewed
- owner-only `provision-role-account` Edge Function deployed with verified student denial and no owner-role creation path
- eleven missing identities provisioned and the full 14-account directory synchronized through one production migration
- all 14 unique credentials stored only in the macOS keychain; all 14 live password logins and matching profile roles verified
- API contracts, lint, production build, migration integrity, security advisors, performance advisors, and credential-safe documentation pass review
- release commit `9e3e949` published to `main`; Vercel deployment `dpl_CfVE9KuT5HAA3wLQr5MiaSSmxWpq` is Ready on `www.stu.best` with root/CRM 200 and unauthenticated AI 401 checks passing

## Phase 7: All-in-one school operating platform [Issue #14]

### Product model and authorization

- make `winsonbaring10@gmail.com` the protected platform owner above the ordinary administrator tier
- establish a school role hierarchy covering owner, administrator, executive/academic leadership, registrar, department heads, faculty, advisors, admissions, finance, support, librarians, and students
- enforce every data boundary in Supabase RLS and trusted server-side functions; role-specific UI is an additional usability layer, not the security boundary
- give the owner a safe role-preview control for auditing student, teacher, and administrative experiences

### Academic operating system

- add departments, programs, academic terms, courses, sections, enrollment/teaching assignments, modules/topics, announcements, notifications, and schedules
- add teacher workspaces for assigned classes, learning content, assessments, gradebook, grade-scan review, and class schedules
- add student workspaces for enrolled classes, topics, quizzes, answer feedback, published grades, announcements, and personal schedules
- add owner/admin workspaces for institutional health, people/role hierarchy, academic catalog, and platform configuration

### Assessment and grade intelligence

- implement assessment questions, choices, protected answer keys, attempts, answers, deterministic transactional scoring, and teacher review
- implement grade items and publishable grades with student-only access to their own published results
- add authenticated AI image analysis for grade sheets with structured extraction, confidence flags, and mandatory human review before persistence

### Conversational intelligence

- replace the single-turn copilot experience with a durable role-aware chatbot backed by local Supabase threads/messages
- ground responses in role, course, student-success, and verified institutional context while minimizing personal data sent to OpenAI
- require authenticated API requests, rate limits, structured responses, safety identifiers, and graceful continuity behavior

### Production completion

- seed safe academic content, topics, a functioning quiz, schedule entries, announcements, and gradebook examples
- apply the reviewed migration to production, regenerate database types, and run security/performance advisors
- verify owner protection, role-specific RLS, quiz scoring, grade privacy, authenticated AI endpoints, application tests, production build, and deployed routes
- update setup/product/portal documentation, GitHub issue status, changelog, and persistent project state

## Current execution

- GitHub issue #14 created
- reusable OpenAI key confirmed in the ignored owner-only `.env.local`; prior user authorization to reuse it remains in effect
- current Supabase RBAC/RLS, Storage, OpenAI Responses multi-turn, vision input, and latest-model guidance reviewed
- architecture selected: a single authenticated platform with database-enforced role boundaries and human-reviewed AI decisions
- nine production migrations applied; owner protection, role hierarchy, academics, teaching, learning, quizzes, bounded atomic grade scans, schedules, chat, audits, rosters, authorization-column locks, and indexes are live
- unified role-aware interface and owner preview implemented; the original CRM is available from authorized workspaces
- owner, real faculty, real student, cross-role RLS, deterministic quiz, grade privacy, authenticated chatbot, and authenticated vision extraction tests pass
- documentation synchronized; implementation, runtime fix, and release-state commits published; issue #14 closed completed; Vercel production and authenticated deployed API checks passed

## Phase 6: CRM portal guide [Issue #13]

- explain the portal's purpose and intended staff audience in plain language
- document every operational workspace, Nexus AI, and representative student-support and admissions workflows
- state the production backend and seed-data boundaries accurately
- link the guide from the CRM and root documentation

## Current execution

- GitHub issue #13 created
- portal guide written at `src/crm/PORTAL_GUIDE.md`
- root and CRM documentation linked to the guide

## Phase 5: Secure CRM credential handoff [Issue #12]

- verify the macOS keychain entry exists without printing its value
- authenticate the stored credential against production Supabase Auth and confirm the trusted staff role
- place the verified credential on the owner's local clipboard for immediate use
- record completion without persisting or exposing the plaintext credential in repository files, logs, or GitHub

## Current execution

- GitHub issue #12 created
- the `www.stu.best` internet-password entry for `winsonbaring10@gmail.com` exists in the login keychain
- production password authentication passed and the returned trusted app role is `admin`
- the exact verified credential was copied to the local clipboard and validated by digest comparison

## Phase 4: Production Supabase CRM activation [Issue #9]

- apply and verify the STU Nexus schema, RLS, grants, indexes, search/vector structures, audit controls, and safe seed data to the healthy `stu_edu_ai` project
- add Supabase Auth session handling, initial-admin bootstrap safeguards, staff login, logout, and role-aware access
- replace continuity-only CRM reads and mutations with live Supabase repositories while preserving explicit offline fallback behavior
- configure browser-safe Supabase variables in Vercel Production and Preview without exposing service credentials
- run live database workflow tests plus security/performance advisors, application lint/build/tests, PR checks, merge, and production deployment verification

## Current execution

- GitHub issue #9 created
- Supabase MCP access verified for project `zhcchldvgqrkfqoknewk` (`stu_edu_ai`, `ACTIVE_HEALTHY`)
- the production project currently has zero public tables, zero migrations, and zero auth users
- current Supabase Auth, Data API exposure, RLS, and Postgres performance guidance reviewed
- three migrations applied: core CRM, policy hardening, and bootstrap lock
- 11 public tables are RLS-enabled; duplicate permissive policies and the missing bootstrap FK index were corrected
- initial owner administrator provisioned through Supabase Auth with its generated credential stored only in the macOS login keychain
- anonymous isolation, admin access to six CRM modules, and a reversible remote mutation pass through the browser-safe publishable key
- CRM Auth gate, live repository, targeted remote mutations, continuity rollback, generated database types, and AI audit logging implemented
- Vercel Production and Preview now contain the browser-safe Supabase URL and publishable key
- PR #10 passed Vercel checks, merged to `main`, and closed issue #9
- the final production deployment is Ready at `www.stu.best`; `/crm` and the OpenAI endpoint passed protected production smoke tests

## Phase 3: STU Nexus CRM and AI student-success platform [Issue #5]

- build a premium responsive CRM workspace at `/crm` without disrupting the public STU homepage
- implement executive dashboard, Student 360, success-risk radar, admissions pipeline, case management, campaigns, tasks, institutional knowledge, and analytics
- add a stateful persistent data adapter with realistic production-shaped demo records and explicit backend status
- add a server-only OpenAI Responses API endpoint for de-identified student-success briefs, grounded answers, recommended actions, and communication drafting
- create Supabase-ready auth, multi-role schema, RLS policies, indexes, knowledge/search structures, and seed data migrations
- verify security boundaries, lint, production build, API behavior, route smoke tests, GitHub review checks, and Vercel deployment

## Current execution

- GitHub issue #5 created
- OpenAI credential isolated in ignored `.env.local` with owner-only permissions
- current OpenAI model and Responses API guidance reviewed
- connected Supabase account lacks access to the repository's configured project; unrelated projects will not be mutated
- all eight CRM workspaces, persistent mutations, Student 360, Success Radar, and Nexus AI interaction flows implemented at `/crm`
- server-only OpenAI endpoint verified against the configured live key with structured, cited output
- activation-ready Supabase migration completed with RLS, indexes, search/vector support, audit controls, and demo seeds
- lint, TypeScript production build, API tests, and `/crm` HTTP smoke checks pass
- PR #6 passed Vercel and automated review checks, merged to `main`, and closed issue #5
- the main-branch Vercel production deployment completed successfully behind configured SSO protection

## Phase 2: Pixel-faithful STU homepage clone [Issue #3]

- capture the live `stu.edu.tw` homepage structure, content, links, imagery, styles, and responsive rules using terminal-only inspection
- rebuild the React page to match the official homepage section order and visual system
- preserve current university destinations and interactive homepage behaviors
- keep the research-driven AI assistant as a distinct enhancement that does not alter the cloned institutional homepage
- verify lint, production build, local routes, responsive layout, and Vercel deployment
- update documentation, GitHub issue status, and persistent project state

## Current execution

- GitHub issue #3 created
- live Elementor HTML, CSS, assets, navigation, and content extracted
- full official homepage section order, content, external links, responsive styling, and interactions implemented
- AI assistant moved to a floating drawer outside the cloned page flow
- Node 22/npm 11 clean install, lint, production build, asset availability, and local route smoke tests pass
- PR #4 merged to `main`
- Vercel preview and production deployments completed successfully
- production root and deep route respond through the configured Vercel SSO protection

## Phase 1: Deployment recovery [Issue #1]

- reproduce the Vercel-facing failure locally
- inspect runtime-sensitive integrations and deployment configuration
- harden the production path so missing environment data does not crash the app
- verify the production build and preview output
- configure a deterministic Vercel runtime, install, build, output, and SPA routing contract

## Phase 1 completion

- local production build reproduced as successful
- Supabase browser client identified as an unguarded runtime dependency
- deployment-safe fallback implemented for missing `VITE_SUPABASE_*` variables and unavailable `todos` data
- explicit Vercel configuration and Node.js 22 runtime pin implemented
- clean-install, lint, production-build, and preview verification completed successfully
- root and deep-link HTTP smoke tests both returned 200 with the built application shell
- production deployment failed because npm 11 rejected missing transitive `@emnapi/*` lockfile entries
- lockfile regenerated and verified with the pinned Node 22 and npm 11 deployment toolchain
- preview and production Vercel deployments completed successfully after the lockfile repair
- production root and SPA deep-link routes respond through Vercel deployment protection

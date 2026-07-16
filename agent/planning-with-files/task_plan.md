# Task Plan

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

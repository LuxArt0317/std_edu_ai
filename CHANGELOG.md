# Changelog

## Unreleased

- fixed the production CRM sign-in screen losing its route stylesheet by replacing a conditional lazy-import callback with distinct statically analyzable route boundaries
- corrected the authentication card's border-box sizing so its padding cannot push the form outside narrow mobile viewports
- added a mandatory post-build asset-graph verifier that rejects CRM bundles missing the semantic authentication stylesheet
- strengthened the live production diagnostic to detect HTTP-200 deployments that render an unstyled portal and report the missing CSS contract directly

- restored Vercel's standard Vite framework detection by removing repository-level framework, install, build, and output overrides
- upgraded the supported Vercel and local runtime from Node.js 22 to the major-only Node.js 24 line
- removed the redundant `vercel-build` script while preserving the `/crm` SPA rewrite required for direct navigation

- added premium first-login onboarding for all 14 school roles with responsive spotlight masks, directional instructions, real navigation-action detection, role-specific scenario checks, pause/resume, review, and restart
- added a persistent Readiness Center with an evidence-only 0–100 score; reading instructions alone does not count as understanding and readiness never changes authorization
- deployed RLS-protected, versioned `onboarding_progress` and append-only `onboarding_events` tables with explicit Data API grants and covering ownership indexes
- added all-role onboarding contracts plus live 14-account RLS acceptance coverage for self progress, owner aggregate visibility, forged-role denial, and event-history deletion denial

- replaced the empty pre-JavaScript root with a branded boot and stalled-load recovery shell so blocked or delayed bundles never produce a blank green screen
- added a global React error boundary for render and lazy-chunk failures with latest-version reload and local-session reset actions
- bounded Supabase session, identity, sign-in, sign-out, and multi-query portal startup so network or cached-session failures resolve to actionable UI
- added regression coverage for the static boot contract, lazy-route recovery, startup timeouts, and session-reset path

- provisioned one confirmed production Auth identity for each of the 14 canonical school roles, with unique credentials stored only in the macOS keychain
- added an owner-only Supabase Edge Function for validated non-owner account creation and credential rotation through the server-side Auth Admin API
- added an atomic role-directory synchronization migration plus credential-safe live verification of every Auth claim and profile role
- documented the complete role sign-in directory without exposing passwords

- revalidated the protected owner login and refreshed its secure local clipboard handoff without exposing plaintext credential material

- expanded `/crm` into a unified role-aware school operating platform for owner, leadership, administrators, department heads, faculty, advisors, admissions, finance, support, librarians, and students
- promoted `winsonbaring10@gmail.com` to an immutable single-owner tier with safe role preview, audited role assignment, and synchronized Auth/profile authorization
- added production departments, programs, terms, courses, sections, rosters, topics, announcements, notifications, schedules, assessments, protected answer keys, attempts, grades, grade-scan jobs, and persistent chat data
- added a working seeded quiz with transactionally enforced enrollment, attempt limits, protected-answer scoring, feedback, and review controls
- added role-filtered learning, teaching, assessment, gradebook, schedule, academic-catalog, and people-governance interfaces
- added authenticated OpenAI multi-turn school chat and vision grade-sheet extraction with structured output, confidence flags, rate limits, privacy-minimized context, and mandatory human review
- provisioned isolated faculty and student validation identities, linked them to safe SIS seed records, and verified their real production RLS boundaries
- added API contracts and live owner, CRM, role, quiz, grade-privacy, chatbot, and grade-vision integration tests
- resolved all Supabase unindexed-foreign-key advisor findings and documented the intentional trusted workflow functions
- split the public homepage and authenticated school platform into route-specific production bundles
- enforced grade-item score ceilings and atomic, enrollment-validated approval for human-reviewed AI grade scans
- locked profile authorization columns against direct authenticated writes and aligned the UI role with fresh trusted Auth metadata
- published the shared authentication helper as a directly traceable Node ESM module with a strict TypeScript declaration, preventing Vercel runtime import failures

- added a plain-language STU Nexus portal guide covering its audience, workspaces, AI role, example workflows, security boundaries, and current seed-data status
- verified the production owner credential against Supabase Auth and added a secure local clipboard handoff without exposing plaintext secrets
- activated the production `stu_edu_ai` Supabase project with three reviewed migrations, 11 RLS-protected CRM tables, explicit Data API grants, operational indexes, knowledge search/vector support, and safe seed records
- added production Supabase Auth login, session restoration, staff-role enforcement, and secure logout for `/crm`
- replaced continuity-only CRM reads with live Student 360, cases, tasks, admissions, campaigns, knowledge, signals, interactions, and profile queries
- added optimistic task, admission-stage, and case-status mutations with remote persistence, rollback, and continuity caching
- provisioned the initial owner administrator using a generated credential stored only in the macOS login keychain and locked the bootstrap RPC afterward
- added generated TypeScript database contracts and privacy-minimized AI audit logging

- added STU Nexus at `/crm`, a premium responsive CRM spanning command center, Student 360, Success Radar, admissions, cases, campaigns, knowledge, and analytics
- added persistent stateful demo workflows for tasks, applicants, cases, student search, profiles, and AI-assisted interventions
- added a server-only OpenAI Responses API endpoint with validation, rate limiting, structured output, de-identification, timeout handling, safety identifiers, and client continuity fallback
- added a production Supabase migration with normalized CRM data, role-based RLS, operational indexes, full-text/vector knowledge search, privacy-minimized AI audit logs, and demo seeds
- added API contract tests plus `/crm` production-build and route verification
- kept API contract tests outside Vercel's reserved `/api` directory so production publishes only the intended CRM assistant function

- scaffolded the repository with the latest Vite React TypeScript app
- replaced the starter page with an AI-enhanced Shu-Te University landing page
- added a mocked campus AI assistant service and knowledge base
- documented project understanding, setup, and planning state
- hardened the Supabase browser client so missing Vercel env vars no longer break the app at startup
- added fallback messaging for missing Supabase configuration or unavailable `todos` data
- added an explicit Vercel deployment configuration with a Node.js 22 runtime pin, lockfile-based installs, Vite output settings, and SPA rewrites
- repaired the npm 11 lockfile metadata required for deterministic Vercel `npm ci` installs
- rebuilt the homepage as a section-complete, responsive reconstruction of the current `stu.edu.tw` experience
- added official navigation, carousel, audience, performance, story, admissions, news, hot-link, public-information, contact, social, and footer destinations
- moved the research-driven AI assistant into a floating drawer so it does not disrupt the cloned homepage layout

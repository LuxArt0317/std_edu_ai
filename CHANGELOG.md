# Changelog

## Unreleased

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

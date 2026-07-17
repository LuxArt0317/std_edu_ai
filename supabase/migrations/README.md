# Database migrations

These ordered SQL files are the reviewed production history for STU Nexus. Create new files with `npx supabase migration new <name>` and never rewrite a migration after it has been applied remotely. Every exposed table must include RLS, least-privilege Data API grants, and indexes covering foreign keys and expected policy filters.

The onboarding migrations add per-user/per-role/per-version readiness and append-only action evidence, then cover the composite event ownership foreign key used for integrity and cascade cleanup.

`20260717133008_academic_operations_workflows.sql` adds a transactional, role-gated enrollment command with identity synchronization and capacity enforcement, plus room, faculty, and shared-student schedule collision checks.

The integrated LMS migration set adds modules, materials, submissions, attendance, progress, private Storage authorization, integrity triggers, advisor-driven policy/index optimization, and an atomic objective assessment builder with protected answer keys.

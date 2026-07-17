# Database migrations

These ordered SQL files are the reviewed production history for STU Nexus. Create new files with `npx supabase migration new <name>` and never rewrite a migration after it has been applied remotely. Every exposed table must include RLS, least-privilege Data API grants, and indexes covering foreign keys and expected policy filters.

The onboarding migrations add per-user/per-role/per-version readiness and append-only action evidence, then cover the composite event ownership foreign key used for integrity and cascade cleanup.

`20260717133008_academic_operations_workflows.sql` adds a transactional, role-gated enrollment command with identity synchronization and capacity enforcement, plus room, faculty, and shared-student schedule collision checks.

The integrated LMS migration set adds modules, materials, submissions, attendance, progress, private Storage authorization, integrity triggers, advisor-driven policy/index optimization, and an atomic objective assessment builder with protected answer keys.

`20260717231612_account_lifecycle_controls.sql` adds the account status projection and an immutable, owner-readable lifecycle audit for Auth-enforced activation, suspension, archival, and restoration.

`20260717232914_account_directory_and_session_revocation.sql` adds immutable access-operation history and the service-role-only session revocation command. `20260717233309_student_support_self_service.sql` lets a student open a case only against their own linked SIS record while leaving assignment and resolution with authorized staff.

`20260717233540_optimize_account_and_support_policies.sql` covers every new audit foreign key and consolidates staff/student case creation into one role-aware insert policy.

`20260717234309_complete_needed_controlled_workflows.sql` adds relational department/program/class responsibilities, student attendance-correction requests, and reasoned final-grade publication, published-grade correction, term closing, and attendance decisions with immutable before/after evidence. The two following migrations make pending correction uniqueness lifecycle-safe and cover all new policy foreign keys without duplicate permissive reads.

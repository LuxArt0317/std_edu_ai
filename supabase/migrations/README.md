# Database migrations

These ordered SQL files are the reviewed production history for STU Nexus. Create new files with `npx supabase migration new <name>` and never rewrite a migration after it has been applied remotely. Every exposed table must include RLS, least-privilege Data API grants, and indexes covering foreign keys and expected policy filters.

The onboarding migrations add per-user/per-role/per-version readiness and append-only action evidence, then cover the composite event ownership foreign key used for integrity and cascade cleanup.

`20260717133008_academic_operations_workflows.sql` adds a transactional, role-gated enrollment command with identity synchronization and capacity enforcement, plus room, faculty, and shared-student schedule collision checks.

The integrated LMS migration set adds modules, materials, submissions, attendance, progress, private Storage authorization, integrity triggers, advisor-driven policy/index optimization, and an atomic objective assessment builder with protected answer keys.

`20260718234504_immersive_lms_integrity_controls.sql` adds teacher-controlled post-attempt review and disclosed fullscreen/focus/display/camera/clipboard policy, append-only student/teacher-scoped integrity evidence, safe reviewed-answer disclosure, and inline lesson video MIME/size support. `20260718235722_assessment_integrity_student_index.sql` covers the student evidence foreign key and read path.

`20260717231612_account_lifecycle_controls.sql` adds the account status projection and an immutable, owner-readable lifecycle audit for Auth-enforced activation, suspension, archival, and restoration.

`20260717232914_account_directory_and_session_revocation.sql` adds immutable access-operation history and the service-role-only session revocation command. `20260717233309_student_support_self_service.sql` lets a student open a case only against their own linked SIS record while leaving assignment and resolution with authorized staff.

`20260717233540_optimize_account_and_support_policies.sql` covers every new audit foreign key and consolidates staff/student case creation into one role-aware insert policy.

`20260717234309_complete_needed_controlled_workflows.sql` adds relational department/program/class responsibilities, student attendance-correction requests, and reasoned final-grade publication, published-grade correction, term closing, and attendance decisions with immutable before/after evidence. The two following migrations make pending correction uniqueness lifecycle-safe and cover all new policy foreign keys without duplicate permissive reads.

`20260718000718_notifications_and_approved_communication.sql` replaces self-insertable notifications with recipient read/update and authorized delivery policies, adds participant-scoped communication requests, and exposes a support/admin approval RPC that atomically delivers portal notifications and writes controlled-action evidence.

`20260718001256_controlled_student_program_submission_records.sql` adds durable student record states and merge lineage, audited withdrawal/merge/program archival/enrollment transitions, and audited submission return/void operations. Each command validates fresh authorization and transition preconditions before preserving before/after state.

The `20260718002408`–`20260718005944` completion set closes the remaining `needed.md` governance boundaries: mandatory first-login password replacement, identity synchronization, admissions handoff and notifications, all-role RLS alignment, scoped department staff editing, institutional initiatives, Registrar exports, assessment availability/release controls, governed question and attempt readers, sensitive-case evidence, bulk campaign approval/delivery, and archive-only CRM retention. Direct answer explanations and unreleased score columns are not selectable by learners; trusted readers apply the teacher's release settings.

`20260718052529_connect_students_to_academic_programs.sql` replaces the ambiguous student program label as the authoritative relationship with a protected foreign key to `academic_programs`, safely backfills existing records, indexes the relationship, and retains the legacy label as a trigger-synchronized compatibility projection.

`20260718055707_manage_academic_curriculum_lifecycle.sql` adds an atomic, security-invoker curriculum editor for draft metadata, subject sequence, catalog synchronization, prerequisites, blocks, approval, and retirement. `20260718060555_authorize_curriculum_audit_evidence.sql` grants only a narrowly constrained same-transaction curriculum audit insert whose actor, role, entity, status, year, and update timestamp must match the changed plan.

`20260719003437_nexus_attachments_queue_and_manual_curricula.sql` adds private owner-folder chat attachments, an RLS-protected durable prompt queue, attachment metadata on chat history, manual program-linked curriculum creation, and audited draft deletion. `20260719005202_authorize_draft_curriculum_deletion_audit.sql` adds the narrowly constrained production follow-up policy required for immutable deletion evidence.

The Issue #104 research migrations beginning at `20260719063425` add governed RAG, campus routing, pseudonymous study execution, and evidence-safe workload measurement. The Issue #120 workload set (`20260719081744`–`20260719082932`) enforces aggregate provenance, comparable windows, independent review, explicit confirmed resolution, small-cell suppression, protected Data API access, reversible synthetic cleanup, and covering foreign-key indexes.

The Issue #121 ingestion-operations set (`20260719083702`–`20260719085219`) adds content-free per-run and per-attempt telemetry, bounded retry/dead-letter invariants, protected health summaries, stale-worker quarantine, fixture-safe cleanup, and covering requester/run indexes. Operational rows deliberately exclude source content, prompts, credentials, and raw provider payloads.

The Issue #122 review set (`20260719090630`–`20260719092100`) adds atomic reject/change-request/quarantine decisions, exact deployed-acquisition fixture cleanup, covering document-lineage/governance indexes, separate source/document/chunk mutation policies so authorized reads are evaluated once rather than through duplicate permissive SELECT policies, and an explicit owner/admin/librarian-only document mutation boundary aligned with the ingestion and review APIs.

The Issue #123 evidence set (`20260719095500`–`20260719095730`) atomically writes privacy-safe public query/answer/retrieval/citation traces, issues expiring one-use feedback capabilities from a private table, accepts session-bound bounded feedback, exposes content-free reports only to owner/admin/librarian roles, and extends the guarded owner-only fixture purge so cited synthetic chunks can be removed without weakening normal evidence foreign keys.

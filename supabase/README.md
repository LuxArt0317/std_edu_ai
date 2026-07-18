# STU Nexus Supabase

This folder contains the deployed production database contract for the complete school platform. The migrations create normalized CRM, student-success, academic, enrollment, learning-content, assessment, grade, schedule, notification, grade-scan, chat, role-audit, and onboarding-evidence data, with RLS enabled on every exposed table.

The integrated LMS adds publishable course modules and materials, student-owned progress and assignment submissions, teacher-managed attendance, and the private `lms-files` Storage bucket. Section enrollment and teacher assignment drive database and Storage authorization; grading ceilings and roster integrity are enforced by triggers.

Rich content adds RLS-protected material pages and the constrained public `learning-media` bucket for non-sensitive instructional images. Only section managers can upload, replace, or delete media; students receive page rows only through published enrolled sections.

Agentic curriculum planning uses `curriculum_plans`, plan subjects, prerequisite edges, and block templates. The `create_academic_curriculum` security-invoker RPC checks the caller's academic role, validates the complete graph, enforces an idempotency key, and commits or rolls back the entire draft as one transaction.

The production project is `stu_edu_ai` (`zhcchldvgqrkfqoknewk`). Schema changes are applied through reviewed migrations and verified with Supabase security and performance advisors. Set staff authorization in each user's `app_metadata.role`; never use editable user metadata for authorization.

The initial owner account has been provisioned and the one-time bootstrap RPC is locked. `winsonbaring10@gmail.com` is protected as the only owner by database triggers and trusted Auth metadata. The owner-only `provision-role-account` Edge Function creates or rotates confirmed non-owner staff identities through the Supabase Auth Admin API. The owner/admin/registrar `manage-student-account` function creates a confirmed student identity and links its profile and SIS record. Server-only service credentials never reach the application client. Role changes use the audited `assign_platform_role` function.

One confirmed acceptance identity now exists for each of the 14 canonical roles. Their emails and Keychain storage contract are documented in [../src/platform/ROLE_ACCOUNTS.md](../src/platform/ROLE_ACCOUNTS.md).

`onboarding_progress` stores one versioned journey per user and role. `onboarding_events` is append-only for signed-in users and records viewed steps, verified interface actions, and knowledge-check outcomes without storing sensitive content. Users can select, insert, and update only their own current-role progress; owner/admin can read institutional readiness; authenticated users cannot update or delete event history. Readiness never grants authorization.

The production security advisor reports three intentional authenticated `SECURITY DEFINER` functions: `submit_assessment`, `assign_platform_role`, and `manage_section_enrollment`. They use fixed search paths, explicit execute grants, and internal identity/role checks because they must atomically cross otherwise protected tables. Leaked-password protection remains a Supabase dashboard setting to enable when the plan exposes it. Performance advisors report only unused-index informational notices expected for newly seeded, low-traffic tables; no unindexed-foreign-key notices remain, including the composite onboarding-event ownership key.

Profile authorization columns are not directly writable by authenticated clients. Role assignment must use the audited RPC, while the separate grade-scan approval RPC runs with caller permissions and saves bounded, enrolled-student rows in one transaction.

See [../src/platform/ROLE_MATRIX.md](../src/platform/ROLE_MATRIX.md) for authorization semantics and [../SETUP.md](../SETUP.md) for deployment configuration.

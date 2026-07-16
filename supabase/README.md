# STU Nexus Supabase

This folder contains the deployed production database contract for the complete school platform. The migrations create normalized CRM, student-success, academic, enrollment, learning-content, assessment, grade, schedule, notification, grade-scan, chat, and role-audit data, with RLS enabled on every exposed table.

The production project is `stu_edu_ai` (`zhcchldvgqrkfqoknewk`). Schema changes are applied through reviewed migrations and verified with Supabase security and performance advisors. Set staff authorization in each user's `app_metadata.role`; never use editable user metadata for authorization.

The initial owner account has been provisioned and the one-time bootstrap RPC is locked. `winsonbaring10@gmail.com` is protected as the only owner by database triggers and trusted Auth metadata. The owner-only `provision-role-account` Edge Function creates or rotates confirmed non-owner identities through the Supabase Auth Admin API; its server-only service credential never reaches the application client. Role changes use the audited `assign_platform_role` function.

One confirmed acceptance identity now exists for each of the 14 canonical roles. Their emails and Keychain storage contract are documented in [../src/platform/ROLE_ACCOUNTS.md](../src/platform/ROLE_ACCOUNTS.md).

The production security advisor reports two intentional authenticated `SECURITY DEFINER` functions: `submit_assessment` and `assign_platform_role`. Both use fixed search paths, explicit execute grants, and internal identity/role checks because they must atomically cross otherwise protected tables. Leaked-password protection remains a Supabase dashboard setting to enable when the plan exposes it. Performance advisors report only unused-index informational notices expected for newly seeded, low-traffic tables; no unindexed foreign-key notices remain.

Profile authorization columns are not directly writable by authenticated clients. Role assignment must use the audited RPC, while the separate grade-scan approval RPC runs with caller permissions and saves bounded, enrolled-student rows in one transaction.

See [../src/platform/ROLE_MATRIX.md](../src/platform/ROLE_MATRIX.md) for authorization semantics and [../SETUP.md](../SETUP.md) for deployment configuration.

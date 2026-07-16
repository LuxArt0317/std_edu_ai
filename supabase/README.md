# STU Nexus Supabase

This folder contains the production database contract for the CRM. The migration creates normalized student-success, service, admissions, campaign, knowledge, and privacy-minimized AI audit data, with RLS enabled on every exposed table.

Apply it to the intended Supabase project with `supabase db push` after linking the CLI to that project. Set staff authorization in each user's `app_metadata.role`; never use editable user metadata for authorization.

The repository's configured Supabase project was not available through the connected account during implementation, so the CRM currently uses its persistent local continuity adapter until this migration is applied and the data adapter is switched on.

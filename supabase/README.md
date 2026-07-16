# STU Nexus Supabase

This folder contains the deployed production database contract for the CRM. The migrations create normalized student-success, service, admissions, campaign, knowledge, and privacy-minimized AI audit data, with RLS enabled on every exposed table.

The production project is `stu_edu_ai` (`zhcchldvgqrkfqoknewk`). Schema changes are applied through reviewed migrations and verified with Supabase security and performance advisors. Set staff authorization in each user's `app_metadata.role`; never use editable user metadata for authorization.

The initial owner account has been provisioned and the one-time bootstrap RPC is locked. New staff accounts must be created through a trusted Supabase administrative workflow and assigned one of `admin`, `advisor`, `admissions`, `support`, or `faculty` in `app_metadata`.

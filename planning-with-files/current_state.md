# Current client state

Issue #74 is complete: unified transactional School OS published at https://stdeduai.vercel.app. Vercel deployment 8VJNpQEEaUR3gVMyFfQ5hj4DzqSD is Ready for code commit 64ebf127263e9335a4b5e370c7e6f19e5f90924e. Independent GitHub quality workflow 41321537236 passed. Final documentation follows this verified runtime release.

`/login` owns sign-in/password screens; `/app` owns the protected dashboard with section URLs, browser history and direct links. Legacy `/crm` and the existing provider recovery callback remain compatible. Versioned Vercel configuration fixes the dashboard build/dist mismatch. Original repository/database and all server permissions are unchanged.

Verified: 170 API/source checks, 11 units, all 32 E2E scenarios across full/focused runs, ten public accessibility states, build/assets/docs, zero dependency vulnerabilities and production owner/browser/backend checks. Auth QA fixed password labeling and logout redirects. Live production verified 27 recursive assets on five entry paths, APIs, RLS/storage, both account functions and OpenAI-backed QA. Lint passes with inherited warnings.

Final isolated fixtures and 13 QA accounts removed. Independent SQL confirms one protected owner, no test-named users or orphan identities, 100 migrations and 101 public RLS tables. Credentials/raw traces remain ignored/private. Manual assistive technology, institutional approvals and email delivery remain external acceptance items.

# Current State

GitHub issue #18 is closed completed. PR #19 passed Vercel and CodeRabbit, merged as production commit `2af21a4`, and deployed as `dpl_H177E9qhzCVWmwS2JtQGEH5nZZMT`, Ready and aliased to both `stu.best` and `www.stu.best`.

Current onboarding status:

- all 14 canonical roles have a distinct six-step foundations journey
- every journey requires two detected real navigation actions and one correct role-specific scenario response
- passive views and instruction dismissal do not increase the 0–100 readiness score
- first authenticated load starts the journey automatically; users can pause, resume on another device, review, or restart from the Readiness Center
- responsive four-panel spotlight masks leave only the required control interactive and reveal sidebar targets on mobile
- progress is stored per user, trusted role, journey key, and version; action/check evidence is append-only
- users can select/insert/update only their own current-role progress and can insert—but not update/delete—their own events
- owner/admin can read institution-wide readiness; readiness never grants or changes school permissions
- 18 automated contracts, lint, the TypeScript/Vite production build, generated types, and documentation pass
- all 14 real production role accounts passed role-matched progress/event writes; owner aggregate read, student forged-role denial, and student delete denial passed
- all 14 temporary acceptance progress rows and their cascading event rows were removed
- Supabase security advisors show only the pre-existing two intentional trusted workflow functions and dashboard leaked-password notice
- Supabase performance advisors show no unindexed foreign key; newly created indexes have expected low-traffic unused notices
- production `/` and `/crm` return HTTP 200 with the recovery shell, recursively verified assets, and the compiled role-readiness bundle
- all 14 production accounts pass sequential Auth/profile checks; faculty/student RLS, protected-answer, grade-denial, schedule, and 5/5 quiz workflows pass with cleanup
- the post-deploy 14-account onboarding acceptance passed again, and all 14 temporary progress rows plus cascading event rows were removed

The blank green production incident under issue #16 is complete. PR #17 merged as commit `2370cc6`; Vercel deployment `dpl_5GpBbZQphy1Hd7bhcRXpvyaUfBaQ` is Ready and aliased to `www.stu.best`. Both `/` and `/crm` ship dependency-free recovery content, every route asset returns HTTP 200, Auth/data startup is bounded, and real faculty/student portal workflows pass. Issue #16 is closed.

The complete school operating platform under closed issue #14 remains live:

- `winsonbaring10@gmail.com` is the immutable, single protected owner
- Supabase Auth and RLS enforce owner, administrator, leadership, academic, operations, and student boundaries
- academic catalog, rosters, topics, assessments, protected answers, transactional scoring, grades, schedules, announcements, CRM, persistent chat, and human-reviewed AI grade scans are live
- one confirmed production identity exists for every canonical role; generated credentials remain only in the local macOS keychain for service `www.stu.best`
- the owner-only non-owner provisioning Edge Function and audited role assignment flow remain active
- the sign-in directory is `src/platform/ROLE_ACCOUNTS.md`; no password is stored in the repository or documentation

Production services:

- Supabase project `stu_edu_ai` (`zhcchldvgqrkfqoknewk`) is active in `ap-northeast-1`
- Vercel Production and Preview contain only the browser-safe Supabase variables; OpenAI remains server-only
- `/crm` uses live Supabase Auth/data and exposes the original Student 360/CRM inside the unified role-aware portal
- the public STU homepage clone remains available at `/` with its additive research-driven AI drawer
- portal purpose, workspaces, AI boundaries, and safe seed-data status are documented in `src/crm/PORTAL_GUIDE.md`

No implementation or release work remains for issue #18. The platform is production-ready for users to sign in at `/crm` and begin the role-specific journey.

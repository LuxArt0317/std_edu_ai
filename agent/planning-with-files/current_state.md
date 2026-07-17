# Current State

GitHub issue #28 is closed completed. PR #29 passed Vercel and CodeRabbit and merged as commit `ef70241`. `docs/STU_Nexus_Comprehensive_Platform_Manual.docx` is a 31-page combined functional reference, role handbook, user guide, technical manual, security/AI boundary, deployment runbook, troubleshooting guide, and production-readiness roadmap. It documents the public website, school operating system, CRM, all 14 canonical roles, workflows, and how-to procedures without including credentials. The tracked builder produces 437 paragraphs, 129 structured headings, and 17 fixed-geometry tables. Microsoft Word rendering and visual inspection covered all 31 pages; a second render confirmed corrected contents pagination and independently restarting procedures. The accessibility audit reports zero findings.

GitHub issue #26 is closed completed. PR #27 passed Vercel and CodeRabbit and merged as commit `2da1aed`. All 14 existing production role identities pass live password authentication, trusted Auth role metadata, protected-owner claim, and RLS-visible profile verification. No duplicate accounts or credential rotations were needed. The requested `PRODUCTION_ROLE_CREDENTIALS.local.md` exists in the root with 14 verified entries, is explicitly ignored by Git, and has owner-only mode `0600`. The exporter writes atomically only after every account passes and prints no password. All 19 contracts, lint, and the guarded production build pass.

GitHub issue #24 is closed completed. PR #25 passed Vercel with no review threads and merged as production commit `633c931`. Role onboarding is disconnected from `UnifiedPortal` for every account: there is no component import or mount, no automatic progress load/create, no persistence effect, no action/reveal state, no target attributes, and no Readiness/tour UI. Implementation files, migrations, RLS policies, and historical rows remain intact for a deliberate future re-enable.

The guarded build and live diagnostic reject onboarding UI markers while the shutdown is active. All 19 contracts, lint, guarded local/Vercel builds, and the hosted preview pass. Production deployment `dpl_FNT89h5EATXXQx53aq9V6fus5yQb` is Ready on both custom domains. The released CRM JavaScript fell from 336.78 KB to 307.00 KB and contains neither UI markers nor `onboarding_progress`/`onboarding_events` strings. Live `/` and `/crm` diagnostics return HTTP 200, verify six recursive assets and CRM styling, and report `onboardingDisabled: true`.

GitHub issue #22 is closed completed. PR #23 passed Vercel with no review threads and merged as production commit `545efc7`. The original production failure was a Vite 8.1.4 dependency association from a route-dependent lazy callback: `/crm` returned HTTP 200 and rendered its complete Auth DOM while loading only the public App CSS. The live production diagnostic detects this failure mode directly.

The released fix gives CRM and the public site distinct statically analyzable lazy boundaries, adds border-box and viewport-bounded mobile sizing to the Auth card, and makes the standard build run a semantic asset-graph verifier. Production deployment `dpl_9HYcdDSXtQPEZzR3jdVexAYMSQf7` is Ready and aliased to both custom domains. All 19 contracts, lint, guarded local/Vercel builds, hosted semantic gate, and protected preview assets pass. Live `/` and `/crm` diagnostics return HTTP 200, verify six recursive assets, and report `crmAuthStyles: true`; actual production desktop and 390×844 captures show the complete centered STU Nexus card with no horizontal overflow.

GitHub issue #20 is closed completed. PR #21 passed Vercel with no review threads and merged as production commit `0048d45`. Repository-level Vercel framework, install, build, and output overrides have been removed; the only remaining `vercel.json` behavior is the SPA rewrite required for direct `/crm` navigation. The custom `vercel-build` alias is gone, and package metadata plus the lockfile now select Node.js `24.x`.

The linked Vercel project reports Node.js `24.x` and its detected Vite defaults: package-manager install, `npm run build`/`vite build`, and `dist`. Under local Node.js 24.12.0 and npm 11.6.2, clean install, all 18 contracts, lint, TypeScript/Vite production build, and `vercel build --prod` pass. The generated `.vercel/output/config.json` identifies Vite 8.1.4 and contains the direct-route rewrite. Production deployment `dpl_ECCAjgYr1EvCMnnbKAE2p6JJSw29` is Ready and aliased to `stu.best` plus `www.stu.best`; its log proves the 22-to-24 runtime transition and standard install/build path. Both production routes return HTTP 200 with the recovery shell, five recursively verified assets, and the onboarding bundle.

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
Issue #30 is in release verification. Academic Office now supports student account/SIS creation, departments, programs, terms, subjects, sections, capacity-aware rosters, and conflict-safe schedule events. The production Supabase migration and JWT-protected Edge Function are active. All 22 contracts, all-role account checks, owner/faculty/student RLS tests, reversible enrollment, room-conflict rejection, lint, standard build, and Vercel production build pass. Remaining work: commit, PR checks, merge, Vercel production verification, then close issue #30.

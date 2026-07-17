# Current State

# Active implementation: Issue #48

- `needed.md` is the authoritative 14-role action, entity lifecycle, controlled-transition, and Nexus boundary contract.
- The protected Owner now has a visible People & Roles account-provisioning form for every non-owner role, using the existing owner-only Edge Function and a locally generated 28-character temporary password that is never persisted.
- Role assignment now requires an impact preview, a 12–500 character reason, explicit confirmation, session-refresh notice, and the existing immutable database audit workflow.
- People & Roles now provides protected-owner-safe activate, suspend, archive, and restore controls backed by Supabase Auth bans and a RLS-protected immutable lifecycle audit. A reversible live test proves suspension blocks a real student acceptance account login and activation restores it.
- Catalog/UI/repository contracts, all 38 API tests, lint, the TypeScript/Vite build, guarded asset verification, production migration/function deployment, and live lifecycle acceptance pass. Remaining catalog gaps stay tracked in Issue #48 and the monolithic plan; the issue is intentionally open until every mapped action and production role test is complete.

# Current release: Issue #46

- Nexus AI now proposes typed, confirmation-gated actions for role-valid navigation, modules, materials, rich material pages, quizzes/exams/assignments/projects, announcements, attendance sessions, schedule events, and student-owned learning progress.
- Trusted `app_metadata.role` determines the server allowlist; the client independently revalidates role, current visible target IDs, and destination access before invoking the ordinary repository under the signed-in user's RLS session.
- Students can navigate and mark their own learning materials in progress/completed. Nexus cannot answer, complete, modify, grade, or submit assessed work for a student; this is blocked in model instructions, API output filtering, the UI executor, RLS, and tests.
- Production `ai_audit_logs` accepts privacy-minimized `action` outcomes without storing prompts or payload values.
- 34 contracts, lint, TypeScript/Vite build, guarded asset verification, live OpenAI faculty action proposal, and live student assessed-work denial pass.
- PR #47 passed CodeRabbit and Vercel, merged as `1c8dab8`, and deployed Ready as `dpl_HEEw9bLnaf5QwP828Xsh3P776KQp`. Both custom-domain routes return HTTP 200 and the released CRM bundle contains the new action and denial contracts.

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
Issue #30 is complete. Academic Office supports student account/SIS creation, departments, programs, terms, subjects, sections, capacity-aware rosters, and conflict-safe schedule events. PR #31 merged as `f561155`; the production Supabase migration and JWT-protected Edge Function are active; Vercel production is Ready. All 22 contracts, all-role account checks, owner/faculty/student RLS tests, reversible enrollment, room-conflict rejection, lint, build, and released `/` and `/crm` diagnostics pass.
Issue #33 is complete. PR #34 merged as `87204bd`; Vercel production is Ready. The integrated LMS schema/private Storage, teacher course studio, and student learning path are live. All 26 contracts, lint, guarded/standard builds, advisor review, released route diagnostics, and the reversible real-faculty/student LMS lifecycle pass.

# Current release: Issue #36

- Branch `agent/instant-navigation` now contains instant authenticated portal restoration with silent refresh, confirmation-gated Nexus AI LMS actions, Tiptap lesson authoring, rich learner reading, and the Learner Support rename.
- Local verification passes: 26 tests, oxlint, TypeScript, Vite production build, and built-asset validation.
- PR #37 passed GitHub/Vercel review checks, merged to `main`, and deployed Ready to `https://www.stu.best/crm`.
- Production returns HTTP 200; the released lazy bundle contains the Learner Support, AI confirmation, and Tiptap editor contracts; the assistant endpoint correctly rejects unauthenticated requests with HTTP 401.

# Current release: Issue #38

- Production CRUD failure isolated to incomplete CORS headers on browser-invoked Supabase Edge Functions.
- `manage-student-account` and `provision-role-account` version 2 are ACTIVE with `x-client-info` allowed and both production origins recognized.
- Production preflight, authenticated owner invocation/validation, role denial, reversible enrollment/schedule operations, and the complete reversible LMS workflow pass.
- PR #39 passed GitHub/Vercel checks, merged to `main`, and deployed Ready. `https://www.stu.best/crm` returns HTTP 200 with the new production entry bundle.
- Issue #38 is closed; no unresolved CRUD failure was found in the reversible Academic Office and LMS workflow audits.

# Current release: Issue #40

- School OS and Learner Support now remain mounted; navigation only changes visibility, so returning never recreates either workspace.
- CRM data warms after authentication, restores synchronously from memory, deduplicates background loads, and clears on sign-out.
- Verification passes: 28 tests, lint, TypeScript/Vite production build, and built-asset validation.
- PR #41 passed GitHub/Vercel checks, merged to `main`, and deployed Ready. The custom production domain serves the new entry/CRM bundle and `/crm` returns HTTP 200.
- Issue #40 is closed; School OS ↔ Learner Support switching no longer causes workspace remounting or repeat loading.

# Current release: Issue #42

- Production Supabase now has the rich-content page schema and managed instructional-image Storage/RLS.
- Application implementation includes multi-page Tiptap lessons, image upload, rich student reading, knowledge CRUD, and live CRM metrics.
- All 29 contracts pass, including reversible live production checks for teacher authoring, student reading, and student write denial.
- PR #43 passed CodeRabbit and Vercel checks, merged to `main`, and deployed Ready. `https://www.stu.best/crm` returns HTTP 200 and serves the verified rich-content CRM bundle.
- Issue #42 is closed; no release work remains for this phase.

# Current release: Issue #44

- `PRODUCT_REQUIREMENTS.md` is the authoritative role, lifecycle, rich-content, AI, security, UX, and production acceptance specification.
- Visible pre-filled editors now cover academic structure, students, teacher/staff profiles, schedules, modules, multi-page materials, assessments/questions/choices/keys, grades, attendance, announcements, CRM students, cases, prospects, campaigns, tasks, signals, interactions, and knowledge.
- Production Supabase has atomic pre-attempt assessment replacement, complete authorized CRM deletion grants, and managed institutional rich-image Storage.
- All 32 contracts, lint (one existing hook advisory), TypeScript/Vite production build, reversible LMS/academic/CRM live workflows, and cleanup pass.
- PR #45 passed CodeRabbit and Vercel, merged as `32ef675`, and deployed Ready as `dpl_Df6sucy57jq4Hr1kazB6LkixE3AX` to both custom domains.
- `https://www.stu.best/crm` returns HTTP 200 and its released CRM bundle contains the assessment, student, profile, grade, prospect, interaction, signal, and multi-page material editor contracts.
- Issue #44 is closed; no release work remains for this phase.

# Current State

# Active implementation: Issue #60

- The completed Issue #58 repository hooks and hook documentation have been removed at the user's request.
- Nexus now has a bounded goal state machine: up to eight steps and five minutes, one action per reasoning turn, real action observations, automatic authorized navigation, per-mutation confirmation, cancellation, repeated-action detection, and explicit complete/impossible terminal states.
- The OpenAI endpoint returns a strict agent decision and fails closed when `working` has no role-permitted action. The browser never receives provider or service-role credentials; all writes still use the signed-in Supabase session and ordinary RLS-protected repository services.
- Successful module/material creation returns its real record ID for dependent follow-up steps. The CRM shows goal, status, step count, observations, pending review, cancellation, and terminal reason.
- 55 contracts, lint, the standard Node 24 production build, semantic asset verification, and the live faculty/student Nexus boundary test pass.
- PR #61 passed CodeRabbit and Vercel with no review threads and merged as `efc8f37`. Production deployment `dpl_Eq1RARBXEkQi4KTpU9xQjMi4tyUb` is Ready and explicitly aliased to `stu.best` plus `www.stu.best`.
- Recursive production diagnostics return HTTP 200 for `/` and `/crm`, verify six assets and the CRM authentication stylesheet, confirm onboarding remains disabled, and find the released `ACTIVE GOAL` and `Cancel goal` markers in `CRMRoot-CuE5RTVt.js`. Issue #60 is complete.

# Active implementation: Issue #48

- All 401 actionable `needed.md` requirements are now mapped to visible UI, repository operations, trusted Supabase authorization/RLS, controlled evidence, and automated/live verification.
- The former seven explicit gaps are complete: first-login password replacement, account email/phone synchronization, accepted-applicant Registrar handoff, sensitive-case access evidence, bulk campaign approval/delivery, and explicit permanent-deletion denial.
- Production also has scoped department staff editing, institutional initiative transitions, Registrar exports, all-role RLS alignment, assessment availability/attempt/release controls, governed explanation reads, and governed held-score history.
- Verification passes: 44 contracts, lint, TypeScript/Vite build, semantic assets, all 14 production identities, 65 required role reads, 70 controlled authorization decisions, 14 account-boundary checks, faculty/student RLS and quiz scoring, academic operations, LMS, held-score privacy, and cleanup.
- PR #55 passed CodeRabbit and Vercel with no review threads, merged as `c454e4c`, and deployed Ready as `dpl_G2kMBddcg4F2sRxRaUxpoAdo16c2`.
- Production `/` and `/crm` return HTTP 200 with the released entry, recovery shell, six recursively verified assets, CRM authentication stylesheet, and onboarding disabled. `stu.best/crm` canonicalizes to the verified `www.stu.best/crm` route.
- Every Phase 48 gate is complete; Issue #48 can now be closed.

- Controlled student withdrawal/merge, program archival, enrollment completion/status changes, and submission return/void are deployed in production Supabase and wired into Academic Office and Teacher Studio with reasoned immutable evidence.
- Notifications and approved communications are now implemented in production Supabase and the portal: recipient-only notices, read state, student-to-authorized-staff requests, support/admin approval or rejection, delivery, and immutable action evidence.
- `needed.md` is the authoritative 14-role action, entity lifecycle, controlled-transition, and Nexus boundary contract.
- The protected Owner now has a visible People & Roles account-provisioning form for every non-owner role, using the existing owner-only Edge Function and a locally generated 28-character temporary password that is never persisted.
- Role assignment now requires an impact preview, a 12–500 character reason, explicit confirmation, session-refresh notice, and the existing immutable database audit workflow.
- People & Roles now provides protected-owner-safe activate, suspend, archive, and restore controls backed by Supabase Auth bans and a RLS-protected immutable lifecycle audit. A reversible live test proves suspension blocks a real student acceptance account login and activation restores it.
- People & Roles now also loads real Auth last-sign-in activity, supports bulk non-owner provisioning, rotates temporary credentials, explicitly revokes refresh sessions, and shows the resulting immutable access audit. Students can open and track support requests linked only to their own SIS identity.
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

# Active release: Issue #56 Stitch workflow UI/UX

- Official Stitch MCP is connected to the private `Shu-Te AI Smart Campus` project and its existing design system; 12 teacher, student, identity, admissions, campaign, and case screens were generated.
- Generated HTML controls were audited against `needed.md`; Stitch remains an ideation layer while real repository services, role authorization, and RLS remain authoritative.
- The authenticated `/crm` LMS and account-directory workflows now expose clear open/preview/edit/delete/manage actions, student next-lesson progression, accessible focus states, and 44px action targets. The public `/` landing page is unchanged.
- All 48 contracts, lint, standard production build, 14-account verification, 14-role action/boundary matrix, faculty/student role checks, and reversible LMS workflow pass.
- PR #57 passed Vercel Preview and CodeRabbit, merged as `8c7c130`, and deployed Ready as `dpl_8qKDB5r5j2NQYaC7miqeC51X9CFP`. Both custom-domain routes, recursive assets, and released workflow markers pass production diagnostics. Issue #56 is complete.

# Active release: Issue #58 all-page Stitch UI/UX

- The official private Stitch project/design system now contains a fresh generated screen for each of 23 CRM surfaces: authentication, shell, every School OS page/role variant, all eight Learner Support workspaces, Notifications, and Nexus AI.
- Every generated HTML artifact returned HTTP 200 and its controls were extracted and audited. The implementation follows Stitch's stronger hierarchy while retaining required platform actions that Stitch omitted or rendered ambiguously.
- Shared page context/framing, accessibility semantics, password recovery, working Learner Support shortcuts, and real section export are implemented without modifying `src/App.tsx` or the public `/` design.
- All 52 contracts, lint, standard production build, 14-account verification, 14-role action boundaries, reversible LMS, and reversible academic operations pass.
- PR #59 passed CodeRabbit and Vercel Preview, merged as `99acb34`, and deployed Ready as `dpl_GGMBaMex7QxWRzmmEFn7SYPhuECr`. Both routes, recursive assets, and all six release markers pass. Issue #58 is complete.
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
# Active release: Issue #80 compact Nexus card sizing

- The compact goal card and activity row now have explicit intrinsic sizing, zero minimum height, strict compact maximums, and single-line activity truncation. This directly fixes the oversized empty thinking panel shown in production.
- All 78 contracts, lint, build, and assets pass. PR #81 merged as `1849406`; Vercel production is Ready and the released stylesheet contains the 150px/42px constraints. Issue #80 is complete.

# Active release: Issue #78 autonomous, resumable Nexus goals

- Nexus now carries an explicit end-to-end plan, remaining work, and optional clarification through every API decision. It cannot report completion while remaining work exists.
- Broader authoritative context is supplied before questions. A genuine question appears as a compact option card; typed or selected answers resume the same run.
- The goal card is compact by default, Details reveals plan/evidence, and closing the drawer continues to preserve active work.
- Live OpenAI verification produced `create_department → create_program` across two decisions and `needs_input → create_program` after clarification. All 78 contracts, lint, TypeScript/Vite build, and assets pass. PR #79 merged as `064faa8`; Vercel production is Ready and custom-domain markers pass. Issue #78 is complete.

# Active release: Issue #76 schema-wide action completeness v2

- `neededv2.md` inventories all current production schema domains and required actions, role boundaries, immutable evidence, archive transitions, and cross-cutting usability requirements; no required item is left unchecked.
- Academic Office exposes a structured curriculum editor and separate-version action. Draft content is atomic and editable; approved curricula are immutable except retirement.
- Production Supabase has both lifecycle migrations. The reversible live workflow passed atomic create, rollback, retry, edit, approval, unsafe-edit rejection, retirement, audit evidence, and cleanup.
- All 75 contracts, lint, TypeScript, Vite production build, and asset validation pass. PR #77 merged as `c0d8cae`; Vercel production is Ready and the custom-domain bundle serves every Issue #76 marker. Issue #76 is complete.

# Active release: Issue #74 connected academic relationships

- The complete production schema is mapped in `docs/PLATFORM_SCHEMA_MAP.md`; the authoritative academic chain is Department → Program → Curriculum → Curriculum Subject → Subject → Class → Enrollment → Student.
- Production Supabase now has an indexed `students.program_id` foreign key. All four existing students were backfilled, no student remains unlinked, and student provisioning Edge Function version 3 is ACTIVE.
- Academic Office is program-centered and exposes curriculum origin, related subjects/classes/staff/students, relationship-health diagnostics, contextual creation/editing, and class-aware transitions into all instructional workspaces.
- All 73 contracts, lint, TypeScript, Vite production build, and built-asset verification pass. PR #75 merged as `7234ac0`; Vercel production is Ready and the custom-domain CRM serves the connected relationship markers. Issue #74 is complete.

# Current release: Issue #48 controlled workflows

- Production Supabase now contains relational department/program/class responsibilities, attendance correction requests, and immutable controlled-action evidence.
- Final grade publication, post-publication correction, term closing, and attendance decisions are authorized reasoned RPC transitions rather than direct CRUD.
- People & Roles includes institutional invite/resend, role capability configuration, and visible responsibility review. Edge Function version 5 is ACTIVE with JWT verification.
- TypeScript, lint, production build, asset validation, and production diagnostics pass. PR #51 merged as `012cd53`; Vercel deployment `dpl_Cf49oiwdYtcM2KRwDi73KtwFM3zh` is Ready and both custom-domain routes return HTTP 200 with the released bundle. Issue #48 remains open for the remaining catalog-wide evidence pass and controlled transitions not yet represented by this slice.

# Active release: Issue #62 bulk curriculum goals

- Nexus no longer depends on WebKit-sensitive `crypto.randomUUID()` during goal startup, and chat persistence failures are visible but non-blocking.
- Authorized academic leaders receive a strict `create_curriculum` action with a full preview and one confirmed, security-invoker Supabase transaction.
- Production schema, RLS, Academic Office Curriculum Library, and the user's representative BSCS prompt are implemented. The live model produced 50 subjects and eight blocks; atomic create, rollback, idempotent retry, cleanup, 58 contracts, lint, and build pass.
- PR #63 passed Vercel checks, merged as `b624417`, and deployed Ready as `dpl_5C9Q6qABcbw6QuEybffVLRh632ns`. Both custom domains pass recursive asset and released curriculum-marker diagnostics. Issue #62 is complete.

# Active release: Issue #64 owner authorization and stable tabs

- Nexus client confirmation now uses the trusted signed-in role; owner interface preview no longer downgrades action authorization.
- Repeated same-owner token refresh/sign-in events preserve the mounted portal and never enter the blocking identity-loading state. Genuine sign-out, recovery, user updates, and account changes still propagate.
- The protected production owner claim is verified, live OpenAI generated 40 curriculum subjects and eight blocks for that owner, and all 60 contracts, lint, TypeScript, Vite build, and asset verification pass.
- PR #65 passed CodeRabbit/Vercel, merged as `72639bc`, and deployed Ready as `dpl_3tzKLuQzpoqeWk9bTDDWShtdUNFU`. Both custom domains pass recursive assets and the released stable-auth markers. Issue #64 is complete.

# Active release: Issue #66 Nexus Enter-to-send

- Nexus submits the existing form on non-composing Enter, retains Shift+Enter for new lines, and displays the shortcut beside the send control.
- All 61 contracts, lint, TypeScript, Vite build, and asset verification pass. PR #67 merged as `aaf598a`; production deployment `dpl_5QuWofnyhqoPNNsdWrTvqZGiAAdQ` and both custom domains pass the released Enter-to-send marker. Issue #66 is complete.

# Active release: Issue #68 curriculum department resolution

- Curriculum confirmation independently validates the structured plan and resolves its owning department from active Academic Office data.
- A valid generated department is retained, the sole active department is automatic, and multiple departments produce an explicit required selector instead of a terminal model-data error.
- All 62 contracts, lint, TypeScript, production build, asset verification, and live atomic create/rollback/idempotency/cleanup pass. PR #69 merged as `ae5b874`; deployment `dpl_EVhJjgZUKGFQYAdu4yEJkCUCLpvi` and both custom domains pass the department-resolution markers. Issue #68 is complete.
# Active release: Issue #70 Nexus platform tools

- Nexus now exposes confirmation-gated academic setup, curriculum, LMS, assessment maintenance, schedule, communication, support, attendance-correction, and institutional-initiative tools through existing production repositories and Supabase authorization.
- Department creation returns its real ID; the assistant reloads platform data after each successful mutation so dependent goals such as department then curriculum can continue safely.
- The API and client independently filter tools by the trusted signed-in role. Credentials, owner replacement, direct role changes, final-grade publication, binary uploads, and student assessed work remain deliberate human-only boundaries.
- All 66 contracts, lint, TypeScript, Vite production build, asset verification, and the live owner/faculty/student model workflow pass. PR #71 merged as `bedc88b`; production deployment `dpl_FH7gZMMjm6UQ1W34KEkPBGG3hP8Y` is Ready and `https://www.stu.best/crm` serves the released tool markers.
# Active release: Issue #72 Nexus conversation continuity

- Nexus restores the last-used valid thread, falls back to the most recently updated conversation, and opens at the newest rendered message without stealing the scroll position from someone reading older messages.
- The goal card now shows named action outcomes and explicit thinking, execution, refresh, confirmation, completion, and stopped phases. The eight value is labelled as a safety limit rather than mandatory steps.
- Closing the drawer leaves the assistant mounted and the run active; the floating Nexus control displays background, confirmation, complete, or attention status.

# Active work: Issue #82 compact Nexus popup and corrected proposals

- Nexus is now a bottom-right, non-blocking 390px chat popup; it has no fullscreen hit area, backdrop, or page blur.
- Goal and runtime activity render as a collapsed assistant reply inside the conversation. Clarification remains a focused assistant question with quick answers.
- Review supports confirm, cancel, or a correction comment that resumes the same goal. Invalid proposal parameters are rejected before review and automatically replanned.
- Quiz/exam actions now carry complete question payloads through the structured API contract into the atomic LMS assessment RPC.
- PR #83 merged as `2dabf9c`; Vercel production deployment `dpl_2P8MjjRVCcjK2AMW8fwYMuuzGtaA` is Ready. The custom-domain CRM returns HTTP 200 and serves the popup, correction, and validation markers.

# Active work: Issue #84 unified role-aware calendar

- The Schedule workspace now composes explicit schedule events, assessment deadlines, attendance sessions, module releases, standalone grade deadlines, assigned institutional work, enrollment windows, and term boundaries.
- Month, week, and agenda modes include navigation, filters, today/importance summaries, compact event details, source/scope labels, and responsive behavior.
- Production schema inspection confirmed personal (`owner_profile_id`), class (`section_id`), and role (`audience_roles`) targeting with separate SELECT/INSERT/UPDATE/DELETE RLS policies. No duplicate calendar table or new permissive view is needed.
- PR #85 merged as `ecb9338`; production deployment `dpl_6X7sArLP8F7d2qWihderHyQRzzMY` is Ready. `stu.best/crm` returns HTTP 200 and serves the released month-grid, filter, and event-detail markers.
- All 70 contracts, lint, TypeScript, Vite production build, and asset verification pass. PR #73 merged as `710d6df`; deployment `dpl_4x6t7wRiLWaqpgwBoWAoSu8hmRZt` is Ready and the custom domain serves the last-thread, background-activity, and safety-limit markers.

# Active work: Issue #86 governed knowledge and reliable Nexus revisions

- Knowledge contributions now preserve contributor, origin, linked event/class, audience, reviewer, and review context. Personal, class, and campus events are supported sources.
- RLS permits authorized staff contributions, routes non-publishers through review, and reserves verification/publication for platform owners, administrators, and librarians. Nexus receives only verified RLS-visible knowledge.
- Nexus quiz actions now use the database's one-based answer positions, corrections must change the semantic proposal, execution errors become retry observations, and replies use a consistent profile identity.
- Both production Supabase migrations are applied. Security advisors report no knowledge-specific finding; covering indexes resolve the new foreign-key performance findings.
- All 89 contracts, lint, TypeScript, Vite build, asset verification, and live Nexus quiz correction checks pass. PR #87 merged as `f887c10`; Vercel production is Ready and the custom-domain recursive asset graph serves every released knowledge, avatar, and correction marker.

# Active work: Issue #88 immersive LMS, integrity controls, and schedule export

- Lesson create/edit/preview now uses a full-width course studio. Every page supports repeated multi-image uploads plus uploaded MP4/WebM/MOV and safe YouTube/Vimeo/direct HTTPS video nodes inside the document flow.
- Enrolled learners retain course/page/progress context and can expand the active lesson into an immersive wide reader.
- Objective assessments now support teacher-selected post-attempt review and disclosed fullscreen, focus, extended-display, camera, multiple-camera, and clipboard checks. Preflight limitations are explicit; camera media is never stored; append-only signals are RLS-scoped and available in a teacher integrity log.
- Students can configure and download a high-resolution STU-branded PNG timetable with theme, rooms, deadlines, and weekend options.
- Both production Supabase migrations are applied. Schema, RLS insert/rollback, reviewed-answer disclosure, security advisors, FK indexes, 92 contracts, lint, build, and the live LMS workflow pass. GitHub review and production deployment remain.

# Progress

## 2026-07-18 — Issue #48

- Created Issue #48 and added Phase 48 to the monolithic plan.
- Published `ROLE_ACTION_CATALOG.md` with all 14 accounts, every domain entity, controlled actions, student personal-assessment rights, student Nexus prohibitions, and an evidence-based definition of done.
- Added visible protected-owner general non-owner account provisioning to People & Roles.
- Replaced immediate dropdown role mutation with impact review, mandatory reason, explicit confirmation, session refresh notice, and audited execution.
- Added role/catalog/provisioning/governance source contracts.
- Promoted the user-authored `needed.md` to the authoritative action contract and linked tests and project documentation to it.
- Added account status fields and immutable lifecycle audit storage with RLS, explicit grants, and production migration deployment.
- Extended the protected-owner Edge Function and People & Roles UI with reason-confirmed activation, suspension, archival, and restoration while preventing owner mutation.
- Added a visible combined account/role governance feed and generated database types.
- Passed 38 contracts, lint, TypeScript/Vite build, guarded asset verification, zero new Supabase advisor findings, and a reversible production test proving suspension blocks login and activation restores it.
- Added real owner account activity, bulk provisioning, credential rotation, explicit session revocation, and access audit workflows; deployed the session migration and Edge Function v4.
- Added student self-service support request creation/status tracking with own-record RLS and deployed the production policy migration.

## 2026-07-18 — Issue #46

- Created GitHub issue #46 and Phase 46 in the monolithic task plan.
- Reviewed the existing OpenAI Responses structured-output endpoint, portal repository services, role model, Supabase RLS guidance/changelog, and current OpenAI function-calling guidance.
- Expanded the authenticated assistant context with bounded visible material, assessment, schedule, and announcement IDs.
- Added typed navigation, module, material, page, assessment, announcement, attendance, schedule, and learner-progress actions.
- Added server role allowlists plus a student-only navigation/progress catalog and an explicit assessed-work prohibition.
- Added client role/target/destination revalidation, confirmation-only execution, success persistence, and privacy-minimized action auditing.
- Applied the production `nexus_agent_action_audit` migration and verified its constraint through Supabase MCP.
- Added two API security contracts and a live production-identity OpenAI test proving faculty action proposal and student assessed-work denial.
- Passed 34 contracts, lint, TypeScript/Vite build, asset verification, and the live Nexus agent role test.
- PR #47 passed CodeRabbit and Vercel, merged, and deployed Ready to production.
- Custom-domain diagnostics passed for `/` and `/crm`; recursive bundle inspection confirmed the learner-progress, rich-page, schedule-action, and client role-denial markers.

## 2026-07-18 — Issue #48 controlled workflows slice

- Audited `needed.md` against the portal repository, Supabase schema/RLS, Edge Functions, and visible controls.
- Applied production migrations for responsibility assignments, controlled academic transitions, attendance corrections, lifecycle-safe request uniqueness, and advisor-driven index/policy optimization.
- Deployed `provision-role-account` version 5 with institutional invitation and resend operations.
- Added UI/repository workflows for role capability configuration, assigned responsibilities, audited grade publication/correction, term closure, and attendance correction request/decision.
- TypeScript, oxlint, Vite build, and semantic asset verification pass.
- PR #51 passed CodeRabbit and Vercel, merged as `012cd53`, and deployed Ready as `dpl_Cf49oiwdYtcM2KRwDi73KtwFM3zh`; custom-domain diagnostics pass on `/` and `/crm`.

## 2026-07-18 — Issue #48 execution continuity

- Added project-scoped Codex `SessionStart` and `Stop` hooks backed by a dependency-free completion guard.
- The guard reads only Phase 48 of the monolithic plan, injects every remaining gate on start/resume, and blocks completed handoff while any gate is unchecked.
- Hook JSON, valid-catalog behavior, session context, and four-gate Stop denial were verified locally.

## 2026-07-18 — Notifications and approved communication

- Applied the production communication migration with participant RLS, staff approval, recipient-only notification delivery, and immutable controlled audit evidence.
- Added the portal notification center, live unread count, read/unread actions, approved contact form, and support/admin decision queue.
- Generated current production database types; TypeScript and Supabase advisor checks pass with no missing foreign-key indexes or duplicate permissive policies.

## 2026-07-18 — Controlled institutional records

- Applied production commands for student withdrawal, student record merge lineage, guarded program archival, reasoned enrollment transitions, and submission return/void.
- Added visible Registrar and Teacher controls for each transition and removed direct program deactivation from ordinary CRUD.
- All commands require fresh role authorization and a reason and write immutable before/after controlled-action evidence.

## 2026-07-18 — Catalog-wide completion gate

- Added a dependency-free `needed.md` verifier to the normal test command. It parses every actionable catalog bullet and requires visible UI, repository, database/RLS, and audit anchors for its evidence domain.
- Added explicit gates for the high-risk actions that cannot be accepted through broad domain evidence.
- The first complete run mapped the catalog and correctly failed on seven remaining gaps: first-login password change, complete identity editing, accepted-applicant conversion, Registrar handoff, sensitive-case access audit, bulk campaign approval/send, and permanent-deletion denial.
- Issue #48 remains open and the durable completion guard remains active; none of the four Phase 48 gates has been checked prematurely.

## 2026-07-18 — Catalog-wide production completion

- Implemented the seven explicit gaps found by the catalog gate plus institutional initiative lifecycle, Registrar exports, all-role RLS alignment, scoped department edits, assessment availability/release settings, and non-destructive CRM retention.
- Deployed ten completion migrations, `provision-role-account` v8, and the additional governed assessment-result migration to production Supabase.
- Added 44 source contracts and a live 14-role evidence matrix covering 65 required reads, 70 controlled authorization decisions, 14 Auth-directory boundaries, protected keys, governed explanations, and held-score privacy.
- Verified all 14 production identities, faculty/student RLS and scoring, reversible academic operations, reversible LMS operations, atomic grade scans, lint, TypeScript, Vite production build, and the semantic asset gate.
- Supabase advisors report only intentional trusted workflow warnings, the dashboard leaked-password-protection warning, and expected unused-index informational notices.
- Issue #48 remains open until the branch is reviewed, merged, deployed, and the custom domains pass post-release diagnostics.
- PR #55 passed CodeRabbit and Vercel with no review threads and merged as `c454e4c`.
- Vercel production deployment `dpl_G2kMBddcg4F2sRxRaUxpoAdo16c2` is Ready; `/` and `/crm` pass recursive asset, recovery-shell, stylesheet, and onboarding-disabled diagnostics on the custom domain.
- Marked every Phase 48 gate complete after production evidence, not before it.

## 2026-07-18 — Stitch workflow UI/UX

- Connected the official Stitch MCP to the existing private STU project/design system and generated 12 workflow screens across teaching, learning, accounts, admissions, campaigns, and cases.
- Inspected generated HTML button/link labels and documented included, omitted, and ambiguous controls before translating the accepted hierarchy into `/crm`.
- Added explicit lesson open/preview/edit/delete flows, first/next student lesson progression, account-management disclosure, accessible focus treatment, and consistent action targets without changing the public landing page.
- Replaced the completed Issue #48 hook with the Phase 56 evidence guard. All 48 contracts, lint, build, all-account, all-role evidence, faculty/student boundary, and live LMS checks pass.
- PR #57 passed Vercel Preview and CodeRabbit and merged as `8c7c130`. Production deployment `dpl_8qKDB5r5j2NQYaC7miqeC51X9CFP` is Ready; `/`, `/crm`, all emitted assets, and the released Stitch workflow markers pass diagnostics.

## 2026-07-18 — Stitch coverage for every CRM page

- Created Issue #58, a 23-surface page matrix, and a completion guard that refuses partial prompt/screen/control/implementation/production evidence.
- Generated separate fresh Stitch screens for authentication, the shell, all School OS pages and role variants, eight Learner Support pages, Notifications, and Nexus AI using functionality-first prompts with no prescribed layout.
- Downloaded all 23 generated HTML artifacts, confirmed HTTP 200, extracted 617 controls, and documented strong patterns plus missing/ambiguous/unsafe actions.
- Applied accepted visual hierarchy and accessibility across all CRM pages, added secure Supabase recovery, made two dead header shortcuts functional, and replaced the fake Export toast with a real download. Local and live verification pass.
- PR #59 passed CodeRabbit and Vercel Preview and merged as `99acb34`. Production deployment `dpl_GGMBaMex7QxWRzmmEFn7SYPhuECr` is Ready; `/`, `/crm`, recursive assets, and all six Phase 58 release markers pass diagnostics.
- Opened GitHub Issue #60 and branch `agent/agentic-nexus-loop`; reviewed current OpenAI Responses structured-output and Supabase RLS guidance.
- Removed the completed Issue #58 repository hooks and obsolete `.codex` documentation.
- Implemented the bounded Nexus goal loop, strict server decision schema, client progress/cancel UI, automatic safe navigation, mutation confirmation/resume, real observations, cycle/step/runtime limits, and dependent record-ID evidence.
- Added multi-step/safety contracts and updated former hook coverage; all 55 tests, lint, standard production build, asset verification, and live Nexus faculty/student boundary check pass.
- PR #61 passed CodeRabbit/Vercel without review threads and merged as `efc8f37`; production deployment `dpl_Eq1RARBXEkQi4KTpU9xQjMi4tyUb` reached Ready.
- Corrected both custom-domain aliases after diagnostics detected the prior artifact, then verified `/`, `/crm`, six recursive assets, CRM CSS, onboarding shutdown, and released goal/cancellation markers in production.

## 2026-07-18 — Reliable bulk academic goals

- Opened Issue #62 and traced the WebKit pattern exception to the new run-ID path; replaced it and isolated recoverable chat persistence from goal execution.
- Deployed the curriculum plan, subject map, prerequisite, block template, RLS, and atomic security-invoker RPC schema to production Supabase.
- Added strict model generation, full confirmation preview, repository execution, Curriculum Library visibility, and academic-role enforcement.
- The representative BSCS prompt generated 50 subjects across all four years and eight blocks. Live Supabase acceptance proved atomic rollback, eight-subject creation, seven prerequisite edges, four blocks, idempotent retry, and cleanup. All 58 contracts, lint, and production build pass.
- PR #63 passed Vercel checks and merged as `b624417`. Production deployment `dpl_5C9Q6qABcbw6QuEybffVLRh632ns` is Ready; both custom aliases now point to it and the released curriculum action, confirmation preview, and library markers pass custom-domain diagnostics.

## 2026-07-18 — Owner authorization and stable background tabs

- Opened Issue #64 and traced the owner rejection to client authorization using the interface-preview role while the server used the trusted Auth role.
- Traced command-tab reloads to repeated same-user Supabase `SIGNED_IN`/`TOKEN_REFRESHED` events replacing React session state and activating the blocking identity loader.
- Separated actor authorization from UI preview and added a session-event policy that ignores same-user refresh noise while preserving real authentication transitions.
- Verified the protected owner's trusted claim and live 40-subject/eight-block curriculum action. All 60 contracts, lint, and the standard production build pass.
- PR #65 passed CodeRabbit and Vercel, merged as `72639bc`, and deployed Ready as `dpl_3tzKLuQzpoqeWk9bTDDWShtdUNFU`. Both custom domains serve the released CRM bundle with stable-auth markers and pass recursive asset diagnostics.

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

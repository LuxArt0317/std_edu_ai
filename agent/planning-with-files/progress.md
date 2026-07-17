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

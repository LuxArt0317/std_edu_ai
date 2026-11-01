# Current client state

Issue #74: local School OS simplification builds on committed shadcn checkpoint 42820bf. Original checkout/database untouched. Working copy: std_edu_ai-luxart0317. Client database: xiftudmvxphxcjtmfmib, 100 migrations and 101 public RLS tables.

Learner Support now renders inside the single School OS sidebar/header; duplicate shell, workspace bridge and separate sign-out are removed. Direct student-service navigation preserves all modules. People & Access has active-first account search, role/status filters, 25-row pagination and a collapsed advanced policy catalog. The protected-owner banner resolves the owner profile. Trusted roles and RLS remain unchanged.

Live account inventory before QA: one Auth user, one active owner profile, zero test-named users and zero orphaned identities. Fourteen role templates are permission definitions, not extra users.

Verified: 170 source/API tests, eight component tests, build/recursive asset graph, documentation placement/links, zero dependency vulnerabilities and ten public accessibility states. All 26 E2E scenarios are verified across the full run and focused reruns: the initial full run passed 23/24; the failed case path plus directory, new task and student handoff passed 4/4 after fixes. All 14 roles passed navigation, the owner scan passed every module, mobile navigation passed, curriculum/LMS live workflows passed. Final teardown removed 13 disposable accounts and exact fixture records/session state. Post-cleanup SQL confirmed one real owner, no test-named users and no orphaned identities.

Fixed additional backend gaps: normal case/task priority now serializes as medium and save responses confirm the written row. A conflicting owner trigger no longer blocks own-student intake; staff triage still requires an eligible owner. The fourth follow-up migration is applied (100 total / 101 public RLS tables). Current provider verification passed owner authentication/CRUD/cleanup, RLS, buckets, two Edge Functions, live public APIs and non-mutating authenticated OpenAI QA. The merged UI is local only; it is not pushed or deployed. Issue #74 remains open for release acceptance.

The dev server remains available at http://localhost:5173/crm. Credentials and authenticated traces remain ignored and private. Temporary QA accounts/records must be removed by teardown and verified after the final suite. Lint exits successfully with inherited React diagnostics. Institutional research approval, corpus review, email delivery and manual assistive-technology acceptance remain external items.

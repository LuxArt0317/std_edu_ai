# Current client state

Issue #74 is active: official shadcn/ui + Tailwind v4 redesign, source/documentation cleanup and workflow QA. Work is in the client copy std_edu_ai-luxart0317; original repository/database untouched. Client Supabase is xiftudmvxphxcjtmfmib. Three curriculum-request migrations are applied (99 total / 101 public RLS tables).

Implemented: shared shadcn controls, dialogs, sidebar, tabs, semantic brand tokens; feature modules under src/features; separate lazy portal views; centralized docs with no runtime/test/provider Markdown; assigned teacher curriculum request/review workflow with protected institutional editing; native form compatibility adapter; editor lifecycle recovery and correct upcoming calendar summary.

Verified so far: 170 source/API tests, 7 meaningful unit/component tests, TypeScript/build/assets, zero-vulnerability dependency audit, 46 current-document link/placement checks and 10 public accessibility states. Last complete client E2E run: 21/23 passed. All 14 independent roles passed navigation; curriculum authorization/review/notifications, module publishing, LMS API integrity, owner academic CRUD and CRM recovery passed. Remaining failures: learner-support case editing and mobile CRM navigation. The latest public accessibility rerun timed out navigating with networkidle; the earlier 10-state run passed. Lint exits successfully with React warnings. The final build has no chunk-size advisory.

This checkpoint is being committed locally on main for review against origin/main (base bc6222e). It is not pushed or deployed. Issue #74 remains open. The earlier empty review inspected the original checkout std_edu_ai, whose main/origin/main remain at 735bc2d; the actual changes belong to this separate client checkout.

Protected configuration remains in ignored mode-0600 local environment files. Browser traces contain authenticated traffic and stay ignored under artifacts/. Temporary identities and isolated records must be removed by fixture teardown before release. No secret values belong in docs or Git.

Research corpus approval, institutional studies, physical campus validation, manual assistive-technology sign-off and production email delivery are external acceptance items; inherited claims are not client release evidence.

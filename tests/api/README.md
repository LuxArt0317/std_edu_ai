# API and contract tests

Node's built-in test runner validates server endpoints, recovery contracts, provisioning safety, school workflows, and the all-role onboarding configuration without deploying test code as Vercel functions. `onboarding.test.ts` requires all 14 roles, two demonstrated actions, one correct scenario check, durable target wiring, RLS, and least-privilege grants.

`academic-operations.test.ts` protects secure student provisioning, capacity-aware enrollment, collision-safe schedules, and the complete Academic Office workflow surface.

`integrated-lms.test.ts` protects the LMS tables, RLS, private files, enrollment/score integrity, and full teacher/student workflow surface.

`research-assistant.test.ts` protects synchronous trace persistence, retrieval/citation identity, deterministic conflict handoff, abstention, and fabricated-citation failure. `research-feedback.test.ts` protects input bounds, session hashing, one-use database rejection, private capability storage, protected reporting, and trace-before-corpus fixture cleanup.

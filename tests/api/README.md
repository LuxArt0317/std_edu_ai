# API and contract tests

Node's built-in test runner validates server endpoints, recovery contracts, provisioning safety, school workflows, and the all-role onboarding configuration without deploying test code as Vercel functions. `onboarding.test.ts` requires all 14 roles, two demonstrated actions, one correct scenario check, durable target wiring, RLS, and least-privilege grants.

`academic-operations.test.ts` protects secure student provisioning, capacity-aware enrollment, collision-safe schedules, and the complete Academic Office workflow surface.

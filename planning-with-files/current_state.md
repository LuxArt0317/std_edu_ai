# Current client state

Issue #74: user authorized Vercel publication. The merged transactional School OS UI and separate login/app routes are implemented in the client checkout. `/login` owns sign-in/password screens; `/app` owns the overview with section URLs, browser history, direct-link guards and legacy `/crm` compatibility. Original repository/database untouched.

Verified: 170 API/source checks, 11 units, all 32 E2E scenarios across full/focused runs, ten public accessibility states, build/assets/docs, zero dependency vulnerabilities and live client/backend checks. Auth regression found and fixed a password-label defect and logout redirect race. Inherited lint warnings remain.

Pushed routing/UI commit 0def115; GitHub quality checks passed. Vercel built successfully but expected the wrong output folder (build). vercel.json now explicitly controls the Vite preset and dist output. Retrying deployment; exact Ready status and live browser verification still pending. Credentials and raw traces remain ignored/private. Database remains 100 migrations / 101 RLS tables.

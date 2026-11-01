# Client repository operations

Read `deployment.json`, `docs/operations/INFRASTRUCTURE.md`, and the single `planning-with-files/task_plan.md` before changes. Track current work in GitHub Issues and update planning state with verified evidence.

This checkout targets LuxArt0317/std_edu_ai, Vercel v1-d286/std_edu_ai, and Supabase xiftudmvxphxcjtmfmib. Never operate on the original repository/database or assume a global CLI login belongs to this client. Dashboard access and CLI access are distinct.

Keep all credentials in provider-managed environments or ignored owner-readable `.env*.local` files. `deployment.json` contains identifiers only. Vite may expose only Supabase URL and publishable/anon keys; never service keys or database/OpenAI secrets.

Use `npm run db:plan` before `npm run db:deploy`. Never reset the client database. The protected owner is luxart0317@gmail.com; preserve trusted app-metadata authorization, RLS, owner protection, and audited transitions.

Before release, run lint, tests, build, handoff checks, dependency audit, and client verification. Record partial or externally blocked work honestly in docs/operations/HANDOFF.md and the issue. Historical research/acceptance records do not prove client readiness.

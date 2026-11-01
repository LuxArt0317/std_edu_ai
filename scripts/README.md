# Scripts

Run scripts from the repository root through `npm run` commands in `package.json`.

- `db:plan` / `db:deploy`: inspect or atomically deploy versioned migrations to the exact client database in `deployment.json`; require ignored server environment values and verified TLS.
- `verify:client`: validate the client schema, RLS, owner login, storage, public API restrictions, and deployed asset graph.
- `verify:handoff`: check current documentation links and client target configuration.
- `verify:dependency-audit`: fail on high/critical production dependency advisories.
- Existing `verify-*` scripts validate product/research/design contracts. Historical external research results are not inferred from passing these checks.
- `import-stu-source-inventory.mjs` stages review-needed official source candidates only; it never silently publishes knowledge.

`deployment-env.mjs` reads ignored local configuration and environment variables without logging values. Never print or commit its returned secrets. See [operational setup](../docs/operations/SETUP.md).

`verify:client` also performs one small, non-mutating live AI request (requires the server key configured in Vercel), verifies `source: openai`, and checks unauthenticated rejection and public directory availability.

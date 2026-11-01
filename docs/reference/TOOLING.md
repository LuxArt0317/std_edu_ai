# Tooling reference

## Historical research evidence

`research-104-evidence.json` is the inherited research-completion evidence manifest consumed by the optional `.codex` research hooks and automated contracts. It is separate from client deployment verification. Current work lives in [planning-with-files](../../planning-with-files/README.md).

## Optional research-completion controller

This inherited controller tracks the historical Issue #104 research-completion epic. It is opt-in in the client checkout: set `STU_RESEARCH_GUARD=1` only when deliberately working on that research epic. Normal client operations use AGENTS.md, deployment.json, and planning-with-files/.

The original guard implementation and evidence manifest are retained for traceability and automated contracts. It does not grant provider access or prove client readiness. Review and trust project hooks before enabling them.

## Scripts

Run scripts from the repository root through `npm run` commands in `package.json`.

- `db:plan` / `db:deploy`: inspect or atomically deploy versioned migrations to the exact client database in `deployment.json`; require ignored server environment values and verified TLS.
- `verify:client`: validate the client schema, RLS, owner login, storage, public API restrictions, and deployed asset graph.
- `verify:handoff`: check current documentation links and client target configuration.
- `verify:dependency-audit`: fail on high/critical production dependency advisories.
- Existing `verify-*` scripts validate product/research/design contracts. Historical external research results are not inferred from passing these checks.
- `import-stu-source-inventory.mjs` stages review-needed official source candidates only; it never silently publishes knowledge.

`deployment-env.mjs` reads ignored local configuration and environment variables without logging values. Never print or commit its returned secrets. See [operational setup](../operations/SETUP.md).

`verify:client` also performs one small, non-mutating live AI request (requires the server key configured in Vercel), verifies `source: openai`, and checks unauthenticated rejection and public directory availability.

## Continuous integration

The read-only GitHub workflow in `.github/workflows/quality.yml` runs lint, source/API contracts, component units, TypeScript/build/assets, documentation placement/links, dependency audit and public browser accessibility on application changes. Actions are pinned to verified upstream commit SHAs. It requires no client database, owner password or service key. Disposable live-client E2E tests remain an explicitly configured local operation; their authenticated traces are never uploaded by CI.

## Route verification

React Router 8 provides protected `/app` section URLs and the separate `/signin` screen. `npm run test:unit` covers safe return URLs and route mapping; `npm run test:e2e` verifies direct links, history, refresh, real sign-in/sign-out and role guards. `npm run test:live-shell` recursively checks production assets for the public, sign-in, dashboard, nested and legacy entry paths.

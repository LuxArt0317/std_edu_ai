# Local development and deployment

## Prerequisites

Use Node.js 24 and npm. Install locked dependencies with `npm ci`. Run all commands at repository root.

Copy `.env.example` to `.env.local` and supply the client project's URL and publishable key. `npm run dev` starts Vite. `npm run build` validates TypeScript, builds `dist/`, and verifies lazy-route assets. Vite's development and preview servers proxy `/api` to the declared client production site so local UI verification can exercise the authorized backend. To test changed Function code locally, use `vercel dev` only after signing into and linking the correct client team. Supabase reads and writes always use the configured client project.

## Environment variables

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser-safe | Client Supabase URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Client publishable key |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Marketplace integration alias, accepted automatically |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | Marketplace integration alias, accepted automatically |
| `OPENAI_API_KEY` | Server-only | Live AI and embeddings |
| `OPENAI_MODEL`, `OPENAI_PUBLIC_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_EMBEDDING_MODEL` | Server configuration | Optional model overrides supported by the endpoints |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | Server-only | Isolated setup and Auth administration; never browser-exposed |
| `POSTGRES_URL_NON_POOLING` / `POSTGRES_URL` | Server-only | Migration connection from the connected Marketplace resource |
| `SAFETY_HASH_SALT` | Server-only | Stable privacy-safe identifiers |

Only the two URL/key values are mapped into Vite. Do not prefix any database password, secret key, service-role key, or OpenAI key with `VITE_`. Local `.env*` files except `.env.example` are ignored. The old tracked `.env` was removed.

## Database deployment

The exact target and protected owner are declared in `deployment.json`. Retrieve the connected resource's environment values through the authenticated client Vercel team and save them privately in `.env.vercel.local` (mode `0600`).

```sh
npm run db:plan
npm run db:deploy
npm run db:plan
```

The deployment command verifies the Supabase project and TLS certificate, acquires a database advisory lock, refuses an untracked pre-existing schema, and applies each migration atomically with a `supabase_migrations.schema_migrations` record. It never resets the database. A fresh database gets only the confirmed client owner Auth identity, and its random initial credential is written to the ignored `.env.owner.local` file (mode `0600`). Existing identities are never password-reset by this command.

Historical demo-account synchronization migrations skip when their acceptance identities do not exist. They do not create inherited accounts. Existing sample academic/CRM seed records are fictional reference data; do not present them as client records or research results.

The public Supabase root certificate in `supabase/certs/` is downloaded from the dashboard's certificate link. TLS peer and hostname verification remain enabled.

## Vercel

Use team `v1-d286`, project `std_edu_ai`, branch `main`, root `./`, Vite framework, build `npm run build`, output `dist`, and Node.js 24. The existing SPA rewrite supports `/login`, `/app`, nested section URLs and legacy `/crm`; Vercel serves `/api` routes as Functions. Marketplace environment changes and code changes require a new deployment.

Use the existing client browser session for administration unless a CLI account is explicitly verified against that team. A globally signed-in Vercel CLI for another account is not client access. Secrets must not be copied into source code or documentation.

## Verification

```sh
npm run lint
npm test
npm run test:unit
npm run build
npm run test:accessibility-public
npm run test:e2e
npm run verify:handoff
npm run verify:dependency-audit
npm run verify:client
```

The client check uses `deployment.json` and client credentials; inherited live acceptance scripts under `tests/integration/` may require historical fixtures and must not be run blindly against another deployment. [Handoff status](HANDOFF.md) records which live features were actually verified.

## Client browser and workflow QA

`test:e2e` requires ignored `.env.vercel.local` (client resource credentials) and `.env.owner.local` (`CRM_ADMIN_EMAIL`/`CRM_ADMIN_PASSWORD`). It verifies the project reference before provisioning disposable accounts, an isolated department/program/class and curriculum. All 14 roles sign in independently. Tests cover role navigation, curriculum request authorization and review, module publication, private learning files, quiz scoring/answer-key protection, assignment grading, attendance, owner academic CRUD, mobile navigation and accessible dialogs.

The setup stores short-lived sessions only in mode-0600 ignored `artifacts/e2e/client-state.json`. Teardown removes exact fixture records and temporary accounts, and deletes that file. Screenshots, reports and traces stay in ignored `artifacts/`; traces may contain authenticated network data and must not be published. If an interrupted run needs cleanup, use `node --input-type=module -e "const {cleanupFixtures}=await import('./tests/e2e/client-fixtures.mjs');await cleanupFixtures()"`. The normal test command cleans up automatically, including after assertions fail.

`test:live-lms` uses the same disposable client fixtures and shared live contract. Other inherited acceptance scripts may still require historical fixtures: use the current E2E suite for this client, and review any older script before running it.

# Local development and deployment

## Account assistant verification and conversations

The existing server-only `OPENAI_API_KEY` powers drafting and independent verification. Optional `OPENAI_VERIFICATION_MODEL` selects the verifier/correction/planner model; it otherwise uses `OPENAI_PUBLIC_MODEL`, then `OPENAI_MODEL`, then the existing default. Never use a `VITE_` variable for the provider key. There is no separate MCP server or LangSmith tracing/checkpoint requirement.

Apply the independent assistant migration using `npm run db:plan -- --only=20261112120000` followed by `npm run db:deploy -- --only=20261112120000` after checking the exact client project. Account chats require this schema. Guest chats remain tab-local; signed-in conversations use the existing School Affairs Google session. Limits: 100 account conversations, 20 cached tab conversations, 24 messages per chat, no saved image bytes or executable action payloads. Conflicting edits require an explicit reload; action confirmation uses durable replay IDs.


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
| `OPENAI_MODEL`, `OPENAI_PUBLIC_MODEL`, `OPENAI_SEARCH_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_EMBEDDING_MODEL` | Server configuration | Optional model overrides supported by the endpoints; search uses the public/model setting when unset |
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

The School Affairs sample-record migration adds account-scoped assignments, historical/current/future sample enrollments, and an illustrative fee charge. Existing sample Google accounts are backfilled once. The verified `luxart0317@gmail.com` Google identity must sign in to School Affairs before the site admin record manager is available. Neither the migration nor that admin role connects to the university SIS or Moodle.

Apply the student-workspace migration with `npm run db:plan` and `npm run db:deploy`. It adds private student service and DTM records on the same client database. Run `node tests/integration/student-workspace-rls-live.mjs` to verify owner access and `node tests/integration/student-workspace-live.mjs` after release for the deployed flows. [Student Affairs](../../src/features/public/affairs/README.md), [DTM](../../src/features/public/dtm/README.md).

Historical demo-account synchronization migrations skip when their acceptance identities do not exist. They do not create inherited accounts. Existing sample academic/CRM seed records are fictional reference data; do not present them as client records or research results.

The public Supabase root certificate in `supabase/certs/` is downloaded from the dashboard's certificate link. TLS peer and hostname verification remain enabled.

## Vercel

Use team `v1-d286`, project `std_edu_ai`, branch `main`, root `./`, Vite framework, build `npm run build`, output `dist`, and Node.js 24. `vercel.json` explicitly sets the Vite preset, `npm ci`, `npm run build` and `dist`, overriding dashboard defaults for each release. The existing SPA rewrite supports `/signin`, `/app`, nested section URLs and legacy `/crm`; Vercel serves `/api` routes as Functions. Marketplace environment changes and code changes require a new deployment.

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

## Public student registration

`/signup` creates an email-confirmed student login; academic enrollment remains a school-controlled step. Migration `20261101160000_public_student_registration.sql` assigns only the trusted student role when no administrator role is supplied; editable user metadata cannot grant staff/owner access. Confirm email stays enabled. Production Auth enforces at least 16 characters and lowercase/uppercase/digit/symbol requirements. The UI also respects the provider 72-byte maximum and never truncates passwords. New confirmation/recovery redirects are exact `/signin` URLs for production, localhost:5173 and 127.0.0.1:5173. Old production `/crm` remains allowlisted.

Production mail readiness: custom SMTP is not configured. The default Supabase mailer accepted the QA confirmation request, but its restricted delivery/limits are not a production mail service. User chose to keep Supabase after discussing Gmail. Its built-in sender is restricted to approved project-team addresses and two emails/hour. A production sender must still be connected before ordinary public student inboxes can be supported. Keep email verification enabled; never bypass it to make signup appear complete. [Provider email delivery documentation](https://supabase.com/docs/guides/auth/auth-smtp).

## In-app video guides and client research QA

`/app/help` recommends chapters by the signed-in role; **All guides** exposes all six chapters and the combined walkthrough. Authenticated active school users receive expiring links to the private `tutorial-guides` bucket. English VTT captions, transcripts and MP4/SRT downloads are available. The ElevenLabs key is not used by the app.

After producing media with the isolated tooling, run `npm run prepare:video-guides` to build the catalogue and `npm run publish:video-guides` to upload immutable checksum-addressed media using the ignored client service credential. The publisher checks the project against `deployment.json`, verifies downloaded SHA-256 hashes and writes private publication proof under `artifacts/guides/`. Never commit media bundles or signed URLs. Apply the storage migrations with the guarded database commands before publishing.

Run `npm run test:client-research` for the eleven client research suites. It serializes foundation, ingestion/API/acquisition, routing, study, evaluation, RLS, recovery and adversarial checks; creates disposable role accounts; and cleans them in `finally`. Optional `RESEARCH_SUITE=campus-routing-live,rag-evaluation-live` selects suites by exact filename stem. Never run this coordinator alongside E2E or another fixture-based suite. It refuses an existing active ledger. It uses the client owner and temporary accounts; original-project Keychain identities are not used. Reports remain private in `artifacts/research-client/`.

See [current issue acceptance](../qa/ISSUE_COMPLETION.md) for the distinction between software verification and institutional/human evidence.

## Public university UI preview

Run `npm run dev -- --host 127.0.0.1 --port 5173` for local review. Public routes are `/`, `/在校學生/`, `/student-sso` and `/school-affairs`. The student Gmail link opens the local SSO UI. Its controls are intentionally disabled and no real school password should be entered. Existing STU Nexus sign-in stays at `/signin`; authenticated school work stays under `/app`.

With the local server running, use `npm run test:public-site`; for the production build use `npm run build`, serve Vite preview and set `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5174`. This UI does not require a migration or a new secret. The source catalogues/assets and capture limits are documented in [public-site QA](../qa/PUBLIC_SITE_REBUILD.md).

For the School Affairs replica, open `/school-affairs`; its directory/homepage entries map locally. `/school-affairs/login` uses a separate Google account via Supabase PKCE, with verified callback at `/school-affairs/auth/callback`; it does not accept an official university password or imply official school enrollment. `npm run test:school-affairs` verifies the 25 menu views, source-link catalog, settings, responsive/keyboard/accessibility behavior, preferences/bookmarks and absence of external requests. `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5174 npm run test:school-affairs` targets a running local production preview. Signed-in accounts receive clearly labeled stu.best sample records; external school applications need their own authorized school login and are not supplied by this site. [Google setup and acceptance status](../qa/GOOGLE_SCHOOL_SIGNIN.md).

The separate `affairs_*` schema supplies a real stu.best account workspace. First Google account data access creates clearly labeled sample school records, and the verified Lux Google account receives site admin controls. Run `npm run db:plan` before `npm run db:deploy`, then `npm run test:live-affairs-workspace-rls` to check account isolation in a rolled-back transaction. Real university records are not imported. The private Assistant can read the caller's site records and propose audited tasks, site requests and admin notices for explicit confirmation. [Behavior and limits](../qa/SCHOOL_AFFAIRS_ASSISTANT.md).

## Production domain

The canonical public URL is [https://stu.best](https://stu.best). `www.stu.best` permanently redirects to the apex; the original Vercel alias remains available. Domain/DNS ownership, management routes and callback details are recorded in [infrastructure](INFRASTRUCTURE.md). `deployment.json` supplies the live verification target and local API proxy. `npm run verify:client` checks both hosted origins, rejects untrusted CORS origins and verifies client database/API/AI access using ignored local credentials. Keep Supabase confirmation enabled; moving the domain does not resolve the outstanding production-mail dependency.

## Assistant knowledge

The public Assistant uses eligible managed knowledge first, then bounded live school web search for missing or current information. The existing server-only `OPENAI_API_KEY` is required; `OPENAI_SEARCH_MODEL` is optional. Web answers are visibly marked and linked to actual returned sources, without being represented as approved corpus evidence. [Search behavior and QA](../qa/SCHOOL_ASSISTANT_SEARCH.md).

Manage sources, imports, audience, review, publication, rollback, refresh and answer tests at `/app/knowledge` as owner/admin/librarian. The public Assistant appears on all public pages; a signed-in session uses authorized account QA and `/app` offers confirmed actions. Details and limits: [Connected Assistant](../qa/CONNECTED_ASSISTANT.md).

Validate the reference manifest with `node scripts/import-assistant-corpus.mjs`. An authorized `--apply` uses the ignored client environment/owner login and the live ingestion API; credentials stay out of logs and source. Captured references expire and require review; the command does not crawl inaccessible school systems or silently renew old source facts. Verify the client target in `deployment.json` before applying.

### Separate School Affairs and knowledge management

Open `/school-affairs/login` for real Google authentication to the independent stu.best School Affairs workspace. No university credentials are accepted. Nexus `/signin` is for management; the protected owner defaults to `/app/knowledge` and can choose **Open full workspace** from the account menu. `npm run test:school-affairs-entry` verifies login/logout/responsive/session isolation with mock provider responses locally. Actual institutional student records still require a school-approved integration.

## Local school-page mirror

See [the mirror guide](../qa/SCHOOL_MIRROR.md) for source capture, local routes, document bundle preparation, offline checks and responsive verification. `npm run dev` and `npm run build` prepare pinned public documents automatically; the first preparation verifies/extracts the bundled documents locally using system `tar` with gzip. Reserve several GB of working disk space. Builds make no document requests to the original school. After reviewed document changes, run `npm run pack:school-documents` and commit the updated bundle/manifest. `npm run test:school-documents` verifies a fresh restore and rejection of tampered parts/paths. No school account or provider secret is used for this step. Private school systems remain separately unconnected.

## School Affairs Google authentication

Use the dedicated client Google Auth project and the exact callback/provider instructions in [Google School Affairs sign-in](../qa/GOOGLE_SCHOOL_SIGNIN.md). This flow is independent of Nexus email/password sign-in and the SMTP sender. OAuth client secrets belong only in Supabase provider settings; browser configuration remains limited to URL and publishable key. Use local-scope sign-out in administrative scripts so verification does not revoke unrelated user sessions.

The verified Vercel Hobby project is limited to 12 functions. `/api/affairs-conversations` rewrites to `/api/affairs-data?resource=conversations`; its private handler lives in `server/assistantConversations.js`. Keep new route handlers behind existing functions unless the hosting capacity changes. `verify:handoff` checks this budget.

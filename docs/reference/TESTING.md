# Testing reference

## API and contract tests

Node's built-in test runner validates server endpoints, recovery contracts, provisioning safety, school workflows, and the all-role onboarding configuration without deploying test code as Vercel functions. `onboarding.test.ts` requires all 14 roles, two demonstrated actions, one correct scenario check, durable target wiring, RLS, and least-privilege grants.

`academic-operations.test.ts` protects secure student provisioning, capacity-aware enrollment, collision-safe schedules, and the complete Academic Office workflow surface.

`integrated-lms.test.ts` protects the LMS tables, RLS, private files, enrollment/score integrity, and full teacher/student workflow surface.

`research-assistant.test.ts` protects synchronous trace persistence, retrieval/citation identity, deterministic conflict handoff, abstention, and fabricated-citation failure. `research-feedback.test.ts` protects input bounds, session hashing, one-use database rejection, private capability storage, protected reporting, and trace-before-corpus fixture cleanup.

`rag-evaluation.test.ts` reconciles perfect/displaced/duplicate/abstention retrieval vectors, citation precision/completeness, ranking-only MRR aggregation, threshold decisions, independent-review/freeze/immutability schema markers, and the complete protected reviewer UI lifecycle.

Client-handoff changes relocate document contracts under docs/product and docs/design. Existing role/RLS/API behavior contracts continue to run through npm test.

## Test fixtures

`grade-sheet.svg` is a synthetic, non-sensitive grade sheet used to verify the authenticated OpenAI vision extraction flow. Tests convert it to PNG before submission; the extracted candidates are never automatically published.

## Integration and release verification

These opt-in scripts exercise the configured production deployment and Supabase project with protected local credentials. They never print passwords. Mutating workflows are reversible; the onboarding acceptance test emits its unique temporary journey key so a trusted operator can delete those test progress rows immediately, with event cleanup cascading through the foreign key.

`build-assets.mjs` is the non-networked release gate invoked by every standard production build. It validates the generated route dependency graph, fails when the CRM JavaScript can render without the stylesheet containing the authentication-card contract, rejects onboarding UI markers, and requires the official-source review controls in the CRM runtime bundle.

`deployment-shell-live.mjs` is the read-only production diagnostic. It recursively follows the deployed hashed asset graph for both public routes and reports whether the boot shell and CRM authentication styles are present while confirming onboarding remains disabled.

`export-role-credentials.mjs` retrieves all 14 passwords from the local macOS Keychain, verifies each production Auth identity and RLS-visible profile, then atomically writes the ignored root file `PRODUCTION_ROLE_CREDENTIALS.local.md` with mode `0600`. It never prints a password or persists a file if verification is incomplete.

`academic-operations-live.mjs` performs and restores a real enrollment update, proves overlapping room bookings are rejected, removes its temporary event, and confirms a student cannot invoke account provisioning.

`lms-live.mjs` runs a reversible production course lifecycle as real faculty and student identities: publish content/private files, deny student authoring, track progress, submit and grade work, enforce the score ceiling, take attendance, verify student visibility, and clean up.

`issue90-live.mjs` uses the protected owner session to reversibly verify one-subject manual curriculum creation, year/semester placement, audited draft deletion, private Nexus attachment persistence, queue transitions, and server-enforced non-mutating Ask mode.

`issue103-live.mjs` uses the protected owner session to reversibly prove exact catalog-subject curriculum placement, prerequisite IDs, department/program mismatch rejection, CRM task/case and owner invariants, structured campaign recipient generation, and admission program snapshots. Existing campaign state is restored and temporary academic records are removed.

`research-foundation-live.mjs` reversibly validates the Issue #104 governed source/document/chunk chain, anonymous metadata boundary, direct chunk denial, accessible campus graph, and pseudonymous protocol-to-response study chain against production. All temporary records are removed in dependency order and the script fails if any relationship or RLS boundary is missing.

`knowledge-ingestion-live.mjs` uses the protected owner and OpenAI credentials to create deterministic embedded versions, publish through the reviewer-only atomic RPC, supersede the prior index, prove expiry removes public visibility, restore the prior version, reject mixed active chunks, record a connected privacy-safe public answer trace, reject cross-session and replayed feedback capabilities, verify the protected reviewer report, and clean every temporary corpus/trace record.

`knowledge-acquisition-live.mjs` acquires the deployed structured HTML fixture through the real SSRF-safe HTTPS boundary, uploads a deterministic PDF, inspects exact HTML/PDF locators and parser versions, proves executable/hidden data exclusion, draft isolation, duplicate replay, publication, supersession, rollback, quarantine, student mutation denial, and zero-residue cleanup.

`rag-evaluation-live.mjs` uses four production role identities to prove the Issue #124 evaluation boundary: ordinary sub-150 freezing fails, author self-review and duplicate review fail, eight synthetic cases receive sixteen independent approvals, the frozen checksum and all metric breakdowns reconcile exactly, student/anonymous access fails, and guarded cleanup leaves zero records. These fixtures prove machinery only and never count as research cases.

`stu-source-inventory-live.mjs` uses owner, librarian, student, and anonymous contexts to prove the Issue #127 boundary. It inserts one reversible candidate for each of ten domains, verifies exact idempotent replay, rejects external hosts and direct state mutation, accepts one candidate only as an inactive source with zero documents, records a librarian rejection, and removes ten candidates plus the inactive source with zero residue.

For the client environment use `npm run verify:client`, which derives its target from deployment.json, verifies owner login/RLS/storage/CRUD cleanup and deployed assets, and checks Edge Function authorization. Historical acceptance scripts may require original fixtures and must not be run blindly against the client.

Deployment/asset diagnostics default to https://stdeduai.vercel.app, so they never silently inspect the original production domain. Optional legacy fixture scripts still require explicit credential/fixture preparation.

## Performance verification

`research-public-load.mjs` is an opt-in bounded load check for the public client deployment. Its default target is https://stdeduai.vercel.app; set STU_BASE_URL explicitly for an approved alternate environment. Read the script's request/concurrency limits before running against a live system. Passing a synthetic run is not evidence of real institutional traffic or research outcomes.

## Tests

The test suite lives outside Vercel's reserved `/api` directory so test modules are never deployed as serverless functions. `api/` contains contract coverage for validation, authentication, privacy filtering, provider calls, structured chatbot output, and human-reviewed grade scanning.

Academic operations contracts cover student, subject, class, enrollment, and schedule management.

`api/boot-recovery.test.ts` protects the non-empty pre-JavaScript boot shell, distinct statically analyzable lazy-route boundaries, lazy-route error handling, finite startup timeouts, and local-session recovery contract that prevents a blank deployment screen.

`integration/crm-live.mjs` verifies anonymous isolation, authenticated staff access, table availability, and a reversible RLS-protected mutation against the configured production Supabase project. It requires credentials through environment variables and never stores them in the repository.

`integration/school-live.mjs` verifies the protected owner claim, anonymous isolation, academic table availability, protected answer-key access, transactional quiz scoring with cleanup, owner-demotion prevention, score ceilings, and atomic grade-scan approval.

`integration/role-portals-live.mjs` signs in with real faculty and student JWT roles, verifies teacher access, student course/topic/assessment/grade scope, answer-key isolation, grade mutation denial, and a complete student quiz cycle with owner cleanup.

`integration/all-role-accounts-live.mjs` retrieves the 14 acceptance credentials from the local macOS keychain, authenticates each identity against production, and verifies that its trusted Auth claim and self-visible profile authorization agree. It never displays or persists a password.

`integration/export-role-credentials.mjs` performs those production authorization checks before exporting the local Keychain credentials to the ignored root file `PRODUCTION_ROLE_CREDENTIALS.local.md`. The export is atomic, restricted to mode `0600`, and never written unless all 14 roles pass.

`integration/onboarding-live.mjs` authenticates all 14 role accounts, writes a temporary role-matched readiness record and append-only action evidence for each, verifies self/owner visibility, rejects a forged-role write and user deletion, and prints the temporary journey key for immediate operator cleanup.

`integration/build-assets.mjs` runs after every production build and fails the build unless the generated entry graph exposes the CRM JavaScript chunk and a linked stylesheet containing the semantic authentication selectors `.nexus-auth-shell` and `.nexus-auth-card`.

`integration/deployment-shell-live.mjs` verifies that deployed `/` and `/crm` contain useful pre-JavaScript recovery content instead of an empty root, recursively checks compiled entry/style/lazy-route assets, requires the live hashed asset graph to expose the CRM authentication stylesheet, and fails while onboarding is disabled if any onboarding UI marker appears in JavaScript.

`integration/research-study-runner-live.mjs` creates a frozen synthetic protocol and proves public consent discovery, 1:1 counterbalancing, hash-only token isolation, two-condition task evidence, standard SUS scoring, completion, anonymized export, withdrawal, immediate deletion, and dependency-order cleanup without treating synthetic rows as participant outcomes.

`integration/ai-live.mjs` invokes the real authenticated school chatbot and OpenAI vision grade extraction using the synthetic `fixtures/grade-sheet.svg` fixture converted to PNG. It verifies structured responses and the mandatory human-review flag without saving grades.

`api/research-foundation.test.ts` and `integration/research-foundation-live.mjs` protect the Issue #104 research system: governed provenance, retrieval privacy, campus graph relationships, pseudonymous study records, explicit Data API privileges, and reversible live production behavior.
`npm run test:live-workload` runs the reversible Issue #120 production workflow: comparable-window constraints, explicit confirmed resolution, independent review, protected reads, small-cell suppression, descriptive-only reporting, and zero-residue cleanup.

`npm run test:live-ingestion-telemetry` proves retry ceilings, permanent-failure isolation, dead-letter behavior, stale recovery, protected operational reads, exact summary measures, and zero-residue cleanup. `npm run test:live-ingestion-api` exercises the deployed authenticated ingestion endpoint, confirms complete terminal run/attempt telemetry, repeats the same payload to prove document/index idempotency, rejects raw-content telemetry, and removes every fixture.

`api/knowledge-acquisition.test.ts` covers reserved/private address rejection, credentialed URL denial, deterministic HTML/Markdown/PDF extraction, exact locators, hostile/hidden content exclusion, malformed/disguised/unsupported/empty/oversized files, redirect/DNS guards, reviewed decisions, and split mutation policies. Run `npm run test:live-knowledge-acquisition` after deployment for the complete reversible URL/file review lifecycle.

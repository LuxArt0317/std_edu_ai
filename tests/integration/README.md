# Integration and release verification

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

# Integration and release verification

These opt-in scripts exercise the configured production deployment and Supabase project with protected local credentials. They never print passwords. Mutating workflows are reversible; the onboarding acceptance test emits its unique temporary journey key so a trusted operator can delete those test progress rows immediately, with event cleanup cascading through the foreign key.

`build-assets.mjs` is the non-networked release gate invoked by every standard production build. It validates the generated route dependency graph, fails when the CRM JavaScript can render without the stylesheet containing the authentication-card contract, and currently rejects onboarding UI markers in the CRM runtime bundle.

`deployment-shell-live.mjs` is the read-only production diagnostic. It recursively follows the deployed hashed asset graph for both public routes and reports whether the boot shell and CRM authentication styles are present while confirming onboarding remains disabled.

`export-role-credentials.mjs` retrieves all 14 passwords from the local macOS Keychain, verifies each production Auth identity and RLS-visible profile, then atomically writes the ignored root file `PRODUCTION_ROLE_CREDENTIALS.local.md` with mode `0600`. It never prints a password or persists a file if verification is incomplete.

`academic-operations-live.mjs` performs and restores a real enrollment update, proves overlapping room bookings are rejected, removes its temporary event, and confirms a student cannot invoke account provisioning.

`lms-live.mjs` runs a reversible production course lifecycle as real faculty and student identities: publish content/private files, deny student authoring, track progress, submit and grade work, enforce the score ceiling, take attendance, verify student visibility, and clean up.

`issue90-live.mjs` uses the protected owner session to reversibly verify one-subject manual curriculum creation, year/semester placement, audited draft deletion, private Nexus attachment persistence, queue transitions, and server-enforced non-mutating Ask mode.

`issue103-live.mjs` uses the protected owner session to reversibly prove exact catalog-subject curriculum placement, prerequisite IDs, department/program mismatch rejection, CRM task/case and owner invariants, structured campaign recipient generation, and admission program snapshots. Existing campaign state is restored and temporary academic records are removed.

`research-foundation-live.mjs` reversibly validates the Issue #104 governed source/document/chunk chain, anonymous metadata boundary, direct chunk denial, accessible campus graph, and pseudonymous protocol-to-response study chain against production. All temporary records are removed in dependency order and the script fails if any relationship or RLS boundary is missing.

`knowledge-ingestion-live.mjs` uses the protected owner and OpenAI credentials to create deterministic embedded versions, publish through the reviewer-only atomic RPC, supersede the prior index, prove expiry removes public visibility, restore the prior version, reject mixed active chunks, and clean every temporary record.

`knowledge-acquisition-live.mjs` acquires the deployed structured HTML fixture through the real SSRF-safe HTTPS boundary, uploads a deterministic PDF, inspects exact HTML/PDF locators and parser versions, proves executable/hidden data exclusion, draft isolation, duplicate replay, publication, supersession, rollback, quarantine, student mutation denial, and zero-residue cleanup.

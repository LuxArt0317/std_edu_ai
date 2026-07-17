# Integration and release verification

These opt-in scripts exercise the configured production deployment and Supabase project with protected local credentials. They never print passwords. Mutating workflows are reversible; the onboarding acceptance test emits its unique temporary journey key so a trusted operator can delete those test progress rows immediately, with event cleanup cascading through the foreign key.

`build-assets.mjs` is the non-networked release gate invoked by every standard production build. It validates the generated route dependency graph, fails when the CRM JavaScript can render without the stylesheet containing the authentication-card contract, and currently rejects onboarding UI markers in the CRM runtime bundle.

`deployment-shell-live.mjs` is the read-only production diagnostic. It recursively follows the deployed hashed asset graph for both public routes and reports whether the boot shell and CRM authentication styles are present while confirming onboarding remains disabled.

`export-role-credentials.mjs` retrieves all 14 passwords from the local macOS Keychain, verifies each production Auth identity and RLS-visible profile, then atomically writes the ignored root file `PRODUCTION_ROLE_CREDENTIALS.local.md` with mode `0600`. It never prints a password or persists a file if verification is incomplete.

`academic-operations-live.mjs` performs and restores a real enrollment update, proves overlapping room bookings are rejected, removes its temporary event, and confirms a student cannot invoke account provisioning.

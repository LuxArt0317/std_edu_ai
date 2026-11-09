# Project scripts

These scripts prepare the build, verify repository contracts and check the client release. `verify-handoff.mjs` keeps detailed documentation under `docs/` while allowing concise purpose READMEs in touched code folders, as required by the current repository instructions.

`supabase-activity.mjs` performs the bounded, read-only Supabase query used by the temporary GitHub schedule. It stops before the fixed cutoff without needing a secret, and reports provider failures without logging the key. See [operations](../docs/operations/INFRASTRUCTURE.md#temporary-supabase-activity-check--issue-97).

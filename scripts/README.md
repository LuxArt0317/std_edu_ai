# Project scripts

`deploy-database.mjs --only=YYYYMMDDHHMMSS` plans/applies one explicitly selected independent migration while reporting deferred drafts. It retains the exact-client check, advisory lock and transaction/history recording. The flag does not infer dependency safety: inspect the selected SQL and record why deferred migrations are independent before using it.


These scripts prepare the build, verify repository contracts and check the client release. `verify-handoff.mjs` keeps detailed documentation under `docs/` while allowing concise purpose READMEs in touched code folders, as required by the current repository instructions.

`supabase-activity.mjs` performs the bounded, read-only Supabase query used by the temporary GitHub schedule. It stops before the fixed cutoff without needing a secret, and reports provider failures without logging the key. See [operations](../docs/operations/INFRASTRUCTURE.md#temporary-supabase-activity-check--issue-97).

Route regeneration preserves the conversation API alias. Handoff verification checks the client 12-function deployment budget and required alias before release.

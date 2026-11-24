# Project scripts

`capture-permanent-courses.mjs` and `import-permanent-courses.mjs` refresh the public permanent course catalog. Use the [exact-target rollback and import steps](../docs/qa/PERMANENT_COURSES.md).

`deploy-database.mjs --only=YYYYMMDDHHMMSS` plans/applies one explicitly selected independent migration while reporting deferred drafts. It retains the exact-client check, advisory lock and transaction/history recording. The flag does not infer dependency safety: inspect the selected SQL and record why deferred migrations are independent before using it.


These scripts prepare the build, verify repository contracts and check the client release. `verify-handoff.mjs` keeps detailed documentation under `docs/` while allowing concise purpose READMEs in touched code folders, as required by the current repository instructions.

`supabase-activity.mjs` performs the bounded, read-only Supabase query used by the temporary GitHub schedule. It stops before the fixed cutoff without needing a secret, and reports provider failures without logging the key. See [operations](../docs/operations/INFRASTRUCTURE.md#temporary-supabase-activity-check--issue-97).

Route regeneration preserves the conversation API alias. Handoff verification checks the client 12-function deployment budget and required alias before release.

`write-release-manifest.mjs` writes `dist/release.json` after the build. Only a valid `VERCEL_GIT_COMMIT_SHA` from a Vercel build sets the revision; local/manual builds without it remain explicitly unverified. The public metadata contains no environment credentials and is uncached, allowing deployed evaluation results to identify the actual release.

`dev-local.mjs` serves Vite and the actual API handlers on loopback, plus the local Answer Lab store. Run `npm run dev:local`; its hosted equivalent uses the authenticated affairs-data adapter and independent database state. See [Answer Lab setup](../tools/evaluation-lab/SETUP.md).

The handoff documentation policy permits the standalone lab’s required `tools/evaluation-lab/SETUP.md` entrypoint, just as it permits the isolated tutorial package setup. Other runtime/provider/test Markdown restrictions remain in place.

`deploy-evaluation-sharing.mjs` is the fixed, idempotent production-build migration step for the two shared Answer Lab administrators. It validates the exact client target and applies only version 20261125020000 under a transactional migration lock using existing production credentials. It skips non-production builds, never bootstraps accounts or applies unrelated migrations, and stops the release on failure.

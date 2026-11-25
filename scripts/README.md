# Project scripts

`capture-permanent-courses.mjs` and `import-permanent-courses.mjs` refresh the public permanent course catalog. Use the [exact-target rollback and import steps](../docs/qa/PERMANENT_COURSES.md).

`deploy-database.mjs --only=YYYYMMDDHHMMSS` plans/applies one explicitly selected independent migration while reporting deferred drafts. It retains the exact-client check, advisory lock and transaction/history recording. The flag does not infer dependency safety: inspect the selected SQL and record why deferred migrations are independent before using it.


These scripts prepare the build, verify repository contracts and check the client release. `verify-handoff.mjs` keeps detailed documentation under `docs/` while allowing concise purpose READMEs in touched code folders, as required by the current repository instructions.

`supabase-activity.mjs` performs the bounded, read-only Supabase query used by the temporary GitHub schedule. It stops before the fixed cutoff without needing a secret, and reports provider failures without logging the key. See [operations](../docs/operations/INFRASTRUCTURE.md#temporary-supabase-activity-check--issue-97).

Route regeneration preserves the conversation API alias. Handoff verification checks the client 12-function deployment budget and required alias before release.

`write-release-manifest.mjs` writes `dist/release.json` after the build. Only a valid `VERCEL_GIT_COMMIT_SHA` from a Vercel build sets the revision; local/manual builds without it remain explicitly unverified. The public metadata contains no environment credentials and is uncached, allowing deployed evaluation results to identify the actual release.

`dev-local.mjs` runs the actual API handlers and Vite together on loopback port 5173 for manual agent checks. Run `npm run dev:local`; set `LOCAL_PORT` to override the port. It reads ignored `.env.local` values, handles the conversation alias and JSON/SSE requests, and never proxies APIs to production. OpenAI and Supabase still use their configured online services. Restart after API/server code changes. It is a development adapter, not a deployment server.

The local runner rejects missing or encrypted-placeholder Supabase/model configuration before serving the page. Vercel production environment downloads can contain placeholders and cannot be used as local runtime credentials.

The local adapter also serves [Answer Lab](../tools/evaluation-lab/README.md) at `/evaluation-lab` with private local persistence. Its development-only endpoints are not deployed Vercel Functions.

## Focused public-source import
`node scripts/import-ipiac-source.mjs` downloads only the missing public 115 IPIAC draft, validates PDF bytes, extracts physical-page text, and writes an unchanged PDF, dated HTML/source record and the server text projection. It uses the existing bounded public-asset downloader, not university sign-in. Run it only for an intentional source refresh; it makes no account, database or deployment changes.

`run-answer-lab-bank.mjs` is a loopback-only checkpointed driver for existing lab answer/result/judge endpoints. Specify `--only` case IDs and `--concurrency 1` for sequential quality work; `--label` keeps separate immutable attempt files under ignored `.evaluation-lab/bank-runs`. The answering endpoint never receives reference answers. Account cases require a caller-provided verified session; absent sessions are recorded as skipped, never counted as passes. Stop with SIGINT; partial results are retained.

`import-accounting-source.mjs` and `import-payment-source.mjs` project existing checksum-pinned public captures/PDF bytes into server source records. They do not import evaluation references or query student accounts.

`run-answer-lab-client.mjs` evaluates one public case through the same Vite-served browser client as chat, using installed Chrome. See the [focused runner instructions](../tools/evaluation-lab/README.md#focused-browser-client-evaluation). Unlike the API-only bank runner, it preserves browser client routing. It deliberately rejects private cases without a verified session and attachment cases that need the UI.

`import-calendar-source.mjs` projects registered calendar headings and verified student/staff/English PDF links into the public navigation record. `repair-campus-map.mjs` restores only the original map image named in the import warning/asset registry, verifies the PNG dimensions and existing page checksum, preserves the captured layout, updates the page/asset manifests and removes only the resolved warning. It never generates a substitute map.

`node scripts/import-calendar-text.mjs` extracts source pages and event rows from checksum-verified, registered calendar PDFs. Unsupported layouts are reported and skipped; no evaluation reference answers are read. Refresh calendar download metadata first with `import-calendar-source.mjs` when the source registry changes.

`node scripts/import-housing-policy.mjs` refreshes housing source sections from registered captures; `node scripts/import-wireless-source.mjs` refreshes public wireless text, validates registration/network/setup markers and derives contact fields. Both verify source checksums and never read FAQ expected answers.

Focused and bank runners default to GPT-6 Luna answers and GPT-6.1 Terra independent grading; --model and --evaluator-model override them. The runtime compiler produces the ignored hosted assistant JavaScript artifact from the maintained TypeScript source. The packaging check runs that artifact without any TypeScript source present.

`npm run lint:runtime-imports` checks backend runtime imports before lint/build. Each failure includes a clickable file:line:column, the production failure reason, and the JavaScript/type-only fix. `npm run verify:api-packaging` additionally exercises the generated runtime without TypeScript sources.

The focused browser runner mounts a minimal same-origin document, without Vite HMR, and imports the real website assistant and lab transport. It checks browser-client routing/API behavior, not a visual click-through; source edits cannot reload the runner during a paid request.

`import-public-funding-source.mjs` verifies nine registered page/PDF checksums and emits dated funding-program evidence. `import-academic-rules-source.mjs` verifies the source directory, exact linked document, PDF hash/page count and article boundaries before projecting the public academic rules. Both run locally and do not publish or mutate a database.

`import-staff-parking-source.mjs` checks the registered procedure capture hash before extracting staff car/motorcycle/contact blocks. It produces a server source record without runtime filesystem reads.

Source importers for academic contacts, faculty training, public communication and the partial contact directory validate registered captures without reading evaluation references. The API bank runner records explicit API-only provenance; these runs do not prove rendered UI or a signed-in browser session.

import-academic-study-options.mjs verifies the regulations-directory capture, linked PDF signatures/checksums, page counts and literal article boundaries before projecting procedure clauses. Two individually pinned PDF assets are registered rather than duplicating a document archive.

The local API bank runner allows125seconds for an answering request to cover the bounded115-second local server budget plus transport. The judge remains separate. Increasing this client ceiling does not extend server or hosting deadlines.

Scholarship application retrieval distinguishes the signed AnnexIV form and scholarship policy from general admission-document checklists; financial calculations retain their own source selection.

`node scripts/summarize-answer-lab-quality.mjs` is an offline current-case-version audit. It separates latest judged scores from historical bests and unjudged cases. Use `--producer gpt-6-luna` to isolate local producer trials or `--json` for case IDs/run provenance; it prints no answers or expected references and makes no model/network calls.

The local `/evaluation-lab` redirect retains query parameters so filtered lab links survive navigation.

`npm test` first builds the ignored JavaScript assistant runtime and restores checksum-pinned documents from the committed bundle. This keeps fresh checkouts and CI equivalent to prepared local workspaces without downloading school files.

The isolated packaging check also follows the authenticated hosted `run-account` dynamic import with local auth/model fixtures and an invalid question, requiring the actual compiled handler’s400 response. It makes no live provider/database requests.

Cloud Answer Lab synchronization supports `--merge` (dry-run unless `--apply` is
also supplied). Merge preserves cloud records, reports stable-ID case/run
conflicts, and blocks apply until those conflicts are resolved. Applying a full
replacement now requires explicit `--replace --apply`. Both apply modes save and
verify a private full cloud/local/proposed-state backup before changing data.
No credentials or answers are printed in conflict summaries. Test the pure merge
with `node --test tests/evaluation/evaluation-lab-merge.test.mjs`.

Cloud sync enforces the deployed lab’s3MB mutation limit, even though the database permits20MB. Increase it only together with the hosted application limit; existing cloud history is never trimmed automatically.

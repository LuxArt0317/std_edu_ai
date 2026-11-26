# Build helpers

These modules prepare captured school assets, document bundles and direct HTML routes. `direct-school-pages.mjs` validates the local manifest and adds the shared campus-assistant controls to captured public pages. It no longer injects the floating disclosure/account-status panel. The source documents, assistant frame, CSP and normal application routes are preserved.

Use the root build and release checks documented in [project scripts](../README.md); generated HTML belongs in the build output.

`runtime-import-lint.mjs` uses the TypeScript AST to identify runtime source-extension imports while allowing type-only dependencies. Diagnostics include the Vercel packaging reason and corrective action.

`school-document-bundle.mjs` restores the original pinned document archive while
checking separately tracked supplemental documents against reviewed descriptors
and physical SHA-256/size. The optional `bundleDirectory` restore option supports
isolated fixture archives; production defaults to `vendor/school-documents`.

`evaluation-lab-merge.mjs` provides the pure, non-destructive Answer Lab state
merge. Stable-ID case or answer-payload differences are reported as conflicts
and block apply; cloud case edits and metadata remain authoritative. Identical
run payloads union deduplicated judge histories without dropping cloud history.
New run imports must reference an existing case/version. Current-version snapshots
must match question, expected answer and expected constraints. Older snapshots
remain older-version runs; matching retained reference history is checked when
available, otherwise a historical-reference warning is emitted. Encoded
attachments follow the RPC limits: 32–2,000,000 bytes each and at most50,000,000
bytes per workspace. The database document cap is20,000,000 bytes (PostgreSQL
JSONB serialization remains the final enforced check).

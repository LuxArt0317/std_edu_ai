# Build helpers

These modules prepare captured school assets, document bundles and direct HTML routes. `direct-school-pages.mjs` validates the local manifest and adds the shared campus-assistant controls to captured public pages. It no longer injects the floating disclosure/account-status panel. The source documents, assistant frame, CSP and normal application routes are preserved.

Use the root build and release checks documented in [project scripts](../README.md); generated HTML belongs in the build output.

`runtime-import-lint.mjs` uses the TypeScript AST to identify runtime source-extension imports while allowing type-only dependencies. Diagnostics include the Vercel packaging reason and corrective action.

`school-document-bundle.mjs` restores the original pinned document archive while
checking separately tracked supplemental documents against reviewed descriptors
and physical SHA-256/size. The optional `bundleDirectory` restore option supports
isolated fixture archives; production defaults to `vendor/school-documents`.

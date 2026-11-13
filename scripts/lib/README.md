# Build helpers

These modules prepare captured school assets, document bundles and direct HTML routes. `direct-school-pages.mjs` validates the local manifest and adds the shared campus-assistant controls to captured public pages. It no longer injects the floating disclosure/account-status panel. The source documents, assistant frame, CSP and normal application routes are preserved.

Use the root build and release checks documented in [project scripts](../README.md); generated HTML belongs in the build output.

# School page mirror

This folder maps observed public STU pages to inert, same-origin HTML copies. `SourceMirror.tsx` loads the captured page in a sandboxed frame, binds local navigation and controls, and restores safe final states for animations that cannot run. The versioned `pages.json`, `assets.json`, `files.json`, `coverage.json` and `gaps.json` distinguish copied resources from unresolved or protected destinations.

Source capture/import, security limits, coverage and verification are documented in [the mirror QA guide](../../../../docs/qa/SCHOOL_MIRROR.md). Do not edit copied HTML without updating its checksum and provenance; layout corrections in the renderer should stay scoped to the affected page.

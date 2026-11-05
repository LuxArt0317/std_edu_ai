# Server helpers

Shared server-only retrieval, authorization and validation helpers for `api/`. `schoolAffairsDirectory.js` reads the captured School Affairs catalog; `schoolWebSearch.js` verifies public STU web sources. These modules do not grant access to official school systems.

`affairsWorkspace.js` now loads account-scoped DTM sample courses/materials alongside School Affairs records after verifying Google identity and RLS. `affairsAnswer.js` identifies the separate DTM source and labels it sample data.

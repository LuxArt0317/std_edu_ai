# Server utilities

This folder contains server-only Node ESM helpers shared by Vercel API functions. Runtime helpers use `.js` files so Vercel packages them with each function; matching `.d.ts` files provide strict TypeScript contracts.

- `apiAuth.js` validates bearer sessions against Supabase Auth and derives trusted roles from `app_metadata`; browser-supplied role claims are never trusted.
- `knowledgePipeline.js` normalizes, fingerprints, chunks, canonicalizes, and classifies governed corpus content deterministically.
- `ragEvaluation.js` provides the dependency-free reference implementation for retrieval, citation, aggregate, latency, cost, and release-gate reconciliation used by Issue #124 contracts.

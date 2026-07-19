# Progress

## 2026-07-19 — Issue #104 implementation

- Created child Issues #105–#116 for every research work package and Issue #117 for the shared schema dependency.
- Implemented and verified the repository-local Codex SessionStart/Stop completion controller; closed #116 and checked it in #104.
- Deployed the Issue #104 foundation to production Supabase: 31 connected RLS-enabled tables, 56 foreign keys, and 56 policies for governed knowledge, answer evidence/evaluation, campus routing, study records, and workload metrics.
- Live audit found inherited anonymous `knowledge_chunks` privileges; deployed a hardening migration that explicitly revokes protected research/retrieval tables from `anon` and `public`.
- Refreshed generated TypeScript types from production and documented the complete research architecture and trust boundaries.
- Added four passing schema contracts and a passing reversible live production chain covering public metadata, protected chunks, accessible routing, pseudonymous protocol/consent/tasks/responses, and dependency-order cleanup.
- Confirmed zero temporary source, campus, or study records remained. Supabase security advisors contain no notices matching the new research tables.
- Commented implementation evidence on and closed #117. Issues #105–#115 remain open because feature and empirical evidence work is not yet complete.
- Created the WP0 draft protocol 0.1.0, analysis plan, claims/evidence matrix, and external governance register. The executable verifier confirms all 15 research/objective/benefit claims have a metric, artifact, owner, and decision/report rule.
- Marked only claims traceability verified. Protocol freeze remains in progress and ethics/advisor approval remains external; no participant or outcome claim was fabricated.
- Added a server-only governed ingestion endpoint with bounded role-gated imports, HTTPS canonicalization, deterministic normalization/chunking/checksums, OpenAI 1,536-dimensional embeddings, checksum deduplication, version creation, and mandatory human review.
- Deployed reviewer-only atomic publication and rollback RPCs. The live owner/OpenAI workflow proved first publication, version supersession, zero mixed active chunks, expired public leakage = 0, prior-version rollback, and cleanup.
- The first cleanup attempt exposed immutable review-event protection and left a fixture; removed it, added a narrowly owner/test-prefix restricted purge RPC, reran the workflow, and independently confirmed 0 sources/documents/review events remain.
- Deployed the public hybrid retrieval RPC with exact, lexical, and 1,536-dimensional vector signals plus authority/language boosts. Governance, audience, publication, effective, expiry, source-active, and chunk-active filters execute before ranking.
- Replaced the public drawer's static mock with the live bilingual research-assistant API. It rate-limits, rejects weak evidence, uses strict grounded OpenAI output, validates citation IDs against retrieved chunks, shows official source cards, and abstains safely.
- Live production evidence now proves the real public endpoint answers from the temporary reviewed source with an exact official citation, excludes the expired version from hybrid retrieval, restores the prior version atomically, and cleans all fixtures.
- The first public deployment exposed a Vercel serverless runtime import failure: API TypeScript was compiled independently and could not load `src/research/knowledgePipeline.ts` from `/var/task`. Moved the shared primitives to the established `server/*.js` plus `*.d.ts` runtime pattern, updated both API routes and verification imports, and passed API type-checking, 129 contracts, lint, and the production build before redeployment.

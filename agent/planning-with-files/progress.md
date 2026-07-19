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

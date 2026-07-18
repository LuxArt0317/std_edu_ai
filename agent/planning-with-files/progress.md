# Progress

## 2026-07-19 — Issue #86

- Added governed knowledge provenance, audience, review, RLS, UI, repository, and Nexus-grounding support.
- Linked contribution sources to personal, class, and whole-campus calendar events while preserving direct staff contributions.
- Corrected Nexus assessment answer positions to the one-based database contract and prevented unchanged rejected proposals from returning for review.
- Added a consistent Nexus profile avatar and top-aligned reply identity.
- Applied the production schema migration and follow-up foreign-key indexes; production RLS contributor/reviewer behavior passed transactional verification.
- All 89 contracts, lint, TypeScript, Vite build, asset verification, and the live Nexus quiz repair workflow pass.
- PR #87 passed CodeRabbit and Vercel, merged as `f887c10`, and deployed successfully. Both production routes return HTTP 200 with valid recursive asset graphs; the released knowledge, event-source, Nexus-avatar, and rejected-parameter markers are present.

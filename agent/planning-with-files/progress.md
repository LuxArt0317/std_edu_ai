# Progress

## 2026-07-19 — Issue #90

- Traced the disconnected program-subject count to a missing manual curriculum creation entry point despite an existing lifecycle editor.
- Added program-linked curriculum creation, catalog-subject import, visible year/semester placement, version duplication, approval/retirement, and audited draft deletion.
- Replaced newline role capabilities with an accessible searchable multi-select catalog.
- Added private Nexus attachments, durable owner-scoped queued prompts, and server-enforced Ask/Agentic modes.
- Applied both production migrations and repaired the deletion-audit RLS edge case found by the first reversible live run.
- Passed 95 contracts, lint, TypeScript, build, live curriculum/storage/queue/OpenAI checks, CodeRabbit, Vercel, recursive custom-domain asset validation, and deployed attachment analysis. PR #91 merged as `07fecf2`.

## 2026-07-19 — Issue #88

- Audited lesson pages, Tiptap media, public learning-media storage, assessment release RPCs, student assessment flow, and unified calendar data.
- Confirmed current lesson authoring is constrained by a modal and single-file image picker; video is not an inline document node.
- Confirmed assessment policy currently covers timing/attempts/result release but not explicit focus/fullscreen/display/camera controls or append-only integrity events.
- Implemented full-width lesson authoring/preview, inline multi-image/video Tiptap nodes, and an enrolled-student wide reader.
- Implemented assessment review/integrity schema, RLS, preflight, browser-event evidence, protected review RPC, and teacher evidence viewer.
- Implemented configurable STU-branded PNG timetable rendering from the role-filtered unified calendar.
- Applied both production migrations. Student evidence insertion succeeded under simulated JWT/RLS and rolled back; reviewed answers returned the configured score-only shape; advisors show no new security or unindexed-FK issue.
- All 92 contracts, lint, TypeScript, Vite build, recursive asset verification, and live faculty/student LMS checks pass.
- PR #89 passed CodeRabbit and Vercel, merged as `0640658`, and deployed successfully. Both production routes return HTTP 200 with healthy recursive asset graphs and every released lesson-studio, inline-video, student-preflight, integrity-log, and schedule-poster marker.

## 2026-07-19 — Issue #86

- Added governed knowledge provenance, audience, review, RLS, UI, repository, and Nexus-grounding support.
- Linked contribution sources to personal, class, and whole-campus calendar events while preserving direct staff contributions.
- Corrected Nexus assessment answer positions to the one-based database contract and prevented unchanged rejected proposals from returning for review.
- Added a consistent Nexus profile avatar and top-aligned reply identity.
- Applied the production schema migration and follow-up foreign-key indexes; production RLS contributor/reviewer behavior passed transactional verification.
- All 89 contracts, lint, TypeScript, Vite build, asset verification, and the live Nexus quiz repair workflow pass.
- PR #87 passed CodeRabbit and Vercel, merged as `f887c10`, and deployed successfully. Both production routes return HTTP 200 with valid recursive asset graphs; the released knowledge, event-source, Nexus-avatar, and rejected-parameter markers are present.

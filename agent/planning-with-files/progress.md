# Progress

## 2026-07-19 — Issue #94

- Opened Issue #94 after confirming the shared Tiptap editor only accepted chosen image files and did not inspect clipboard image items.
- Reusing the existing `uploadLearningImage` boundary so pasted screenshots inherit MIME, size, Storage, section authorization, and RLS enforcement.
- Added image-only clipboard detection, cursor-position insertion, multiple-image sequencing, shared picker/paste upload handling, and a compact ⌘V/Ctrl+V discovery hint.
- Normal clipboard content returns before `preventDefault`, preserving native Tiptap text and HTML paste behavior.
- All 97 contracts, lint, TypeScript/Vite production build, asset verification, and the reversible live LMS/private-media workflow pass with cleanup.
- PR #95 passed Vercel Preview and repository checks, merged as `1ef71bd`, and deployed Ready as `dpl_6aTPePRXRYsRYRTAQc8UsYqVXzNg`; both custom domains were explicitly assigned to the release.
- Production `/` and `/crm` return HTTP 200 with six recursively verified assets. The released CRM bundle contains clipboard item filtering, image-only detection, cursor insertion, the normal-paste guard, and the ⌘V/Ctrl+V hint.

## 2026-07-19 — Issue #92

- Confirmed the lesson form duplicates obsolete HTTPS/file controls outside the page document, the authoring canvas can compress into a side column, and the Add Page action inherits oversized form-button styling.
- Traced the privileged Learning route to the legacy `course_topics` reader while students use the current module/material/page LMS, explaining the disconnected demo-like experience.
- Opened GitHub Issue #92 and began replacing the split with one repository-backed, role-aware learning library.
- Implemented inline private file nodes with named link cards, signed-URL opening, multiple-file upload, and enrolled-student visibility.
- Removed the separate URL/file inputs and legacy external-resource call to action; retained old private attachments as clearly named file cards.
- Replaced the legacy privileged-role topic UI with the live LMS reader while keeping student-only progress, attendance, assignment submission, and completion controls isolated.
- All 96 contracts, lint, TypeScript, Vite production build, recursive asset verification, and the reversible live teacher/student LMS workflow pass; cleanup completed.
- PR #93 passed Vercel Preview and repository checks, merged as `f9b7df2`, and deployed Ready as `dpl_jFZtVA42wugQNBFSvSYjaW4JHRye` to both custom domains.
- Production `/` and `/crm` return HTTP 200 with six recursively verified assets. The released CRM bundle contains the live library, inline attachment, and private-path markers, excludes the misleading learning-resource action, and serves the compact-page/file-card CSS.

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

# Progress

## 2026-07-19 — Issue #101

- Read the captured failed Topic 1 enrichment run. The agent completed two pages, then proposed a page for a stale/deleted material and stopped instead of re-resolving the target and continuing the remaining four materials.
- Confirmed generated page content can contain raw Markdown in `content_html`, which the Tiptap/HTML lesson reader renders as literal syntax rather than structured headings and lists.
- Opened Issue #101 for resilient rich-page continuation, approved media-source handling, conversation rename/delete, and compact attachment presentation.
- Added stale-target validation and same-run refresh/replanning for material-page actions, and corrected the API boundary that had reduced the client run's 32-action allowance back to eight.
- Added a strict rich-lesson content boundary: model instructions require semantic HTML, the client normalizes before review, and the repository normalizes again before storing. Flattened Markdown headings/lists are converted, unsafe nodes/attributes are removed, and only exact HTTPS image and supported video sources survive.
- Added durable thread rename/delete controls, valid next-thread restoration, queue/message cascades, and deletion of private `nexus-attachments` objects.
- Replaced verbose attachment filenames with compact accessible openable tiles and composer image/file previews with icon-only attachment selection.
- All 109 contracts and the production build pass. The reversible live Issue #101 workflow proved semantic HTML, human instructional framing, authorized inline media, stale-ID recovery, page persistence, thread rename/delete cascade, and private attachment cleanup against production Supabase/OpenAI.

## 2026-07-19 — Issue #98

- Opened Issue #98 for clearer prospect-card actions and validated drag-and-drop admissions transitions.
- Confirmed the current board only increments stages through a fixed Advance button and does not validate destination-stage completeness before persisting to `admission_leads`.
- Added desktop drag/drop across all five stages with visible drop targets and retained the accessible Advance action for keyboard and touch users.
- Added stage-specific completeness gates: Engaged requires accountable ownership, at least one reliable contact method, and a next action; Application, Review, and Admitted require ownership, email, phone, and next action. Missing data opens a focused form, assigns the signed-in operator, persists the full record, and rolls back optimistic UI on failure.
- Recolored Advance, Edit, Registrar handoff, and Archive into distinct primary, informational, controlled-handoff, and destructive actions.
- All 103 contracts, lint, TypeScript/Vite build, assets, and the reversible live admissions-role stage/required-fields/owner/rollback workflow pass.
- PR #99 and contact-validation hardening PR #100 passed CodeRabbit/Vercel and merged as `39a4348` and `7bbd0ad`.
- Production `/` and `/crm` return HTTP 200 with six recursively verified assets. Both custom domains serve the focused completion prompt, reliable-contact validation, accountable-owner assignment, drag/drop controls, and semantic action colors.

## 2026-07-19 — Issue #96

- The screenshots prove two independent sources of confusion: staff navigation exposes both Teaching and Learning, while the newly created `My Favorites` material is a draft and therefore intentionally excluded by student RLS.
- Opened Issue #96 to consolidate staff course work, preserve one student Learning destination, and make publication dependencies actionable in the authoring surface.
- Consolidated each role to one Courses entry, retained route compatibility, and added an exact Student view inside teacher authoring over the same module/material/page records.
- Added explicit module/material visibility explanations, direct publish/unpublish actions, and immediate-publish defaults while retaining intentional drafts.
- The first live student check exposed an ambiguous original RLS predicate: its unqualified material `status` resolved to the module row. Replaced the policy with independently qualified material/module publication, timestamp, unlock, enrollment, and manager predicates.
- All 100 contracts, lint, TypeScript/Vite build, guarded assets, and the reversible production LMS workflow pass. The live workflow proves draft denial, immediate post-publish visibility, protected rich pages/files, student write denial, grading, quiz, attendance, and cleanup.
- PR #97 passed CodeRabbit and Vercel, merged as `dad07d4`, and deployed Ready as `dpl_BHXMCebouW17VKBU9dckVsK6tBp6` to both custom domains.
- Production `/` and `/crm` return HTTP 200 with six recursively verified assets. The released lazy CRM bundle contains the exact Student view, direct publication controls, hidden-draft state, and shared-record/no-synchronization markers.

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

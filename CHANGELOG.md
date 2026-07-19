# Changelog

## Unreleased

- Began Issue #104 implementation with child Issues #105–#116, a machine-verifiable Codex completion controller, and an evidence ledger that distinguishes implemented gates from external research dependencies.
- Deployed the connected research foundation to production Supabase: governed/versioned knowledge and chunks, AI retrieval/citation/evaluation traces, accessible campus graph entities, pseudonymous protocol/consent/task/questionnaire records, and administrative workload metrics.
- Enabled RLS on all 31 new tables, added 56 foreign keys and 56 policies, explicitly revoked anonymous access to chunks/evaluation/participant data, refreshed generated TypeScript types, and documented the architecture in `docs/RESEARCH_SYSTEM_SCHEMA.md`.
- Added static schema/privacy contracts and a reversible production workflow proving public metadata, protected chunks, accessible routes, connected study records, and complete cleanup. Closed schema dependency Issue #117; research outcome work remains open in #105–#115.
- Added the draft 0.1.0 research protocol, prespecified analysis/reporting rules, a machine-readable 15-claim evidence matrix, explicit external ethics/governance dependencies, and a mandatory traceability verifier. Expected benefits remain hypotheses until approved measured evidence exists.

- Added the `neededv3.md` relationship-first contract and replaced duplicate/free-text relationship inputs with authoritative, parent-scoped selectors across curricula, profiles, students, classes, CRM, admissions, campaigns, attendance, schedules, governance, and Nexus.
- Curriculum rows now retain exact catalog `courseId` values, show immutable subject identity, select earlier prerequisite course IDs, recover legacy rows through explicit linking, and return newly created catalog subjects to the unfinished curriculum.
- Added structured campaign audiences with generated recipient review, admissions program foreign keys, database relationship triggers, generated TypeScript contracts, static regression verification, and reversible owner-role production verification.
- Released as `7d0aa83`; Vercel deployment `dpl_Buos2NzKBoCbcbjShy7udHRMwp22` is Ready, both custom-domain routes return HTTP 200, and every referenced production asset was fetched successfully.

- Polished the admissions pipeline primary action with a high-contrast green treatment while retaining the released stage-colored actions, validated drag-and-drop, and destination completeness dialog.
- Released as `0ffd637`; Vercel deployment `dpl_C4kER9tLbbnFkqnhtunZQKCc7vqG` is Ready, `/crm` returns HTTP 200, and the production lazy assets contain every add/advance/edit/handoff/archive, drag-target, and completeness-dialog marker.

- Made long Nexus lesson-enrichment goals resilient to stale material IDs by refreshing authoritative LMS context and replanning the same run instead of terminating it; the API now preserves the full 32-action safety ceiling.
- Constrained AI-authored lesson pages to sanitized Tiptap-compatible semantic HTML, with a Markdown-to-HTML compatibility boundary, human instructional framing, retained reputable-media authorization, and exact inline image/video nodes.
- Added persisted Nexus conversation rename and deletion with current-thread recovery, queued-message cascade, private attachment cleanup, compact image/file tiles, accessible open/remove controls, and private attachment previews.
- Released through PR #102 as `a88a9d6`; Vercel production deployment `dpl_5MuducvgXyBxhbezH3mKoQrZgaTc` is Ready on both custom domains, recursive assets contain every conversation/stale-target marker, and the deployed API produced exact-target semantic HTML with authorized inline media under a 32-step run.

- Added validated admissions pipeline drag-and-drop with destination-stage completeness prompts, accountable-owner assignment, calibrated probabilities, keyboard/touch Advance parity, persistence rollback, visible drop states, and a clearer blue/purple/red action hierarchy.
- Released through PRs #99 and #100 as `39a4348` and `7bbd0ad`; Vercel production is Ready on both custom domains and serves the drag, contact-validation, accountable-owner, rollback, and semantic-action contracts.

- Consolidated staff Teaching and Learning navigation into one Courses workspace with teacher authoring, an exact published Student view, student learning, and scoped staff review over the same Supabase LMS records.
- Made module/material publication dependencies explicit, added direct publish/unpublish actions, defaulted new content to immediate publication, and preserved deliberate draft controls with clear hidden-state feedback.
- Corrected the production LMS read policy so draft materials cannot be exposed by a published parent module; learner reads now require independently published material/module records, publication timestamps, unlock eligibility, and section access.
- Released through PR #97 as `dad07d4`; Vercel production is Ready on both custom domains and route/assets plus every unified-Courses, Student-view, publication-control, and hidden-draft marker pass.

- Added direct clipboard screenshot paste to Tiptap lesson pages for macOS and Windows, including multiple clipboard images, insertion at the active cursor, existing protected media validation, progress/error feedback, and untouched ordinary text/HTML paste.
- Released through PR #95 as `1ef71bd`; Vercel production is Ready on both custom domains and recursive route/assets plus every clipboard-filter, cursor-insertion, normal-paste, and shortcut-hint marker pass.

- Replaced the privileged-role legacy topic reader with the same live Supabase-backed LMS module, material, and multi-page lesson graph used by students, with role-appropriate read-only review states.
- Removed misleading standalone HTTPS and file fields from lesson creation; teachers now insert named private file links, images, and videos directly into the lesson page where learners consume them.
- Made Add Page compact, constrained the lesson canvas to the available width, and kept the editing toolbar above the document while the course studio scrolls.
- Released through PR #93 as `f9b7df2`; Vercel production is Ready on both custom domains and recursive route/assets plus every live-library, inline-file, compact-page, and removed-legacy-action marker pass.

- Added direct program-linked curriculum creation, effective-year versioning, visible year/semester subject placement, catalog-subject import, prerequisites, blocks, approval/retirement, duplication, and audited draft deletion.
- Replaced raw newline role-capability editing with a searchable, accessible multi-select capability catalog.
- Added private Nexus image/PDF/text attachments, database-backed prompt queuing, and explicit non-mutating Ask versus confirmation-gated Agentic modes.
- Applied RLS-protected production migrations and passed reversible live verification for curriculum placement/deletion, private attachments, queue transitions, and Ask-mode action suppression.
- Released through PR #91 as `07fecf2`; Vercel production is Ready, both custom-domain routes return HTTP 200, all release markers are present, and the deployed API analyzed a real attachment in non-mutating Ask mode.

- Replaced constrained lesson-material dialogs with a wide course studio and added multi-image insertion plus uploaded/embedded inline video on every Tiptap lesson page.
- Added an immersive student reading mode with page navigation and responsive image/video rendering inside the lesson flow.
- Added teacher-controlled post-attempt review plus disclosed fullscreen, focus, extended-display, camera, multiple-camera, and clipboard checks with append-only RLS evidence and a teacher integrity log.
- Added a configurable high-resolution student schedule PNG with STU identity, rooms, deadlines, weekend selection, and color themes.
- Released through PR #89 as `0640658`; Vercel production is Ready and the custom domain serves every immersive-lesson, assessment-integrity, and schedule-export marker.

- Added governed rich-text knowledge contributions sourced from staff expertise or linked personal, class, and whole-campus events, with institution/role/class/staff audiences and contributor/reviewer provenance.
- Added RLS-enforced contributor submission and owner/administrator/librarian verification, production indexes, and verified-knowledge grounding for Nexus.
- Added a consistent Nexus profile avatar and reply identity, corrected quiz answers to the database's one-based choice contract, and forced genuine parameter changes after rejected proposals.
- Released through PR #87 as `f887c10`; Vercel production is Ready and the custom-domain recursive asset graph serves all governed-knowledge and Nexus-correction markers.

- Added a role-aware unified school calendar with month, week, and agenda views, filters, event details, and existing conflict-safe schedule CRUD.
- Composed personal, class, assessment, attendance, learning-release, standalone-grade, institutional, enrollment, and academic-term dates without duplicating their authoritative records.
- Documented and verified the calendar schema, Supabase RLS audience rules, and production data coverage.

- Redesigned Nexus as a compact, non-blocking Messenger-style popup with no page overlay or blur.
- Moved live goal progress into a collapsed assistant reply and preserved focused clarification questions.
- Added proposal comments and same-goal retries, plus pre-review parameter validation and complete quiz/exam question payloads.

- constrained the compact Nexus goal card and activity row to intrinsic content height so the thinking state cannot stretch into a large empty panel
- released through PR #81 as `1849406`; Vercel production is Ready and serves the 150px card and 42px activity-row constraints

- made Nexus goals compact by default with optional plan/action details, accurate remaining-work counts, and a separate clarification card
- expanded the agent's grounded platform context and required it to infer safe defaults and inspect existing records before asking the user
- added explicit plan, remaining-work, and resumable clarification decision fields; successful actions now continue through the same run until the complete goal is proven
- raised the bounded complex-goal allowance to 32 actions and thirty minutes while preserving repetition, role, confirmation, RLS, and student assessed-work safeguards
- added live-model evidence for department → program multi-action continuation and ambiguous-program clarification → resumed program creation
- released through PR #79 as `064faa8`; Vercel production is Ready and the custom-domain CRM serves compact details, remaining-work, clarification-card, and same-run continuation markers

- added `neededv2.md`, a schema-wide role/action/lifecycle contract that treats visible UI, real services, authorization, audit behavior, automated coverage, and production evidence as one completion requirement
- added a discoverable structured curriculum editor for draft metadata, subject creation/edit/removal/reordering, units/categories/placement, prerequisite links, block templates/capacities, approval, retirement, and immutable version duplication
- deployed an atomic curriculum lifecycle RPC with RLS role checks, adopted-version immutability, normalized mapping rebuilds, and narrowly constrained controlled-action evidence
- added authorized governance-audit CSV export and live create/edit/approve/immutability/retire/cleanup verification
- released through PR #77 as `c0d8cae`; Vercel production is Ready and the custom-domain CRM serves the curriculum editor, versioning, subject/block management, reason, and audit-export controls

- documented the complete production schema and the authoritative Department → Program → Curriculum → Subject → Class → Enrollment → Student relationship chain
- added an authoritative `students.program_id` foreign key with compatibility backfill and synchronization, then deployed it to production Supabase
- rebuilt Academic Office around program pathways with curriculum origin, relationship health, linked subjects/classes/staff/students, recovery actions, and class-aware navigation into teaching, learning, assessments, grades, and schedule
- upgraded student provisioning/editing to store the program relationship by ID while retaining the legacy program label for compatibility
- released through PR #75 as `7234ac0`; the Vercel production deployment is Ready and `stu.best/crm` serves the connected-program and contextual-workspace markers

- restored Nexus to the last-used valid conversation and its newest message, with near-bottom following that preserves intentional upward reading
- added visible thinking, executing, refreshing, confirmation, completion, and stopped states; the closed floating control now exposes background activity without unmounting the run
- replaced the misleading `step of 8` presentation with completed-action count and an explicit eight-action safety limit, plus named action outcomes
- released through PR #73 as `710d6df`; deployment `dpl_4x6t7wRiLWaqpgwBoWAoSu8hmRZt` is Ready and production serves the conversation-continuity markers

- expanded Nexus into a governed cross-platform tool catalog for academic setup, dependent curriculum goals, LMS authoring and maintenance, schedules, communications, support cases, attendance corrections, and institutional initiatives
- added exact-ID platform context, double role authorization, repository/RLS execution, returned record observations, and refreshed-data continuation between confirmed goal steps
- retained hard safety boundaries for credentials, owner replacement, direct role changes, final grade publication, binary uploads, and student assessed work
- released through PR #71 as `bedc88b`; Vercel deployment `dpl_FH7gZMMjm6UQ1W34KEkPBGG3hP8Y` is Ready and the production CRM serves the department and service-tool markers

- fixed curriculum confirmation when the model omits or returns a stale department ID by retaining valid selections, automatically choosing the sole active department, or requiring an explicit active-department choice in the review card
- released through PR #69 as `ae5b874`; Vercel deployment `dpl_EVhJjgZUKGFQYAdu4yEJkCUCLpvi` is Ready and both custom domains serve the department-resolution controls

- added Enter-to-send to the Nexus composer while preserving Shift+Enter multiline input, IME composition, existing loading protection, and form validation
- released through PR #67 as `aaf598a`; Vercel deployment `dpl_5QuWofnyhqoPNNsdWrTvqZGiAAdQ` is Ready and both custom domains serve the Enter-to-send composer

- fixed protected-owner Nexus confirmations by authorizing client actions with the trusted signed-in role instead of the optional interface-preview role
- stopped repeated same-user `SIGNED_IN` and `TOKEN_REFRESHED` events from remounting the authenticated portal or showing a blocking loader after command-tab/browser visibility changes, while preserving sign-out, recovery, user-update, and account-change handling
- added stable-session and owner-role regression contracts plus live protected-owner curriculum generation coverage
- released through PR #65 as `72639bc`; Vercel production deployment `dpl_3tzKLuQzpoqeWk9bTDDWShtdUNFU` is Ready and both custom domains serve the stable-session authentication policy

- fixed Nexus goal startup on WebKit/Safari and made chat-history persistence non-blocking so a recoverable storage failure cannot mark an operational goal impossible
- added a confirmation-gated `create_curriculum` action that generates and atomically saves a complete multi-year program, subject sequence, prerequisite graph, and yearly block templates through the signed-in user's Supabase authorization
- added the Academic Office Curriculum Library plus strict generation, idempotency, rollback, RLS, role-boundary, live OpenAI, and live database acceptance coverage
- released through PR #63 as `b624417`; Vercel production deployment `dpl_5C9Q6qABcbw6QuEybffVLRh632ns` is Ready and both custom domains serve the curriculum action, preview, and library markers

- removed the completed repository-scoped Stitch session/stop hooks and their obsolete hook documentation
- upgraded Nexus AI from one-shot proposals to a bounded eight-step goal loop with real action observations, automatic safe navigation, mutation-by-mutation confirmation, cancellation, cycle detection, a five-minute limit, and explicit complete/impossible outcomes
- added a visible goal/progress card, returned record IDs for dependent LMS steps, structured agent decisions, privacy-minimized observation context, and contract/live coverage while preserving Supabase RLS and the absolute student assessed-work boundary
- released the goal-driven agent through reviewed PR #61 as `efc8f37`; Vercel deployment `dpl_Eq1RARBXEkQi4KTpU9xQjMi4tyUb` is Ready and both custom domains pass recursive route, asset, stylesheet, onboarding-shutdown, and agent-marker diagnostics

- generated and HTML-audited fresh Google Stitch designs for all 23 authenticated CRM surfaces, including separate student/teacher Learning, Assessment, and Grade variants plus every Learner Support page
- applied a shared Stitch-derived authenticated workspace language with live role/page context, tonal page framing, consistent focus states, skip links, current-page semantics, responsive stacking, and reduced visual noise while leaving `/` unchanged
- added real Supabase password-reset and recovery completion with show/hide password, converted Learner Support header shortcuts into working navigation, and replaced its toast-only Export with a dated section-scoped JSON download
- replaced the completed Phase 56 hook with a strict Phase 58 guard that counts every page row and requires prompt, screen, HTML-control, implementation, test, review, deployment, and production evidence
- released the 23-surface Stitch phase through reviewed PR #59 as `99acb34`; Vercel deployment `dpl_GGMBaMex7QxWRzmmEFn7SYPhuECr` is Ready and both custom-domain routes plus the six released Phase 58 markers pass recursive diagnostics

- established the official Google Stitch MCP project and reusable prompt/evidence workflow for authenticated `/crm` UI/UX while explicitly protecting the public `/` landing design
- validated generated Stitch HTML controls against real teacher, student, account, admissions, campaign, and case workflows; retained required production actions that Stitch omitted or rendered ambiguously
- made LMS lessons explicitly openable with teacher preview/edit/delete actions, default student lesson selection and next-lesson navigation, plus clearer People & Roles account-management disclosure and 44px accessible action targets
- replaced the completed Issue #48 stop hook with an Issue #56 completion guard that requires Stitch evidence, control contracts, implementation proof, review, deployment, and production diagnostics
- released the Stitch workflow phase through reviewed PR #57 as `8c7c130`; Vercel deployment `dpl_8qKDB5r5j2NQYaC7miqeC51X9CFP` is Ready and both custom-domain routes plus released workflow markers pass recursive diagnostics

- completed the full 401-action `needed.md` role catalog across all 14 production roles with visible operations, repository services, RLS/trusted workflows, controlled audit evidence, and live account-boundary verification
- added mandatory first-login password replacement, complete Auth/profile identity editing, scoped department staff maintenance, accepted-applicant Registrar handoff, sensitive-case access evidence, and approved bulk campaign delivery
- added governed institutional policy/initiative proposal, approval, assignment, escalation, rejection, and completion; Registrar CSV exports; and archive-only CRM retention
- added teacher-controlled assessment availability, duration, attempts, score release, and explanation release with direct-column denial, masked held-result responses, governed result history, and live privacy verification
- released the complete catalog through reviewed PR #55 as production commit `c454e4c`; Vercel deployment `dpl_G2kMBddcg4F2sRxRaUxpoAdo16c2` is Ready and both custom-domain routes pass recursive diagnostics

- Added a release-blocking `needed.md` catalog verifier that maps every action to implementation evidence and names unresolved governed workflows precisely.

- added controlled student withdrawal and record merging, program archival guards, reasoned enrollment transitions, and teacher return/void submission actions with immutable before/after evidence
- fixed department status values to match the production active/inactive contract and removed direct program deactivation from the ordinary editor

- added a live notification center with unread counts, read/unread controls, governed student-to-teacher/advisor/support messaging, staff approval or rejection, portal delivery, and immutable communication audit evidence

- added trusted repository Codex SessionStart and Stop hooks that load Issue #48 continuity context and block a completed handoff while the authoritative Phase 48 catalog still has unchecked requirements

- added institutional email invitation and resend controls, owner-managed role capability catalogs, and visible department, program, class, and advisee responsibility assignments
- added governed final-grade publication and post-publication correction, academic-term closure, and student attendance-correction requests with authorized teacher decisions and immutable before/after audit evidence
- added RLS-protected responsibility, attendance-correction, and controlled-action records with complete foreign-key indexes and production Edge Function version 5

- added owner-only live Auth directory activity, explicit audited session revocation, temporary-password rotation, and bulk non-owner account provisioning with one-time credential handoff
- added student self-service support requests linked to the authenticated student's own SIS record, with status tracking and staff-only triage controls

- published the exhaustive 14-account role/action catalog and entity lifecycle definition of done
- added protected-owner general account provisioning for every non-owner role in People & Roles using the existing server-only Auth boundary
- replaced immediate role dropdown mutation with an impact preview, mandatory reason, explicit confirmation, session-refresh notice, and immutable audit workflow
- added Auth-enforced activation, suspension, archival, and restoration with reasoned confirmation, protected-owner denial, immutable lifecycle history, and a visible governance activity feed
- added a reversible production acceptance test proving suspension blocks a real account login and activation restores it without leaving test state behind

- expanded Ask Nexus AI into a role-aware action agent for workspace navigation, LMS authoring, assessments, announcements, attendance, schedule events, and learner-owned progress
- added authenticated server and client action allowlists, stale-target checks, explicit confirmation, ordinary repository/RLS execution, and privacy-minimized action outcomes
- enforced a layered student boundary that prevents Nexus from answering, completing, modifying, grading, or submitting any assignment, quiz, exam, or project
- added API and live OpenAI role tests proving faculty action proposals and student assessed-work denial
- released through PR #47 to production deployment `dpl_HEEw9bLnaf5QwP828Xsh3P776KQp` and verified both custom-domain routes plus the emitted action-agent bundle

- added the authoritative platform PRD with a role, entity-lifecycle, rich-content, AI-safety, security, UX, and production acceptance contract
- completed visible pre-filled editing for academic departments, programs, terms, subjects, sections, schedules, students, and teacher/staff profiles
- completed teacher assessment authoring and editing for quizzes, exams, assignments, and projects, including protected correct answers, rich instructions, question replacement before attempts, safe attempt locking, and detail access
- completed multi-page material editing, page add/edit/remove/reorder, module dialogs, attendance-session editing, and rich-image announcement editing
- added complete CRM record editors for student-success records, cases, prospects, campaigns, tasks, signals, append-only interactions, and knowledge, with production RLS CRUD verification and cleanup
- added editable grade score/letter/feedback/publication workflows plus managed rich images for assessments, announcements, cases, campaigns, signals, interactions, and institutional knowledge

- added RLS-protected multi-page learning materials, public instructional-image media with manager-only uploads, and polished page-by-page student reading
- upgraded the shared Tiptap editor with managed image uploads and reused it for institutional knowledge publishing
- added create, edit, and delete workflows for verified knowledge plus update/delete operations for LMS modules, materials, and lesson pages
- replaced hardcoded CRM greeting, date, alert counts, and knowledge-health percentage with authenticated and live database values

- removed Learner Support tab loading by keeping both workspaces mounted, warming CRM data after sign-in, deduplicating its fetch, and restoring it synchronously from memory
- isolated the CRM snapshot by clearing it with the authenticated platform snapshot on sign-out

- fixed production account-creation requests being blocked after CORS preflight by allowing Supabase's `x-client-info` header in both provisioning Edge Functions
- added actionable Edge Function error extraction so CRUD failures show the server's real validation or authorization message

- added a Tiptap-powered rich lesson editor and a polished, responsive student reading experience for structured learning materials
- upgraded Nexus AI to prepare role-authorized modules, materials, assignments, announcements, and attendance sessions with explicit human confirmation before every write
- added an authenticated in-memory platform snapshot with background refresh and sign-out isolation to remove repeated blocking portal loads
- renamed Student CRM to Learner Support so its advising, intervention, attendance-risk, and Student 360 purpose is clear

- added a complete integrated LMS course studio with ordered modules, lessons, links, videos, activities, private file materials, assessments, assignment submissions, grading feedback, attendance, announcements, and learner progress
- added the enrolled-student learning path with completion tracking, private material access, assignment submission, feedback, grades, and attendance visibility
- deployed six RLS-protected LMS tables, a private 50 MB constrained Storage bucket, enrollment/score integrity triggers, explicit Data API grants, and optimized policy/index coverage

- transformed Academic Office from a read-only catalog into working student, department, program, term, subject, class-section, roster, and schedule management
- added owner/admin/registrar student account provisioning with a confirmed Supabase Auth identity, linked profile/SIS records, validation, and compensating cleanup
- added transactional capacity-aware enrollment and database-enforced room, faculty, and shared-student schedule collision prevention
- added production integration coverage that reversibly verifies enrollment, conflict rejection, cleanup, and student provisioning denial

- added a comprehensive 31-page Word manual covering the public website, STU Nexus school OS, CRM modules, all 14 canonical roles, end-user procedures, AI and security boundaries, technical architecture, deployment, troubleshooting, and governance
- added a deterministic document builder, accessible Word heading/navigation structure, fixed-width reference tables, and render-based visual quality verification

- added a fail-closed production credential exporter that verifies all 14 Auth roles, protected-owner claims, and RLS-visible profiles before atomically writing the local root Markdown sheet
- explicitly ignored `PRODUCTION_ROLE_CREDENTIALS.local.md`, enforced owner-only file mode `0600`, and kept passwords out of logs, Git, CI, and issue tracking

- temporarily disabled role onboarding for every account by disconnecting its runtime component, progress loading/writes, action signals, Readiness control, and guided overlays
- preserved the onboarding implementation, migrations, and RLS-protected historical data for a deliberate future re-enable
- changed build and live production diagnostics to reject released CRM JavaScript containing onboarding UI markers while the feature is disabled

- fixed the production CRM sign-in screen losing its route stylesheet by replacing a conditional lazy-import callback with distinct statically analyzable route boundaries
- corrected the authentication card's border-box sizing so its padding cannot push the form outside narrow mobile viewports
- added a mandatory post-build asset-graph verifier that rejects CRM bundles missing the semantic authentication stylesheet
- strengthened the live production diagnostic to detect HTTP-200 deployments that render an unstyled portal and report the missing CSS contract directly

- restored Vercel's standard Vite framework detection by removing repository-level framework, install, build, and output overrides
- upgraded the supported Vercel and local runtime from Node.js 22 to the major-only Node.js 24 line
- removed the redundant `vercel-build` script while preserving the `/crm` SPA rewrite required for direct navigation

- added premium first-login onboarding for all 14 school roles with responsive spotlight masks, directional instructions, real navigation-action detection, role-specific scenario checks, pause/resume, review, and restart
- added a persistent Readiness Center with an evidence-only 0–100 score; reading instructions alone does not count as understanding and readiness never changes authorization
- deployed RLS-protected, versioned `onboarding_progress` and append-only `onboarding_events` tables with explicit Data API grants and covering ownership indexes
- added all-role onboarding contracts plus live 14-account RLS acceptance coverage for self progress, owner aggregate visibility, forged-role denial, and event-history deletion denial

- replaced the empty pre-JavaScript root with a branded boot and stalled-load recovery shell so blocked or delayed bundles never produce a blank green screen
- added a global React error boundary for render and lazy-chunk failures with latest-version reload and local-session reset actions
- bounded Supabase session, identity, sign-in, sign-out, and multi-query portal startup so network or cached-session failures resolve to actionable UI
- added regression coverage for the static boot contract, lazy-route recovery, startup timeouts, and session-reset path

- provisioned one confirmed production Auth identity for each of the 14 canonical school roles, with unique credentials stored only in the macOS keychain
- added an owner-only Supabase Edge Function for validated non-owner account creation and credential rotation through the server-side Auth Admin API
- added an atomic role-directory synchronization migration plus credential-safe live verification of every Auth claim and profile role
- documented the complete role sign-in directory without exposing passwords

- revalidated the protected owner login and refreshed its secure local clipboard handoff without exposing plaintext credential material

- expanded `/crm` into a unified role-aware school operating platform for owner, leadership, administrators, department heads, faculty, advisors, admissions, finance, support, librarians, and students
- promoted `winsonbaring10@gmail.com` to an immutable single-owner tier with safe role preview, audited role assignment, and synchronized Auth/profile authorization
- added production departments, programs, terms, courses, sections, rosters, topics, announcements, notifications, schedules, assessments, protected answer keys, attempts, grades, grade-scan jobs, and persistent chat data
- added a working seeded quiz with transactionally enforced enrollment, attempt limits, protected-answer scoring, feedback, and review controls
- added role-filtered learning, teaching, assessment, gradebook, schedule, academic-catalog, and people-governance interfaces
- added authenticated OpenAI multi-turn school chat and vision grade-sheet extraction with structured output, confidence flags, rate limits, privacy-minimized context, and mandatory human review
- provisioned isolated faculty and student validation identities, linked them to safe SIS seed records, and verified their real production RLS boundaries
- added API contracts and live owner, CRM, role, quiz, grade-privacy, chatbot, and grade-vision integration tests
- resolved all Supabase unindexed-foreign-key advisor findings and documented the intentional trusted workflow functions
- split the public homepage and authenticated school platform into route-specific production bundles
- enforced grade-item score ceilings and atomic, enrollment-validated approval for human-reviewed AI grade scans
- locked profile authorization columns against direct authenticated writes and aligned the UI role with fresh trusted Auth metadata
- published the shared authentication helper as a directly traceable Node ESM module with a strict TypeScript declaration, preventing Vercel runtime import failures

- added a plain-language STU Nexus portal guide covering its audience, workspaces, AI role, example workflows, security boundaries, and current seed-data status
- verified the production owner credential against Supabase Auth and added a secure local clipboard handoff without exposing plaintext secrets
- activated the production `stu_edu_ai` Supabase project with three reviewed migrations, 11 RLS-protected CRM tables, explicit Data API grants, operational indexes, knowledge search/vector support, and safe seed records
- added production Supabase Auth login, session restoration, staff-role enforcement, and secure logout for `/crm`
- replaced continuity-only CRM reads with live Student 360, cases, tasks, admissions, campaigns, knowledge, signals, interactions, and profile queries
- added optimistic task, admission-stage, and case-status mutations with remote persistence, rollback, and continuity caching
- provisioned the initial owner administrator using a generated credential stored only in the macOS login keychain and locked the bootstrap RPC afterward
- added generated TypeScript database contracts and privacy-minimized AI audit logging

- added STU Nexus at `/crm`, a premium responsive CRM spanning command center, Student 360, Success Radar, admissions, cases, campaigns, knowledge, and analytics
- added persistent stateful demo workflows for tasks, applicants, cases, student search, profiles, and AI-assisted interventions
- added a server-only OpenAI Responses API endpoint with validation, rate limiting, structured output, de-identification, timeout handling, safety identifiers, and client continuity fallback
- added a production Supabase migration with normalized CRM data, role-based RLS, operational indexes, full-text/vector knowledge search, privacy-minimized AI audit logs, and demo seeds
- added API contract tests plus `/crm` production-build and route verification
- kept API contract tests outside Vercel's reserved `/api` directory so production publishes only the intended CRM assistant function

- scaffolded the repository with the latest Vite React TypeScript app
- replaced the starter page with an AI-enhanced Shu-Te University landing page
- added a mocked campus AI assistant service and knowledge base
- documented project understanding, setup, and planning state
- hardened the Supabase browser client so missing Vercel env vars no longer break the app at startup
- added fallback messaging for missing Supabase configuration or unavailable `todos` data
- added an explicit Vercel deployment configuration with a Node.js 22 runtime pin, lockfile-based installs, Vite output settings, and SPA rewrites
- repaired the npm 11 lockfile metadata required for deterministic Vercel `npm ci` installs
- rebuilt the homepage as a section-complete, responsive reconstruction of the current `stu.edu.tw` experience
- added official navigation, carousel, audience, performance, story, admissions, news, hot-link, public-information, contact, social, and footer destinations
- moved the research-driven AI assistant into a floating drawer so it does not disrupt the cloned homepage layout

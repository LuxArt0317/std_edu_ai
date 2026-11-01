# Findings

- hiding only the Readiness button would not fully disable onboarding because mounting `RoleOnboarding` automatically loads or creates progress and can persist evidence; the shutdown boundary must remove the component mount itself
- removing `RoleOnboarding` from `UnifiedPortal` prevents every onboarding repository effect while preserving database history and implementation files for a deliberate future re-enable
- a build assertion against the three stable onboarding UI markers ensures tree-shaking actually excludes the runtime feature rather than merely hiding its visible trigger

- production HTTP 200, a non-empty React DOM, and reachable JavaScript assets do not prove a route is usable; the `/crm` incident rendered the full sign-in DOM with browser-default controls because its route CSS was absent from the runtime preload graph
- Vite normally extracts CSS used by async chunks and loads it before evaluating the chunk, but the route-dependent ternary inside a single `lazy` callback produced an incorrect dependency association under Vite 8.1.4
- separate top-level lazy boundaries keep both dynamic imports statically analyzable and allow Vite to associate each route with its own extracted CSS
- deployment verification must require meaningful selectors from the fetched CRM CSS, not merely count CSS responses or search the CRM JavaScript bundle

- Vercel automatically configures install, build, and output settings after framework detection; `framework`, `installCommand`, `buildCommand`, and `outputDirectory` in `vercel.json` are repository-level overrides rather than requirements for a standard Vite deployment
- the SPA rewrite is independent routing configuration and must remain so direct requests such as `/crm` resolve to the React application shell
- Vercel supports Node.js 24 for builds and functions, and a major-only `24.x` engine range lets Vercel select the maintained minor and patch release

- a credible all-in-one school platform needs database-enforced separation between the owner, institutional administrators, academic staff, specialist staff, teachers, and students; hiding navigation items is not authorization
- answer keys must live in a separately protected table and deterministic database grading must remain the source of truth for objective quizzes
- AI grade-sheet scanning should extract candidate values and confidence only; a teacher must review before any grade is saved or published
- durable chatbot history belongs in first-party Supabase tables while only bounded, privacy-minimized context is sent to OpenAI
- a protected owner tier plus an owner-only role preview is safer and more useful than giving the main account an ordinary mutable admin role
- real faculty and student Auth sessions confirm that RLS filters course, topic, answer-key, grade, schedule, and mutation access independently of interface navigation
- PostgREST may return a successful response for an RLS-filtered update that affected zero rows, so authorization tests must verify persisted state rather than relying only on the error field
- transactional assessment grading provides a reliable boundary for attempt limits, enrollment, scoring, and cleanup while keeping answer keys unavailable to learners
- all new foreign keys need covering indexes even in a new low-volume deployment; the final performance advisor now reports only expected unused-index information
- the owner credential was present as a macOS internet-password entry even though it was not visible where the user expected in Keychain Access
- the stored owner credential remains valid against production Supabase Auth and resolves to the trusted `owner` app role
- a verified clipboard handoff gives the owner immediate access without copying the secret into chat, terminal output, GitHub, or repository files
- the production `stu_edu_ai` Supabase project is healthy, empty, and now accessible through MCP
- a production-ready activation requires both live repositories and a real authenticated staff session; a browser publishable key alone must never bypass RLS
- newly SQL-created tables may require explicit Data API grants, which the prepared migration provides alongside RLS
- the initial administrator must be bootstrapped through a constrained, auditable path and subsequent authorization must rely on trusted `app_metadata`
- a generated 40-character owner password stored in the macOS login keychain avoids plaintext credential handoff while keeping the deployed CRM immediately usable
- production RLS validation confirms anonymous requests are denied and trusted admin JWTs can read and mutate only through explicit policies
- policy-specific insert/update rules remove the multiple-permissive-policy advisor findings without broadening authorization
- Supabase's leaked-password-protection setting is a dashboard-level control not exposed by the connected MCP toolset; the strong generated credential substantially mitigates the current warning until that toggle is available
- hosted self-signup is constrained by email-delivery rate limits and is not an appropriate administrative provisioning workflow for a complete role directory
- an owner-authorized Edge Function backed by the Auth Admin API provides an idempotent creation/rotation boundary while keeping the service role server-only and excluding second-owner creation
- acceptance testing is strongest when every canonical role has a real confirmed identity and the verifier checks both the fresh Auth claim and the RLS-visible profile role
- a healthy Vercel deployment can still show an empty green screen when its HTML ships an empty React root and the entry or lazy route fails before mounting; useful pre-JavaScript content is a separate production requirement
- client error recovery must cover the entry-before-mount path, React/lazy-chunk failures, stalled authentication, stalled multi-query data loading, and corrupted or locked device-local session state
- onboarding comprehension is more credible when the score counts demonstrated interface actions and correct scenario answers, not passive step views or dismissal
- role onboarding must use the authenticated role rather than owner preview state; preview changes presentation but must not forge training evidence for another role
- a four-panel spotlight mask leaves the real highlighted control clickable while blocking unintended surrounding actions, and the navigation revealer makes the same contract work on mobile
- versioned per-user/per-role progress supports role changes and future journey revisions without overwriting historical readiness
- append-only onboarding events can remain user-visible and owner/admin-readable while denying authenticated update/delete; the readiness score remains a usability signal and never an authorization input
- live acceptance across all 14 real accounts confirmed current-role RLS writes, owner aggregate reads, forged-role denial, and event-history deletion denial

- the live homepage is WordPress 7.0.1 using Elementor 3.35 and exposes its page-243 styling inline
- the current desktop hero is 800px tall, uses three 5-second slides, and overlays the centered logo/navigation with a dark green gradient
- the official core visual tokens are `#3CB69E` teal and `#D2E3E0` mist, with Roboto typography and clipped diagonal section transitions
- the full homepage order is hero, ten audience entrances, campus vision carousel, four performance counters, three institutional stories, campus-life banner, eight admissions routes, news tabs, student/teacher hot links, six public-information banners, contact/social links, and copyright footer
- the research-driven AI layer should remain an overlay so the official clone remains structurally and visually intact
- the highest-leverage CRM experience is a daily student-success copilot that connects academic, engagement, service, and financial signals into reviewable next-best actions with evidence citations
- student context sent to OpenAI can remain useful while excluding name, student number, email, phone, and exact financial amounts
- the configured OpenAI Responses API path successfully returns schema-constrained, cited output with the current model
- the connected Supabase account cannot access the repository's configured project, so production safety requires an explicit local continuity adapter rather than mutating an unrelated database
- Supabase activation is fully represented in a migration with role-based RLS, indexed operational paths, searchable/vectorized knowledge, and privacy-minimized AI audits

- `research.md` defines the project as an AI-enhanced Shu-Te University campus and website experience
- the goal is to improve accessibility, usability, information retrieval, and user experience
- the most important product addition is an AI assistant for academic, administrative, and campus questions
- the live STU homepage uses a sticky overlay header, large hero, role-category section, admissions section, news section, and hot links section
- the screenshots emphasize exact color treatment, gradients, slanted white separators, oversized Chinese headings, wide image blocks, and a contact-footer composition that needed a much closer pass
- the provided Supabase project credentials are valid enough to reach the API, but the example `public.todos` table is not currently available to query
- the research scope is frontend-friendly: it requires information retrieval, user support, FAQ coverage, and navigation assistance, but explicitly excludes full administrative processing and predictive systems
- the current deployment risk is frontend bootstrap failure when `createClient` is called without valid Vercel env vars
- production should treat Supabase as optional for page render and isolate backend failure to the data panel
- the repository previously relied on Vercel framework inference and did not pin a supported runtime, deterministic install command, output directory, or SPA fallback
- GitHub issue #1 tracks the Vercel recovery
- Vercel's Node 22/npm 11 install fails when the npm lockfile omits optional transitive `@emnapi/core` and `@emnapi/runtime` entries, even though older local npm versions accept the same lockfile
# Issue #86 findings

- `create_lms_assessment` uses one-based `correctOption` values. The API and client previously documented and validated zero-based choices, which caused valid-looking proposals to fail at execution.
- Proposal identity must include the complete semantic payload, including assessment questions and choices. Confirmation copy is presentation-only and must not affect retry identity.
- Institutional knowledge needs explicit provenance, audience, and review state. Personal, class, and campus events are useful sources, but event linkage does not itself make a contribution verified.
- Contributors can submit reviewable knowledge; platform owners, administrators, and librarians are the publication authorities. Nexus is grounded only in verified articles visible through RLS.
- Supabase advisors found no new knowledge security finding. Two new foreign keys required covering indexes, which were added in a follow-up production migration.
# Research-goal achievement audit — 2026-07-19

- The engineering objective in `research.md` is substantially achieved: the repository has a deployed public STU experience, a governed bilingual RAG assistant with citations/abstention, an authenticated School OS extension, campus graph routing, and production-backed research/evaluation instrumentation.
- The research outcome is not yet achieved as a defensible empirical claim. No approved primary participant study has established improved retrieval time, task success, usability, accessibility, satisfaction, or reduced administrative workload.
- Research completion also remains gated by the complete reviewed official corpus, the real independently reviewed >=150-case evaluation set, verified official campus inventory plus physical route walkthroughs, protocol/ethics/translation approval, manual assistive-technology review, and WP9 operational hardening.
- Therefore the accurate status is: product/system goal achieved in substantial part; research validation goal partially achieved; final thesis conclusion not yet supported.

# Official-source discovery findings — Issue #127

- The official homepage and role-entry links yield at least two candidate sources for each of the ten research domains, but discovery is not institutional approval. Graduation requirements and FAQ authority are especially weak and remain explicitly marked for owner review rather than silently treated as authoritative.
- Twenty candidates reconcile to 20 distinct canonical official HTTPS identities. Several official subdomains return HTTP 202 to automated requests; that proves endpoint response only, not content correctness, so human inspection remains mandatory.
- A candidate may become only an inactive governed source through an authorized recorded decision. Acquisition, document review, embedding, approval, and publication remain separate gates, preventing discovery from leaking unreviewed content into public RAG.
- Production role evidence covers the candidate table and all three candidate RPCs: anonymous/student reads and executions are zero, direct governance transitions are rejected, librarian review is permitted, and reversible fixtures leave zero residue.

## Client infrastructure audit — 2026-11-01

Vercel UI verifies V1 (v1-d286), project std_edu_ai, production stdeduai.vercel.app, GitHub LuxArt0317/std_edu_ai. The connected database is Marketplace resource store_HQOW6JtYFaS7eKnK, project xiftudmvxphxcjtmfmib. The separate pre-existing Supabase tab wubnovvoklsdsxjvsyxz is not the connected resource. Vercel CLI currently belongs to wnnsnn and does not have this client team; browser access is verified. Never silently use that CLI identity. Standard Supabase migrations must retain migration-history rows. Integration injects NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY and server database secrets; only browser-safe aliases may be exposed to Vite.

Client setup is now live: migrations=96, public RLS tables=100; both Edge Functions pass CORS/authentication and owner-directory checks. Vercel release Aw8nC9DBjH5uW7pdi4F2oaLe2S5M serves client-targeted assets. Auth site URL is stdeduai.vercel.app and redirect is exact /crm. The user supplied the AI key directly in Vercel; authenticated QA returned source=openai, without exposing the key. Original research defaults and external evidence remain clearly distinguished from client acceptance.

## Issue #74 initial audit

There are 59 source files; the principal school/CRM TSX files contain over 13,000 lines and platform CSS is 5,555 lines. UI uses native controls and hand-built overlay dialogs. Markdown remains scattered in source/server/API/tests/Supabase. Brand tokens are ink #152d2a, muted #657d79, line #dfe9e7, background #f3f7f6, teal #27a98f, dark teal #137562. Faculty navigation currently omits the Academic Office, so assigned curriculum visibility and change-request flows need explicit audit. Existing 170 tests include many source-text contracts; they are not a substitute for rendered interaction tests. Official shadcn Vite/Tailwind v4 and Native Select docs reviewed; native-select preserves existing form contracts.

## Issue #74 verified decisions

Use official shadcn source primitives with Tailwind v4, preserve green/teal tokens, and retain specialized feature layout CSS in a lower cascade layer. Runtime modules belong under src/features; documentation belongs only at root entry points, docs, or planning-with-files. Four engineering references replace 24 scattered folder readmes.

Teachers inspect their assigned program and propose curriculum changes. Independent academic managers review proposals; approving a request never silently publishes an institutional curriculum. Supabase remains the permission authority. Isolated QA accounts explicitly synchronize Auth roles and profiles, matching the production provisioning contract.

The browser suite found a real rich-editor lifecycle crash under rapid lazy navigation; deferred initialization and destroyed/schema guards repair the stale editor access. The home upcoming summary now filters expired/invalid calendar entries and refreshes time every minute. Automated public accessibility passed 10 states; institutional manual sign-off is still external.

## Unified School OS decision [Issue #74]

User authorized merging the two workspace shells. Preserve the fourteen server-enforced role templates; they are job-specific access boundaries. Live client audit found exactly one Auth user and one active owner profile, zero test-named users and zero orphaned identities. Present actual accounts separately from advanced templates. Use one shadcn sidebar/header with direct support modules. No database role consolidation or user deletion is needed.

## Taste-led transactional redesign [Issue #74]

User explicitly requested a full visual and copy overhaul using the taste skill. Existing green accent #137562 and brand mark remain. Audit found duplicate page/role/context banners, permission-marketing hero sections, 3 competing assistant controls, oversized metric tiles, all-caps slogans and inherited gradients/shadows. Existing routes, forms, domain records and permissions must remain functional.

Design read: daily school administration, shadcn/Radix + Tailwind, neutral surfaces and one green accent. DESIGN_VARIANCE=2 (predictable), MOTION_INTENSITY=1 (state feedback only), VISUAL_DENSITY=7 (compact, readable operations). The user explicitly authorizes simple labels and navigation changes; the taste skill's landing-page hero/imagery rules are not applicable to transactional records. Remove filler in source, not only via CSS. Keep validation, consent, audit reasons and security warnings. Test desktop/mobile, light/dark and actual workflows. The requested planning skill is not installed at the documented locations; existing single planning records remain the source of truth.

## Release routing — Issue #74

React Router 8 separates `/login` from `/app` and gives every school section a stable URL. Existing provider `/crm` recovery allowlists remain intact through a compatibility entry. Safe return URLs accept only known local sections. Role guards hide unauthorized content before redirecting; backend RLS and trusted role checks remain authoritative. Browser QA exposed an implicit password label including Show/Hide text and delayed competing logout redirects; explicit labeling and sign-out intent now keep the auth flow stable. All 32 E2E scenarios verified across full/focused runs; 170 API/source and 11 units pass.

Production release `64ebf12` is Ready as Vercel `8VJNpQEEaUR3gVMyFfQ5hj4DzqSD`. Initial app compilation succeeded but the provider expected build instead of dist; explicit versioned Vite/build/install/output settings resolved it. Independent quality CI and actual production owner/browser/backend checks passed. Existing original resources and login permissions were not changed.

## Issue #75 audit

User screenshots show missed nested states: dark legacy LMS/calendar/quiz/assistant headers receive foreground/muted text from semantic theme overrides; Radix sheet/dialog portals sit outside .school-shell and need semantic styling independent of that ancestor; the assistant header also needs the same neutral surface rules. Official shadcn Button inline-flex, fixed heights and nowrap override legacy grid/block selector layouts; broad .section-operations article > div also styles action groups as metric grids. Fix semantic surfaces and explicit layout roles, not isolated text colors. Preserve green #137562; DESIGN_VARIANCE=2, MOTION_INTENSITY=1, VISUAL_DENSITY=7. User explicitly approved public student registration; school staff/admin roles remain controlled by trusted metadata.

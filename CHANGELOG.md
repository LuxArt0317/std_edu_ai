# Changelog
## Unreleased

### School Affairs assistant and DTM homepage fidelity (Issue #93)

- Keep signed-in account and assistant-capability questions on the private, token-verified School Affairs path; answer reported profile and capability prompts from account-scoped records instead of sending them to public search.
- State clearly that official Moodle assignments, submissions, grades and notifications are not connected to stu.best.
- Rebuild the DTM overview with the official page's three-column structure, dated public announcement/category references, navigation, quick links and contacts while preserving account-scoped sample courses.
- Add an AI behavior acceptance matrix and DTM content, search, responsive and accessibility checks.

### School Affairs sign-in from public assistant (Issue #83)

- Open School Affairs sign-in outside the embedded campus assistant so Google OAuth starts in the full page.
- Recover login pages already opened in the assistant frame; bound the Google start step and show a retryable error if it stalls.

### Live assistant activity (Issue #92)

- Stream actual directory, managed-knowledge, school-web, image and verified-account lookup stages into the chat while it works. Keep the final sourced answer and action confirmation after validation; retain JSON compatibility and private-model-reasoning boundaries.

### DTM preview and shared Google account (Issue #91)

- Recreate local DTM login, dashboard and course-material pages with the existing School Affairs Google session, replacing the source's large red SSO entry with Google sign-in.
- Store per-account sample DTM courses/materials and sample notices in three RLS-protected client tables; expose them to the private assistant only after verified Google sign-in.
- Show signed-in Google status on the copied landing page and route old DTM links to the local preview. Keep official university and Nexus records separate.

### Private School Affairs workspace (Issue #90)

- Add 14 client Supabase School Affairs tables with Google-only account initialization, account-scoped row-level security, sample courses/grades/notices, a protected Lux site admin, and audited task/request/notice actions.
- Show signed-in account records and site administration in School Affairs. The personal assistant reads only the account's stu.best records, clearly labels sample data, and proposes changes for explicit confirmation.
- Keep official university systems and Nexus account data outside the School Affairs assistant; add focused authentication, browser and live database isolation checks.

### Responsive university homepage (Issue #84)

- Make the captured hero slide fill the viewport at desktop and phone widths instead of exposing a neighboring slide, and center the sticky university header.
- Check the homepage hero, navigation and page width at six viewport sizes.

### Public chatbot on copied pages (Issue #84)

- Restore the floating campus assistant on all 395 standalone public pages, with a same-origin panel that keeps the page in view.
- Reuse the existing anonymous/School Affairs assistant, image upload, source citations and chat API without loading Nexus data.
- Keep copied source scripts and forms disabled, and verify answers, Escape/close, responsive layout and direct navigation.

### Direct public school pages (Issue #84)

- Serve 395 copied public school pages as standalone same-origin HTML, removing the iframe loading gate from homepage and entrance navigation.
- Keep the Nexus and School Affairs app routes on their separate application shell, and expose campus assistant and directory routes from the copied pages.
- Validate the manifest and rewrite map, and check every copied route, ten entrances, responsive layout, statistics and no-JavaScript rendering. Update public accessibility flows to use the dedicated assistant and directory routes.

### Public loading recovery (Issue #84)

- Exclude missing JavaScript, CSS and copied school assets from the SPA rewrite so they return 404 instead of the app's HTML loading shell.
- Keep page HTML uncached and automatically refresh once when an older entry refers to a removed JavaScript bundle.
- Use a neutral campus-site loading message on public pages and verify recovery in a browser.

### Public school-page navigation (Issue #84)

- Show a copied page as soon as its body content is usable, without waiting for every image, font or stylesheet to finish; keep its local links active during slow loads.
- Detect a missing static capture rewritten to the application shell and show a retry/home error instead of a misleading loading screen.
- Add a browser regression for delayed stylesheets, student-page navigation and missing captured pages.

### University landing-page alignment (Issue #84)

- Restore the source-sized entrance labels after inert captured animations, and reflow the ten audience links for narrower screens so titles stay inside their cards.

### School Affairs login photos (Issue #89)

- Restore all 16 source-verified ePortal campus photos, a varying first photo, timed rotation, previous/next controls and an accessible pause control. Reduced-motion visitors start paused.

### Official university browser icon (Issue #88)

- Replace the inherited Vercel favicon with the source-verified STU crest and provide a matching touch bookmark icon.

### School Affairs assistant isolation (Issue #87)

- Give School Affairs Google sessions an independent, read-only chat route that verifies the stu.best identity and never reads Nexus course, student, term or schedule data.
- Answer captured School Affairs service/menu questions from all 94 catalog links with official destinations and dated snapshot limits; retain governed public knowledge and verified web search for broader school facts.
- Add validated image attachments and a visible source/activity panel. Images are processed only for the submitted answer, and private model reasoning is not displayed.
- Release the isolated assistant at stu.best after correcting Vercel's cross-function import and protected deployment-URL routing; verify directory, cited public contact, private subject boundary and image answers live.

### Helpful STU Assistant (Issue #86)

- Search managed knowledge first, then live official STU pages and broader school-related sources when current or missing public details need verification. Show only source URLs returned by the web tool and label external sources separately.
- Give supported partial answers, specific follow-up guidance and a clear campus-only scope; preserve private account boundaries and read-only/confirmation-gated actions.
- Prevent prior private conversation turns from entering retrieval or web-search requests; handle knowledge outages and provider failures without invented answers.
- Require a real web-search tool call, preserve sourced partial answers when an exact detail is unavailable, cite corroborated links from answer text, remove tracking parameters and deduplicate citations. Production English/Chinese official-source acceptance passed on `stu.best`; Issue #86 closed.

### School Affairs Google sign-in (Issue #83, real callback acceptance pending)

- Replace the expiring demo gate with an isolated Google PKCE client, validated restore/callback, cancellation/error handling and session-local logout.
- Show the actual Google email and linked student record or an honest empty state; remove disabled school-password fields and sample fee data.
- Scope preferences and Assistant conversations to the School Affairs account; use its own JWT for read-only authorized answers while keeping public chat anonymous and Nexus permissions separate.
- Add sign-in privacy information, provider/setup documentation, meaningful account/session browser checks and a manifest-only public build that excludes unreleased archive captures.
- Configure the approved Google Web OAuth client and basic identity scopes; enable the Supabase provider, add exact callbacks and publish the External audience to Production. Real callback acceptance still needs the account-holder's Google verification.
- Publish the Google entry at `/school-affairs/login`; the actual Google callback remains pending account-holder passkey/phone/Authenticator verification, so Issue #83 stays open.


### Readable achievement totals (Issue #85)

- Render the source-provided final totals without source animation scripts: 4,601+, 128,475+, 33,056+ and 54+.
- Give all four statistic cards a dark green surface with readable white labels, numbers and icons; adapt the grid across desktop/tablet/phone widths.
- Add focused computed-contrast, source-value, hover, image-loading and overflow checks for six viewport sizes.

### Local school-page copies (Issue #84)

- Serve source-preserving homepage, audience entrances and linked public pages locally, with title/body search and an auditable URL/asset inventory.
- Attach trusted navigation as soon as source DOM is parsed and keep controls hidden until ready, so slow images/fonts cannot trap a link inside the frame.
- Keep source scripts and submissions inert; isolate source CSS and implement local menus, tabs, carousel navigation and Escape behavior.
- Correct captured header widths, mobile legacy layouts, invisible menu labels, transient loading overlays and document-query collisions.
- Bundle checksum-pinned public documents in bounded compressed parts for offline cloud builds; preserve existing student/Nexus identity and knowledge-publication boundaries.
- Copy 395 distinct public pages, including all ten entrances and added freshman/international/alumni service details; skip further old-archive crawling as requested.
- Retain explicit gaps for deeper services, private systems, unavailable media and inherited source contrast limitations. See [mirror coverage and QA](docs/qa/SCHOOL_MIRROR.md).

### School Affairs identity and management separation (Issue #83)

- Rebuild the logged-out School Affairs entry using observed public branding/background/campus photos; make demo access explicit and logout return to the entry.
- Stop public chat from using Nexus account identity; clear demo access/conversation on exit and preserve unrelated management sessions.
- Default Lux to a knowledge-manager presentation and route, with an explicit full-owner workspace option; preserve protected authorization.
- Restrict internal Nexus guides to staff knowledge and publish a corrected public School Affairs/account-boundary guide.
- Keep real School Affairs authentication/student data pending the user's integration choice; disabled preview controls never collect official credentials.


### Connected school Assistant (Issue #82)

- Add shared, readable shadcn public chat across school pages, signed-in QA routing, follow-ups, safe Markdown, citations and account-change transcript clearing.
- Load authoritative signed-in context with the caller JWT and RLS, including actual subject relationships, announcements, schedules, grades, learning and service records. Ignore posted account facts and reject inactive/mismatched roles.
- Connect published internal/public retrieval with freshness/audience filters, meaningful rank fusion, bilingual aliases, document diversity and keyword degradation without privileged fallback.
- Populate 22 dated client-reviewed school/site references and retain explicit snapshot/index-source limits. Add knowledge answer testing, role/class authoring and refresh-to-draft controls.
- Keep the public preview banner below portaled dialogs and preserve header spacing and verify that Assistant headers/close controls remain unobstructed across all public pages.
- Verify real data isolation and confirmed teacher actions; correct a test that selected an arbitrary assessment rather than its own quiz fixture.


### Custom production domain (Issue #81)

- Connect `stu.best` to the existing client Vercel project and permanently redirect `www.stu.best` to the apex, preserving Spaceship DNS authority and existing CNAMEs.
- Align Supabase Auth Site URL/callbacks and both protected account-function CORS allowlists with the new apex; retain existing hosted/local origins and authorization.
- Record the canonical domain and browser management routes, strengthen live origin checks, and publish the previously verified public/School Affairs UI source.


### School Affairs portal UI (Issue #80)

- Reproduce the observed signed-in student portal at `/school-affairs`: blue header, account menu, sidebar/shortcuts, index widgets, 25 menu views and all-program search from 57 source rows/94 program links.
- Add browser-local custom menus, saved display settings/font controls, announcement reading/bookmarks, widget collapse, keyboard focus restoration and responsive mobile navigation using shadcn primitives, including a shared Popover.
- Link the School Affairs entry from the copied directory/homepage. Preserve clearly marked external program paths without opaque session queries; use demo identity/fees and local public branding assets. Keep school auth and all existing app permissions separate.
- Correct mixed-control settings semantics, accessible names, popup layering, source-color contrast and route titles; add catalog fingerprints, storage-failure and full local UI checks.

### Public university UI preview (Issue #79)

- Refresh the STU homepage from current public references and serve its 28 captured image assets locally, with checksum provenance, an optimized hero image and native font fallbacks.
- Rebuild `/在校學生/` with all seven sections/72 original entries, preserving external destinations and source non-link labels. Student Gmail opens the local `/student-sso` UI.
- Match the publicly visible mySTU SSO layout as an explicitly labeled preview with disabled credentials and no authentication request. Preserve all existing app auth routes and permissions.
- Add opt-in carousel playback and fix public tab keyboard controls, primitive visibility overrides, off-screen assistant focus and responsive layouts. Keep source snapshots, state/asset checks and UI QA in the established documentation structure.


### In-app guides and Assistant repair (Issues #78, #75)

- Add private, role-recommended video help at `/app/help`, with six narrated chapters, a complete walkthrough, captions, transcripts and downloads. Verify immutable media checksums; keep editable assets and credentials outside the app.
- Fix Assistant message contrast, responsive controls and hidden-upload overflow. Render safe Markdown and preserve the first message while a new conversation directory refreshes; cancel stale history loads.
- Move eleven research acceptance suites onto disposable client identities with strict target guards and serialized cleanup, preserving original historical evidence. Document unmet institutional, pilot, source-refresh and student-mail dependencies without inventing completion.
- Record the actual installed PDF parser version in acquisition provenance instead of an outdated hardcoded value.
- Require active profiles for guide-link access and allow the exact client acquisition fixture through the protected reversible cleanup routine.


### Narrated role video guides (Issue #77)

- Add six English-narrated chapters and a 12m43s combined walkthrough using actual demo-role navigation, Remotion graphics and 251 aligned captions. Teacher/student workflows receive the most detail; all fourteen roles are covered.
- Deliver MP4/SRT/VTT files, a responsive viewing gallery, and ready-to-watch/editable-asset archives. Keep ElevenLabs credentials private and tooling isolated from the application.
- Verify full decode/playback, every narration clip against the master, zero black frames and desktop/mobile delivery accessibility; remove disposable records/accounts. Human uninterrupted playback acceptance remains a documented client review step.

### Collapsible school sidebar (Issue #76)

- Published 10fa59c to Vercel; quality CI, twelve production sidebar states and complete client backend checks pass.

- Add a visible desktop expand/collapse control and 64px icon rail using the existing shadcn sidebar.
- Preserve accessible link/account labels, show collapsed navigation tooltips, and restore the preference from the existing seven-day cookie.
- Retain the full-label mobile drawer, keyboard shortcut and role-filtered navigation.

### Alerts and remaining nested UI (Issue #75)

- Published runtime ae1ed52; quality CI, all 48 production nested states, live Plan/OpenAI and client backend checks pass. All 43 browser scenarios are verified across runs; final affected regressions pass 9/9.

- Replace the blocked custom AI panel with a shadcn sheet; separate Plan context from the student drawer, support nested Escape/focus restoration and cancel obsolete requests.
- Replace remaining green hero/research headers with readable semantic surfaces; correct preview title, progress, risk-badge and grade-upload contrast in light/dark themes.
- Restore compact responsive Alert rows, wrap populated task actions, and contain the keyboard-scrollable service table.
- Make grade upload keyboard-operable, align quiz radio rows, simplify notification copy/layout and hide empty contact links.
- Correct Alerts heading hierarchy and include the visible account name/role in the account menu accessible name.

### Readability and student registration (Issue #75)

- UI/auth release fa01a84 is deployed Ready; production browser, asset graph and backend checks pass. Public email delivery remains restricted by the selected built-in Supabase sender.

- Separate auth into its own feature with canonical `/signin` and public student `/signup`; preserve `/login` and `/crm` redirects.
- Add email confirmation/resend states and trusted student-only signup metadata; preserve administrator provisioning and RLS.
- Align new-password forms with the provider policy and exact callback allowlist.
- Fix semantic surfaces in nested/portal panels, academic selector wrapping, class metrics/actions, roster labels and mobile task signals; migrate quiz preview to a shadcn sheet.
- Verify 170 API/source checks, 13 units, 38 browser scenarios across full/focused runs and 100 unique visual/theme/viewport states. Client SMTP configuration remains pending.


### Client release and routes (Issue #74)

- Published and verified on stdeduai.vercel.app; Vercel Ready for code 64ebf12. Independent quality CI and live owner/browser/API/database checks pass.

- Pin Vercel framework, install/build commands and `dist` output in versioned configuration to prevent dashboard output mismatches.

- Separate sign-in (`/login`) from the protected dashboard (`/app`); add section URLs, safe return links, refresh/history support and compatible old `/crm` links.
- Retain the existing Supabase recovery redirect and all server permissions.
- Add React Router 8 with route unit and real browser authentication/navigation checks.

### Transactional UI overhaul (Issue #74)

- Apply the requested taste-led redesign with compact shadcn controls, one green accent, a grouped sidebar and record-focused pages.
- Remove oversized heroes, repeated context/role banners and promotional copy; simplify page and action labels.
- Move appearance, owner role preview and sign-out to the account menu; provide System, Light and Dark modes.
- Replace case/department card grids with tables, consolidate academic Add/Export actions and put change requests in their own tab.
- Improve assistant labels, keyboard scrolling, input names and focus restoration. Preserve role permissions, approval controls and institutional data.
- Verify 170 API/source checks, eight units, all 29 E2E scenarios across full/focused runs, 30 light/dark page states and ten public accessibility states. Sign-in Lighthouse: performance 98, accessibility 100, LCP 0.7s, CLS 0.
- Release includes the reviewed transactional UI and unified school workspace.

### Unified School OS (Issue #74)

- Merge Learner Support modules into the School OS navigation and remove the duplicate workspace shell.
- Separate actual accounts from role templates with search, filters, pagination and a collapsed advanced policy catalog.
- Resolve the protected-owner banner from the owner profile and expose record-save errors within their editor.
- Restore own-student support intake while keeping staff owner assignment and triage checks enforced.
- Translate normal case/task priority to the database medium enum and verify the saved row, fixing rejected default-priority writes.
- Verify lazy feature bundles recursively and remove network-idle dependence from public accessibility navigation.


### Design system and workflow overhaul — Issue #74 (review checkpoint)

- Use official shadcn/ui primitives and Tailwind v4 brand tokens across workspaces, dialogs, navigation, form controls and tables.
- Consolidate runtime modules under src/features and documentation under docs; extract lazy portal views and the rich editor.
- Add assigned-teacher curriculum proposals, independent academic review, audit evidence, bounded pagination and participant notifications (three client migrations applied).
- Replace shared browser CRM recovery/demo data with identity-scoped memory caching, explicit retry and verified writes; derive operational metrics/signals from records and activate case filters.
- Add component units, disposable client E2E fixtures, expanded accessibility checks and a credential-free GitHub quality workflow.
- The original checkpoint failures are resolved by the unified School OS follow-up: 170 API/source checks, eight units, ten public accessibility states and all 26 E2E scenarios verified across the full run and focused regressions. Changes remain local for review.


### Client handoff — Issue #73

- Organize product/design/research documentation and root planning records; provide client setup, infrastructure, and handoff guides.
- Remove inherited tracked environment configuration and keep migration exports/credentials outside the deliverable.
- Accept Marketplace Supabase aliases safely in Vite and server endpoints.
- Add certificate-verified, serialized migration deployment with client owner bootstrap and history tracking.
- Make historical demo-identity synchronization optional on fresh client databases and correct a malformed SQL comment.
- Align patched rich-text/PDF dependencies and add client verification commands.
- Verify 96 applied migrations, 100 RLS tables, live owner/browser workflows, two deployed Edge Functions, client asset targets, and authenticated OpenAI QA.
- Configure exact production Auth redirects and make diagnostics default to the client deployment.


## Historical unreleased

- Added Issue #127's deterministic official STU source-discovery manifest: 20 candidates, exactly two across each of ten research domains, 20/20 canonical official HTTPS hosts, zero duplicate identities, and zero automatic publication.
- Added protected candidate RLS, idempotent import, direct-transition guards, reviewer decisions, atomic acceptance into inactive governed sources, exact reports, and reversible owner cleanup. Production evidence proves zero anonymous/student reads or mutations, one inactive accepted source, zero generated documents, and zero fixture residue.
- Added the owner/admin/librarian source-inventory workspace with domain/state filters, provenance inspection, official links, responsible-department selection, evidence-backed accept/reject/unreachable/duplicate decisions, and a direct path to the resulting inactive governed source.

- Added Issues #125/#126 research hardening: eight versioned SLO families, content-free immutable operational events, owned alert/recovery workflows, protected service reporting, automatic ingestion/evaluation observers, strict telemetry redaction, and an owner/admin/librarian/support operations workspace.
- Added pre-embedding prompt/document-injection quarantine, complete protected research-table RLS evidence, automated WCAG 2.2 public-state checks, 320 px reflow and focus/control gates, bounded production load measurement, recovery cleanup, and zero-high/critical dependency enforcement.
- Corrected public-site contrast, tab semantics, and carousel target sizes after axe identified one critical ARIA violation, 49 serious contrast nodes, and three undersized targets in the prior release.
- Corrected the unavailable-study fallback so it cannot inherit the dark pre-React boot background and render dark text with insufficient contrast.
- Expanded the WCAG release gate from five shallow states to ten complete public workflows: grounded assistant citations and correction feedback, verified campus route results, research consent, active tasks/questionnaires, withdrawal, and 320 px reflow. The stronger audit exposed and corrected five previously unobserved serious contrast nodes and now enforces zero serious/critical, target-size, unnamed-control, focus-containment, obscured-focus, status-message, and overflow failures. Assistant results and study state changes are announced, and the withdrawal dialog now traps keyboard focus, closes with Escape, and restores focus to its launcher.
- Split public campus-directory reads from graph routing so directory requests no longer fetch aliases, nodes, or edges, and added one-minute in-instance promise coalescing for verified directory/graph snapshots. This preserves the existing freshness contract while removing repeated eight-query fan-out discovered by the production p95 gate.
- Revoked the two remaining anonymous analysis-RPC grants (`research_sus_score` and `research_anonymized_export`), expanded the live role matrix to six protected and two intentionally public RPCs, and strengthened the recovery drill to inject one owned failure across every one of the eight SLO families.

- Added Issue #124's production RAG evaluation control plane: checksummed dataset versions, two-reviewer author-independent case approval, immutable frozen evidence, deterministic retrieval/citation/answer/abstention/leakage/latency/cost scoring, protected segmented reports, regression exports, and a guarded synthetic lifecycle that cannot satisfy the real 150-case research gate.
- Released Issue #124 as Vercel deployment `dpl_G5osn3MaBEk4ckY7yGkNsZWhRfTN`; both application shells, eight recursive assets, deployed reviewer-workspace markers, and the post-deploy zero-residue four-role evaluation lifecycle pass on `www.stu.best`.
- Added Issue #123's atomic privacy-safe public RAG trace, retrieval, and citation persistence; deterministic same-policy authoritative conflict handoff; opaque expiring session-bound one-use feedback; compact public feedback controls; and protected content-free reviewer metrics.
- Extended guarded verification cleanup to remove connected synthetic AI evidence before cited fixture chunks. The production workflow proved one connected answer trace, cross-session denial, replay denial, reviewer-only reporting, one trace purged, and zero residual AI traces.
- Released the public AI evidence flow as production deployment `dpl_Aka1cszfGnpGZNZiBUA1XUy4Hcfk`; both application shells, eight recursively referenced assets, the deployed answer capability, and matching-session feedback submission pass on `www.stu.best`.

- Began Issue #104 implementation with child Issues #105–#116, a machine-verifiable Codex completion controller, and an evidence ledger that distinguishes implemented gates from external research dependencies.
- Deployed the connected research foundation to production Supabase: governed/versioned knowledge and chunks, AI retrieval/citation/evaluation traces, accessible campus graph entities, pseudonymous protocol/consent/task/questionnaire records, and administrative workload metrics.
- Enabled RLS on all 31 new tables, added 56 foreign keys and 56 policies, explicitly revoked anonymous access to chunks/evaluation/participant data, refreshed generated TypeScript types, and documented the architecture in `docs/RESEARCH_SYSTEM_SCHEMA.md`.
- Added static schema/privacy contracts and a reversible production workflow proving public metadata, protected chunks, accessible routes, connected study records, and complete cleanup. Closed schema dependency Issue #117; research outcome work remains open in #105–#115.
- Added the draft 0.1.0 research protocol, prespecified analysis/reporting rules, a machine-readable 15-claim evidence matrix, explicit external ethics/governance dependencies, and a mandatory traceability verifier. Expected benefits remain hypotheses until approved measured evidence exists.
- Added a protected knowledge-ingestion API with deterministic HTML/text normalization, canonical URLs, SHA-256 deduplication, content-addressed chunks, real server-only OpenAI embeddings, versioned review-only documents, and structured ingestion failures.
- Deployed reviewer-only atomic publication and rollback RPCs plus a narrowly owner-only reversible-fixture cleanup. Live production evidence proves 1,536-dimensional embeddings, supersession/rollback without mixed active chunks, expired-public leakage = 0, and zero residual fixture records.
- Replaced the public assistant mock with a rate-limited bilingual OpenAI research endpoint backed by pre-filtered exact/keyword/vector retrieval. Answers fail closed on weak evidence or fabricated citation IDs and render exact official source cards; live production evidence proves grounded citation, expiry rejection, rollback restoration, and zero fixture residue.
- Corrected Vercel serverless packaging for the research assistant and ingestion APIs by moving their shared deterministic knowledge primitives to a directly deployable Node ESM runtime module with a strict declaration contract. Production deployment `dpl_7j48QsBUEADk5rz8Ds6jbx2P8cKg` is Ready; the public endpoint returns a grounded abstention with HTTP 200 and the protected ingestion endpoint reaches its expected HTTP 401 authentication boundary.
- Added Issue #118's verified campus directory and deterministic bilingual route engine with exact alias resolution, one-way/closure/hours enforcement, wheelchair-safe routing, reviewed reverse directions, ordered text instructions, official provenance, and an explicit pending-walkthrough boundary. Deployment `dpl_E7ALmJhW4p2aogXvX474AyFg4ZAn` is Ready and passed the reversible production route, cleanup, route-shell, and recursive-asset checks.
- Added Issue #119's `/study/:code` consented research runner with frozen protocol discovery, Secure/HttpOnly pseudonymous sessions, serialized AB/BA counterbalancing, timed baseline/enhanced tasks, per-condition SEQ/SUS, completion gates, withdrawal/deletion, standard SUS scoring, and identity-free analysis export. Production deployment `dpl_E4XP4nFeiTxYhUX1LfuLgRTMgi2j` passed the complete public HTTP API lifecycle with AB=1/BA=1, two objective attempts, SUS=100, zero gold/token/identity leakage, completion enforcement, withdrawal write denial, immediate deletion, zero residual fixtures, and healthy `/` plus `/crm` shells. These are synthetic platform measures, not human outcome evidence.
- Replaced unsupported CRM Analytics outcome cards with Issue #120's governed administrative-workload workspace. Comparable baseline/pilot windows now require aggregate provenance, checksum, equal duration, no overlap, explicit confirmed-resolution evidence, reconciled source totals, independent verification, append-only observations, protected RLS, small-cell suppression, descriptive-only reports, and a narrow reversible synthetic validator. Production deployment `dpl_96cHUYk72GzQoVHaLk4jcCyekqCG` rejects overlap, incomparable duration, creator self-review, anonymous/student reads, and premature claims while leaving zero fixtures; both routes and all recursive assets pass.
- Added Issue #121's governed ingestion operations layer: bounded transient retries, permanent-failure isolation, dead-letter state, database-enforced attempt order/ceiling, stale-worker quarantine, content-free request hashes, tokens, configured-cost status, latency, backlog, and failure summaries. Owner, administrator, and librarian roles receive a protected pipeline-health workspace. Deployment `dpl_7zALqpPrJXGpkot1NCqx2av4uf6x` is Ready; its actual authenticated ingestion endpoint reached terminal review, recorded one of three attempts, 32 tokens, duration/cost state, deduplicated an identical replay with zero duplicate documents/chunks, and removed all fixtures. Synthetic failure coverage proves 5 runs, 8 attempts, 2 retries, 1 dead letter, no illegal retry, no unauthorized read, and no raw-content telemetry.
- Added Issue #122's governed corpus acquisition and review workspace. Owner/admin/librarian operators can register and edit source ownership/authority/audience/crawl metadata; fetch approved HTTPS content; upload bounded PDF, HTML, Markdown, or text; preserve source publication/update dates; inspect exact heading/page chunks and lineage; edit draft governance; publish, request changes, reject, quarantine, or restore versions with append-only reasons. Connection-time DNS/redirect/host validation, MIME signatures, pinned deterministic parsers, draft isolation, least-privilege mutation policies, and covering relationship indexes fail closed before public retrieval. Deployment `dpl_3YSP6bB5NHVyFMAKN71pJRMxcU5b` passed the complete URL/PDF/review lifecycle with five HTML chunks, one exact PDF page locator, zero hidden/draft leakage, zero duplicates, atomic supersession/rollback, quarantine, student/support denial, four audited runs, and zero residue.

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

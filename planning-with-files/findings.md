# Findings

## Native protected-service expansion — Issue #98

Live source inspection distinguishes a historical guide from the current page: housing history now has eight columns including subsidy, while the older walkthrough shows seven. Student aid currently exposes a records query without an Apply button. Preserve those observed controls and keep management in the admin workspace. Catalog offerings and syllabi are separate from enrollment, so the assistant must not treat a catalog match as the caller taking that course. Housing consent snapshots, immutable ownership and versioned writes prevent applying under stale instructions; a retry must recover an existing receipt or ask for renewed consent after a period change.

The fresh inventory covers94 catalog entries:7 dedicated native destinations,73 generic trackers,9 partial pages and5 portal/public-preview destinations. This count excludes DTM. Remaining generic/partial entries span54 source families and need source-by-source implementation; a working route is not equivalent to a complete service.

## Issue #96 — whole-client QA audit

Audit the client copy and production separately from the original repository. Treat existing test successes as a starting point, then check live routes, complete workflows, account boundaries and cleanup. Distinguish a reproduced defect from an unavailable institutional integration or unrun human acceptance. Use retried browser assertions for asynchronous behavior; W3C WCAG 2.2 reflow, contrast and keyboard criteria guide the accessibility pass. Rank fixes by user impact and verify the final deployed bundle.

The browser audit exposed four actionable client defects: owner menu focus masking navigation, mobile Knowledge row overlap, missing signup discovery, and an Assistant conversation race. The history race is caused by an earlier `loadChatMessages` result replacing an optimistic message after send; wait for the selected thread's history and keep rendered rows scoped to that thread. CI also lacked the direct copied-page browser suite. A later support test failure came from the machine running out of space while Playwright saved its trace; its workflow assertions and isolated rerun passed, so classify that failure as an environment limit rather than an app defect.

The connected live assistant caught a fifth defect: the personal-question regex accepted plural “classes” but not singular “class”. “My app class” therefore triggered a public search instead of a verified account-context answer and missed a seeded private announcement. Match both forms at the shared scope gate and verify the exact question before and after deployment.

## Issue #95 — assistant conversation activity

The public chat currently keeps streamed progress in a standalone `busy` panel. It disappears when the answer arrives, and the answer's own activity can omit steps seen in the stream. Messages are component state and reset on navigation or refresh. Keep observable source/tool stages with the corresponding answer, restore a bounded transcript only within the same browser tab and identity, and clear it on sign-out or New chat. Do not display private model chain of thought; show actual lookup stages and linked sources. Do not persist attached image bytes, feedback capabilities, authentication tokens or unconfirmed actions.


## Issue #94 — account-grounded school demo

The pasted signed-in chat exposed two faults: no fee/assignment rows existed for the sample account, and the short follow-up “how about assignments?” fell through to public research with empty history. A verified Google session alone cannot reveal official university SIS or Moodle records, so the release uses clearly labeled stu.best-owned sample rows with per-account RLS. The existing client schema already covered terms, courses, sections, enrollments, grades, attendance, charges and site tasks/requests; the additive work supplies sample academic history, a future term, assignment records, an illustrative tuition charge and audited Lux admin management. Asia/Taipei term dates and weekly meetings determine today/next class. Only a genuine Lux School Affairs Google sign-in can validate the live admin flow; no such identity existed in the client auth database during this work.

## Local public-page copy — Issue #84

- User scope: entrance pages and service/detail pages; skip old news archives. Public third-party services stay explicit external links. Protected school applications remain separate integration work under #83; no source credentials or private student context are collected.
- Source-faithful static HTML/CSS/assets run in a same-origin, script/form-disabled iframe. Trusted local controllers implement menus, tabs, carousels, search and routing. Existing Assistant, campus-directory and Nexus boundaries remain intact.
- Preserve source doctype and responsive source CSS. Minified CSS imports without whitespace, captured fixed header widths, transient alumni loaders and source tab semantics required corrections. Exact canonical pages must win over redirect aliases; query-selected documents and reserved app paths must not collide.
- All first-hop public HTML destinations are captured. Additional service details include freshman steps/housing, international forms/visa/insurance/emergency information and alumni profiles. The recursive inventory includes deeper department/service pages and intentionally deferred archives; never count an inventoried URL as an implemented page.
- Large documents are manifest-pinned and hash-verified during preparation, excluded from Git. A local build does not prove a fresh hosted deployment can accommodate this corpus; hosting size/cold-build transfer must be verified before release. Source resource failures and inherited contrast remain reported limitations.

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

## Further nested UI audit — Issue #75

The Alerts Plan action set selectedStudentId (opening a modal StudentDrawer) and opened a custom, non-portal copilot sibling. Radix made the sibling inert, and that panel had no Escape handler. Separating the assistant's student context from drawer selection and using a second shadcn Sheet fixes both direct and nested entry. The earlier broad audit missed expanded research headers and treated gradient contrast as incomplete; the new checks explicitly inspect those states and assert plain surface/foreground colors. LMS preview h1 and grade upload Label had their own legacy color rules that bypassed earlier heading/button fixes. Keep the existing green accent on actions, use neutral panels, and test actual form input/result/Escape/focus behavior.

- Sidebar #76: existing shadcn supports icon collapse, but the desktop trigger was hidden and the mobile-only legacy school-menu rule also needed overriding. Read the existing seven-day sidebar cookie at portal mount; its provider already writes the preference.
- Radix tooltips must mount only for the collapsed desktop icon rail. Mounting visually hidden tooltips on mobile let the first Escape dismiss an invisible tooltip instead of the navigation sheet. Conditional mounting preserves direct mobile Escape/focus restoration.

## Narrated video guides — Issue #77

Six grouped chapters provide teacher/student depth without a single long onboarding dependency. Live recordings use actual trusted role accounts and synthetic records. Narration is cached by text/voice/settings; frame-based captions follow provider alignment. Long render instability was resolved with independent short-scene renders. Final packet-copy AAC concatenation caused accumulating drift; normalized PCM concatenation and one AAC master encode eliminated it (all 40 source matches within 0.31 ms). Delivery explicitly converts to limited-range yuv420p. The final gallery and archives exclude credentials and authenticated artifacts; source and safe assets remain editable. Human uninterrupted playback acceptance is a documented review limit.

## Achievement statistics — Issue #85

The live iframe has four white counters over a low-contrast surface and leaves their text at0 because source animation scripts are disabled. The source data-to-value attributes contain4601,128475,33056,54. Only the homepage has this widget across395 snapshots. Trusted DOM setup must render those source totals and scope a contrasting green card surface to this counter grid; source scripts remain disabled.

Live #85 acceptance repeats24 cards/six widths at9.5709:1 minimum; source totals/icons preserved. Runtime bb19d2a is Ready (DumUWcTKnzRo29SSM9Rx9wiQ4Jas), CI41544180053 successful. Focused source navigation passes after a null-safe test readiness guard. Broader source contrast and service coverage remain tracked under #84.

## Pending fees and credit-load history — November12,2026

The original39-1 is an eight-column read-only pending-charge table. Occurrence date is not the due date; missing unit/extension/category values stay unknown. Native11-3 is a six-column history query with no application controls. Its7-1 link leads to a separate acknowledgement page; its unlisted credit-transfer query remains an external source link. Main table geometry is source-measured, not inferred from another service family. Two additive migrations retain caller-owned rows and strict audited admin writes; no institutional eligibility decision is inferred. Updated coverage:9 native/72 generic/8 partial/5 other across94 catalog destinations,53 remaining families.

Next source evidence:11-1 selection history uses year/semester/selection-stage filters and seven result columns;11-2 timetable uses the same filters and a Monday–Sunday grid with14 source periods plus unscheduled courses. Both are source read-only queries. Sanitized geometry is in ignored visual-parity artifacts; screenshots contain private source rows and must not be committed or used as shared sample data. No next-family runtime change yet.

Implementation boundary for11-1/11-2: use a separate owner-scoped phase snapshot family (year, semester, stage, term course code, title, required/elective label, credits, instructor, raw remark, display order, version/source mode). Add multiple weekday/period/room children and retain unscheduled courses. Existing enrollment status is not the source remarkY/Y(W)/A; a public offering does not establish enrollment. Official initial selection and add/drop queries returned different row counts, confirming phase separation; nofailed/withdrawn row was observed, so timetable exclusion behavior remains unverified. Preserve that uncertainty rather than infer rules. No application or course mutation was made.

### Native selection history and timetable — 2026-11-12

11-1 and11-2 share a1120px centered WebSelectCourse shell and query criteria for academic year, semester and selection phase. The history has seven columns; the weekly grid has fourteen observed periods including lunch/evening. Initial/add-drop snapshots can differ. Preserve phase remarks and explicit timetable inclusion rather than interpreting a remark as enrollment status. Current/next-class questions must stay on dated enrollment records, and class-room questions must not be intercepted as page navigation. Migration1000 provides strict private rows, versioned admin writes and replay receipts. Local database/browser tests pass; release verification is still in progress.

Native selection release55322e5 and production QA are verified. Explicit page-navigation routing was narrowed so room/count/next-class questions reach private data. A concurrent answer-verification agent owns new graph modules and the released assistant reader files; see agent/A2A.md before integration or release. AcademicServices13-1 is a different source UI/model from Moodle grades: seven transcript columns, term earned-credit/average summaries, a five-column warning table and four-column rankings. Current-term query is closed; transfer/cycle views expose only no-record notices. No actual source values were copied into local accounts.

- 2026-11-13: Archived the prior100-line progress ledger after the selection release. Its latest runtime55322e5/final97aac17 were verified Ready; full institutional cloning remains Issue98. CurrentIssue99 owns shared assistant/release files. Academic/graduation drafts remain disjoint and uncommitted.

## Syllabus search12-3 source observations (2026-11-13, Issue #98)

Source `info.stu.edu.tw/ACA/teacher/Syllabus/MainCoursequery.asp` exposes a960px inner frame, explicit keyword/current-or-historical/term/department filters,26sequential checkbox themes and an eight-column result table. Source historical radio valueALL includes current-year records; a fully loaded keyword query returned524rows including115, whereas a premature DOM sample hadonly39. Always wait for completed navigation before recording counts. Currenttheme11 returned5rows,1+11 returned5,1alone returned0: themes matchANY. Header clicks toggle ascending/descending. Source has no visible pager; local host will collect bounded pages before rendering a complete table, reject changing revision/count/duplicates, and request narrower filters instead of showing incomplete data as complete. No source records become application fixtures. The three new nullable metadata fields are explicit current-membership, academic-year text and semester text; existing syllabus.meanings is reused. Draft170000 remains unapplied.

### Tuition source48/49 — November13

User completed separate CAPTCHA in tab47. Read-only observed URLs: StuTuition/CreditCharge/GetSettle, Payment/Summer, Payment/Extend, Payment/CreditCharge. Settlement has only empty historical selector (無對應資料), query control and accounting-office explanation, no populated result schema. Summer and evening credit open PDF requirement/continue-print landing pages; Extend returns the application index for this session. No PDF/print/payment was triggered. Screenshots are private under ignored artifacts/source-tuition/. Browser zoom60percent made1280override report2133CSSpixels; do not call its screenshot a1280CSS comparison. Measured container1120CSSpx, pagepadding8/20/24, header34+navbar45+breadcrumb31, body13/19.5 JhengHei/Verdana. No unseen result columns or receipt data inferred.

## November13 Loan and assistant repair checkpoint [#98/#100]

Loan0731bda is productionaccepted;131 migrations/148publicRLS tables. Dorm220000 passed rollback-only validation but is not applied. Frozen assistant23path corrections pass isolated839API/318unit/380evaluation/build/lint/audit, with final grader wording fixes still held for independent review. Prior real-model failures are retained. New overview/current-term/coaching runtime is a separate offline candidate. DTM dashboard source has a23px empty center; stored courses remain reachable through term navigation. Six rendered states contain their viewport; exact footer/row spacing and a pending-session account-switch write are still being corrected. Raw progress is archived in archive/progress_2026-11-13_loan-and-assistant.md.

## Protected-service coverage refresh [Issue #98]

The prior protected-service coverage artifact is stale; do not quote it as a current completion count. Generic service records are real private note/status CRUD, not the named university workflow. Leave20-1/33-1 has native draft/history/review, but attachments and institutional approvals are absent. Internship53-1 has an observed index plus generic contract/reflection/company records;55-1 PracticeUnit is a distinct unimplemented directory. Education fund21-2, remission21-3 and subsidy24-1 still need authenticated detail evidence and native models. The21-2 source returned to the main portal CAPTCHA; a user handoff is pending.

DTM at `/dtm` implements the distinct dtm.stu.edu.tw service. Catalog4-2 Moodle (elearning.stu.edu.tw) and4-3 CU remain generic, and should not be counted as DTM completion. DTM has private courses/activities/grades and real file submissions; institutional messaging, roster/quiz execution and persisted dashboard block customization remain absent. Loan21-1 is accepted only for observed metadata/empty states; dormant application controls are unobserved. Dorm34-2 is locally mounted only until220000 applies. Prioritize observed internship details,21-2/21-3/24-1 and explicit Moodle source before inventing unseen forms.


## Next DTM persistence gap — 2026-11-13 [Issue #98]

Read-only audit found the existing DTM numeric grade tracker cannot represent the observed Moodle grade report: source items may be ungraded while retaining explicit range/weight/contribution, separate percentage/rank, and a literal course total. DtmStudentRecords currently calculates percentages and hardcodes other cells. Existing dtm_grade_items require numeric scores; affairsWorkspace maps them through Number. Do not make those scores nullable under the paused assistant contract.

Preferred next reviewed design: separate owner-scoped per-course literal report and selected-student admin maintenance with versioned writes, stable receipts and deletion tombstones; preserve legacy tracker rows/anchors and generic assistant snapshots. Retain null, blank, zero and literal text, with no inferred grading policy or calculated totals. Current source proves one course group, ordered items and course total, not arbitrary nested categories. New report-aware assistant integration remains deferred to explicit resumption of the separate paused Issue100 task. No migration or report implementation exists yet. Secondary DTM gaps: explicit assignment section/order (the source examination section can contain assignment-kind activities) and source-inspected local material destinations. Do not infer grouping from names or invent unseen resource forms.

## 2026-11-13: Course section placement source and security

The authorized ignored course-content screenshot shows作業區/測驗區/教材區, with the same assignment-style icon/behavior in the first two sections. Section membership must be explicit metadata rather than inferred from title, due date or entity kind. Source editing controls are not captured; administration belongs in the existing guarded maintenance area. Supabase [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [function security](https://supabase.com/docs/guides/database/functions) guidance was rechecked: caller ownership must be enforced and elevated RPCs need an empty search path with schema-qualified references. The existing project authorization boundary remains unchanged.

## Course content checkpoint — November 13, 2026

Course placement is ready for publication: isolated 985 API/source and 519 serial unit checks, build/assets, lint, handoff and dependency audit passed. The six-group rollback preflight and exact selected migration passed; client schema is 135 migrations / 152 public RLS tables. Local actual-JWT acceptance ed3d6e78 passed five groups / 59 API requests / six writes, including concurrent duplicate, version and save/delete cases; exact cleanup, protected-owner and unrelated-data preservation, and closed connections passed. Independent compiled student checks passed six groups at four widths. Compiled administrator-browser coverage is not claimed; nine DOM lifecycle tests pass. The floating panel remains removed on live 0d085e1 and its chatbot opens/closes. Publication and pinned production acceptance are next. No Issue #100 file changes or model calls. The two earlier preflight failures remain preserved; the second reached its watchdog, and an independent read-only recovery verified current object/prefix absence without inventing historical fingerprints. Full prior progress is in archive/progress_2026-11-13_course-content.md.

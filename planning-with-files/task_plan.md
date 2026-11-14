# Task Plan

## Remote-learning Moodle [Issue #98]

- [x] Inspect the source login, signed-in directory, workshop catalog and unsubmitted self-enrollment form.
- [x] Implement separate local routing, a persisted catalog and caller-owned enrollment.
- [x] Verify the hosted release, private data access and assistant links.
- [x] Capture the full visible category listing and implement bounded database search and pagination.
- [x] Verify the expanded catalog on the deployed revision.
- [x] Verify two source course outlines and their 17 activity destinations.
- [x] Verify and publish the account-scoped outlines and assistant links.
- [ ] Verify and implement remaining resource content and private academic records.

## Counseling appointments [Issue #98]

- [x] Observe the source landing and consent views.
- [x] Model the account-scoped workflow and verify persistence and restricted access.
- [x] Verify the pinned production UI and published assistant navigation.
- [ ] Verify the university appointment controls beyond the observed consent page.

## Certificate award applications [Issue #98]

- [x] Observe the authenticated 52-1 form and certificate catalog search.
- [x] Implement the student form, catalog lookup, private proof documents and protected review.
- [x] Verify the browser, authenticated API, storage isolation and assistant status.
- [ ] Verify official review and payout handling with an authorized integration.

## Announcement email preference [Issue #98]

- [x] Observe the protected source setting and activation rule.
- [x] Implement private persistence, observed controls and assistant preference lookup.
- [x] Implement the consent-scoped queue and opt-in delivery worker.
- [x] Verify saved preferences on the pinned production release.
- [ ] Connect an approved delivery service and verify actual announcements reach opted-in accounts.

## Student information confirmation [Issue #98]

- [x] Observe the protected 8-1 form and record its field structure and geometry.
- [x] Implement protected baseline maintenance, personal confirmation and assistant status.
- [x] Verify exact-client rollback, input validation, authorization and replay.
- [x] Apply the migration and verify the browser and actual-session API on the pinned release.
- [ ] Compare the university confirmation result when authorized evidence is available.

## Summer course selection [Issue #98]

- [x] Observe the signed-in identity-check screen and verify the dated notice.
- [x] Add account-scoped summer decisions and the public notice with exact-year lookup.
- [x] Connect the source-shaped page, administration, history link and campus assistant.
- [x] Apply the summer migration after rollback verification.
- [x] Verify the pinned release with browser, authenticated HTTP and guest assistant checks.
- [ ] Compare the eligible university registration, availability and payment workflow.


## Facilities repair [Issue #98]

- [x] Confirm the reporting and status fields from the public noticeboard and check the protected source gate.
- [x] Implement confirmed reports, private history, administrator review and assistant status.
- [x] Apply the exact-client migration after rollback verification.
- [x] Verify the production browser, actual-JWT HTTP, guest assistant and pinned release.
- [x] Observe the authenticated area picker, two form variants, equipment picker and empty progress view.
- [x] Connect the observed area and equipment catalogs to the form and persist the structured report fields.
- [ ] Compare populated university history and dispatch screens.


## Venue booking [Issue #98]

- [x] Inspect the public weekly schedule and confirm the application sign-in gate.
- [x] Add verified room availability, private local applications and administrator review.
- [x] Verify authorization, overlap and request retries in an exact-client rollback.
- [x] Verify source-shaped browser workflows, public and private assistant routing, and the deployed release.
- [ ] Compare the authenticated university application and use-status views.

## Permanent course catalog [Issue #98]

- [x] Observe the public search, every course kind and division, and the description dialog.
- [x] Capture and import the public course list into the exact client database with read-only visitor policies.
- [x] Add the dedicated catalog, database-backed detail lookup and assistant links.
- [x] Verify the browser, persisted detail lookup and pinned production release.
- [ ] Inspect the authenticated teacher timetable and catalog maintenance screens.

## Graduation clearance [Issue #98]

- [x] Verify the official flowchart and sign-in gates for the application and status pages.
- [x] Implement acknowledged applications, period and candidate management, and shared per-office results.
- [x] Verify database authorization, browser workflows and deployment.
- [ ] Compare the authenticated source layouts and office screens.

## Teaching evaluation and immediate feedback [Issue #98]

- [x] Recheck school access and confirm the three distinct workflows from the university handbook.
- [x] Connect course ownership, survey windows and confidential feedback to persistent student and administrator pages.
- [x] Verify isolated enrollment access, result release, and deployed browser and API behavior.
- [x] Check graduation-clearance source access and verify the public process diagram for the next two routes.
- [ ] Compare the authenticated source forms when the school session is restored.

## Early graduation [Issue #98]

- [x] Inspect the source page and published workflow.
- [x] Implement the term window, account eligibility, submission, cancellation, administrator review and shared assistant lookup.
- [x] Exercise successful writes and denied scopes in an exact-target rollback.
- [x] Verify the compiled browser, deployed API and pinned release.
- [ ] Compare the university’s open-period and populated-history screens when observable.

## Native Moodle URL resource pages [Issue #98]

- [x] Inspect the authenticated material link and capture native resource layout and navigation.
- [x] Store explicit destination metadata separately from Moodle provenance; preserve ownership and existing material operations.
- [x] Replace material summary dialogs with exact account/course-bound routes and source-shaped resource pages, retaining existing management.
- [x] Independently review URL safety, exact records outside snapshot coverage, account changes and desktop/mobile rendering; verify database and deployed behavior before acceptance. Runtime7476b4e is Ready and Quality43435922591 attempt2 succeeded unchanged.

The previous goal turn made progress: c686501 was deployed and accepted. Fresh source inspection confirms a full URL-resource page with course/section/resource breadcrumbs and an explicit external destination. The School Affairs source login was restored by the user and verified; Moodle source access works. No target is inferred from title or summary. The independent Issue100 assistant work remains user-paused.

## DTM course activity placement [Issue #98]

- [x] Preserve the source course's section placement and explicit activity order, including assignments inside the examination section, without inventing a quiz workflow.
- [x] Add account/course-scoped persistent references and guarded administrator maintenance, retaining existing assignment/submission/material routes and unplaced records.
- [x] Independently verify strict ownership, concurrent saves, stale/deleted references, source-shaped rendering, account switches and desktop/mobile navigation.
- [x] Run exact-client rollback preflight and additive deployment plan, then isolated release gates and pinned production acceptance; c686501 is Ready and Quality43428235159 succeeded.

The source screenshot confirms three sections and an assignment activity in the examination section. The previous renderer put every assignment in the first section and always left examinations empty; explicit persisted placement now corrects this. Root owns API integration/source evidence/release; backend, UI and independent QA are delegated. Issue100 assistant work stays paused. No new live database operation is started.

## Literal Moodle grade report [Issue #98]

- [x] Preserve source-displayed grades, weights, ranges, feedback and explicit totals in an additive owner/course-scoped report; leave personal numeric trackers intact.
- [x] Complete administrator maintenance, strict API scopes and native grade-page integration, including existing grade links and report-only courses.
- [x] Independently review security/round trips, source layout and account changes; run rollback-only migration preflight before an exact client deployment plan.
- [x] Verify database/rendered behavior and publish corrected0d085e1; pinned API/UI/public-shell checks pass. Final Quality43419257202 passed; assistant semantic work stays reserved by user-paused Issue100.

The additive migration is applied at134/151 after rollback preflight. Isolated API/source965 and initial units483 pass; compiled table geometry/mobile checks pass. Local and deployed actual-JWT acceptance plus contextual overview/browser checks pass at7a52c2b. The explicit-pagination correction/API build gate is published as0d085e1 and passed final pinned API/UI acceptance. The floating-panel removal is already verified in production.

## Credit-load entry and selection-system navigation [Issue #98]

- [x] Reinspect signed-in source7-1, its acknowledged closed-window notice and system-index destination without submitting anything.
- [x] Verify all three source staff-review links return this student account to the system index.
- [x] Replace the generic7-1 tracker with the measured instructions/closed-period flow and add the observed selection-system index.
- [x] Verify native route/auth/navigation, source geometry and mobile containment; update honest workflow coverage.
- [x] Run isolated release gates, publish and verify production53c9304, Ready HJ937VNZjMjvXUVSTqhXvP2AV5y9 and Quality43410656358 success.

The unobserved open-period application and staff review forms remain separate gaps. In parallel, audit literal Moodle grade-report persistence for the next native backend batch. Preserve the user-paused Issue100 files and all failed evidence.

## Remove the added personal summary and floating panel [Issue #98]

- [x] Remove the floating green disclosure/account-status panel from copied public pages; retain the chatbot and normal sign-in routes.
- [x] Remove the non-source My School Affairs summary and student menu entry; preserve saved records and old-link compatibility.
- [x] Retain existing account/record maintenance in a separately guarded admin route, with caller-bound writes.
- [x] Repair copied-home navigation and update the 94-entry menu inventory without counting generic trackers as complete workflows.
- [x] Update affected synthetic admin/login acceptance, independently review, publish and verify the follow-up (b14a672; exact manifest, successful Quality and scoped production checks).


## Protected navigation and Education Fund [Issue #98]

- [x] Read the updated goal; audit menu destinations and preserve the separate user-paused Issue100 changes.
- [x] Reopen authenticated Education Fund and record its actual closed-period instructions and layout without school mutations.
- [x] Replace its generic tracker with the observed standalone page and local navigation; verify desktop/mobile rendering.
- [x] Repair reproduced account-switch write races in Leave, Scholarship and service records, using existing caller guards.
- [x] Verify the shared side panel, close/composer behavior, safe-area spacing and long formatted text without changing paused assistant runtime.
- [x] Review, run release gates, publish tested changes and verify the deployed destinations.

Keep stored-data provenance truthful. Do not replace missing school records with invented personal facts or assume unobserved application forms.

## DTM dashboard preferences [Issue #98]

- [x] Revalidate source Customize mode and built-in block configuration without saving school changes.
- [x] Persist owner-only Important, Navigation and Contacts visibility, region and weight with versioned reset/retry handling;230000 applied after rollback preflight.
- [x] Match the observed configuration screen, preserve account-switch isolation, and verify local rendering and database behavior.
- [x] Independently review, run scoped/full release gates, publish and verify deployed behavior.

HTML block creation, Administration block behavior and unobserved Move interaction remain separate source-inspection gaps. Issue100 remains user-paused; no AI candidate or model tests are included.

## Active native academic records and Moodle submissions [Issue #98]

- [x] Inspect source transcript/ranking/warning, modern/legacy graduation, attendance and assignment detail/editor layouts without school mutations.
- [x] Implement eight native academic tables/readers, twelve routes and eight admin operations; pass isolated geometry, API and rollback-only SQL checks.
- [x] Connect explicit own-account academic assistant tools, compact views, private routing and verification regressions.
- [x] Apply only reviewed110000/130000/140000 after exact client migration plans (124 migrations / 140 public RLS tables).
- [x] Verify native two-account persistence/browser isolation and publish the native runtime.
- [ ] Resolve remaining production native model/reference failures with Issue #100 and rerun all three suites.
- [x] Apply independent Moodle upload/review backend150000; mount source-faithful detail/editor and pass real Storage plus browser checks.
- [x] Publish and verify Moodle student/admin submissions against deployed HTTP; positive admin browser interaction remains a separate gap.
- [x] Register observed assets, update docs, pass release gates, commit/publish and verify production.
- [x] Inspect certificate17-1, apply160000 after preflight, mount dedicated personal/admin views and pass post-apply rollback checks.
- [x] Complete certificate actual-JWT local API/browser acceptance with exact cleanup and protected-owner preservation.
- [x] Verify authenticated preview, publish and pass deployed Moodle/certificate acceptance with exact cleanup. Unattended preview remains SSO-protected.
- [ ] Continue remaining source families; recount current native coverage before quoting a total. Closed school application windows do not establish unseen forms.


## Next protected service: syllabus search12-3 [Issue #98]

- [x] Inspect source layout, complete sorting behavior, historical ALL including current, and ANY-theme matching.
- [x] Build unmounted source-shaped search UI and pass8DOM/9browser checks.
- [x] Independently review170000 and pass rollback-only SQL preflight with exact cleanup; no schema applied yet.
- [x] Wire bounded complete-result collection, local syllabus/back navigation and separate metadata maintenance; pass focused UI/client/mock API checks.
- [x] Apply only170000 after the reviewed exact migration plan; run actual-JWT persistence/permissions/browser acceptance, then release and verify production.

## Next protected service: tuition queries [Issue #98]

- [x] Inspect authenticated summer/evening payment instructions, extended-study Index redirect and empty settlement query without printing or paying.
- [x] Implement separate RLS-owned settlements and document metadata, strict versioned administrator operations and source-shaped student views.
- [x] Pass independent review, rollback-only preflight and exact staged gates (545 API/source,231 units, TypeScript/build/lint/handoff/audit).
- [x] Apply only180000 after its exact migration plan; baseline128 migrations/146 RLS tables,190000 remains unapplied.
- [x] Complete actual-JWT local/deployed HTTP and browser acceptance with exact cleanup, then publish and verify the production revision.
- [x] Add separately scoped tuition statement evidence to the assistant in567276e; actual-model acceptance is pending and payment ledger totals do not prove statement/PDF content.

## Current assistant repair release [Issue #100]

- [x] Independently review native evidence selection, saved-conversation handling, fixture recovery and diagnostics; pass isolated594 API/source,252 units,289 offline evaluation checks plus9 conversation-HTTP contracts.
- [x] Pass TypeScript/build/lint/handoff/audit and repeat190000 rollback preflight at128/146; plan/apply only190000. Current client129 migrations/146 RLS tables;200000 deferred.
- [x] Publish772ec95; verify exact manifest, Vercel Ready and successful GitHub Quality.
- [x] Complete actual-JWT saved-conversation/browser acceptance727423ae after the reviewed auth-settlement harness correction; exact cleanup passed.
- [x] Return the serialized model lease; grades/graduation passed on772ec95.
- [x] Publish reviewed correction e494fd4, verify Vercel Ready, Quality and deployed shell; hand sole live lease to Issue100.
- [ ] Targeted packet completed with raw failures retained: attendance passed5groups, certificate6/7, tuition9/12, catalog3/5. Issue100 is user-paused; lease returned after exact cleanup. No unfinished BatchB publication.

## Phase Next: systemwide assistant evaluation [Issue #100]

- [ ] Verifier thread owns isolated tests/evaluation and docs/qa/ASSISTANT_SYSTEM_EVALUATION.md to derive question coverage from all current routes/services/records.
- [x] Hand assistant runtime and serialized DB/model lease to Issue #100 after native release and certificate rollback cleanup.
- [ ] Track supported, unsupported and unverified capabilities separately; new file submissions are not personal tracker changes.

## Account assistant, verification graph and conversations [Issue #99]

- [x] Coordinate shared ownership in `agent/A2A.md`; preserve the other agent's native-service work.
- [x] Integrate the LangGraph evidence-check/correction loop into private, public knowledge, web and image answers. Fail closed and retain observable activity.
- [x] Verify account permissions, source contents, dates/amounts, correction limits and unavailable-provider behavior with adversarial and live-model checks.
- [x] Expand authorized read/action tools across School Affairs and Moodle, using existing business validations and confirmation for writes; keep Nexus and official-school identities separate.
- [x] Make the assistant available throughout signed-in stu.best pages, add useful record views and separate account-owned conversations.
- [x] Verify backend/UI/isolation, run release gates, publish through the client project and inspect production before closing the issue.

The latest user goal includes multiple conversations and permitted student-record edits/actions. An MCP deployment is an optional transport, not a requirement for these capabilities. Current implementation first completes verification before expanding write capabilities. No guarantee of perfect answers or access to records absent from the authorized database.

## Native aid, housing and course catalog destinations [Issue #98]

- [x] Revalidate signed-in source services and record actual application availability and query layouts.
- [x] Implement source-backed native destinations with persistent records and scoped assistant queries.
- [x] Verify permissions, lifecycle behavior and desktop/mobile parity; publish the tested batch.

The preceding turn made verified progress; this continuation has live source access. Parking sign-in currently does not open after the original button click. Housing shows its closed-season timetable and a published application walkthrough. Student aid shows records without a current application action. Do not infer unseen form controls or use historical deadlines as current defaults.

## Next native family: pending fees [Issue #98]

- [x] Inspect source39-1: eight columns, read-only rows, pending status; settled-row behavior unobserved.
- [x] Give39-1 its own measured layout and add nullable occurrence date, category, contact unit/extension and payment unit to account-owned charges. Never substitute due date for occurrence date.
- [x] Add stable pagination instead of silent100-record truncation; extend admin metadata and private assistant answers.
- [x] Verify privacy, totals, phone layout and source geometry, then publish.

Keep tuition queries48-1/48-2/48-3, settlement49-1 and transfers50-1 separate; their source workflows are different.

## Credit-load history [Issue #98]

- [x] Inspect original11-3 history, source menu links and empty six-column layout. Keep7-1 application rules separate.
- [x] Implement private history, strict versioned admin writes and persistent replay receipts; ground account answers in those records.
- [x] Complete source typography/geometry, two-account browser/API checks, release and production verification.

## Native selection history and weekly timetable [Issue #98]

- [x] Inspect original11-1 and11-2 filters, seven-column records and14-period weekly grid.
- [x] Implement separate account-owned phase snapshots and multiple meeting slots; preserve observed remarks without inferring enrollment or eligibility.
- [x] Recreate source filters/layout and admin maintenance; ground private subject/timetable queries in explicit records.
- [x] Verify privacy, persistence, source geometry and release.

## Native academic results [Issue #98]

- [x] Open source13-1 and inspect its menu, transcript, warning grades, ranking and unavailable/empty query states.
- [ ] Capture remaining source geometry and reconstruct independent academic-result views without substituting DTM assessment scores.
- [ ] Add account-owned semester results, summaries and administrative maintenance with scoped assistant access.
- [ ] Verify source parity, private records and complete link behavior, then release.

The source current-term grade query is outside its published opening period. Transfer and cycle-grade queries show no-record notices. Do not invent unseen source fields, infer graduation eligibility, or seed actual university student records into demonstration accounts.

## Protected course and scholarship destinations [Issues #93 and #98]

- [x] Revalidate the official sessions and inspect actual Moodle course/grade and international-scholarship screens.
- [x] Match the signed-in Moodle course outline and grade report using account-owned records.
- [x] Replace scholarship tracking with a persistent application period, apply/cancel, review and history workflow.
- [x] Route the academic-calendar entry directly to the existing copied calendar and local PDFs.
- [x] Verify browser behavior, database permissions and assistant answers; publish and record the remaining protected-service gaps.

The preceding goal turn made verified progress through deployed layout fixes and live database isolation checks. The current official Moodle and scholarship pages are accessible, so broader session expiry is not a blocker for these destinations.

## Student Affairs and DTM records [Issue #98]

- [x] Observe the official signed-in service menu, leave form, Moodle term tree, course and grades views. Verify the client project and migration baseline.
- [x] Give the catalog local service routes and implement account-scoped leave, internship and service records, plus explicit site review.
- [x] Implement personal DTM courses, sessions, attendance, materials, assignments and grades, including selected calendar deadline imports.
- [x] Add bilingual navigation and source-backed assistant links and personal record answers.
- [x] Verify database isolation, persistent UI flows, assistant behavior, build and client release. Document the institutional integration boundary.

Official SIS and Moodle sync, institutional submissions, and deeper university service workflows remain open in #98.

## Temporary client Supabase activity check [Issue #97]

- [x] Match the exact LuxArt0317 client project and verify an anonymous read against a public, RLS-protected table.
- [x] Add an external scheduled read with a fixed one-month cutoff and automatic workflow retirement.
- [x] Test successful, expired, manual-stop and failed-query paths without production writes.
- [x] Set the repository secret, publish to client main, verify normal and stop/re-enable runs, and record the operational limits and final state.

## Full client QA and verified repairs [Issue #96]

- [x] Establish a baseline for CI, API/unit/browser flows, live public routes and protected client checks; record reproducible failures.
- [x] Critique public, School Affairs/DTM and Nexus workflows, accessibility, authorization, data correctness, security and operations; rank concrete defects and map external gates to existing issues.
- [x] Fix the verified defects within the client repository and add focused regression checks for the affected behavior.
- [x] Run the full release gates, publish any verified fixes, test the deployed client routes, and record remaining limits honestly.

## Keep assistant work visible with each answer [Issue #95]

- [x] Trace the streamed progress, final answer activity, and conversation lifetime.
- [x] Attach every observed lookup stage to its assistant turn, including failures and JSON fallbacks.
- [x] Add a compact, expandable activity timeline and preserve conversation state across navigation/refresh in the current tab without storing image bytes or action capabilities.
- [x] Verify public and synthetic signed-in desktop/phone flows, stream interruption, account isolation, build and client release gates; publish and check stu.best. Real Lux Google callback acceptance remains tracked separately in Issues #83 and #94.

## Account-scoped school records and grounded assistant [Issue #94]

- [x] Reproduce the signed-in follow-up routing failure and identify missing personal records.
- [x] Add sample-provenance tuition, historical/upcoming courses, timetable and assignments to the client database with RLS.
- [x] Add administrator record management and show the records in School Affairs/DTM.
- [x] Answer current, today, next, past, future, assignment and fee questions from the caller's records, including follow-ups.
- [x] Run database, API, UI, security and release checks; publish and verify the live client site.


## Signed-in School Affairs answers and DTM fidelity [Issue #93]

- [x] Compare the official signed-in DTM page with the current stu.best preview and reproduce the assistant's contradictory account answers.
- [x] Route signed-in account and capability questions to verified private records; add deterministic answers for the reported failures.
- [x] Rebuild the DTM overview with its three-column navigation, system announcements, course categories, quick links and contact blocks; keep official reference labels separate from sample account data.
- [x] Run the AI behavior matrix, local UI/accessibility and full release checks; publish only the verified result.
- [x] Verify stu.best after deployment, update docs and handoff, and record the official Moodle integration gap.

## School Affairs Google sign-in from public assistant [Issue #83]

- [x] Reproduce the reported embedded login and identify why OAuth leaves the button busy.
- [x] Open School Affairs sign-in in the top-level page and recover older assistant frames.
- [x] Bound Google start time; preserve the PKCE callback and account separation.
- [x] Run focused and release checks, publish, verify the live route, and update the handoff.

## Live assistant research progress [Issue #92]

- [x] Inspect the public and signed-in assistant paths, identify actual lookup stages, and verify current OpenAI tool guidance.
- [x] Stream truthful server activity for knowledge, web, image and account lookups without exposing private model reasoning.
- [x] Show live progress in the chat UI, with final sources and confirmation-gated actions preserved.
- [x] Verify public/private API and browser behavior, run release gates, publish and verify stu.best.

## DTM copy, shared sign-in and account context [Issue #91]

- [x] Verify the client checkout, current School Affairs session boundary, DTM source screenshots and missing local routes.
- [x] Add account-scoped DTM sample schema and read API without using Nexus or official school credentials.
- [x] Build local DTM login/home/course views with shared Google sign-in and public landing account status.
- [x] Let the assistant answer from School Affairs and DTM only for a verified signed-in account.
- [x] Run database plan/deploy, privacy/API/UI checks, release gates, publish and verify production.

## Private School Affairs workspace and assistant [Issue #90]

- [x] Confirm the independent Google sign-in, current personal-data gap, client Supabase target, and data-source limits.
- [x] Add a dedicated School Affairs schema with sample provenance, owner/admin authorization, RLS and an audited action path.
- [x] Show account-specific records and an admin workspace in School Affairs, with clear sample labels.
- [x] Ground private assistant answers in the signed-in person's records and offer reviewable actions.
- [x] Run database plan/deploy, security/API/UI checks, release gates, live verification and handoff updates.

## Homepage hero and header responsiveness [Issue #84]

- [x] Reproduce the reported wide-screen offset against the live page and captured HTML.
- [x] Replace frozen Swiper slide/offset and sticky-header width with viewport-relative layout.
- [x] Verify 3020/2048/1440/768/390/320px hero width, centered navigation, and no horizontal overflow locally.
- [x] Run release gates, publish to stu.best, verify the live layout, and update the issue/handoff.

## Restore chatbot on direct public pages [Issue #84]

- [x] Confirm the direct-page release removed the React assistant mount and identify the shared assistant route.
- [x] Add a visible, accessible chat control to every captured page without restoring the page-loading iframe.
- [x] Verify open, answer, close, Escape, desktop/mobile layout, and direct-page navigation locally.
- [x] Run release checks, publish, verify the live pages and app, and update the issue and handoff.

## Direct public school pages [Issue #84]

- [x] Reproduce the local and public loading paths, and identify the iframe boundary and existing captured pages.
- [x] Serve copied public pages directly at their stu.best routes, preserving application/auth routes and the existing source assets.
- [x] Remove unnecessary public-page loading gates and verify homepage-to-destination navigation, refreshes, missing pages, and app sign-in.
- [x] Run release checks, publish the client site, verify the public routes, and record the handoff.

## Public loading recovery after deployment [Issue #84]

- [x] Compare the user's fallback screenshot with live public routes and missing asset responses.
- [x] Exclude missing static assets from the SPA rewrite, keep HTML fresh, and recover one stale entry automatically.
- [x] Add browser and source regression checks for stale bundles, no-JavaScript fallback, and missing asset status.
- [x] Complete the release gates, publish to the client Vercel project, and verify public route, asset, and header behavior.

## Public-page navigation loading regression [Issue #84]

- [x] Reproduce the hidden mirrored page while a production stylesheet keeps the iframe in `loading` state.
- [x] Bind visible copied content and links before nonessential assets finish; detect the SPA shell when a capture is unavailable.
- [x] Complete local mirror, API, unit, build, lint, handoff, dependency and client checks.
- [x] Publish to the client Vercel project and verify live cross-page navigation and the deployed build.

## Landing-page alignment regression [Issue #84]

- [x] Reproduce the crowded entrance labels on stu.best and compare with the user's official STU screenshots.
- [x] Remove the captured animation scale and restore ten/five/two/one-column entrance spacing without changing source documents or links.
- [x] Verify all entrance labels and page width across desktop/tablet/phone widths, then run existing mirror/statistics and release gates.
- [x] Publish the verified client release and confirm the live layout; update the issue and handoff.

## School Affairs login photo rotation [Issue #89]

- [x] Capture and verify all 16 public photos used by the official ePortal login.
- [x] Match the changing initial image, automatic rotation and previous/next controls with accessible behavior.
- [x] Run focused UI and release checks, publish to stu.best, and verify the live rotation.

## Official STU browser icon [Issue #88]

- [x] Compare the live official and client favicon metadata; identify the source-verified university crest.
- [x] Replace the inherited Vercel icon with the official crest for browser tabs and touch bookmarks.
- [x] Run release gates, publish to the client Vercel project, and verify the live favicon bytes and page metadata.

## School Affairs assistant source isolation and capabilities [Issue #87]

- [x] Route School Affairs Google sessions to a dedicated read-only assistant; exclude all Nexus account/course/term context.
- [x] Answer service and menu questions from the complete captured portal catalog, with dated source links; retain managed public knowledge and verified web fallback for other STU questions.
- [x] Support submitted screenshots/images and show actual lookup activity and sources without exposing private model reasoning.
- [x] Verify auth isolation, account-specific record limits, portal/vision answers, responsive UI and release gates; document and publish the verified change.


## Transactional UI overhaul [Issue #74]

- [x] Audit current pages with the taste skill; preserve green brand, permissions and workflows.
- [x] Replace promotional copy and repeated context banners with compact transactional screens.
- [x] Rebuild navigation, dashboard, forms and record lists with consistent shadcn controls.
- [x] Verify desktop/mobile, light/dark, accessibility and real role/CRUD workflows.
- [x] Update handoff evidence and commit the UI overhaul locally.

## Previous verified work [Issue #74]

- [x] Inventory existing components, brand colors, source structure, and role navigation.
- [x] Consolidate documentation and feature boundaries; preserve imports and contract references.
- [x] Install official shadcn/ui and Tailwind; migrate every feature surface and shared interaction.
- [x] Merge Learner Support into the School OS shell; audit real accounts and simplify directory/role presentation.
- [x] Audit CRUD and complete role workflows; fix verified gaps with preserved authorization.
- [x] Run unit/component/API/E2E/accessibility checks with real client-backed flows and cleanup.
- [x] Review responsive visuals, document verified evidence, and commit the merged workspace locally.
- [x] Publish the client release and verify the deployed merged UI.

Historical phase checklists: [planning history](../docs/archive/PLANNING_HISTORY.md).

## Client release and routing [Issue #74]

- [x] Separate `/login` and `/app`, add section URLs, preserve legacy recovery links and role guards.
- [x] Verify route behavior, build, backend integration and regression checks.
- [x] Push client main, verify the exact production deployment, and update handoff records.

## Readability, layout and public student registration [Issue #75]

- [x] Audit reported and related nested states; fix shared contrast, portal styling and overflow causes.
- [x] Add canonical /signin and /signup with secure student-only registration and compatible legacy links.
- [x] Verify backend registration/role boundaries, responsive light/dark visuals, unit/API/E2E and public regressions.
- [x] Update handoff/planning evidence, commit and publish the corrected client UI.

- [ ] Connect and verify a production sender for public student email delivery; Supabase default delivery remains restricted (user chose to keep Supabase).

## Alerts Plan and remaining nested UI [Issue #75]

- [x] Separate assistant context from the student drawer; use a proper sheet with Escape, focus, scrolling and request state handling.
- [x] Remove remaining dark green panel backgrounds and unreadable hero/upload/header text; improve quiz and notification spacing.
- [x] Verify real and mocked AI flows, nested sheets, keyboard interactions, contrast and overflow across themes/viewports; commit and publish.

## Collapsible school sidebar [Issue #76]

- [x] Enable shadcn icon collapse, desktop control, discoverable labels and persisted preference; preserve mobile drawer.
- [x] Verify pointer/keyboard, reload/navigation, account menu, both themes and mobile behavior.
- [x] Update documentation/issue and commit the verified change locally.

## Publish sidebar enhancement [Issue #76]

- [x] Push the verified sidebar commit through the client Git integration and confirm the exact Vercel deployment.
- [x] Verify live collapse/persistence/navigation/mobile behavior, backend checks and quality CI; update release records.

## Narrated pitch and role tutorials [Issue #77]

- [x] Find/validate the local ElevenLabs key and save it privately in an ignored owner-readable project env file.
- [x] Map six chaptered videos to every role/process; prioritize teacher and student depth and verify claims against actual app behavior.
- [x] Capture actual live role navigation/actions using isolated synthetic records, generate narration/captions and build explanatory Remotion graphics.
- [x] Render individual chapters and a combined master; inspect audio, captions, transitions, privacy, technical output and role coverage; remove temporary accounts/records.
- [x] Update handoff, scripts, setup/QA records, issue status and commit reproducible source without credentials or generated media.

## Complete actionable open issues and publish video help [Issue #78, #75, #61, #63, #65, #67, #69, #71]

- [x] Audit every current issue against code, client data and existing tests; map migrated issue references and record acceptance gaps.
- [x] Add authenticated /app/help with role-recommended guides, accessible playback/captions, stable client storage and downloads.
- [x] Fix Assistant message contrast, Card/legacy structure, responsive sizing/mode controls, and related output states.
- [x] Exercise research/API/RLS/study/ingestion/operations flows, correct implementable defects and rerun meaningful tests.
- [x] Publish verified changes through the client Git/Vercel integration and check production; update/close only satisfied issues.

User scope clarification: skip institutional approvals, physical campus walkthroughs, human participant/manual assistive-technology evidence and unavailable student-mail credentials. Keep those acceptance dependencies explicitly pending; preserve email confirmation and existing permissions.

Remaining acceptance: #75 production mail; #63 approved corpus/owners and scheduled source-refresh worker; #65 independent gold/metrics; #67 official physical/manual checks; #69 consented pilot; #71 manual operational acceptance; parent #61 remains open.

## STU public website and student systems UI [Issue #79]

- [x] Capture current homepage/student directory, observed SSO entry UI and assets; inventory source links.
- [x] Rebuild source-faithful public pages and local navigation, preserving official destinations.
- [x] Add labeled mySTU SSO UI preview without credential capture or backend/provider changes.
- [x] Verify screenshots, routes, keyboard/responsive/accessibility and regression gates; update docs/status and commit for local review.

Scope: UI only. Authenticated source screens remain unavailable until authorized access is provided. Preserve existing STU Nexus auth/app and database permissions; do not invent exact copies of unseen screens.

User clarification for #79: the second target is the mySTU SSO reached from student Gmail (sso2.stu.edu.tw), not TronClass/Moodle or an authenticated School Affairs screen. Execution choice: prepare the preview locally for review; real school integration stays disconnected within the requested UI-only scope.

## School Affairs portal UI [Issue #80]

- [x] Audit the signed-in portal shell, seven menu groups, program catalog, utilities and accessible read-only screens; sanitize all personal/session data.
- [x] Rebuild local portal routing, index, menu tables/search, preferences and observed views; connect School Affairs entries without changing app authentication.
- [x] Verify source coverage, local/demo behavior, responsive/keyboard/accessibility states, privacy and regressions; update centralized docs and commit for local review.

Scope: continue the UI-only reconstruction. Current signed-in source role is the available reference; use demo identity/records. No real school submissions, credential capture, account settings changes, push or deployment.

## Connect stu.best to client Vercel [Issue #81]

- [x] Verify Spaceship/Vercel ownership context, current DNS/HTTPS state and exact project requirements; preserve a non-secret record backup.
- [x] Attach the apex domain and consistent www routing, update only required DNS records and verify certificates/HTTPS.
- [x] Align authentication URLs and app domain references as needed, verify the live release and key routes, update provider/project handoff and private registry, then commit.

User authorized use of the existing stu.best domain for this Vercel website. Keep the apex hostname, existing Spaceship nameservers and unrelated records. The original registrar tab has an unsaved custom-nameserver draft; leave it untouched and use a separate management tab.

#81 verified release: runtime ae66d9c, Vercel 3cV4TGGQMokAyqeogtXCKVfwJkA7 Ready, quality 41482095220 successful. Canonical URL, HTTPS/redirect, public/portal navigation, asset graph/checksums, protected client backend and new/legacy/untrusted origin checks pass. #79/#80 source is published; both issues CLOSED. Seven prior acceptance issues stay open.

Final source verification: d9ba36b / Vercel 43s3ZCUGEcHh53fY52iBGv5DYXCX Ready; quality 41482854168 successful; #81 CLOSED.

## Connected school Assistant [Issue #82; related #63, #65, #71]

- [x] Audit public/internal retrieval, current corpus, role context, actions, source governance and end-to-end coverage.
- [x] Load trusted signed-in context server-side with existing RLS, shared eligible retrieval/citations, and robust public/signed-in chat behavior.
- [x] Populate and verify a broad dated official school/site corpus, with /app/knowledge management, source refresh and honest data-access boundaries.
- [x] Verify account isolation, public/private/stale/injection cases, meaningful questions and confirmed actions; run unit/API/E2E/release gates.
- [x] Document supported coverage and unavailable official/private data; update issue/state, commit and verify production.

User requests a complete connected Assistant. Preserve existing account permissions, confirmation-gated mutations and school-login isolation; do not fabricate records, official approvals or perfect coverage.

## School Affairs identity and knowledge management [Issue #83]

- [x] Rebuild public logged-out School Affairs entry from observed official login UI/assets; correct logout and reload behavior.
- [x] Separate public chatbot identity from Nexus and retain public RAG while real School Affairs authentication is clarified.
- [x] Default Lux's protected-owner sign-in to a knowledge-manager workspace, preserving owner authority and full-workspace escape.
- [x] Verify source likeness, session isolation, manager routes, responsive/a11y/API/unit/build checks and publish verified changes.

User chose real Google/Gmail authentication for independent stu.best accounts on November 3. No official school credentials are collected and no demo identity is trusted as authentication.

## Complete public destination copies and source fidelity [Issue #84]

- [x] Inventory the ten audience entrances and observed linked destinations; read source browser captures/assets rather than treat empty202 responses as copied pages.
- [x] Build deterministic local source-page/asset imports and internal school-link routing; preserve explicit protected/third-party boundaries.
- [x] Copy first-hop public HTML and additional freshman/international/alumni service details; record exact file/private coverage.
- [ ] Resolve remaining deeper service links and unavailable source resources; old news archives are excluded by the user's clarification.
- [x] Match homepage/source layouts, icons and responsive behavior; implement local menus/search/carousel interactions without source backend submissions.
- [x] Verify the local checkpoint with responsive visual/a11y and app regression gates; retain unresolved coverage honestly. Production publication is separate and has not happened.

Initial observed graph:299 school URLs across43 hosts plus83 third-party URLs from eleven captured root pages (home plus ten entrances). Browser rendering works where plain requests return empty202; no CAPTCHA/security warning or authentication bypass. #83 real student-auth integration choice remains separately pending.

User clarified scope: include entrance and service/detail pages; skip old news archives. Preserve existing dated snapshots, but do not spend further capture work on historical news, author listings or archive pagination. First-hop public HTML is copied; additional freshman, international-service and alumni-profile details are being added. Keep deeper service/resource gaps explicit until verified.

## Publish local school-page checkpoint [Issue #84]

User explicitly authorized publication.
- [x] Verify exact client identity/target, release gates and current production; preserve existing auth and domain settings.
- [x] Push the verified source to client main; follow its existing Vercel deployment and resolve build issues.
- [x] Verify the exact production assets, representative local page/file navigation and backend; update issue, handoff and private infrastructure records.

The remaining service/source-resource gaps and excluded old archives are unchanged by publication.

## Readable achievement statistics [Issue #85]

- [x] Inspect the reported homepage cards and inventory related source counters.
- [x] Restore source final totals and readable card/label/icon contrast; verify responsive widths and counter values.
- [x] Run release checks, publish to the existing client target and verify live figures/contrast; update handoff and infrastructure records.

Scope: only four source counters exist across the395 captured pages. Preserve source totals and public/school identity boundaries.

## Real Google School Affairs sign-in [Issue #83]

- [x] Verify client/provider state and isolate work from the unpublished archive draft (codex/full-school-archive, 9f15a95).
- [x] Replace demo entry with isolated Google PKCE sign-in, callback, validated session and local logout.
- [x] Show actual account identity and truthful linked/unlinked records; preserve Nexus roles and identity boundary.
- [x] Configure client Google OAuth and exact callback URLs; approved Google policies accepted, basic scopes saved, provider enabled and External audience published to Production.
- [x] Verify synthetic security/session/error/responsive flows, release gates and production Google entry/provider configuration.
- [ ] Verify an actual Google callback, account identity/linked-record behavior and logout isolation after the account holder completes Google's passkey/phone/Authenticator challenge.

## Helpful STU chatbot and live web search [Issue #86]

- [x] Audit hard abstention/provider/source failures and current official web-search API guidance.
- [x] Add managed-knowledge-first, privacy-safe official/broader STU web fallback, useful partial answers and clear scope/source UI.
- [x] Verify local API/security/failure/English-Chinese/follow-up/browser scenarios and release gates; deployed model/tool acceptance remains a release check.
- [x] Commit and publish the approved Google and chatbot changes, verify live official-source answers and protected boundaries; retain the unpublished archive draft separately. Issue #86 CLOSED; #83 remains open for real Google callback acceptance.

## Signed-in School Affairs and Moodle layout [Issue #93]

- [x] Capture the authenticated university and deployed stu.best layouts and measure the header, sidebar, notices and course columns.
- [x] Align authenticated pages to those references. Keep account records and assistant access in the account menu.
- [x] Compare the local build at reference sizes and on mobile. Verify all 94 catalog destinations and native leave, internship, grades and fees flows.
- [x] Publish the initial updated build and verify the private record workflows with a disposable two-account live test.

## Protected service destinations [Issue #98]

- [x] Verify actual catalog click-through, expose the leave form at its own URL, and separate application, history, and internship views.
- [x] Connect native enrollment, timetable, grade, attendance, credit, student and fee queries to account-scoped database records and assistant links.
- [x] Match the observed leave form controls and period picker and check phone/desktop accessibility.
- [ ] Inspect the remaining private university forms and views after the source sign-in challenge is completed. Check their layout and workflow individually.

## Next protected services: conduct38-1 and loan21-1 [Issue #98]

- [x] Inspect authenticated source views read-only; preserve private source evidence outside Git.
- [x] Mount conduct UI/admin/API locally; pass rollback preflight, focused tests and measured desktop/mobile QA.
- [x] Finish independent conduct live-harness review, plan/apply only200000 under the root lease, and pass actual-JWT local6ee6d6a6 with exact cleanup.
- [x] Publish Conductfcac3c4 and pass deployed b8c64115 six-group acceptance with exact cleanup/owner preservation.
- [x] Complete source-shaped loan UI, scoped database/administrator workflow and seven-group local/deployed acceptance at0731bda; exact cleanup/owner preservation verified. Unseen application forms and document issuance remain unavailable.
- [ ] Review/publish the next assistant corrections and rerun targeted real-model acceptance before expanding native readers.
- [x] Complete observed Dorm34-2 actual-JWT acceptance and publication:400abb0/ReadyEPE1/Quality43388722996; local7a3ab8b7 and productiond145f4ce7groups pass with exact cleanup. Only220000 applied at132/149. Populated source/assistant/admin-browser remain outside this batch.

## Next authenticated source coverage [Issue #98]

- [ ] Resume21-2 education-fund source after the new main-portal CAPTCHA handoff; capture only authorized read-only views.
- [ ] Inspect internship detail forms, separate PracticeUnit55-1, remission21-3 and subsidy24-1 before defining native workflows.
- [ ] Keep separate DTM and catalog4-2 Moodle/CU scopes explicit; do not count generic note records as native service completion.
- [ ] Complete the reviewed dashboard row/footer/account-switch repair, then rendered and release acceptance.

## Phase Next: Native fee-remission21-3 [Issue #98]

- [x] Inspect restored authenticated source and save its actual closed-period instructions and empty history layout.
- [x] Replace the generic tracker with the native page and retain notes at `/school-affairs/services/21-3/notes`.
- [x] Implement account-owned literal history with read-only student access and audited administrator maintenance. Migration `20261114030000` was applied after rollback verification.
- [x] Verify source layout, account boundaries, administrator editing, real persistence and deployed behavior. The deployed page reproduces the observed closed period.

## Next authenticated service, exchange and conference grants [Issue #98]

- [x] Open the grant system from the authenticated Student Affairs menu and capture the index and its destinations.
- [x] Observe the conference and exchange instructions, the report page, and the receipt link returning to the index after a notice.
- [ ] Verify what the application buttons lead to and implement the resulting local routes, forms and account records from observed fields.
- [ ] Verify report maintenance and the receipt flow with their actual available controls.

- [x] Implement the captured grant index, instruction pages, local manual, documented conference draft form and account-owned reports.
- [x] Verify browser navigation and record handling at desktop and phone widths. Verify the draft migration in a rollback transaction.
- [x] Verify live API cleanup and release acceptance for the implemented scope.
- [ ] Compare the current consent-gated application forms, roster fields and receipt issuance when observable.

## Teaching assistant and tutor evaluation [Issue #98]

- [x] Observe both TA destinations and the tutor evaluation form through the authenticated source.
- [x] Implement the observed TA routes, full tutor form, caller-scoped storage and local assistant navigation.
- [x] Pass rollback verification, targeted browser checks and all 94 catalog destination checks.
- [x] Verify exact production release and disposable-account cleanup.
- [ ] Compare populated TA reports and self-evaluations when a source account can open them.

## Service Leadership and assistant links [Issue #98]

- [x] Confirm the 42-1 index layout and source destination paths. Recheck protected detail access.
- [x] Mount the observed index, four distinct entry pages and account-owned notes.
- [x] Correct assistant destinations for existing subjects and Moodle materials.
- [x] Verify exact production release, local links and public shell.
- [ ] Capture and implement protected leadership and internship workflows when available.

## Parking permits [Issue #98]

- [x] Verify the public parking entry, instructions viewer and university authentication boundary.
- [x] Replace the generic entry with dedicated permit and instructions routes. Preserve existing private notes.
- [x] Verify the menu, assistant links, responsive layout and guest sign-in on the deployed revision.
- [ ] Verify the source instructions acknowledgment continuation, then compare the authenticated application form and records when the university session is available.

## Historical curriculum plans [Issue #98]

- [x] Capture the public program tabs and historical views. Verify the source table geometry and a sample plan PDF.
- [x] Implement the curriculum matrix and each observed program/archive route on stu.best.
- [x] Verify plan navigation, sample document access, assistant links, and desktop and mobile layout.

## Curriculum maps and related searches [Issue #98]

- [x] Confirm the public map entry, all 42 program overview URLs, and all 42 course-content destinations. Identify the separate career and competency sign-in gates.
- [x] Capture the source map layouts and course selectors for local navigation.
- [x] Implement the public map flow and verify real year/track results.
- [x] Verify the exact production revision and assistant links.
- [ ] Evaluate and implement the protected career and competency detail pages when the school session is available.

## Interdisciplinary credit programs [Issue #98]

- [x] Capture the official 35-row directory and verify the 30 linked PDFs.
- [x] Implement the database-backed local table, document routes and assistant lookups.
- [x] Verify migration isolation, routes, assets, assistant evidence and production deployment.
- [ ] Verify authenticated internship details when the university provides access.

## Interdisciplinary registration [Issue #98]

- [x] Inspect the authenticated university registration table.
- [x] Connect local registrations and withdrawals to the existing program catalog and private database.
- [x] Verify actual account read/write isolation, assistant evidence and exact production deployment.
- [ ] Compare the official populated registration, selection and progress screens when available.

## Course substitution [Issue #98]

- [x] Verify the source search uses the department code selected by autocomplete.
- [x] Capture populated, no-replacement and empty cases in the browser and independent HTTP client.
- [x] Build the full read-only selector and preserve old courses, alternative groups and provenance.
- [x] Verify result completeness, mobile layout, assistant lookup and deployed behavior at 52ec598.

## First course selection [Issue #98]

- [x] Verify the signed-in schedule, fee notice and final entry behavior on the source.
- [x] Implement the dated schedule and fee navigation, with Supabase-backed assistant answers and existing history kept in its account scope.
- [x] Verify the exact client migration, rendered notice geometry and assistant lookup before release.
- [ ] Capture the exact availability message and open-period selection requirements when observable.
- [ ] Implement and verify the open-period enrollment workflow with caller-owned records.
- [x] Verify the dated notice release on production at 3e4b51e.

## Course add/drop and late add [Issue #98]

- [x] Verify the signed-in source entry and read-only eligibility notices.
- [x] Implement the observed local pages, late-add notices and private eligibility decisions.
- [x] Verify and apply the exact client migration.
- [x] Verify the release at stu.best, including scoped HTTP reads and rendered manager retry and stale-edit recovery.
- [ ] Capture the eligible student forms and their transaction behavior when available.
- [ ] Implement and verify the eligible student's transaction workflow.

For each remaining stateful School Affairs and DTM service, implement account-scoped records and real persistence for the observed transactions. Use labeled sample records where needed. An unverified or missing record must stay unknown in the assistant and UI.

## Course withdrawal and restore [Issue #98]

- [x] Check the authenticated course menu destination and verify the withdrawal and restore sequence in the official handbook.
- [x] Mount the withdrawal workspace and persist confirmed changes against the caller's explicit withdrawal-phase course records.
- [x] Give administrators control of the local term window. Verify role boundaries, deadlines, stale writes, retry receipts and history.
- [x] Verify navigation, assistant lookup and production behavior at `91d97d3`.
- [ ] Inspect the current university withdrawal layout and active window.
- [ ] Inspect summer selection with a source account that can pass the student-record check. The observed entry displayed a missing college-code message.

## Credit transfer [Issue #98]

- [x] Recheck the source entry and verify application fields and review outcomes in the published documents.
- [x] Implement private drafts, print, confirmed submission, per-course review and assistant history.
- [x] Verify exact-client rollback, account boundaries and idempotency.
- [x] Verify the migration and deployed runtime at `420b8f2`.
- [ ] Inspect the current university open form and populated history.

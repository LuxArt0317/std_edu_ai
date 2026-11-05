# Task Plan

## Live assistant research progress [Issue #92]

- [x] Inspect the public and signed-in assistant paths, identify actual lookup stages, and verify current OpenAI tool guidance.
- [x] Stream truthful server activity for knowledge, web, image and account lookups without exposing private model reasoning.
- [x] Show live progress in the chat UI, with final sources and confirmation-gated actions preserved.
- [ ] Verify public/private API and browser behavior, run release gates, publish and verify stu.best.

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

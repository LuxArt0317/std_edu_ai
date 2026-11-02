# Task Plan

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
- [ ] Document supported coverage and unavailable official/private data; update issue/state, commit and verify production.

User requests a complete connected Assistant. Preserve existing account permissions, confirmation-gated mutations and school-login isolation; do not fabricate records, official approvals or perfect coverage.

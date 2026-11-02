# STU public-site reconstruction

Tracked by client [Issue #79](https://github.com/LuxArt0317/std_edu_ai/issues/79). User clarified the two linked destinations as the **current-student directory** and the **mySTU SSO entry reached from student Gmail**. The homepage is refreshed to match the current public reference. This is a separately hosted UI reconstruction, not a university identity-provider connection.

## Source audit and scope

Browser observations on 2026-11-02 (Asia/Manila):

| Source | Observed design/content | Local route |
| --- | --- | --- |
| [Homepage](https://www.stu.edu.tw/) | 800px hero, university logo/navigation, ten audience entries, three campus photographs, performance counters, ranking feature, campus image, eight admission categories, news/hot-link tabs and footer | `/` |
| [Current students](https://www.stu.edu.tw/在校學生/) | White university header, green title band, seven directory sections, 72 entries; two labels have no source link | `/在校學生/` (`/students` alias) |
| [School identity provider](https://sso2.stu.edu.tw/) | mySTU branding, blue/green field with blurred decorative clouds, 416×332px rounded panel, English username/password fields and Sign In button | `/student-sso` |

The user-supplied SAML request is temporary authentication state, so it is not saved or replayed. The local SAML-shaped path alias replaces itself with the clean preview URL and discards query state. Direct automated requests to the public site returned empty HTTP 202 bodies; only normal rendered-browser observations and its observed-asset export were used. No challenge or login boundary was bypassed.

The previously inspected School Affairs, TronClass and Moodle screens are excluded from this narrowed implementation. That was the #79 scope; Issue #80 below now adds the School Affairs portal. TronClass and Moodle directory links retain the original destinations. External service/article links are links, not claims that every university subsite or authenticated page has been cloned. No protected page beyond the SSO entry was available for inspection.

## Implementation

- `src/features/public/PublicSite.tsx` owns public routing. The main bootstrap retains separate lazy auth, research-study and public boundaries; `/signin`, `/signup`, `/app` and compatibility routes remain independent.
- `src/features/public/site/` contains the student page, SSO preview, shared preview notice, scoped styles, link/asset resolver and source snapshots. `src/data/knowledge.ts` retains the existing public homepage catalogue.
- All 72 student entries match independently captured per-category source fingerprints. Both source labels without URLs remain plain text. At the #79 checkpoint, only the copied student destination and school Gmail/SSO destination were mapped locally; the other original URLs are preserved.
- The homepage has the current campaign/campus slides, one current ranking story, three-photo strip and a 40-item news snapshot with the source's eight-item ALL order. News is a dated UI snapshot, not a live feed; source display truncation/encoding artifacts are retained.
- The initial 28 observed image assets are local under `public/stu-reference/`. The source URL, delivery byte count and SHA-256 are in its `provenance.json`. The initial 1920×800 campaign PNG is delivered as a 158,010-byte WebP (89.6% smaller); original source checksum/size and encoding provenance are retained, and the original capture stays in ignored audit artifacts; no WordPress scripts or external auth code is shipped. Google font requests are removed; the UI uses native font fallbacks. Metadata clearly identifies an unindexed interface preview.
- The reference's shapes, order, labels and spacing are preserved, with contrast corrections, responsive wrapping and proper keyboard controls. The preview notice and SSO explanation distinguish the copy from the school service. The SSO fields/button are disabled, with no form/action, session-code input, OAuth request, password listener or credential storage.
- Existing public AI/campus features stay available. Closed assistant content is inert, avoiding off-screen keyboard focus. The carousel starts paused, with explicit Play/Pause and reduced-motion handling. Tab arrow/Home/End navigation works without changing backend permissions.

## Verification

`npm run test:public-site` exercises the running local site; `PUBLIC_SITE_ORIGIN=http://127.0.0.1:5174 npm run test:public-site` checks the production build served by Vite preview. It rejects non-local targets. Screenshots/reports are private under ignored `artifacts/stu-reference/qa/`.

The suite checks home, directory and SSO at 1280, 768, 390 and 320px; dark system/saved app preferences preserve the source's light public presentation. It verifies all local navigation, refresh/back, clean SSO alias routing, mobile menu Escape/focus, original link coverage, disabled credential submission, carousel controls, news/hot-link keyboard tabs, local assets, app sign-in isolation, overflow and WCAG 2.2 A/AA findings.

Current successful run: 15 responsive/theme states, four-width navigation flows, all 28 served asset byte counts, no serious/critical automated accessibility findings, no overflow and no application errors. Also passed: 170 API/source checks, 19 units, build/assets and the inherited lint gate (existing React warnings). Existing public AI/campus/study regressions also pass all ten states with zero serious/critical findings, focus failures, unnamed controls or overflow. Handoff/documentation and dependency checks pass, with zero dependency vulnerabilities. The isolated public UI does not mutate the backend, so no database fixture or school login was used.

Mobile Lighthouse (local production preview, simulated mobile throttling):

| Page | Performance | Accessibility | LCP | CLS |
| --- | --- | --- | --- | --- |
| Home | 91 | 100 | 3.47s | 0 |
| Student directory | 100 | 100 | 0.93s | 0 |
| mySTU preview | 100 | 100 | 0.93s | 0 |

The initial homepage measurement was 75/100 with a 12.8s LCP: auto-advancing slides and the large source banner delayed the measured content. Opt-in playback, priority loading of the current hero, below-fold lazy images and WebP delivery improve that result. Source dimensions, content and layout are retained; compression is documented rather than claimed byte-identical. These local throttled lab measurements do not establish a sub-2.5s mobile field LCP or manual screen-reader acceptance.

## Delivery boundary

This task is UI-only. School authentication, mailbox access and protected content are not connected. No database migration, school credential handling or provider setting is needed for this preview. Authenticated source screens and an authorized integration are a later task. The changes are prepared for local review; production publication has not been requested in this task.

## School Affairs extension — Issue #80

Reference: [signed-in School Affairs portal](https://info.stu.edu.tw/ePortal/index.asp), observed on 2026-11-02. The user's existing source tab was already signed in. Read-only menu expansion/navigation and a public announcement dialog were inspected. No real-school form submission, password access, logout or account-setting change was performed. The full program catalog was already present in the rendered source DOM; no API, session or hidden authentication material was extracted.

The source uses a 45px blue header, 190px collapsible gray sidebar, 41px breadcrumbs, dense table/list content and a native Chinese font stack. The reconstruction preserves this service-portal composition instead of applying a new marketing design. Two public source images (logo and generic avatar) extend the shared asset manifest to 30 files. A scoped `.gitattributes` rule preserves captured SVG bytes across checkouts; the staged logo blob and worktree both match its provenance checksum.

### Implemented coverage

- Seven sidebar groups and 25 menu views; 57 source catalog rows and 94 program links, independently fingerprinted as `2c924bd6` over the normalized source tuples. Academic scopes contain 34 programs, student affairs 30, general affairs 11, research/development five, computing/personal four and information/library four; the remaining six entries are external/help rows. Common-menu aliases and course/graduation list views match the captured portal catalog.
- Source-shaped Index widgets: four system notices, ten public news headlines, six common links and nine health headlines. The real student's name, fees and client IP are excluded; the visible student identity and 12,000 fee are explicitly demo values. Announcement dialogs reproduce reading/close/copy/bookmark controls; summaries are labeled previews, not complete copies of all article bodies or attachments.
- Local search, custom-menu add/remove, persistent bookmarks, display skins/font size, fixed layout options, sidebar collapse/hover, mobile Sheet navigation, separate notifications and exit-preview state. This browser-local state is validated and isolated from STU Nexus authentication. Blocked storage produces an accessible warning while controls keep working in memory.
- Directory/homepage School Affairs entry links map to `/school-affairs`. `/ePortal/index.asp` and `/ePortal/apMenu.asp` are clean local compatibility aliases. Other copied portal menus resolve locally; program links are explicitly marked external school services. They retain stable source host/path, omit opaque query/fragment state and open with `noreferrer`. No claim is made that the 94 separate underlying applications, other roles' private menus or their backends have been cloned.
- Source-color differences are limited to readable smaller text/badges and controls, including the mobile blue header. Preview notices add vertical space. Lucide icons replace source icon-font glyphs within the existing shadcn/Tailwind foundation. The mixed settings controls use a nonmodal Popover; news/mobile overlays sit above the shared preview notice.

### Verification and delivery

`npm run test:school-affairs` passed all 25 menu views and 23 desktop/mobile/skin/dialog states at 1280, 1024, 768, 390 and 320px. It verifies search/no-results, all 94 program link targets, favorites and bookmarks across reload, widget collapse, sidebar width/persistence, keyboard menu activation, deep-link refresh/back, account-menu routes, settings persistence, four skins, mobile Escape/focus, query-stripping aliases, separate app sign-in and blocked storage. Successful checks have zero serious/critical automated accessibility findings, horizontal overflow, page errors or external requests. The portal has no credential form.

Five new units cover the independently captured catalog, scoped search/navigation, input sanitation, unavailable storage and entry URL mapping. Final checks pass: 170 API/source checks, 24 units, build/assets, inherited lint gate (no new portal/Popover warnings), handoff/docs and dependency audit with zero vulnerabilities. Existing reference pages pass 15 responsive/theme states; public AI/campus/study flows pass ten states with zero focus/target/overflow failures. The table checks explicitly verify 96px/132px desktop and 63px/88px mobile category columns. Route titles and the absence of credential forms are checked. Mobile Lighthouse on the local production preview measured performance 96, accessibility 100, LCP 2.71s and CLS 0; these lab results are not field metrics or manual assistive-technology acceptance. Evidence stays ignored under `artifacts/stu-reference/affairs-qa/`; source account values and authenticated screenshots are not versioned.

Local review only. The real school services, database, provider settings and app authorization remain unchanged; source is committed locally without a push/deployment.

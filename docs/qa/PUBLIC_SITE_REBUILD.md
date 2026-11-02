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

The previously inspected School Affairs, TronClass and Moodle screens are excluded from this narrowed implementation. Their directory links retain the original destinations. External service/article links are links, not claims that every university subsite or authenticated page has been cloned. No protected page beyond the SSO entry was available for inspection.

## Implementation

- `src/features/public/PublicSite.tsx` owns public routing. The main bootstrap retains separate lazy auth, research-study and public boundaries; `/signin`, `/signup`, `/app` and compatibility routes remain independent.
- `src/features/public/site/` contains the student page, SSO preview, shared preview notice, scoped styles, link/asset resolver and source snapshots. `src/data/knowledge.ts` retains the existing public homepage catalogue.
- All 72 student entries match independently captured per-category source fingerprints. Both source labels without URLs remain plain text. Only the copied student destination and school Gmail/SSO destination are mapped locally; the other original URLs are preserved.
- The homepage has the current campaign/campus slides, one current ranking story, three-photo strip and a 40-item news snapshot with the source's eight-item ALL order. News is a dated UI snapshot, not a live feed; source display truncation/encoding artifacts are retained.
- 28 observed image assets are local under `public/stu-reference/`. The source URL, delivery byte count and SHA-256 are in its `provenance.json`. The initial 1920×800 campaign PNG is delivered as a 158,010-byte WebP (89.6% smaller); original source checksum/size and encoding provenance are retained, and the original capture stays in ignored audit artifacts; no WordPress scripts or external auth code is shipped. Google font requests are removed; the UI uses native font fallbacks. Metadata clearly identifies an unindexed interface preview.
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

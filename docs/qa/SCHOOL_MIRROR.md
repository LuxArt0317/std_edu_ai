# Local school-page mirror — Issue #84

This website copy uses dated, public, browser-observed source HTML and self-hosted styles, fonts and images. It does not proxy the university at runtime. The homepage and all ten audience entrances use the source layouts; existing School Affairs/mySTU previews and Nexus account boundaries stay separate.

## Coverage and limits

The user clarified the scope on 2026-11-03: **entrance pages and service/detail pages; skip old news archives**. Existing dated snapshots are retained, but recursive historical-news, author and pagination archives are not a completion requirement. Protected applications still require separate approved integration. Department sites and deeper service links in the inventory must not be mislabeled as copied merely because their entrance page exists.

The 2026-11-03 capture contains 395 distinct public pages. The first-hop inventory has 304 normalized school destinations: 274 copied page/redirect URLs, three copied file destinations, 25 separately authenticated destinations and two native School Affairs preview entries. All first-hop public HTML destinations were captured after retries and chunked exports. Redirect aliases count as URLs, not additional distinct pages.

The recursive graph has expanded to 2,269 observed URLs. This is **not a complete copy of every department, historical archive, private application or third-party service**. The versioned [coverage inventory](../../src/features/public/mirror/coverage.json) distinguishes copied pages/files, pending imports, separately authenticated systems and state-changing actions excluded from crawling. [Page provenance/checksums](../../src/features/public/mirror/pages.json) and [asset provenance/checksums](../../src/features/public/mirror/assets.json) and [unavailable resource records](../../src/features/public/mirror/import-warnings.json) are independently inspectable. `/local-pages` provides local title/body search. An uncopied destination displays its actual status instead of silently redirecting to the original school.

Public third-party services remain explicitly external. School sign-in, submissions, Google translation widgets and private student data are not connected by this copy. The existing verified campus-directory/route UI remains available independently of the copied pages. Source layouts contain inherited contrast limitations; responsive layout, semantic labels and local interactions are corrected separately. Do not describe source appearance as complete accessibility acceptance or as a pixel-perfect institutional clone. The original alumni site also repeats the first profile article for several different profile URLs; those observed source responses are preserved, without inventing other biographies. Issue #84 stays open for deeper service coverage and unavailable source resources. Issue #83 separately tracks the School Affairs authentication/data decision.

Mirrored content is not automatically published to the Assistant knowledge base. Knowledge source review, audiences, freshness and publication remain managed in `/app/knowledge`.

## Implementation

- `src/features/public/mirror/paths.ts` is the shared URL policy. School paths map locally; custom application/identity routes are reserved. Query strings selecting documents remain distinct. No arbitrary URL fetch exists in the browser.
- `scripts/lib/school-browser-capture.mjs` accepts an already selected public-source Cua tab. Use only documented browser APIs; it neither launches its own browser nor signs into school systems. The importer excludes authenticated/private hosts, captures large DOM exports in chunks and records observed links. Raw captures stay ignored under `artifacts/site-mirror/`.
- `scripts/school-mirror-queue.mjs` maintains the observed graph and minimum hop depths. It preserves observed HTTP source addresses where appropriate, avoids destructive/state-changing paths and separates protected systems.
- `scripts/build-school-mirror.mjs` imports those captures. It removes source scripts, trackers, browser annotation overlays, hidden/credential values, active embeds and submissions. Source menus, tabs, carousels and search are controlled by trusted local code. Source CSS lives in a same-origin iframe with scripts/forms disabled and its own CSP, preventing source CSS from changing Nexus or the Assistant.
- Static asset fetching permits only the observed school/static-provider hosts, validates redirect hosts, bounds size/time and caches successes/failures. A media response must not be an HTML login/error page. Documents above the explicit 100 MB importer limit (25 MiB for images/fonts) and inaccessible resources remain reported gaps.
- Raw large documents are generated under `public/school-assets/` and excluded from Git there. Their verified bytes are shipped as 36 checksum-pinned compressed parts (at most 32 MiB each) under `vendor/school-documents/`. `prepare-school-assets.mjs` checks the document set, every archive part, the complete archive, regular-file entry names and every extracted file before atomic restoration. It uses system `tar`/gzip and isolated temporary extraction, with no school-server requests or provider credentials. Temporary archive/extraction data is removed. Images, styles and fonts remain directly versioned.
- The initial source-download design passed locally but fresh GitHub runners received HTTP 403 for 386 documents. That failed quality run is preserved as evidence; the bundled delivery replaces network hydration rather than suppressing failed checks. The static output still exceeds 1.7 GB; exact cloud acceptance and live verification must be recorded before claiming publication.

## Reproduce and verify

From the client checkout with Node 24:

```sh
npm ci
npm run prepare:school-assets
npm run dev -- --host 127.0.0.1 --port 5173
```

The repository includes about 1.2 GB of compressed document parts. Initial preparation needs system `tar` with gzip and several GB of temporary disk space; later runs reuse verified extracted files. `STU_MIRROR_OFFLINE=1 npm run prepare:school-assets` or `node scripts/prepare-school-assets.mjs --check` verifies existing local documents and fails if one is missing. Never suppress missing assets for a production build.

```sh
npm test
npm run test:unit
npm run test:school-documents
npm run test:school-mirror
npm run test:school-affairs-entry
npm run lint
npm run build
npm run verify:handoff
npm run verify:dependency-audit
```

The mirror UI suite uses 1440/768/390/320-pixel viewports and checks source pages, local school navigation, direct links/history, tabs, carousel, mobile menu/Escape, source SSO safety and search. Source frames keep script restrictions; accessibility is scanned on a separate frozen DOM/CSS snapshot, not by weakening the website. Results and screenshots stay in ignored `artifacts/site-mirror/qa/`. Scanner findings inherited from the source colors are reported, not silently treated as passing.

For focused diagnostics use `MIRROR_WIDTHS=390 MIRROR_ROUTES='/freshman|/international' npm run test:school-mirror`. `PUBLIC_SITE_ORIGIN` selects a running local preview; remote targets are rejected. Human screen-reader and complete institutional acceptance are not asserted by this suite.

## Refresh

Refresh public captures through the documented browser workflow, then run `npm run mirror:queue` and `npm run mirror:import`. `npm run mirror:import -- --offline` compiles only existing local captures/cache. `--retry-failed` explicitly retries previously failed asset imports. After reviewed document changes, run `npm run pack:school-documents`; commit the asset and bundle manifests together with all changed parts. Review changed source content, coverage, checksums and screenshots before committing. A fresh repository contains the sanitized deliverables and pinned public assets, not the private raw-capture working set; ordinary builds do not require recrawling.

## Verification checkpoint

Local review build: `index-C6ya21l1.js` (41 recursive app dependencies), available at `http://127.0.0.1:5174/`. Source34c2812 was pushed after publication approval. Its first cloud attempts failed Supabase branch provisioning and source-document403; the offline bundle and production-action correction are being released. Production remains the previously verified #83 release until exact cloud/live checks are recorded.

Verified: 193 API/source checks, 28 unit tests, build/assets, lint (inherited warnings; none in the new mirror code), documentation and zero dependency vulnerabilities. The expanded mirror browser suite passes 56 route/viewport states at 1440/768/390/320 pixels, local tabs/carousel, student-SSO isolation, alumni menus, admissions details/history, mobile Escape and search. No tested overflow, source script error, foreign iframe resource request or transparent media placeholder remains. Source snapshots report 24 serious color-contrast rule occurrences across the scanned views; other serious/critical semantic checks pass. This is not a WCAG-conformance claim.

Existing surrounding Assistant/campus/study UI passes ten automated accessibility states with zero serious/critical findings, overflow or focus failures. School Affairs entry/logout/identity isolation passes five states. A source hydration test initially downloaded one missing file locally; fresh cloud requests later failed HTTP 403. The replacement cold-bundle test restores all 401 documents without networking and rejects a corrupt part and path-traversal metadata. Mirrored HTML, local CSS and a copied PDF return HTTP 200 with their scoped CSP and `nosniff` headers.

The delivery contains 395 distinct pages and 304 first-hop school destinations (274 copied HTML/redirect URLs, three copied file URLs, 25 protected systems and two native previews). The broader 2,269-URL inventory still includes untriaged deeper service/department links and excluded historical archives. There are 59 pending document destinations and 123 unique unavailable asset URLs in the current inventory. These are gaps, not successful copies. Source alumni-profile repetition, unavailable assets, inherited colors, private-system integration and hosted delivery limits remain explicit. Issue #84 stays open for unresolved service/resource coverage; old archives are excluded by user choice. No database, account-policy or knowledge-publication changes were made.

## First hosted acceptance and navigation follow-up

Source `664fba586ef6e3a629f6cb52aede7b8d3b9d990f` is Ready as Vercel `AaFGEskY4Bz63XtV2mfwckbYjh5W`; quality41538417839 succeeded. Live verification checksums all395 copied HTML files and verifies HTTP200, sizes/types and scoped CSP/nosniff on all3545 unique static assets, including401 documents. Ten audience entry routes, native/auth entries and search match the expected application entry. Client RLS/CRUD cleanup/Edge/OpenAI checks pass.

A subsequent real browser check found that links could be clicked before the source iframe load event when media was slow. The follow-up binds controls at DOM readiness, gates visibility until binding and remounts per page/alias to prevent stale readiness. Local56 states plus delayed-image/font navigation and surrounding public a11y10 states pass; source contrast24 remains reported. The readiness follow-up is being published; its expected local entry is `index-DHcbVgDM.js`.

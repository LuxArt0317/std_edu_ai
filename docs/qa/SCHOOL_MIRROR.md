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
- Large documents exceed 1 GB and are excluded from Git. `prepare-school-assets.mjs` materializes only manifest-pinned documents at build/dev startup, verifies SHA-256, uses a local build cache and fails on missing/changed content. It does not fall back to an original-school redirect. Images, styles and fonts remain versioned. The GitHub workflow caches document binaries; no provider credential is required for public document preparation. The current static delivery exceeds 1.7 GB; hosted size/cold-build transfer and document hosting must be verified before a production release. A successful local build is not evidence of hosted acceptance.

## Reproduce and verify

From the client checkout with Node 24:

```sh
npm ci
npm run prepare:school-assets
npm run dev -- --host 127.0.0.1 --port 5173
```

The initial document preparation may take several minutes and more than 1 GB of transfer/disk space. Later runs reuse verified content. `STU_MIRROR_OFFLINE=1 npm run prepare:school-assets` or `node scripts/prepare-school-assets.mjs --check` verifies existing local documents and fails if one is missing. Never suppress missing assets for a production build.

```sh
npm test
npm run test:unit
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

Refresh public captures through the documented browser workflow, then run `npm run mirror:queue` and `npm run mirror:import`. `npm run mirror:import -- --offline` compiles only existing local captures/cache. `--retry-failed` explicitly retries previously failed asset imports. Review changed source content, coverage, checksums and screenshots before committing. A fresh repository contains the sanitized deliverables and pinned public assets, not the private raw-capture working set; ordinary builds do not require recrawling.

## Verification checkpoint

Local review build: `index-C6ya21l1.js` (41 recursive app dependencies), available at `http://127.0.0.1:5174/`. This checkpoint is committed locally; it has not been pushed or deployed. Production remains the previously verified #83 release.

Verified: 193 API/source checks, 28 unit tests, build/assets, lint (inherited warnings; none in the new mirror code), documentation and zero dependency vulnerabilities. The expanded mirror browser suite passes 56 route/viewport states at 1440/768/390/320 pixels, local tabs/carousel, student-SSO isolation, alumni menus, admissions details/history, mobile Escape and search. No tested overflow, source script error, foreign iframe resource request or transparent media placeholder remains. Source snapshots report 24 serious color-contrast rule occurrences across the scanned views; other serious/critical semantic checks pass. This is not a WCAG-conformance claim.

Existing surrounding Assistant/campus/study UI passes ten automated accessibility states with zero serious/critical findings, overflow or focus failures. School Affairs entry/logout/identity isolation passes five states. A pinned-document hydration test downloaded a missing public file and verified its checksum; normal preparation verifies all 401 unique document files locally. Mirrored HTML, local CSS and a copied PDF return HTTP 200 with their scoped CSP and `nosniff` headers.

The delivery contains 395 distinct pages and 304 first-hop school destinations (274 copied HTML/redirect URLs, three copied file URLs, 25 protected systems and two native previews). The broader 2,269-URL inventory still includes untriaged deeper service/department links and excluded historical archives. There are 59 pending document destinations and 123 unique unavailable asset URLs in the current inventory. These are gaps, not successful copies. Source alumni-profile repetition, unavailable assets, inherited colors, private-system integration and hosted delivery limits remain explicit. Issue #84 stays open for unresolved service/resource coverage; old archives are excluded by user choice. No database, account-policy or knowledge-publication changes were made.

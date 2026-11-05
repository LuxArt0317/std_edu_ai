# Public school pages

`pages.json` is the manifest of 395 observed public school pages. Each page has a captured, inert HTML document in `public/school-pages/`, plus a dated source URL. `assets.json`, `files.json`, `coverage.json`, and `gaps.json` distinguish copied resources from unavailable or separately authenticated destinations.

The release serves each captured document directly at its `stu.best` route. `scripts/lib/direct-school-pages.mjs` validates manifest paths and adds the nonofficial-site notice without editing source captures. `scripts/sync-school-routes.mjs` generates exact Vercel rewrites; Vite dev and preview use the same manifest. The root copied document is `dist/index.html`, while the React application for `/app`, `/signin`, School Affairs and other app routes is `dist/app-shell.html`. Public copied pages do not use an iframe, boot screen, or runtime source fetch. `SourceMirror.tsx` handles uncopied paths and local search only.

`public/direct-school.css` supplies scoped corrections for the copied homepage entrance grid and statistics. Captured pages have scripts and forms disabled, so source controls requiring JavaScript are not implemented here. Authenticated university systems need an approved integration. The campus assistant and directory remain available at `/campus-assistant` and `/campus-directory`.

Run `npm run sync:school-routes` after changing `pages.json`, then `npm run build` and `npm run test:school-mirror`. See [mirror QA](../../../../docs/qa/SCHOOL_MIRROR.md) for provenance, coverage and limits. Do not edit a captured HTML file without updating its checksum and provenance.

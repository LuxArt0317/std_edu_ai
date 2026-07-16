# Progress Log

2026-07-16 — Pixel-faithful homepage clone

- created GitHub issue #3 for the full `stu.edu.tw` homepage reconstruction
- confirmed the live homepage is WordPress 7.0.1 with Elementor 3.35 and page-specific inline styling for page 243
- began extracting the live navigation, section content, image assets, and exact responsive CSS using terminal-only inspection
- extracted all official navigation, hero, audience, performance, story, admissions, news, hot-link, public-information, contact, social, and footer data
- replaced the prototype page with a section-complete responsive STU homepage reconstruction
- implemented hero autoplay/navigation, campus-image navigation, responsive mobile menu, news filters, hot-link tabs, and official external destinations
- preserved the research AI assistant as a floating drawer rather than an in-flow homepage section
- verified every referenced STU media asset returns HTTP 200
- verified Node 22/npm 11 clean install, lint, production build, and HTTP 200 responses for `/` and `/campus/assistant`
- published the implementation in PR #4 and verified its Vercel preview deployment passed
- merged PR #4 to `main` and verified the production Vercel deployment completed successfully
- confirmed the production root and `/campus/assistant` routes respond through the configured Vercel SSO protection

- Checked repository contents and confirmed `research.md` is the only existing project document.
- Read `research.md` and extracted the website direction and AI-support goals.
- Verified the current Vite scaffold command against the official Vite documentation.
- Scaffolded a latest Vite React TypeScript app locally.
- Replaced the starter UI with a Shu-Te University smart campus prototype.
- Added documentation files for understanding, setup, project summary, changelog, and planning state.
- Installed npm dependencies and verified the app with a successful production build.
- Inspected the live `https://www.stu.edu.tw` homepage source in the terminal and refactored the prototype to follow its section order and visual composition more closely.
- Reworked the page again to match the screenshot styling more literally, including the hero overlay, turquoise bands, slanted section edges, title treatment, story blocks, contact band, and footer-style lower section.
- Installed `@supabase/supabase-js`, added the Supabase env variables and browser client, and integrated a live `todos` query panel into the existing page.
- Verified the frontend integration, build, and lint; verified the live query path reaches Supabase but currently fails because `public.todos` is not present in the target schema cache.
- Implemented the core research modules in the app: structured knowledge documents, intelligent search, FAQ support, campus destination guidance, context-aware AI answers, and a local survey/evaluation workflow.
2026-07-16

- investigated the Vercel deployment breakage starting from local build and repository workflow files
- confirmed the production build succeeds locally with the current checkout
- identified unguarded Supabase client initialization as the highest-risk production failure path
- updated the Supabase integration to avoid app startup crashes when Vercel env vars are missing
- updated the app copy and setup docs to reflect the new fallback behavior
- created GitHub issue #1 to track the Vercel deployment recovery
- confirmed the existing checkout passes the production build and lint before deployment configuration changes
- added an explicit Vercel contract for Node.js 22, `npm ci`, the Vite build, `dist`, and SPA route fallback
- verified a clean `npm ci`, lint, Vercel production build, and valid `vercel.json`
- verified the production preview returns HTTP 200 at `/` and `/campus/assistant`, with identical application shells
- reopened GitHub issue #1 after GitHub reported two failed Vercel production deployments
- reproduced the Vercel install failure with Node 22/npm 11: `npm ci` rejected four missing transitive `@emnapi/*` lockfile entries
- regenerated `package-lock.json` with npm 11 and verified clean install, lint, and production build with Node 22/npm 11
- pushed the repair in PR #2 and verified its Vercel preview deployment completed successfully
- merged PR #2 to `main` and verified production deployment 5472729645 completed successfully
- confirmed the production root and `/campus/assistant` routes are reachable behind the project's Vercel SSO deployment protection

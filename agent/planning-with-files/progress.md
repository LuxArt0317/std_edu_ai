# Progress Log

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

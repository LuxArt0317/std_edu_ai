# Current State

The repository contains a Vite-based prototype for an AI-enhanced Shu-Te University website, and the active fix is focused on stabilizing the Vercel deployment path.

Working status:

- the Vite scaffold has been installed and configured locally
- the homepage now reflects the Shu-Te University smart campus concept from the research
- the homepage structure now more closely mirrors the live `stu.edu.tw` homepage layout and section order
- the homepage styling has been pushed closer to the screenshots, including hero treatment, turquoise section bands, slanted separators, content blocks, and footer/contact composition
- the AI feature is implemented as a local mocked assistant backed by a small knowledge base
- Supabase frontend integration now degrades gracefully when env vars are missing or the `todos` table is unavailable
- the site should continue rendering on Vercel even when live Supabase data is misconfigured
- research modules now implemented in the frontend include knowledge retrieval, FAQ coverage, navigation support, AI chat assistance, and a local evaluation survey
- Vercel now has an explicit Node.js 22, `npm ci`, Vite build, `dist` output, and SPA rewrite contract
- deployment recovery is tracked in GitHub issue #1
- `npm ci`, lint, and the Vercel production build pass
- preview smoke tests return HTTP 200 for both `/` and `/campus/assistant`, with the deep route serving the application shell
- the first configured production deployment failed during `npm ci` because npm 11 rejected missing transitive `@emnapi/*` lockfile entries
- the lockfile has been regenerated with Node 22/npm 11 and now passes clean install, lint, and production build under the deployment toolchain
- the local Vercel CLI has no credentials, so production verification is performed through the connected GitHub deployment integration

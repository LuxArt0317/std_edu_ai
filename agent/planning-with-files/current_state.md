# Current State

Production Supabase activation is complete. GitHub issue #12 tracks the final secure credential handoff for the existing owner administrator.

Credential handoff status:

- the owner email is `winsonbaring10@gmail.com`
- the credential exists in the macOS login keychain as an internet password for `www.stu.best`
- production Supabase password authentication passes and returns the trusted `admin` app role
- the verified password has been copied to the owner's local clipboard for direct paste into the CRM login form
- no plaintext password was written to the repository, command output, planning files, or GitHub

Activation status:

- project ref `zhcchldvgqrkfqoknewk` is `ACTIVE_HEALTHY` in `ap-northeast-1`
- current remote state: 11 RLS-protected public CRM tables, three migrations, and the provisioned owner administrator
- the existing CRM remains available through its persistent continuity adapter while live integration is implemented
- no unrelated Supabase project will be modified
- remote schema is now live through three tracked migrations with 11 RLS-protected tables and safe seed data
- the confirmed owner account has trusted `admin` app metadata; its generated password is stored only in the local macOS keychain for `www.stu.best`
- the one-time bootstrap RPC is no longer executable by authenticated users
- authenticated live reads and reversible case mutation tests pass; anonymous student access is denied
- the application now uses Supabase Auth and live persistence with explicit continuity fallback and rollback behavior
- Vercel Production and Preview have browser-safe Supabase configuration
- the only remaining Supabase advisor warning is the dashboard-level leaked-password protection toggle; the provisioned owner password is a randomly generated 40-character credential
- PR #10 merged to `main`, issue #9 closed as completed, and the Vercel production deployment is Ready
- production `/crm` returns HTTP 200 behind Vercel SSO and the production OpenAI endpoint returns structured grounded output

The repository contains the responsive STU homepage reconstruction and the completed STU Nexus school CRM at `/crm`, aligned with `research.md` and `UNDERSTANDING.md`.

Working status:

- full CRM implementation is tracked in GitHub issue #5
- the OpenAI key is stored only in ignored `.env.local` with mode `600`
- the connected Supabase account cannot access the project ref configured in this repository, so no remote schema mutation is authorized
- the CRM provides command center, Student 360, Success Radar, admissions, cases, campaigns, Knowledge Hub, analytics, and stateful local persistence
- the server-only OpenAI endpoint sends de-identified context, enforces structured responses, and has a grounded client fallback
- the configured OpenAI key and current model returned a successful structured response in live verification
- the Supabase migration is activation-ready with normalized tables, RLS, indexes, full-text/vector search, AI audit controls, and demo seeds
- lint, full TypeScript/Vite build, 3 API contract tests, and `/crm` HTTP smoke checks pass
- PR #6 merged to `main`, GitHub issue #5 closed as completed, and the Vercel production deployment passed
- production remains protected by the project's configured Vercel SSO; anonymous CRM requests redirect to authentication and anonymous API requests return 401
- OpenAI production/preview variables are encrypted in Vercel; tests live outside the reserved `/api` directory so only the intended assistant function is deployed

- pixel-faithful homepage reconstruction is tracked in GitHub issue #3
- the live Elementor page structure, styles, content, links, and assets have been extracted using terminal-only inspection
- the homepage now reproduces the full official section order with live STU imagery and destinations
- hero and campus carousels, mobile navigation, news filters, hot-link tabs, and the floating AI assistant are interactive
- the Node 22/npm 11 clean install, lint, production build, media validation, and local root/deep-route smoke tests pass
- PR #4 is merged to `main` and GitHub issue #3 is resolved
- the Vercel preview and production deployments completed successfully
- the production root and deep route respond through the configured Vercel SSO deployment protection

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
- the corrected preview and production deployments completed successfully through the GitHub/Vercel integration
- the production root and `/campus/assistant` routes respond through Vercel deployment protection; anonymous requests redirect to Vercel SSO as configured for the project

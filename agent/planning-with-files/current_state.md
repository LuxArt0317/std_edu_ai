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
- the production build is being re-verified after the deployment-hardening change
- GitHub issue tracking is still pending because GitHub MCP access is not installed in this session

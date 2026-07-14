# Current State

The repository now contains a working Vite-based prototype for an AI-enhanced Shu-Te University website.

Working status:

- the Vite scaffold has been installed and configured locally
- the homepage now reflects the Shu-Te University smart campus concept from the research
- the homepage structure now more closely mirrors the live `stu.edu.tw` homepage layout and section order
- the homepage styling has been pushed closer to the screenshots, including hero treatment, turquoise section bands, slanted separators, content blocks, and footer/contact composition
- the AI feature is implemented as a local mocked assistant backed by a small knowledge base
- Supabase frontend integration has been added with `@supabase/supabase-js`, env variables, and a browser client
- live Supabase verification currently fails because `public.todos` is not available in the target project schema cache
- research modules now implemented in the frontend include knowledge retrieval, FAQ coverage, navigation support, AI chat assistance, and a local evaluation survey
- the production build succeeds
- GitHub issue tracking is not yet active because the local repository has no configured remote

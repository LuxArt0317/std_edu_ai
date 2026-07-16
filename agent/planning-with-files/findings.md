# Findings

- `research.md` defines the project as an AI-enhanced Shu-Te University campus and website experience
- the goal is to improve accessibility, usability, information retrieval, and user experience
- the most important product addition is an AI assistant for academic, administrative, and campus questions
- the live STU homepage uses a sticky overlay header, large hero, role-category section, admissions section, news section, and hot links section
- the screenshots emphasize exact color treatment, gradients, slanted white separators, oversized Chinese headings, wide image blocks, and a contact-footer composition that needed a much closer pass
- the provided Supabase project credentials are valid enough to reach the API, but the example `public.todos` table is not currently available to query
- the research scope is frontend-friendly: it requires information retrieval, user support, FAQ coverage, and navigation assistance, but explicitly excludes full administrative processing and predictive systems
- the current deployment risk is frontend bootstrap failure when `createClient` is called without valid Vercel env vars
- production should treat Supabase as optional for page render and isolate backend failure to the data panel
- the repository previously relied on Vercel framework inference and did not pin a supported runtime, deterministic install command, output directory, or SPA fallback
- GitHub issue #1 tracks the Vercel recovery
- Vercel's Node 22/npm 11 install fails when the npm lockfile omits optional transitive `@emnapi/core` and `@emnapi/runtime` entries, even though older local npm versions accept the same lockfile

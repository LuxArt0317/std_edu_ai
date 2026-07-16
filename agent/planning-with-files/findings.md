# Findings

- the owner credential was present as a macOS internet-password entry even though it was not visible where the user expected in Keychain Access
- the stored credential remains valid against production Supabase Auth and resolves to the trusted `admin` app role
- a verified clipboard handoff gives the owner immediate access without copying the secret into chat, terminal output, GitHub, or repository files
- the production `stu_edu_ai` Supabase project is healthy, empty, and now accessible through MCP
- a production-ready activation requires both live repositories and a real authenticated staff session; a browser publishable key alone must never bypass RLS
- newly SQL-created tables may require explicit Data API grants, which the prepared migration provides alongside RLS
- the initial administrator must be bootstrapped through a constrained, auditable path and subsequent authorization must rely on trusted `app_metadata`
- a generated 40-character owner password stored in the macOS login keychain avoids plaintext credential handoff while keeping the deployed CRM immediately usable
- production RLS validation confirms anonymous requests are denied and trusted admin JWTs can read and mutate only through explicit policies
- policy-specific insert/update rules remove the multiple-permissive-policy advisor findings without broadening authorization
- Supabase's leaked-password-protection setting is a dashboard-level control not exposed by the connected MCP toolset; the strong generated credential substantially mitigates the current warning until that toggle is available

- the live homepage is WordPress 7.0.1 using Elementor 3.35 and exposes its page-243 styling inline
- the current desktop hero is 800px tall, uses three 5-second slides, and overlays the centered logo/navigation with a dark green gradient
- the official core visual tokens are `#3CB69E` teal and `#D2E3E0` mist, with Roboto typography and clipped diagonal section transitions
- the full homepage order is hero, ten audience entrances, campus vision carousel, four performance counters, three institutional stories, campus-life banner, eight admissions routes, news tabs, student/teacher hot links, six public-information banners, contact/social links, and copyright footer
- the research-driven AI layer should remain an overlay so the official clone remains structurally and visually intact
- the highest-leverage CRM experience is a daily student-success copilot that connects academic, engagement, service, and financial signals into reviewable next-best actions with evidence citations
- student context sent to OpenAI can remain useful while excluding name, student number, email, phone, and exact financial amounts
- the configured OpenAI Responses API path successfully returns schema-constrained, cited output with the current model
- the connected Supabase account cannot access the repository's configured project, so production safety requires an explicit local continuity adapter rather than mutating an unrelated database
- Supabase activation is fully represented in a migration with role-based RLS, indexed operational paths, searchable/vectorized knowledge, and privacy-minimized AI audits

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

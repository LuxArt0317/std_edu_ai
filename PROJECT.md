# Project

This project combines a responsive reconstruction of the current Shu-Te University homepage with STU Nexus, a production-shaped school CRM and AI student-success workspace built with Vite, React, TypeScript, Supabase, and the OpenAI Responses API.

It demonstrates:

- a section-complete reconstruction of the official `stu.edu.tw` homepage
- official navigation destinations, hero carousel, audience entrances, performance counters, campus stories, admissions, news, hot links, public information, and footer content
- responsive desktop, tablet, and mobile layouts modeled on the live Elementor page
- a smart-campus positioning aligned with the research
- a non-disruptive floating AI assistant for natural-language campus questions
- a deployment-safe optional Supabase service reserved for later research modules
- a deterministic Vercel deployment using Node.js 22, the npm lockfile, explicit Vite output settings, and SPA route fallback
- a premium `/crm` command center with eight operational workspaces and responsive desktop/mobile behavior
- stateful Student 360, task, admission, case, campaign, and knowledge workflows that persist in the browser continuity adapter
- a server-only, rate-limited OpenAI endpoint with structured output, de-identified student context, timeouts, and safe local fallback
- an activation-ready Supabase migration with normalized CRM entities, role-based RLS, query indexes, full-text/vector knowledge search, privacy-minimized AI audit logs, and demo seed records
- automated API contract tests and production route smoke coverage

For setup and run instructions, see [SETUP.md](./SETUP.md).

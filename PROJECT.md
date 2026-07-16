# Project

This project combines a responsive reconstruction of the current Shu-Te University homepage with STU Nexus, a production-shaped, all-in-one school operating platform built with Vite, React, TypeScript, Supabase, and the OpenAI Responses API.

It demonstrates:

- a section-complete reconstruction of the official `stu.edu.tw` homepage
- official navigation destinations, hero carousel, audience entrances, performance counters, campus stories, admissions, news, hot links, public information, and footer content
- responsive desktop, tablet, and mobile layouts modeled on the live Elementor page
- a smart-campus positioning aligned with the research
- a non-disruptive floating AI assistant for natural-language campus questions
- a production Supabase Auth and Postgres backend with browser-safe publishable credentials and database-enforced authorization
- a deterministic Vercel deployment using Node.js 22, the npm lockfile, explicit Vite output settings, and SPA route fallback
- a premium `/crm` school OS with distinct owner, leadership, administrator, teacher, specialist-staff, and student experiences
- a protected owner tier for `winsonbaring10@gmail.com`, safe role preview, audited role assignment, and immutable owner guarantees
- departments, programs, terms, courses, sections, rosters, topics, assessments, protected answer keys, attempts, transactional scoring, gradebooks, announcements, notifications, and calendars
- AI-assisted grade-sheet image extraction with confidence signals and mandatory teacher review before a draft grade can be saved or published
- durable, authenticated, multi-turn school conversations grounded in the signed-in user's visible courses, topics, schedule, and role
- the original Student 360, early-support, admissions, task, case, campaign, knowledge, and analytics CRM available inside the unified platform
- deployed Supabase migrations with RLS on every exposed school table, trusted workflow functions, covering indexes, role audits, and safe production seed records
- automated API contracts plus live owner-protection, cross-role RLS, quiz, grade-privacy, CRM, and OpenAI vision/chat validation

For setup and run instructions, see [SETUP.md](./SETUP.md). For detailed capabilities and authorization, see [src/crm/PORTAL_GUIDE.md](./src/crm/PORTAL_GUIDE.md) and [src/platform/ROLE_MATRIX.md](./src/platform/ROLE_MATRIX.md).

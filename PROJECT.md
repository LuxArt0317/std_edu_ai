# Project

The current UI/UX workflow uses the private Google Stitch project and STU design system documented in [STITCH_UI_PROMPTS.md](./STITCH_UI_PROMPTS.md). Generated designs are never treated as complete until [STITCH_UI_EVIDENCE.md](./STITCH_UI_EVIDENCE.md) validates their actual controls against the role/action catalog. Issue #58 extends this to the strict 23-surface matrix in [STITCH_ALL_PAGES_EVIDENCE.md](./STITCH_ALL_PAGES_EVIDENCE.md), spanning authentication, every School OS page/role variant, every Learner Support page, Notifications, and Nexus AI while excluding `/`.

This project combines a responsive reconstruction of the current Shu-Te University homepage with STU Nexus, a production-shaped, all-in-one school operating platform built with Vite, React, TypeScript, Supabase, and the OpenAI Responses API.

It demonstrates:

- a section-complete reconstruction of the official `stu.edu.tw` homepage
- official navigation destinations, hero carousel, audience entrances, performance counters, campus stories, admissions, news, hot links, public information, and footer content
- responsive desktop, tablet, and mobile layouts modeled on the live Elementor page
- a smart-campus positioning aligned with the research
- a non-disruptive floating AI assistant for natural-language campus questions
- a production Supabase Auth and Postgres backend with browser-safe publishable credentials and database-enforced authorization
- a Vercel deployment using Node.js 24, Vite's framework-detected defaults, the npm lockfile, and the required SPA route fallback
- resilient client boot with dependency-free initial content, lazy-route/render recovery, and finite authentication and school-data startup
- a premium `/crm` school OS with distinct owner, leadership, administrator, teacher, specialist-staff, and student experiences
- a protected owner tier for `winsonbaring10@gmail.com`, safe role preview, audited role assignment, and immutable owner guarantees
- one confirmed production acceptance identity for every canonical role, with owner-only Auth provisioning and Keychain-only generated credentials
- a preserved role-specific onboarding system for all 14 roles that is currently disconnected from the runtime and disabled for every account
- departments, programs, terms, courses, sections, rosters, topics, assessments, protected answer keys, attempts, transactional scoring, gradebooks, announcements, notifications, and calendars
- visible pre-filled lifecycle editors for academic structure, students, teacher/staff profiles, schedules, rich multi-page materials, quizzes/exams/assignments/projects, attendance, announcements, CRM cases, prospects, campaigns, tasks, and knowledge
- AI-assisted grade-sheet image extraction with confidence signals and mandatory teacher review before a draft grade can be saved or published
- durable, authenticated, multi-turn school conversations grounded in the signed-in user's visible records, with confirmation-gated role actions for navigation, teaching content, assessments, announcements, attendance, schedules, and learner-owned progress
- a defense-in-depth student AI boundary that permits guidance and progress tracking but never answers, completes, modifies, grades, or submits assessed work
- the original Student 360, early-support, admissions, task, case, campaign, knowledge, and analytics CRM available inside the unified platform
- deployed Supabase migrations with RLS on every exposed school table, trusted workflow functions, covering indexes, role audits, and safe production seed records
- automated API contracts plus live owner-protection, cross-role RLS, onboarding evidence, quiz, grade-privacy, CRM, and OpenAI vision/chat validation

For setup and run instructions, see [SETUP.md](./SETUP.md). The authoritative scope and acceptance contract is [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md). For detailed capabilities and authorization, see [src/crm/PORTAL_GUIDE.md](./src/crm/PORTAL_GUIDE.md) and [src/platform/ROLE_MATRIX.md](./src/platform/ROLE_MATRIX.md).

The exhaustive account-by-account operational contract and implementation checklist is [needed.md](./needed.md).

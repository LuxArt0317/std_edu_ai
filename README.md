# STU Edu AI

This repository contains two connected Shu-Te University experiences:

- `/` is the responsive reconstruction of the institutional `stu.edu.tw` homepage, with its research-driven campus assistant preserved as an additive overlay.
- `/crm` is STU Nexus, a role-aware school operating platform spanning academics, teaching, learning content, quizzes, gradebooks, AI-assisted grade-sheet review, schedules, people and role governance, Student 360, admissions, service cases, analytics, and a persistent OpenAI assistant.

STU Nexus is backed by production Supabase Auth and Postgres. Owner, leadership, administrative, faculty, specialist-staff, and student access is enforced by database row-level security; the interface adapts to the same trusted role. The protected owner is `winsonbaring10@gmail.com`.

Role onboarding is temporarily disabled for every account. The portal does not mount its onboarding component, load or write readiness progress, display the Readiness Center, or show guided tours. The implementation and existing RLS-protected history remain preserved for a deliberate future re-enable.

The deployment always renders a dependency-free branded boot shell before JavaScript starts. Lazy-chunk, React render, authentication, and portal-loading failures resolve to visible reload or local-session recovery controls instead of an empty background. Every production build also verifies that the generated CRM lazy-route graph includes its semantic authentication stylesheet; `npm run diagnose:production` applies the same check to the live hashed assets.

Primary references:

- [Authoritative product requirements and CRUD matrix](./PRODUCT_REQUIREMENTS.md)
- [Authoritative role/action catalog](./needed.md)
- [`needed.md` implementation and production evidence](./NEEDED_IMPLEMENTATION_EVIDENCE.md)
- [Stitch UI prompts](./STITCH_UI_PROMPTS.md)
- [Stitch generated-control validation and implementation evidence](./STITCH_UI_EVIDENCE.md)
- [UNDERSTANDING.md](./UNDERSTANDING.md)
- [agent/planning-with-files/task_plan.md](./agent/planning-with-files/task_plan.md)
- [SETUP.md](./SETUP.md)
- [PROJECT.md](./PROJECT.md)
- [STU Nexus portal guide](./src/crm/PORTAL_GUIDE.md)
- [Role and permission matrix](./src/platform/ROLE_MATRIX.md)
- [Production role account directory](./src/platform/ROLE_ACCOUNTS.md)
- [Unified platform architecture](./src/platform/README.md)
- [Comprehensive Word platform manual](./docs/STU_Nexus_Comprehensive_Platform_Manual.docx)
- [src/crm/README.md](./src/crm/README.md)
- [supabase/README.md](./supabase/README.md)

Authorized POC operators can generate the protected local root credential sheet with `npm run export:role-credentials`. The generated `PRODUCTION_ROLE_CREDENTIALS.local.md` is Git-ignored, written only after all 14 live accounts pass authorization checks, and restricted to file mode `0600`.

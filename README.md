# STU Edu AI

This repository contains two connected Shu-Te University experiences:

- `/` is the responsive reconstruction of the institutional `stu.edu.tw` homepage, with its research-driven campus assistant preserved as an additive overlay.
- `/crm` is STU Nexus, a role-aware school operating platform spanning academics, teaching, learning content, quizzes, gradebooks, AI-assisted grade-sheet review, schedules, people and role governance, Student 360, admissions, service cases, analytics, and a persistent OpenAI assistant.

STU Nexus is backed by production Supabase Auth and Postgres. Owner, leadership, administrative, faculty, specialist-staff, and student access is enforced by database row-level security; the interface adapts to the same trusted role. The protected owner is `winsonbaring10@gmail.com`.

The deployment always renders a dependency-free branded boot shell before JavaScript starts. Lazy-chunk, React render, authentication, and portal-loading failures resolve to visible reload or local-session recovery controls instead of an empty background.

Primary references:

- [UNDERSTANDING.md](./UNDERSTANDING.md)
- [agent/planning-with-files/task_plan.md](./agent/planning-with-files/task_plan.md)
- [SETUP.md](./SETUP.md)
- [PROJECT.md](./PROJECT.md)
- [STU Nexus portal guide](./src/crm/PORTAL_GUIDE.md)
- [Role and permission matrix](./src/platform/ROLE_MATRIX.md)
- [Production role account directory](./src/platform/ROLE_ACCOUNTS.md)
- [Unified platform architecture](./src/platform/README.md)
- [src/crm/README.md](./src/crm/README.md)
- [supabase/README.md](./supabase/README.md)

# STU Edu AI

This repository contains two connected Shu-Te University experiences:

- `/` is the responsive reconstruction of the institutional `stu.edu.tw` homepage, with its research-driven campus assistant preserved as an additive overlay.
- `/crm` is STU Nexus, a premium school relationship platform spanning Student 360, early-support intelligence, admissions, service cases, campaigns, institutional knowledge, analytics, and a privacy-conscious OpenAI copilot.

The CRM is backed by production Supabase Auth and Postgres with role-based RLS. Its browser cache is used only for explicit continuity recovery when the live service is interrupted.

Primary references:

- [UNDERSTANDING.md](./UNDERSTANDING.md)
- [agent/planning-with-files/task_plan.md](./agent/planning-with-files/task_plan.md)
- [SETUP.md](./SETUP.md)
- [PROJECT.md](./PROJECT.md)
- [STU Nexus portal guide](./src/crm/PORTAL_GUIDE.md)
- [src/crm/README.md](./src/crm/README.md)
- [supabase/README.md](./supabase/README.md)

# STU Nexus unified platform

This folder contains the role-aware school operating experience layered over the production Supabase schema.

- `UnifiedPortal.tsx` renders owner, administrator, teacher, specialist-staff, and student workspaces.
- `platformRepository.ts` loads RLS-filtered academic data and owns quiz, grade, and chat persistence.
- `platformAi.ts` calls authenticated school-chat and grade-scan endpoints.
- `platform.css` contains the responsive visual system for the unified portal.
- `types.ts` defines the frontend academic and role contracts.

The interface adapts to the authenticated role, but authorization is enforced by Supabase RLS and trusted database functions.

See [ROLE_MATRIX.md](./ROLE_MATRIX.md) for the complete role hierarchy, visibility rules, owner guarantees, and AI decision boundaries.

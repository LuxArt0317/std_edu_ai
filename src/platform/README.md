# STU Nexus unified platform

This folder contains the role-aware school operating experience layered over the production Supabase schema.

- `UnifiedPortal.tsx` renders owner, administrator, teacher, specialist-staff, and student workspaces.
- `platformRepository.ts` loads RLS-filtered academic data and owns quiz, grade, and chat persistence.
- `platformAi.ts` calls authenticated school-chat and grade-scan endpoints.
- `onboarding.ts` defines the six-step, role-specific foundations journey for all 14 canonical roles and calculates evidence-only readiness.
- `RoleOnboarding.tsx` renders the spotlight, directional callout, action detector, knowledge check, and account readiness center.
- `onboardingRepository.ts` persists versioned progress and append-only evidence through Supabase RLS.
- `platform.css` contains the responsive visual system for the unified portal.
- `types.ts` defines the frontend academic and role contracts.
- `ROLE_ACCOUNTS.md` is the credential-safe production acceptance-account directory.

The interface adapts to the authenticated role, but authorization is enforced by Supabase RLS and trusted database functions.

Every role receives an automatic first-login guided start. Two real workspace actions and one role-specific scenario answer determine the 0–100 readiness score; merely reading or dismissing instructions does not. Progress can be paused, resumed on another device, reviewed, or restarted from the top-bar Readiness Center. This score is a training signal only and never changes data permissions.

See [ROLE_MATRIX.md](./ROLE_MATRIX.md) for the complete role hierarchy, visibility rules, owner guarantees, and AI decision boundaries. See [ROLE_ACCOUNTS.md](./ROLE_ACCOUNTS.md) for the production sign-in emails and secure credential-storage model.

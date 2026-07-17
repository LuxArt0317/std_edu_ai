# STU Nexus unified platform

This folder contains the role-aware school operating experience layered over the production Supabase schema.

- `UnifiedPortal.tsx` renders owner, administrator, teacher, specialist-staff, and student workspaces.
- `AcademicOperations.tsx` provides create and pre-filled edit workflows for students, departments, programs, terms, subjects, classes, enrollment, and conflict-safe schedules.
- `LmsWorkspace.tsx` turns every existing section into an integrated teacher course studio and enrolled-student learning path, including editable multi-page rich lessons, managed images, materials, private files, complete quiz/exam/assignment/project builders, submissions, feedback, attendance, announcements, and progress.
- `RichTextEditor.tsx` is the shared Tiptap publishing surface used by lessons and institutional knowledge.
- `platformRepository.ts` loads RLS-filtered academic data and owns quiz, grade, and chat persistence.
- `platformAi.ts` calls authenticated school-chat and grade-scan endpoints.
- `onboarding.ts`, `RoleOnboarding.tsx`, and `onboardingRepository.ts` preserve the currently disabled role-onboarding implementation and RLS-backed history for a reviewed future re-enable.
- `platform.css` contains the responsive visual system for the unified portal.
- `types.ts` defines the frontend academic and role contracts.
- `ROLE_ACCOUNTS.md` is the credential-safe production acceptance-account directory.

The interface adapts to the authenticated role, but authorization is enforced by Supabase RLS and trusted database functions.

Owners, administrators, and registrars can create linked student portal/SIS records and manage enrollment. Academic leaders can build the catalog and open classes. Authorized schedule managers can add events; the database rejects overlapping rooms, assigned teachers, and shared-student class/exam conflicts.

Role onboarding is temporarily disabled for every role. `UnifiedPortal.tsx` does not import or mount the onboarding component, emit onboarding action signals, or expose onboarding target attributes. As a result, sign-in cannot automatically load/create progress or display Readiness and tour UI. Historical progress remains protected by RLS and is not used for authorization.

See [ROLE_MATRIX.md](./ROLE_MATRIX.md) for the complete role hierarchy, visibility rules, owner guarantees, and AI decision boundaries. See [ROLE_ACCOUNTS.md](./ROLE_ACCOUNTS.md) for the production sign-in emails and secure credential-storage model.

The authoritative product scope and entity lifecycle requirements are defined in [`PRODUCT_REQUIREMENTS.md`](../../PRODUCT_REQUIREMENTS.md).

# STU Nexus unified platform

This folder contains the role-aware school operating experience layered over the production Supabase schema.

- `UnifiedPortal.tsx` renders owner, administrator, teacher, specialist-staff, and student workspaces.
- `AcademicOperations.tsx` provides create and pre-filled edit workflows for students, departments, programs, curricula, terms, subjects, classes, enrollment, and conflict-safe schedules. Program-linked curricula are created manually or with Nexus, versioned by effective year, and expose visible year/semester subject placement, prerequisites, blocks, approval, retirement, and audited draft deletion.
- `LmsWorkspace.tsx` turns every RLS-visible section into an integrated teacher course studio and a shared live learning library. Students receive their enrolled path, progress, attendance, and assignments; authorized staff receive a read-only review of the same modules, materials, and pages rather than a separate legacy topic demo.
- `RichTextEditor.tsx` is the shared Tiptap publishing surface used by lessons and institutional knowledge, with a sticky top toolbar plus safe inline images, uploaded/embedded video, links, and private named file attachments. Lesson resources are authored in context on each page and private files resolve through short-lived signed URLs when opened.
- `platformRepository.ts` loads RLS-filtered academic data and owns quiz, grade, and chat persistence.
- `platformAi.ts` calls authenticated school-chat and grade-scan endpoints and grounds Nexus in the signed-in user's RLS-visible, verified institutional knowledge.
- `onboarding.ts`, `RoleOnboarding.tsx`, and `onboardingRepository.ts` preserve the currently disabled role-onboarding implementation and RLS-backed history for a reviewed future re-enable.
- `platform.css` contains the responsive visual system for the unified portal.
- `types.ts` defines the frontend academic and role contracts.
- `ROLE_ACCOUNTS.md` is the credential-safe production acceptance-account directory.

The interface adapts to the authenticated role, but authorization is enforced by Supabase RLS and trusted database functions.

Nexus uses one-based quiz answer positions to match the database contract, validates actions before review, and will not repeat an unchanged proposal after the user requests corrections. Its composer supports private image/PDF/text attachments, database-backed queued prompts, a non-mutating Ask mode, and a confirmation-gated Agentic mode. Its assistant identity remains visually consistent in the header, progress replies, questions, and ordinary messages.

Owners, administrators, and registrars can create linked student portal/SIS records and manage enrollment. Academic leaders can build the catalog and open classes. Authorized schedule managers can add events; the database rejects overlapping rooms, assigned teachers, and shared-student class/exam conflicts.

Teachers choose post-attempt review access and can enable disclosed fullscreen, focus, extended-display, camera-device, multiple-camera, and clipboard signals. Browser capabilities are best-effort and never presented as infallible lockdown; the platform stores append-only technical evidence for human review and does not store camera media. Students can also generate a configurable high-resolution STU-branded class-schedule PNG from their authorized calendar.

Role onboarding is temporarily disabled for every role. `UnifiedPortal.tsx` does not import or mount the onboarding component, emit onboarding action signals, or expose onboarding target attributes. As a result, sign-in cannot automatically load/create progress or display Readiness and tour UI. Historical progress remains protected by RLS and is not used for authorization.

See [ROLE_MATRIX.md](./ROLE_MATRIX.md) for the complete role hierarchy, visibility rules, owner guarantees, and AI decision boundaries. See [ROLE_ACCOUNTS.md](./ROLE_ACCOUNTS.md) for the production sign-in emails and secure credential-storage model.

The authoritative product scope and entity lifecycle requirements are defined in [`PRODUCT_REQUIREMENTS.md`](../../PRODUCT_REQUIREMENTS.md).

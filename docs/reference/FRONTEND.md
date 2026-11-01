# Frontend reference

## Transactional UI

The school app uses compact shadcn/Radix controls, neutral surfaces and the existing green accent. The taste-led overhaul removes promotional heroes, repeated role/context banners, decorative gradients and duplicate assistant launchers. Page headings identify the work; tables and compact summaries show the records. Core case and department lists use actual shadcn tables, with secondary row actions in dropdown menus.

Navigation groups learning, student services and administration. The account menu contains appearance, role preview and sign-out. Appearance supports System, Light and Dark for the authenticated app; the public university website keeps its established light presentation. Role preview remains a presentation tool, with an explicit warning that actions still use the actual owner role.

Academics uses Add and Export menus plus separate tabs for curriculum, students, subjects, classes, enrollment and change requests. Technical service/AI diagnostics stay accessible under expandable sections. The assistant uses plain Ask and Draft changes labels; change preparation still requires review. Its message log supports keyboard scrolling, fields have accessible labels and closing restores launcher focus.

Layout compatibility remains in feature CSS. Neutral paint and type use shared semantic variables from src/styles/theme.css; control variants are owned shadcn source, not recreated components. Institutional records, field names, routes, role policies and approval flows are preserved.


## Shared public components

`PublicAssistantFeedback.tsx` renders the compact answer-evaluation control for the public STU assistant. It redeems an opaque, session-bound, one-use capability and supports helpfulness, correction category, resolved-need status, and a bounded optional comment without exposing the stored trace identifier.

## School OS student services

Authentication session-event policy lives in `authSessionPolicy.ts`. Repeated same-identity token refresh and sign-in events deliberately preserve the mounted portal; genuine sign-out, recovery, user updates, and account changes still update root authentication state.

School OS has one shadcn sidebar and header. Student services render inside that shell as controlled feature workspaces; there is no separate CRM navigation or sign-out. Internal CRM names remain for API and database compatibility.

For a plain-language explanation of the portal, its users, workspaces, AI capabilities, and example workflows, see [PORTAL_GUIDE.md](../guides/portal.md).

- `CRMApp.tsx` renders the selected student-service workflow inside the School OS shell.
- `CrmRecordEditor.tsx` provides complete pre-filled create/edit forms for CRM students, support cases, admissions prospects, campaigns, and tasks; content-bearing fields use Tiptap.
- `CRMRoot.tsx` enforces Supabase Auth, launches the unified role-aware platform, and exposes visible local-session recovery instead of allowing an indefinite startup shell.
- `authService.ts` owns bounded session restoration, login, logout, trusted-role checks, and device-local session cleanup.
- `crmRepository.ts` loads production Supabase data and owns the complete authorized student, task, admissions, case, campaign, and governed knowledge-contribution lifecycle through RLS. Knowledge may be linked to visible personal, class, or campus events and is review-gated before publication. Its local cache is continuity recovery, not the system of record.
- The Admissions board supports desktop drag-and-drop plus the accessible Advance action. Every destination uses the same completeness gate: missing contact, next-step, or accountable-owner details are collected before the stage and calibrated probability are persisted, with optimistic rollback on failure.
- CRM relationship forms use the academic system of record: students and prospects choose active programs, cases and tasks choose accountable staff, task cases are filtered by student, and campaigns generate reviewable recipients from institution/program/class/role/risk/explicit scopes.
- `aiService.ts` calls the server-only OpenAI endpoint, records privacy-minimized audit metadata, and degrades to a grounded local response.
- `types.ts` defines the shared CRM domain model.

## Data

`knowledge.ts` contains two data groups:

- homepage content and destinations extracted from the current official `stu.edu.tw` homepage
- the structured campus knowledge used by the research-driven AI assistant

Official media remain externally hosted by Shu-Te University and should be revalidated when the source homepage changes.

## STU Nexus unified platform

This folder contains the role-aware school operating experience layered over the production Supabase schema.

- `UnifiedPortal.tsx` renders owner, administrator, teacher, specialist-staff, and student workspaces.
- `AcademicOperations.tsx` provides create and pre-filled edit workflows for students, departments, programs, curricula, terms, subjects, classes, enrollment, and conflict-safe schedules. Program-linked curricula are created manually or with Nexus, versioned by effective year, and expose visible year/semester subject placement, prerequisites, blocks, approval, retirement, and audited draft deletion.
- `LmsWorkspace.tsx` turns every RLS-visible section into an integrated teacher course studio and a shared live learning library. Students receive their enrolled path, progress, attendance, and assignments; authorized staff receive a read-only review of the same modules, materials, and pages rather than a separate legacy topic demo.
- `RichTextEditor.tsx` is the shared Tiptap publishing surface used by lessons and institutional knowledge, with a sticky top toolbar plus safe inline images, uploaded/embedded video, links, and private named file attachments. Image files copied by macOS screenshots or Windows Snipping Tool can be pasted at the cursor with ⌘V/Ctrl+V; ordinary text/HTML paste remains native. Lesson resources are authored in context on each page and private files resolve through short-lived signed URLs when opened.
- `platformRepository.ts` loads RLS-filtered academic data and owns quiz, grade, and chat persistence.
- `platformAi.ts` calls authenticated school-chat and grade-scan endpoints and grounds Nexus in the signed-in user's RLS-visible, verified institutional knowledge.
- `onboarding.ts`, `RoleOnboarding.tsx`, and `onboardingRepository.ts` preserve the currently disabled role-onboarding implementation and RLS-backed history for a reviewed future re-enable.
- `platform.css` contains the responsive visual system for the unified portal.
- `types.ts` defines the frontend academic and role contracts.
- `ROLE_ACCOUNTS.md` is the credential-safe production acceptance-account directory.

The interface adapts to the authenticated role, but authorization is enforced by Supabase RLS and trusted database functions.

The sidebar exposes one **Courses** destination per role. Faculty and authorized academic managers author content and open an exact published Student view in the same workspace; students receive the enrolled learning experience; other authorized staff receive read-only review. Teaching and Learning remain internal route identifiers only for backward-compatible links—there is no second content store or synchronization job. A lesson is student-visible only when both it and its parent module are published and any scheduled unlock time has passed.

Nexus uses one-based quiz answer positions to match the database contract, validates actions before review, and will not repeat an unchanged proposal after the user requests corrections. Long lesson-authoring goals refresh and re-resolve stale material targets without discarding completed work; generated page content is normalized to sanitized Tiptap semantic HTML before review and again before persistence. Reputable-media authorization remains valid for the active goal, while exact image/video URLs are required rather than invented. Its composer supports compact private image/PDF/text previews, database-backed queued prompts, a non-mutating Ask mode, and a confirmation-gated Agentic mode. Conversations can be renamed or permanently deleted; deletion cascades messages and queued work and removes private attachment objects. Its assistant identity remains visually consistent in the header, progress replies, questions, and ordinary messages.

Owners, administrators, and registrars can create linked student portal/SIS records and manage enrollment. Academic leaders can build the catalog and open classes. Authorized schedule managers can add events; the database rejects overlapping rooms, assigned teachers, and shared-student class/exam conflicts.

Teachers choose post-attempt review access and can enable disclosed fullscreen, focus, extended-display, camera-device, multiple-camera, and clipboard signals. Browser capabilities are best-effort and never presented as infallible lockdown; the platform stores append-only technical evidence for human review and does not store camera media. Students can also generate a configurable high-resolution STU-branded class-schedule PNG from their authorized calendar.

Role onboarding is temporarily disabled for every role. `UnifiedPortal.tsx` does not import or mount the onboarding component, emit onboarding action signals, or expose onboarding target attributes. As a result, sign-in cannot automatically load/create progress or display Readiness and tour UI. Historical progress remains protected by RLS and is not used for authorization.

See [ROLE_MATRIX.md](../security/roles.md) for the complete role hierarchy, visibility rules, owner guarantees, and AI decision boundaries. See [ROLE_ACCOUNTS.md](../operations/accounts.md) for the production sign-in emails and secure credential-storage model.

The authoritative product scope and entity lifecycle requirements are defined in [`PRODUCT_REQUIREMENTS.md`](../product/PRODUCT_REQUIREMENTS.md).

Academic relationship workflows use exact records throughout. Curriculum placement chooses catalog subjects and earlier placed prerequisites by ID; profile, student, advisor, class, schedule, attendance-correction, and initiative forms use parent-scoped selectors. Nexus receives the same authoritative catalog and must refresh stale IDs rather than recreate an existing entity.

Client handoff uses deployment.json and docs/operations/. Enhanced-study links stay on the current deployment; the old account directory is historical.

## Research interfaces

This folder contains the participant-facing frozen study runner and the protected administrative-workload evidence workspace used by Issue #104.

- `StudyApp.tsx` runs consented, pseudonymous, counterbalanced participant sessions at `/study/:code`.
- `WorkloadEvidencePanel.tsx` replaces unsupported analytics claims with aggregate baseline/pilot entry, independent review, small-cell-safe reporting, and explicit “not measured” states.
- `workloadService.ts` is the typed Supabase boundary for workload evidence. It hashes aggregate submissions and never accepts respondent-level identifiers or message content.
- `IngestionHealthPanel.tsx` exposes reviewer-only, content-free pipeline health, bounded retry/dead-letter counts, latency/cost totals, and stale-run quarantine.
- `ResearchOperationsPanel.tsx` exposes the eight versioned research service objectives, privacy-safe 24-hour measurements, owned alerts, acknowledgement, and evidence-backed recovery controls.
- `GovernedKnowledgeWorkspace.tsx` and `knowledgeGovernanceService.ts` provide protected official-source candidate review, inactive-source acceptance, source registry CRUD, URL/file acquisition, source date preservation, version/chunk preview, metadata review, publication, change request, rejection, quarantine, lineage, rollback, and audit history for owner/admin/librarian operators. Candidate acceptance never acquires or publishes content.
- `PublicAiEvidencePanel.tsx` provides owner/admin/librarian reviewers with 30-day content-free answer, citation, handoff, feedback, and latency evidence. It never displays raw questions, IP addresses, user agents, or provider payloads.
- `RagEvaluationPanel.tsx` is the protected Issue #124 evaluation control plane for dataset/version creation, gold-case authoring, two-reviewer approval, freeze readiness, version-pinned runs, deterministic observation import, threshold reports, breakdowns, and reproducible JSON/CSV export. Its fixture workflow is explicitly synthetic and cannot satisfy the real >=150-case gate.

Human outcomes remain external evidence. Synthetic tests prove platform behavior only.
## Automated hardening evidence

- `npm run test:accessibility-public` runs deterministic WCAG 2.2 checks across ten states: public home, open assistant, grounded citation/feedback, expanded correction form, campus directory, verified route result, study consent, active tasks/questionnaires, withdrawal dialog, and 320 px reflow. The gate rejects serious/critical or target-size findings, unnamed controls, broken Shift+Tab/Tab modal cycling, missing/out-of-dialog focus, obscured focus, missing required live-status semantics, and horizontal overflow using the installed local Chrome executable. It does not replace named VoiceOver, NVDA, or TalkBack review.
- `npm run test:live-research-operations` proves all eight component families, strict non-content telemetry, alert ownership, append-only evidence, recovery transitions, role boundaries, and zero fixture residue.
- `npm run test:live-research-rls` proves the 28 protected research tables and nine protected RPCs expose zero rows or successful operations to anonymous/student roles while preserving intended librarian and support access.
- `npm run test:live-stu-source-inventory` reversibly proves ten-domain insertion, exact replay, official-host rejection, direct-transition denial, librarian review, inactive-source acceptance, zero document creation, and zero fixture residue.
- `npm run test:load-research-public` executes the bounded public shell and campus-route pilot and fails when measured p95 or error rate exceeds the versioned SLO.
- Instruction-bearing source content is quarantined before embeddings, publication, or retrieval. Retrieved evidence is still treated as untrusted data, and public research mode has no mutation tools.

Client handoff uses deployment.json and docs/operations/. Enhanced-study links stay on the current deployment; the old account directory is historical.

## Generated database types

`database.generated.ts` mirrors the production Supabase schema, including versioned onboarding progress and append-only onboarding events. Regenerate it after schema migrations and review the resulting table and relationship contracts before release.

## Shared browser utilities

This folder contains small, provider-independent helpers shared by the public site and authenticated platform.

- `supabase.ts` creates the browser-safe Supabase client only when deployment configuration is available.
- `async.ts` provides finite promise timeouts so authentication and portal startup cannot remain pending forever.

Utilities in this folder must not contain server-only credentials or expose sensitive session material.

## Source

The React application lives in `App.tsx`, with global styling in `index.css` and the full responsive STU homepage treatment in `App.css`.

- `crm/` contains authentication plus the original Student 360, success, admissions, case, campaign, knowledge, and analytics workspace.
- `platform/` contains the unified role-aware owner, administrator, teacher, specialist, and student school operating experience.
- `data/` contains official homepage content and the research knowledge base.
- `services/` contains local information-retrieval and AI-assistant behavior.
- `utils/` contains optional external-service clients with deployment-safe fallbacks.

`main.tsx` selects the institutional website for public paths and the React Router school application for `/login`, `/app` and legacy `/crm` paths. `/login` handles sign-in and required password changes; `/app` is the protected overview. Each section has its own `/app/<section>` URL with refresh and browser-history support. Unauthenticated requests return to a validated internal destination after sign-in. Legacy `/crm` links redirect to the new routes, including the existing Supabase password-recovery callback; provider permissions and redirect allowlists are unchanged.

`index.html` includes a dependency-free branded boot and stalled-load recovery shell, while `ApplicationErrorBoundary.tsx` catches render and lazy-chunk failures. Authentication and platform startup requests have finite timeouts and local-session recovery so deployment, network, or cached-session problems cannot collapse into an empty page.

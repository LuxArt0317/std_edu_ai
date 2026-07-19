# STU Nexus CRM

Authentication session-event policy lives in `authSessionPolicy.ts`. Repeated same-identity token refresh and sign-in events deliberately preserve the mounted portal; genuine sign-out, recovery, user updates, and account changes still update root authentication state.

This folder contains the original school-wide relationship and student-success workspace, now available through the role-aware STU Nexus platform.

For a plain-language explanation of the portal, its users, workspaces, AI capabilities, and example workflows, see [PORTAL_GUIDE.md](./PORTAL_GUIDE.md).

- `CRMApp.tsx` renders the operational dashboard and workflows.
- `CrmRecordEditor.tsx` provides complete pre-filled create/edit forms for CRM students, support cases, admissions prospects, campaigns, and tasks; content-bearing fields use Tiptap.
- `CRMRoot.tsx` enforces Supabase Auth, launches the unified role-aware platform, and exposes visible local-session recovery instead of allowing an indefinite startup shell.
- `authService.ts` owns bounded session restoration, login, logout, trusted-role checks, and device-local session cleanup.
- `crmRepository.ts` loads production Supabase data and owns the complete authorized student, task, admissions, case, campaign, and governed knowledge-contribution lifecycle through RLS. Knowledge may be linked to visible personal, class, or campus events and is review-gated before publication. Its local cache is continuity recovery, not the system of record.
- The Admissions board supports desktop drag-and-drop plus the accessible Advance action. Every destination uses the same completeness gate: missing contact, next-step, or accountable-owner details are collected before the stage and calibrated probability are persisted, with optimistic rollback on failure.
- `mockData.ts` contains realistic non-sensitive demonstration records.
- `aiService.ts` calls the server-only OpenAI endpoint, records privacy-minimized audit metadata, and degrades to a grounded local response.
- `types.ts` defines the shared CRM domain model.

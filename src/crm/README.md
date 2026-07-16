# STU Nexus CRM

This folder contains the original school-wide relationship and student-success workspace, now available through the role-aware STU Nexus platform.

For a plain-language explanation of the portal, its users, workspaces, AI capabilities, and example workflows, see [PORTAL_GUIDE.md](./PORTAL_GUIDE.md).

- `CRMApp.tsx` renders the operational dashboard and workflows.
- `CRMRoot.tsx` enforces Supabase Auth and launches the unified role-aware platform for recognized school roles.
- `authService.ts` owns session restoration, login, logout, and staff-role checks.
- `crmRepository.ts` loads production Supabase data and persists targeted task, admissions, and case mutations through RLS. Its local cache is continuity recovery, not the system of record.
- `mockData.ts` contains realistic non-sensitive demonstration records.
- `aiService.ts` calls the server-only OpenAI endpoint, records privacy-minimized audit metadata, and degrades to a grounded local response.
- `types.ts` defines the shared CRM domain model.

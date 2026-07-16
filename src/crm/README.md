# STU Nexus CRM

This folder contains the school-wide CRM workspace.

- `CRMApp.tsx` renders the operational dashboard and workflows.
- `CRMRoot.tsx` enforces Supabase Auth and role-aware staff access before rendering the workspace.
- `authService.ts` owns session restoration, login, logout, and staff-role checks.
- `crmRepository.ts` loads production Supabase data and persists targeted task, admissions, and case mutations through RLS. Its local cache is continuity recovery, not the system of record.
- `mockData.ts` contains realistic non-sensitive demonstration records.
- `aiService.ts` calls the server-only OpenAI endpoint, records privacy-minimized audit metadata, and degrades to a grounded local response.
- `types.ts` defines the shared CRM domain model.

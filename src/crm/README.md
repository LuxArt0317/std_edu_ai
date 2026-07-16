# STU Nexus CRM

This folder contains the school-wide CRM workspace.

- `CRMApp.tsx` renders the operational dashboard and workflows.
- `crmRepository.ts` provides a persistent, production-shaped demo adapter while Supabase access is unavailable.
- `mockData.ts` contains realistic non-sensitive demonstration records.
- `aiService.ts` calls the server-only OpenAI endpoint and degrades to a grounded local response.
- `types.ts` defines the shared CRM domain model.

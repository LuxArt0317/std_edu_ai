# Source

The React application lives in `App.tsx`, with global styling in `index.css` and the full responsive STU homepage treatment in `App.css`.

- `crm/` contains authentication plus the original Student 360, success, admissions, case, campaign, knowledge, and analytics workspace.
- `platform/` contains the unified role-aware owner, administrator, teacher, specialist, and student school operating experience.
- `data/` contains official homepage content and the research knowledge base.
- `services/` contains local information-retrieval and AI-assistant behavior.
- `utils/` contains optional external-service clients with deployment-safe fallbacks.

`main.tsx` selects the institutional website for public paths and STU Nexus for `/crm` paths.

`index.html` includes a dependency-free branded boot and stalled-load recovery shell, while `ApplicationErrorBoundary.tsx` catches render and lazy-chunk failures. Authentication and platform startup requests have finite timeouts and local-session recovery so deployment, network, or cached-session problems cannot collapse into an empty page.

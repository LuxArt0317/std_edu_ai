# Research interfaces

This folder contains the participant-facing frozen study runner and the protected administrative-workload evidence workspace used by Issue #104.

- `StudyApp.tsx` runs consented, pseudonymous, counterbalanced participant sessions at `/study/:code`.
- `WorkloadEvidencePanel.tsx` replaces unsupported analytics claims with aggregate baseline/pilot entry, independent review, small-cell-safe reporting, and explicit “not measured” states.
- `workloadService.ts` is the typed Supabase boundary for workload evidence. It hashes aggregate submissions and never accepts respondent-level identifiers or message content.
- `IngestionHealthPanel.tsx` exposes reviewer-only, content-free pipeline health, bounded retry/dead-letter counts, latency/cost totals, and stale-run quarantine.
- `GovernedKnowledgeWorkspace.tsx` and `knowledgeGovernanceService.ts` provide source registry CRUD, URL/file acquisition, source date preservation, version/chunk preview, metadata review, publication, change request, rejection, quarantine, lineage, rollback, and audit history for owner/admin/librarian operators.
- `PublicAiEvidencePanel.tsx` provides owner/admin/librarian reviewers with 30-day content-free answer, citation, handoff, feedback, and latency evidence. It never displays raw questions, IP addresses, user agents, or provider payloads.

Human outcomes remain external evidence. Synthetic tests prove platform behavior only.

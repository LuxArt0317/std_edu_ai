# Research interfaces

This folder contains the participant-facing frozen study runner and the protected administrative-workload evidence workspace used by Issue #104.

- `StudyApp.tsx` runs consented, pseudonymous, counterbalanced participant sessions at `/study/:code`.
- `WorkloadEvidencePanel.tsx` replaces unsupported analytics claims with aggregate baseline/pilot entry, independent review, small-cell-safe reporting, and explicit “not measured” states.
- `workloadService.ts` is the typed Supabase boundary for workload evidence. It hashes aggregate submissions and never accepts respondent-level identifiers or message content.

Human outcomes remain external evidence. Synthetic tests prove platform behavior only.

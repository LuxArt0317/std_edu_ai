# Research interfaces

This folder contains the participant-facing frozen study runner and the protected administrative-workload evidence workspace used by Issue #104.

- `StudyApp.tsx` runs consented, pseudonymous, counterbalanced participant sessions at `/study/:code`.
- `WorkloadEvidencePanel.tsx` replaces unsupported analytics claims with aggregate baseline/pilot entry, independent review, small-cell-safe reporting, and explicit “not measured” states.
- `workloadService.ts` is the typed Supabase boundary for workload evidence. It hashes aggregate submissions and never accepts respondent-level identifiers or message content.
- `IngestionHealthPanel.tsx` exposes reviewer-only, content-free pipeline health, bounded retry/dead-letter counts, latency/cost totals, and stale-run quarantine.
- `ResearchOperationsPanel.tsx` exposes the eight versioned research service objectives, privacy-safe 24-hour measurements, owned alerts, acknowledgement, and evidence-backed recovery controls.
- `GovernedKnowledgeWorkspace.tsx` and `knowledgeGovernanceService.ts` provide source registry CRUD, URL/file acquisition, source date preservation, version/chunk preview, metadata review, publication, change request, rejection, quarantine, lineage, rollback, and audit history for owner/admin/librarian operators.
- `PublicAiEvidencePanel.tsx` provides owner/admin/librarian reviewers with 30-day content-free answer, citation, handoff, feedback, and latency evidence. It never displays raw questions, IP addresses, user agents, or provider payloads.
- `RagEvaluationPanel.tsx` is the protected Issue #124 evaluation control plane for dataset/version creation, gold-case authoring, two-reviewer approval, freeze readiness, version-pinned runs, deterministic observation import, threshold reports, breakdowns, and reproducible JSON/CSV export. Its fixture workflow is explicitly synthetic and cannot satisfy the real >=150-case gate.

Human outcomes remain external evidence. Synthetic tests prove platform behavior only.
## Automated hardening evidence

- `npm run test:accessibility-public` runs deterministic WCAG 2.2 checks across ten states: public home, open assistant, grounded citation/feedback, expanded correction form, campus directory, verified route result, study consent, active tasks/questionnaires, withdrawal dialog, and 320 px reflow. The gate rejects serious/critical or target-size findings, unnamed controls, broken Shift+Tab/Tab modal cycling, missing/out-of-dialog focus, obscured focus, missing required live-status semantics, and horizontal overflow using the installed local Chrome executable. It does not replace named VoiceOver, NVDA, or TalkBack review.
- `npm run test:live-research-operations` proves all eight component families, strict non-content telemetry, alert ownership, append-only evidence, recovery transitions, role boundaries, and zero fixture residue.
- `npm run test:live-research-rls` proves the 27 protected research tables expose zero rows to anonymous/student roles while preserving intended librarian and support access.
- `npm run test:load-research-public` executes the bounded public shell and campus-route pilot and fails when measured p95 or error rate exceeds the versioned SLO.
- Instruction-bearing source content is quarantined before embeddings, publication, or retrieval. Retrieved evidence is still treated as untrusted data, and public research mode has no mutation tools.

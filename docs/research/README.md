# Issue #104 research governance

This directory is the versioned research contract for the public, non-mutating **AI-Enhanced Shu-Te University Campus & Website** study described by `research.md`. The authenticated School OS at `/crm` is a governed product extension and is not evidence that the public research surface is usable, safe, accurate, or effective.

## Artifacts

- `PROTOCOL.md` — version, scope, questions, design, population, outcomes, consent, tasks, and freeze rules.
- `ANALYSIS_PLAN.md` — estimands, scoring, exclusions, missing data, statistical analysis, and reporting rules.
- `CLAIMS_EVIDENCE_MATRIX.md` — readable claim-to-evidence contract.
- `claims-evidence.json` — machine-verifiable source for the same contract.
- `GOVERNANCE_DEPENDENCIES.md` — advisor/institutional decisions that Codex cannot honestly approve.

The protocol is intentionally marked **draft pending advisor/institutional review**. No participant recruitment or primary data collection may begin until those external requirements are resolved and the approved version is frozen in both Git and `research_study_versions`.

Validate locally with:

```bash
npm run verify:research-protocol
```

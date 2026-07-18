# Codex project controls

`hooks.json` activates a repository-scoped completion contract for GitHub Issue #56.

- `SessionStart` loads the remaining Phase 56 Stitch/UI requirements whenever Codex starts or resumes work in this trusted repository.
- `Stop` requires the Phase 56 checklist, Stitch project/design-system evidence, generated-screen validation, implementation evidence, tests, and production evidence.
- `.codex/hooks/stitch_ui_completion_guard.mjs` has no third-party dependencies, does not access secrets or the network, and emits only missing evidence and checklist labels.

Codex requires review and trust for new or changed project hooks. Open `/hooks`, review both commands, and trust them. Project hooks are ignored while the repository is untrusted.

Run the guard directly:

```bash
printf '{"cwd":"%s"}' "$PWD" | node .codex/hooks/stitch_ui_completion_guard.mjs stop
```

The guard is an execution-continuity control, not proof that a design is usable. A Phase 56 item may be checked only after the generated controls are inspected, omissions are documented, accepted ideas are implemented through existing trusted workflows, regressions pass, and production is verified.
